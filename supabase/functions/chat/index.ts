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

// ─── Google Token Helper ────────────────────────────────────────────
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

// ─── Data Fetchers ──────────────────────────────────────────────────
async function fetchCalendarEvents(accessToken: string): Promise<string> {
  try {
    const now = new Date();
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

    const todayStr = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(now);

    const lines = data.items.map((e: any) => {
      const startRaw = e.start?.dateTime || e.start?.date || "";
      const endRaw = e.end?.dateTime || e.end?.date || "";
      const startDate = new Date(startRaw);
      const eventDateStr = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(startDate);
      const isToday = eventDateStr === todayStr;
      const dayLabel = isToday ? "[HOJE]" : `[${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "short" }).format(startDate)}]`;
      const location = e.location ? ` | Local: ${e.location}` : "";
      const desc = e.description ? ` | Descrição: ${e.description.slice(0, 100)}` : "";
      return `- ${dayLabel} ${e.summary || "Sem título"} | Início: ${startRaw} | Fim: ${endRaw}${location}${desc}`;
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

async function fetchWeather(city = "São Paulo"): Promise<string> {
  try {
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt`
    );
    const geoData = await geoResp.json();
    let lat = -23.5505, lon = -46.6333, cityName = city;
    if (geoData.results && geoData.results.length > 0) {
      lat = geoData.results[0].latitude;
      lon = geoData.results[0].longitude;
      cityName = geoData.results[0].name;
    }

    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=America/Sao_Paulo`
    );
    const data = await resp.json();
    const c = data.current;

    const codeDesc: Record<number, string> = {
      0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado", 3: "nublado",
      45: "neblina", 51: "garoa leve", 53: "garoa", 61: "chuva leve", 63: "chuva moderada",
      65: "chuva forte", 80: "pancadas de chuva", 95: "trovoadas",
    };

    const desc = codeDesc[c.weather_code] || "condição desconhecida";
    return `${cityName}: ${c.temperature_2m}°C (sensação ${c.apparent_temperature}°C), ${desc}, umidade ${c.relative_humidity_2m}%`;
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

// ─── Tool Definitions ───────────────────────────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Cria uma nova tarefa para o usuário. Use quando o usuário pedir para criar, adicionar ou anotar uma tarefa.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da tarefa" },
          description: { type: "string", description: "Descrição opcional da tarefa" },
          priority: { type: "integer", enum: [1, 2, 3], description: "Prioridade: 1=alta, 2=média, 3=baixa" },
          due_date: { type: "string", description: "Data de vencimento no formato YYYY-MM-DD. Use a data atual como referência." },
          estimated_minutes: { type: "integer", description: "Tempo estimado em minutos, se mencionado" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "Lista as tarefas pendentes do usuário. Use quando o usuário perguntar sobre suas tarefas.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["today", "week", "overdue", "all"], description: "Filtro de tarefas" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Marca uma tarefa como concluída. Use quando o usuário disser que terminou ou completou uma tarefa.",
      parameters: {
        type: "object",
        properties: {
          task_title_search: { type: "string", description: "Parte do título da tarefa para buscar e completar" },
        },
        required: ["task_title_search"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Cria um evento no Google Calendar do usuário. Use quando o usuário pedir para agendar, marcar reunião ou criar evento.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Título do evento" },
          start_datetime: { type: "string", description: "Data/hora de início no formato ISO 8601 (ex: 2025-03-06T14:00:00-03:00)" },
          end_datetime: { type: "string", description: "Data/hora de fim no formato ISO 8601" },
          description: { type: "string", description: "Descrição do evento" },
          location: { type: "string", description: "Local do evento" },
        },
        required: ["summary", "start_datetime", "end_datetime"],
      },
    },
  },
];

// ─── Tool Execution ─────────────────────────────────────────────────
async function executeTool(
  toolName: string,
  args: any,
  userId: string,
  googleToken: string | null,
): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  switch (toolName) {
    case "create_task": {
      const { title, description, priority, due_date, estimated_minutes } = args;
      const { data, error } = await supabase.from("tasks").insert({
        user_id: userId,
        title,
        description: description || "",
        priority: priority || 2,
        due_date: due_date || null,
        estimated_minutes: estimated_minutes || null,
      }).select("id, title, priority, due_date").single();

      if (error) return JSON.stringify({ success: false, error: error.message });

      const priorityLabels: Record<number, string> = { 1: "Alta", 2: "Média", 3: "Baixa" };
      return JSON.stringify({
        success: true,
        task: data,
        message: `Tarefa "${data.title}" criada com prioridade ${priorityLabels[data.priority] || "Média"}${data.due_date ? ` para ${data.due_date}` : ""}.`,
      });
    }

    case "list_tasks": {
      const { filter } = args;
      let query = supabase
        .from("tasks")
        .select("id, title, priority, status, due_date, estimated_minutes")
        .eq("user_id", userId)
        .order("priority", { ascending: true })
        .order("due_date", { ascending: true });

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      if (filter === "today") {
        query = query.eq("due_date", todayStr).neq("status", "completed");
      } else if (filter === "overdue") {
        query = query.lt("due_date", todayStr).neq("status", "completed");
      } else if (filter === "week") {
        const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        query = query.lte("due_date", weekLater).neq("status", "completed");
      } else {
        query = query.neq("status", "completed");
      }

      const { data, error } = await query.limit(20);
      if (error) return JSON.stringify({ success: false, error: error.message });

      const priorityLabels: Record<number, string> = { 1: "🔴 Alta", 2: "🟡 Média", 3: "🟢 Baixa" };
      const tasksList = (data || []).map((t: any) =>
        `- [${priorityLabels[t.priority] || "Média"}] ${t.title}${t.due_date ? ` (até ${t.due_date})` : ""}${t.estimated_minutes ? ` ~${t.estimated_minutes}min` : ""}`
      ).join("\n");

      return JSON.stringify({
        success: true,
        count: data?.length || 0,
        tasks: tasksList || "Nenhuma tarefa encontrada.",
      });
    }

    case "complete_task": {
      const { task_title_search } = args;
      // Find task by partial title match
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("user_id", userId)
        .neq("status", "completed")
        .ilike("title", `%${task_title_search}%`)
        .limit(5);

      if (!tasks || tasks.length === 0) {
        return JSON.stringify({ success: false, message: `Nenhuma tarefa encontrada com "${task_title_search}".` });
      }

      if (tasks.length > 1) {
        const list = tasks.map((t: any) => `- ${t.title}`).join("\n");
        return JSON.stringify({
          success: false,
          message: `Encontrei ${tasks.length} tarefas similares. Qual delas?\n${list}`,
          ambiguous: true,
        });
      }

      const task = tasks[0];
      await supabase.from("tasks").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", task.id);

      return JSON.stringify({ success: true, message: `Tarefa "${task.title}" marcada como concluída. ✅` });
    }

    case "create_calendar_event": {
      if (!googleToken) {
        return JSON.stringify({ success: false, message: "Google Calendar não está conectado. Conecte sua conta Google nas configurações." });
      }

      const { summary, start_datetime, end_datetime, description, location } = args;

      const event: any = {
        summary,
        start: { dateTime: start_datetime, timeZone: "America/Sao_Paulo" },
        end: { dateTime: end_datetime, timeZone: "America/Sao_Paulo" },
      };
      if (description) event.description = description;
      if (location) event.location = location;

      try {
        const resp = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
          }
        );

        const data = await resp.json();
        if (data.error) {
          return JSON.stringify({ success: false, message: `Erro ao criar evento: ${data.error.message}` });
        }

        return JSON.stringify({
          success: true,
          message: `Evento "${summary}" criado com sucesso no Google Calendar.`,
          event_link: data.htmlLink,
        });
      } catch (e) {
        return JSON.stringify({ success: false, message: "Erro ao conectar com o Google Calendar." });
      }
    }

    default:
      return JSON.stringify({ success: false, message: `Ferramenta desconhecida: ${toolName}` });
  }
}

// ─── System Prompt ──────────────────────────────────────────────────
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
- **Google Calendar**: Você pode ver a agenda da semana do usuário E CRIAR NOVOS EVENTOS usando a ferramenta create_calendar_event.
- **Notícias**: Você tem acesso às manchetes do dia do Brasil em tempo real.
- **Clima**: Você tem acesso ao clima atual.
- **Tarefas**: Você pode CRIAR, LISTAR e COMPLETAR tarefas usando as ferramentas disponíveis.

FERRAMENTAS DISPONÍVEIS:
Você tem acesso a ferramentas para executar ações. USE-AS quando o usuário pedir para:
- Criar tarefa → use create_task
- Listar tarefas → use list_tasks
- Completar tarefa → use complete_task
- Agendar reunião/evento → use create_calendar_event

CONFIRMAÇÕES INTELIGENTES:
- Para ações REVERSÍVEIS (criar tarefa): execute diretamente e confirme o que fez.
- Para ações que ENVOLVEM TERCEIROS (criar evento, enviar email): confirme ANTES de executar, descrevendo o que vai fazer.
- Ao confirmar, seja breve: "Vou criar a reunião 'X' amanhã às 14h. Confirma?"
- Se o usuário confirmar (sim, ok, pode, confirmo), execute a ação.

IMPORTANTE: Quando o usuário perguntar sobre e-mails ou agenda, use os DADOS REAIS fornecidos abaixo para responder diretamente. Você TEM os dados. NÃO diga que não tem acesso — responda com as informações concretas.

Capacidades:
- Você é um assistente completo: agenda, e-mails, tarefas, arquivos, automações
- Responda com clareza e formatação markdown quando útil (listas, negrito, código)
- Se não souber algo, diga com honestidade e sugira alternativas

Estilo de resposta:
- Respostas curtas e objetivas para perguntas simples
- Respostas detalhadas e estruturadas para questões complexas
- Sempre termine oferecendo ajuda adicional quando pertinente
- Quando executar uma ferramenta, informe o resultado de forma natural e concisa`;

function buildSystemPrompt(profile?: {
  instructions?: string;
  user_name?: string;
  user_profession?: string;
  user_preferences?: Record<string, string>;
  memories?: string[];
}, liveData?: { calendar?: string; emails?: string; news?: string; weather?: string }, currentDateTime?: string): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (currentDateTime) {
    prompt += `\n\n🕐 DATA E HORA ATUAL (fuso horário do usuário): ${currentDateTime}\nIMPORTANTE: Use SEMPRE esta data/hora como referência para saudações (bom dia/boa tarde/boa noite), para identificar "hoje", "amanhã", "esta semana", etc. Nunca invente ou assuma outra data.`;
  }

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

// ─── Main Handler ───────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, profile } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Get user info
    let userId: string | null = null;
    let googleToken: string | null = null;
    let liveData: { calendar?: string; emails?: string; news?: string; weather?: string } = {};
    const authHeader = req.headers.get("Authorization");
    const userCity = profile?.user_preferences?.city || "São Paulo";

    // Fetch news and weather in parallel
    const [newsData, weatherData] = await Promise.all([
      fetchNews(),
      fetchWeather(userCity),
    ]);
    liveData.news = newsData;
    liveData.weather = weatherData;

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader?.replace("Bearer ", "");
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          userId = user.id;
          googleToken = await getValidGoogleToken(supabase, user.id);
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
    }

    // Generate current date/time
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const currentDateTime = formatter.format(now);
    const systemPrompt = buildSystemPrompt(profile, liveData, currentDateTime);

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // ─── Step 1: Non-streaming call to detect tool calls ──────────
    const initialResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: allMessages,
          tools,
          tool_choice: "auto",
          stream: false,
        }),
      }
    );

    if (!initialResponse.ok) {
      if (initialResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (initialResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await initialResponse.text();
      console.error("AI gateway error:", initialResponse.status, t);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com a IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const initialData = await initialResponse.json();
    const choice = initialData.choices?.[0];

    // ─── Step 2: If tool calls, execute and get final response ────
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && userId) {
      const toolCalls = choice.message.tool_calls;
      
      // Execute all tool calls
      const toolResults: any[] = [];
      for (const tc of toolCalls) {
        const args = typeof tc.function.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;
        
        console.log(`Executing tool: ${tc.function.name}`, args);
        const result = await executeTool(tc.function.name, args, userId, googleToken);
        
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Send tool results back to LLM for final streaming response
      const finalMessages = [
        ...allMessages,
        choice.message, // assistant message with tool_calls
        ...toolResults,
      ];

      const finalResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: finalMessages,
            stream: true,
          }),
        }
      );

      if (!finalResponse.ok) {
        const t = await finalResponse.text();
        console.error("AI gateway final error:", finalResponse.status, t);
        return new Response(
          JSON.stringify({ error: "Erro ao processar resposta." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return streaming response with tool metadata prepended
      const toolMeta = toolCalls.map((tc: any) => {
        const args = typeof tc.function.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;
        const result = toolResults.find((r: any) => r.tool_call_id === tc.id);
        return {
          tool: tc.function.name,
          args,
          result: result ? JSON.parse(result.content) : null,
        };
      });

      // Create a TransformStream to prepend tool metadata as a custom SSE event
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Write tool metadata event first
      writer.write(encoder.encode(`data: ${JSON.stringify({ tool_calls: toolMeta })}\n\n`));

      // Pipe the rest of the streaming response
      const reader = finalResponse.body!.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
        } finally {
          writer.close();
        }
      })();

      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ─── Step 3: No tool calls — stream the response directly ─────
    // Re-call with streaming since initial was non-streaming
    const streamResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: allMessages,
          stream: true,
        }),
      }
    );

    if (!streamResponse.ok) {
      const t = await streamResponse.text();
      console.error("AI gateway stream error:", streamResponse.status, t);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com a IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(streamResponse.body, {
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
