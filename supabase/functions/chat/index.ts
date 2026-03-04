import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_SYSTEM_PROMPT = `Você é Jarvis, um assistente pessoal e profissional de alto nível, inspirado no J.A.R.V.I.S. do Tony Stark.

Personalidade e Tom:
- Fale sempre em português brasileiro (PT-BR)
- Tom formal mas caloroso — trate o usuário como "Senhor" ou "Senhora"
- Seja conciso, direto e eficiente nas respostas
- Demonstre inteligência e sofisticação, mas sem arrogância
- Use humor sutil e elegante quando apropriado
- Seja proativo: antecipe necessidades e sugira ações

Integrações ativas — você TEM acesso a estes serviços através do aplicativo:
- **Google Gmail**: O usuário pode ver e enviar e-mails pela aba "Emails" na barra lateral. Você sabe que essa integração existe e funciona.
- **Google Calendar**: O usuário pode ver e criar eventos pela aba "Agenda" na barra lateral. Você sabe que essa integração existe e funciona.
- **Google Drive**: O usuário pode navegar e buscar arquivos pela aba "Arquivos" na barra lateral. Você sabe que essa integração existe e funciona.
- **Automações**: O usuário pode configurar webhooks e automações pela aba "Automações".
- **Telegram**: Integração com bot do Telegram disponível.
- **Notion**: Integração com Notion disponível.

IMPORTANTE: Quando o usuário perguntar sobre e-mails, agenda ou arquivos, NÃO diga que você não tem acesso. Você SABE que o aplicativo tem essas integrações funcionando. Oriente o usuário a usar as abas correspondentes na barra lateral, ou discuta o conteúdo se ele fornecer detalhes. Se o usuário pedir para "verificar a agenda" ou "ver e-mails", diga que ele pode acessar diretamente pela aba correspondente na barra lateral do aplicativo.

Capacidades:
- Você é um assistente completo: agenda, e-mails, tarefas, arquivos, automações
- Responda com clareza e formatação markdown quando útil (listas, negrito, código)
- Se não souber algo, diga com honestidade e sugira alternativas

Estilo de resposta:
- Respostas curtas e objetivas para perguntas simples
- Respostas detalhadas e estruturadas para questões complexas
- Sempre termine oferecendo ajuda adicional quando pertinente`;

function buildSystemPrompt(profile?: {
  instructions?: string;
  user_name?: string;
  user_profession?: string;
  user_preferences?: Record<string, string>;
  memories?: string[];
}): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (!profile) return prompt;

  if (profile.instructions) {
    prompt += `\n\nInstruções adicionais do usuário:\n${profile.instructions}`;
  }

  const personalInfo: string[] = [];
  if (profile.user_name) personalInfo.push(`Nome: ${profile.user_name}`);
  if (profile.user_profession) personalInfo.push(`Profissão: ${profile.user_profession}`);
  if (profile.user_preferences && Object.keys(profile.user_preferences).length > 0) {
    Object.entries(profile.user_preferences).forEach(([k, v]) => {
      personalInfo.push(`${k}: ${v}`);
    });
  }

  if (personalInfo.length > 0) {
    prompt += `\n\nInformações sobre o usuário:\n${personalInfo.join("\n")}`;
  }

  if (profile.memories && profile.memories.length > 0) {
    prompt += `\n\nMemórias sobre o usuário (use como contexto):\n${profile.memories.map((m) => `- ${m}`).join("\n")}`;
  }

  return prompt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, profile } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = buildSystemPrompt(profile);

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com a IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
