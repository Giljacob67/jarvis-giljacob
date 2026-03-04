import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TELEGRAM_API = "https://api.telegram.org/bot";

const JARVIS_SYSTEM_PROMPT = `Você é Jarvis, um assistente pessoal e profissional de alto nível, inspirado no J.A.R.V.I.S. do Tony Stark.
Você está respondendo via Telegram. Seja conciso e direto — mensagens de Telegram devem ser curtas.
Fale sempre em português brasileiro (PT-BR).
Tom formal mas caloroso — trate o usuário como "Senhor" ou "Senhora".
Use humor sutil e elegante quando apropriado.
NÃO use markdown extenso — Telegram suporta apenas formatação básica.`;

// In-memory conversation history per chat (reset on cold start)
const chatHistories = new Map<number, Array<{ role: string; content: string }>>();

async function getAIResponse(chatId: number, userMessage: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return "Erro: chave de IA não configurada.";

  // Get or create history for this chat
  let history = chatHistories.get(chatId) || [];
  history.push({ role: "user", content: userMessage });
  
  // Keep last 20 messages to avoid token limits
  if (history.length > 20) history = history.slice(-20);
  chatHistories.set(chatId, history);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: JARVIS_SYSTEM_PROMPT },
          ...history,
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI error:", response.status, text);
      return "Desculpe, estou com dificuldades no momento. Tente novamente em instantes.";
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
    
    // Save assistant reply to history
    history.push({ role: "assistant", content: reply });
    chatHistories.set(chatId, history);
    
    return reply;
  } catch (e) {
    console.error("AI fetch error:", e);
    return "Erro ao processar sua mensagem. Tente novamente.";
  }
}

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    // === WEBHOOK MODE: Telegram sends updates directly ===
    if (body.message || body.update_id !== undefined) {
      const msg = body.message;
      if (msg?.text && !msg.from?.is_bot) {
        const chatId = msg.chat.id;
        const userText = msg.text;

        // Handle /start command
        if (userText === "/start") {
          await sendTelegramMessage(token, chatId, "Olá! Eu sou o <b>Jarvis</b>, seu assistente pessoal. Como posso ajudá-lo?");
          return new Response("ok");
        }

        // Get AI response and reply
        const aiReply = await getAIResponse(chatId, userText);
        await sendTelegramMessage(token, chatId, aiReply);

        // Log telegram message (no user_id available in webhook mode, use chat_id in metadata)
        try {
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          await svc.from("activity_logs").insert({
            user_id: "00000000-0000-0000-0000-000000000000",
            action_type: "telegram_message", title: `Mensagem Telegram`,
            description: userText.substring(0, 100), status: "success",
            metadata: { chat_id: chatId, from: msg.from?.first_name },
          });
        } catch {}
      }
      return new Response("ok");
    }

    // === API MODE: Frontend calls with action ===
    const { action, chat_id, text, offset } = body;
    const baseUrl = `${TELEGRAM_API}${token}`;
    let telegramUrl: string;
    let fetchOptions: RequestInit = { method: "GET" };

    switch (action) {
      case "get_me":
        telegramUrl = `${baseUrl}/getMe`;
        break;

      case "get_updates":
        telegramUrl = `${baseUrl}/getUpdates?allowed_updates=["message"]&limit=100`;
        if (offset) telegramUrl += `&offset=${offset}`;
        break;

      case "send_message":
        if (!chat_id || !text) {
          return new Response(JSON.stringify({ error: "chat_id and text are required" }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        telegramUrl = `${baseUrl}/sendMessage`;
        fetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
        };
        break;

      case "set_webhook": {
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-bot`;
        telegramUrl = `${baseUrl}/setWebhook`;
        fetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
        };
        break;
      }

      case "delete_webhook":
        telegramUrl = `${baseUrl}/deleteWebhook`;
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const response = await fetch(telegramUrl, fetchOptions);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("telegram-bot error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
