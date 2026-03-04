import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getValidGoogleToken(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data) return null;

  if (new Date(data.expires_at) <= new Date(Date.now() + 5 * 60 * 1000)) {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await resp.json();
    if (tokenData.error) return null;

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    await supabase
      .from("google_tokens")
      .update({ access_token: tokenData.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    return tokenData.access_token;
  }

  return data.access_token;
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

async function fetchCalendarEvents(accessToken: string): Promise<string> {
  try {
    const now = new Date();
    // Get events for the next 7 days
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: weekLater.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "30",
    });

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await resp.json();

    if (!data.items || data.items.length === 0) {
      return "Nenhum evento encontrado nos próximos 7 dias.";
    }

    const lines = data.items.map((e: any) => {
      const start = e.start?.dateTime || e.start?.date || "";
      const end = e.end?.dateTime || e.end?.date || "";
      const location = e.location ? ` | Local: ${e.location}` : "";
      const desc = e.description ? ` | Descrição: ${e.description.slice(0, 100)}` : "";
      return `- ${e.summary || "Sem título"} | Início: ${start} | Fim: ${end}${location}${desc}`;
    });

    return lines.join("\n");
  } catch (e) {
    console.error("Error fetching calendar:", e);
    return "Erro ao acessar a agenda do Google.";
  }
}

async function fetchNews(): Promise<string> {
  try {
    const apiKey = Deno.env.get("GNEWS_API_KEY");
    if (!apiKey) return "API de notícias não configurada.";

    const resp = await fetch(
      `https://gnews.io/api/v4/top-headlines?country=br&lang=pt&max=8&apikey=${apiKey}`
    );
    const data = await resp.json();

    if (!data.articles || data.articles.length === 0) {
      return "Nenhuma notícia disponível no momento.";
    }

    return data.articles.map((a: any) =>
      `- ${a.title} (${a.source?.name || "Fonte desconhecida"})`
    ).join("\n");
  } catch (e) {
    console.error("Error fetching news:", e);
    return "Erro ao buscar notícias.";
  }
}

async function fetchWeather(): Promise<string> {
  try {
    const resp = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=America/Sao_Paulo"
    );
    const data = await resp.json();
    const c = data.current;

    const codeDesc: Record<number, string> = {
      0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado", 3: "nublado",
      45: "neblina", 51: "garoa leve", 53: "garoa", 61: "chuva leve", 63: "chuva moderada",
      65: "chuva forte", 80: "pancadas de chuva", 95: "trovoadas",
    };

    const desc = codeDesc[c.weather_code] || "condição desconhecida";
    return `São Paulo: ${c.temperature_2m}°C (sensação ${c.apparent_temperature}°C), ${desc}, umidade ${c.relative_humidity_2m}%`;
  } catch (e) {
    console.error("Error fetching weather:", e);
    return "Erro ao buscar clima.";
  }
}

async function fetchRecentEmails(accessToken: string): Promise<string> {
  try {
    const params = new URLSearchParams({ maxResults: "10", q: "" });
    const resp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await resp.json();

    if (!data.messages || data.messages.length === 0) {
      return "Nenhum e-mail recente encontrado.";
    }

    const details = await Promise.all(
      data.messages.slice(0, 10).map(async (msg: any) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return r.json();
      })
    );

    const lines = details.map((d: any) => {
      const from = getHeader(d.payload?.headers, "From");
      const subject = getHeader(d.payload?.headers, "Subject");
      const date = getHeader(d.payload?.headers, "Date");
      const unread = d.labelIds?.includes("UNREAD") ? "📩 NÃO LIDO" : "✓ Lido";
      return `- [${unread}] De: ${from} | Assunto: ${subject} | Data: ${date}`;
    });

    return lines.join("\n");
  } catch (e) {
    console.error("Error fetching emails:", e);
    return "Erro ao acessar o Gmail.";
  }
}

const BASE_SYSTEM_PROMPT = `Você é Jarvis, um assistente pessoal e profissional de alto nível, inspirado no J.A.R.V.I.S. do Tony Stark.

Personalidade e Tom:
- Fale sempre em português brasileiro (PT-BR)
- Tom formal mas caloroso — trate o usuário como "Senhor" ou "Senhora"
- Seja conciso, direto e eficiente nas respostas
- Demonstre inteligência e sofisticação, mas sem arrogância
- Use humor sutil e elegante quando apropriado
- Seja proativo: antecipe necessidades e sugira ações

Integrações ativas — você TEM acesso direto a estes serviços:
- **Google Gmail**: Você pode ver os e-mails recentes do usuário. Os dados são fornecidos abaixo em tempo real.
- **Google Calendar**: Você pode ver a agenda da semana do usuário. Os dados são fornecidos abaixo em tempo real.
- **Notícias**: Você tem acesso às manchetes do dia do Brasil em tempo real. Quando o usuário pedir um resumo das notícias, use os dados fornecidos abaixo para criar um resumo claro e bem estruturado.
- **Clima**: Você tem acesso ao clima atual. Quando o usuário perguntar sobre o clima, use os dados fornecidos abaixo.
- **Google Drive**: O usuário pode navegar e buscar arquivos pela aba "Arquivos" na barra lateral.
- **Automações**: O usuário pode configurar webhooks e automações pela aba "Automações".
- **Telegram**: Integração com bot do Telegram disponível.
- **Notion**: Integração com Notion disponível.

IMPORTANTE: Quando o usuário perguntar sobre e-mails ou agenda, use os DADOS REAIS fornecidos abaixo para responder diretamente. Você TEM os dados. NÃO diga que não tem acesso — responda com as informações concretas.

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
}, liveData?: { calendar?: string; emails?: string; news?: string; weather?: string }): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // Inject live Google data
  if (liveData?.calendar) {
    prompt += `\n\n📅 AGENDA DA SEMANA (dados em tempo real do Google Calendar):\n${liveData.calendar}`;
  }
  if (liveData?.emails) {
    prompt += `\n\n📧 E-MAILS RECENTES (dados em tempo real do Gmail):\n${liveData.emails}`;
  }
  if (liveData?.news) {
    prompt += `\n\n📰 NOTÍCIAS DO DIA (dados em tempo real do GNews):\n${liveData.news}`;
  }
  if (liveData?.weather) {
    prompt += `\n\n🌤️ CLIMA ATUAL:\n${liveData.weather}`;
  }

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

    // Try to get user's Google token to fetch live data
    let liveData: { calendar?: string; emails?: string; news?: string; weather?: string } = {};
    const authHeader = req.headers.get("Authorization");

    // Fetch news and weather in parallel (no auth needed)
    const [newsData, weatherData] = await Promise.all([
      fetchNews(),
      fetchWeather(),
    ]);
    liveData.news = newsData;
    liveData.weather = weatherData;

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader?.replace("Bearer ", "");
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const googleToken = await getValidGoogleToken(supabase, user.id);
          if (googleToken) {
            const [calendarData, emailData] = await Promise.all([
              fetchCalendarEvents(googleToken),
              fetchRecentEmails(googleToken),
            ]);
            liveData.calendar = calendarData;
            liveData.emails = emailData;
          }
        }
      }
    } catch (e) {
      console.error("Error fetching live data:", e);
      // Continue without live data
    }

    const systemPrompt = buildSystemPrompt(profile, liveData);

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
