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

// ─── Internal LLM call (for skills that need AI processing) ─────────
async function internalLLMCall(systemPrompt: string, userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
    }),
  });

  if (!resp.ok) throw new Error(`LLM call failed: ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Erro ao processar análise.";
}

// ─── Generate embedding via Lovable AI ──────────────────────────────
async function generateEmbedding(text: string): Promise<number[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/text-embedding-004",
      input: text.slice(0, 8000),
    }),
  });

  if (!resp.ok) throw new Error(`Embedding failed: ${resp.status}`);
  const data = await resp.json();
  return data.data?.[0]?.embedding || [];
}

// ─── Audit Logger ───────────────────────────────────────────────────
async function logToolExecution(supabase: any, userId: string, toolName: string, args: any, result: string) {
  try {
    const parsed = JSON.parse(result);
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action_type: "tool",
      title: `Jarvis executou: ${toolName}`,
      description: parsed.message || `Tool ${toolName} executada`,
      status: parsed.success ? "success" : "error",
      metadata: { tool: toolName, args, result: parsed },
    });
  } catch {
    // Silent fail for audit logging
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
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Salva uma informação permanente sobre o usuário (preferência, fato pessoal, hábito). Use quando o usuário mencionar algo sobre si mesmo que pode ser útil no futuro.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "A informação a ser memorizada" },
          category: { type: "string", enum: ["preference", "personal", "professional", "habit", "general"], description: "Categoria da memória" },
        },
        required: ["content", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_operational_context",
      description: "Salva ou atualiza um contexto operacional temporário — algo que está em andamento.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Identificador curto e único" },
          value: { type: "string", description: "Descrição do contexto" },
          category: { type: "string", enum: ["project", "deadline", "follow_up", "pending", "general"], description: "Tipo de contexto" },
          expires_in_days: { type: "integer", description: "Dias até expirar (padrão: 30)" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description: "Busca nas memórias e contextos operacionais do usuário.",
      parameters: {
        type: "object",
        properties: {
          search_query: { type: "string", description: "Termo de busca para filtrar memórias" },
        },
        required: ["search_query"],
      },
    },
  },
  // ─── Planner Skill ──────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_execution_plan",
      description: "Cria um plano de execução para uma tarefa complexa que envolve múltiplas etapas.",
      parameters: {
        type: "object",
        properties: {
          plan_name: { type: "string", description: "Nome curto do plano" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                order: { type: "integer", description: "Ordem da etapa" },
                action: { type: "string", description: "Descrição da ação" },
                tool: { type: "string", description: "Ferramenta a usar ou 'manual'" },
                estimated_minutes: { type: "integer", description: "Tempo estimado em minutos" },
              },
              required: ["order", "action"],
            },
            description: "Lista de etapas do plano",
          },
          create_tasks: { type: "boolean", description: "Se true, cria tarefas automaticamente para cada etapa" },
        },
        required: ["plan_name", "steps"],
      },
    },
  },
  // ─── Legal/Advocacy Skills ────────────────────────────────────
  {
    type: "function",
    function: {
      name: "analyze_legal_document",
      description: "Analisa um texto jurídico e retorna: resumo, cláusulas críticas, riscos, prazos e recomendações.",
      parameters: {
        type: "object",
        properties: {
          document_text: { type: "string", description: "O texto do documento jurídico" },
          analysis_type: {
            type: "string",
            enum: ["full", "risks", "deadlines", "summary", "clauses"],
            description: "Tipo de análise",
          },
          document_type: {
            type: "string",
            enum: ["contract", "petition", "decision", "agreement", "letter", "other"],
            description: "Tipo do documento",
          },
        },
        required: ["document_text", "analysis_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_legal_outline",
      description: "Gera um esboço/roteiro para uma peça jurídica.",
      parameters: {
        type: "object",
        properties: {
          piece_type: {
            type: "string",
            enum: ["petition", "appeal", "defense", "opinion", "contract_draft", "letter", "other"],
            description: "Tipo da peça jurídica",
          },
          context: { type: "string", description: "Contexto do caso" },
          key_arguments: { type: "array", items: { type: "string" }, description: "Argumentos principais" },
          legal_basis: { type: "array", items: { type: "string" }, description: "Base legal" },
        },
        required: ["piece_type", "context"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_documents",
      description: "Compara dois textos jurídicos e identifica diferenças, conflitos e alterações.",
      parameters: {
        type: "object",
        properties: {
          document_a: { type: "string", description: "Primeiro documento" },
          document_b: { type: "string", description: "Segundo documento" },
          focus: { type: "string", description: "Aspecto específico para focar" },
        },
        required: ["document_a", "document_b"],
      },
    },
  },
  // ─── Email Tools (send/draft) ─────────────────────────────────
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Envia um e-mail pelo Gmail do usuário. SEMPRE peça confirmação antes de enviar. Mostre o destinatário, assunto e corpo para o usuário confirmar.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Endereço de e-mail do destinatário" },
          subject: { type: "string", description: "Assunto do e-mail" },
          body: { type: "string", description: "Corpo do e-mail em texto ou HTML" },
          confirmed: { type: "boolean", description: "Se o usuário já confirmou o envio. DEVE ser true para enviar." },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Gera um rascunho de e-mail profissional baseado no contexto fornecido. NÃO envia — apenas mostra o rascunho para revisão.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Destinatário (se conhecido)" },
          context: { type: "string", description: "Contexto e objetivo do e-mail" },
          tone: { type: "string", enum: ["formal", "casual", "legal", "commercial"], description: "Tom do e-mail" },
          language: { type: "string", enum: ["pt-BR", "en"], description: "Idioma" },
        },
        required: ["context"],
      },
    },
  },
  // ─── Document Search (RAG) ────────────────────────────────────
  {
    type: "function",
    function: {
      name: "search_documents",
      description: "Busca semântica nos documentos do usuário (PDFs, DOCs, etc.) usando inteligência artificial. Use quando o usuário perguntar sobre conteúdo de documentos que ele enviou.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A pergunta ou termo de busca" },
          max_results: { type: "integer", description: "Número máximo de resultados (padrão: 5)" },
        },
        required: ["query"],
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
        return JSON.stringify({ success: false, message: "Google Calendar não está conectado." });
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
            headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(event),
          }
        );
        const data = await resp.json();
        if (data.error) return JSON.stringify({ success: false, message: `Erro: ${data.error.message}` });
        return JSON.stringify({ success: true, message: `Evento "${summary}" criado no Calendar.`, event_link: data.htmlLink });
      } catch {
        return JSON.stringify({ success: false, message: "Erro ao conectar com o Google Calendar." });
      }
    }

    case "save_memory": {
      const { content, category } = args;
      const { error } = await supabase.from("jarvis_memories").insert({
        user_id: userId, content, category: category || "general",
      });
      if (error) return JSON.stringify({ success: false, error: error.message });
      return JSON.stringify({ success: true, message: `Memória salva: "${content}"` });
    }

    case "save_operational_context": {
      const { key, value, category: ctxCategory, expires_in_days } = args;
      const expiresAt = new Date(Date.now() + (expires_in_days || 30) * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("operational_context").upsert({
        user_id: userId, key, value, category: ctxCategory || "general",
        expires_at: expiresAt, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,key" });
      if (error) return JSON.stringify({ success: false, error: error.message });
      return JSON.stringify({ success: true, message: `Contexto operacional salvo: "${key}"` });
    }

    case "recall_memory": {
      const { search_query } = args;
      const { data: memories } = await supabase
        .from("jarvis_memories")
        .select("content, category, created_at")
        .eq("user_id", userId)
        .ilike("content", `%${search_query}%`)
        .order("created_at", { ascending: false })
        .limit(10);

      const { data: opCtx } = await supabase
        .from("operational_context")
        .select("key, value, category, updated_at")
        .eq("user_id", userId)
        .or(`key.ilike.%${search_query}%,value.ilike.%${search_query}%`)
        .order("updated_at", { ascending: false })
        .limit(10);

      const memLines = (memories || []).map((m: any) => `- [${m.category}] ${m.content}`);
      const opLines = (opCtx || []).map((o: any) => `- [${o.category}] ${o.key}: ${o.value}`);

      const result = [
        ...(memLines.length > 0 ? ["**Memórias:**", ...memLines] : []),
        ...(opLines.length > 0 ? ["**Contexto operacional:**", ...opLines] : []),
      ].join("\n");

      return JSON.stringify({
        success: true,
        found: memLines.length + opLines.length,
        data: result || "Nenhuma memória encontrada para essa busca.",
      });
    }

    case "create_execution_plan": {
      const { plan_name, steps, create_tasks } = args;
      const planSummary = steps.map((s: any) => `${s.order}. ${s.action}${s.tool ? ` [${s.tool}]` : ""}${s.estimated_minutes ? ` ~${s.estimated_minutes}min` : ""}`).join("\n");
      
      await supabase.from("operational_context").upsert({
        user_id: userId,
        key: `plan-${plan_name.toLowerCase().replace(/\s+/g, "-")}`,
        value: planSummary, category: "project",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,key" });

      let tasksCreated = 0;
      if (create_tasks) {
        const today = new Date();
        for (const step of steps) {
          const dueDate = new Date(today.getTime() + (step.order) * 24 * 60 * 60 * 1000);
          await supabase.from("tasks").insert({
            user_id: userId,
            title: `[${plan_name}] ${step.action}`,
            priority: step.order <= 2 ? 1 : 2,
            due_date: dueDate.toISOString().split("T")[0],
            estimated_minutes: step.estimated_minutes || null,
          });
          tasksCreated++;
        }
      }

      return JSON.stringify({
        success: true,
        message: `Plano "${plan_name}" criado com ${steps.length} etapas.${create_tasks ? ` ${tasksCreated} tarefas criadas.` : ""}`,
        plan: planSummary,
      });
    }

    // ─── Legal/Advocacy Skills ────────────────────────────────────
    case "analyze_legal_document": {
      const { document_text, analysis_type, document_type } = args;
      const analysisPrompts: Record<string, string> = {
        full: `Analise este documento jurídico${document_type ? ` (tipo: ${document_type})` : ""} de forma COMPLETA. Forneça:\n1. **Resumo executivo**\n2. **Cláusulas críticas**\n3. **Riscos identificados** (Alto/Médio/Baixo)\n4. **Prazos e datas**\n5. **Recomendações**\n6. **Pontos de atenção**`,
        risks: `Analise APENAS os RISCOS deste documento jurídico. Para cada: descrição, severidade, cláusula, mitigação.`,
        deadlines: `Extraia TODOS os PRAZOS e DATAS deste documento jurídico.`,
        summary: `Faça um RESUMO EXECUTIVO conciso deste documento jurídico em 3-5 parágrafos.`,
        clauses: `Liste e explique as CLÁUSULAS CRÍTICAS deste documento.`,
      };
      try {
        const analysis = await internalLLMCall(
          "Você é um advogado sênior brasileiro especialista em análise documental. Responda sempre em PT-BR com rigor técnico.",
          `${analysisPrompts[analysis_type] || analysisPrompts.full}\n\n--- DOCUMENTO ---\n${document_text.slice(0, 15000)}`
        );
        return JSON.stringify({ success: true, analysis, analysis_type });
      } catch {
        return JSON.stringify({ success: false, message: "Erro ao analisar documento." });
      }
    }

    case "draft_legal_outline": {
      const { piece_type, context, key_arguments, legal_basis } = args;
      const pieceLabels: Record<string, string> = {
        petition: "Petição Inicial", appeal: "Recurso", defense: "Contestação",
        opinion: "Parecer Jurídico", contract_draft: "Minuta de Contrato",
        letter: "Notificação Extrajudicial", other: "Peça Jurídica",
      };
      const prompt = `Crie um ESBOÇO/ROTEIRO estruturado para: ${pieceLabels[piece_type] || "Peça Jurídica"}\n\nCONTEXTO:\n${context}\n\n${key_arguments?.length ? `ARGUMENTOS:\n${key_arguments.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}` : ""}\n\n${legal_basis?.length ? `BASE LEGAL:\n${legal_basis.map((b: string) => `- ${b}`).join("\n")}` : ""}\n\nForneça: Estrutura, Síntese dos fatos, Fundamentos jurídicos, Linha argumentativa, Pedidos, Documentos a anexar.`;
      try {
        const outline = await internalLLMCall(
          "Você é um advogado sênior brasileiro especialista em redação jurídica.",
          prompt
        );
        return JSON.stringify({ success: true, outline, piece_type: pieceLabels[piece_type] });
      } catch {
        return JSON.stringify({ success: false, message: "Erro ao gerar esboço jurídico." });
      }
    }

    case "compare_documents": {
      const { document_a, document_b, focus } = args;
      const prompt = `Compare os dois documentos jurídicos:\n1. Diferenças principais\n2. Conflitos\n3. Alterações de valores/prazos\n4. Impacto jurídico\n${focus ? `FOCO: ${focus}` : ""}\n\n--- DOC A ---\n${document_a.slice(0, 8000)}\n\n--- DOC B ---\n${document_b.slice(0, 8000)}`;
      try {
        const comparison = await internalLLMCall(
          "Você é um advogado sênior brasileiro especialista em revisão e comparação de documentos jurídicos.",
          prompt
        );
        return JSON.stringify({ success: true, comparison });
      } catch {
        return JSON.stringify({ success: false, message: "Erro ao comparar documentos." });
      }
    }

    // ─── Email Tools ──────────────────────────────────────────────
    case "send_email": {
      if (!googleToken) {
        return JSON.stringify({ success: false, message: "Gmail não está conectado." });
      }
      const { to, subject, body, confirmed } = args;
      if (!confirmed) {
        return JSON.stringify({
          success: false,
          needs_confirmation: true,
          message: `Posso enviar este e-mail?\n\n**Para:** ${to}\n**Assunto:** ${subject}\n**Corpo:** ${body.slice(0, 200)}${body.length > 200 ? "..." : ""}\n\nConfirme para enviar.`,
        });
      }

      // Actually send via Gmail API
      const rawEmail = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/html; charset=utf-8`,
        "",
        body,
      ].join("\r\n");

      const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      try {
        const resp = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw: encoded }),
          }
        );
        const data = await resp.json();
        if (data.error) return JSON.stringify({ success: false, message: `Erro ao enviar: ${data.error.message}` });
        return JSON.stringify({ success: true, message: `E-mail enviado para ${to} com assunto "${subject}".` });
      } catch {
        return JSON.stringify({ success: false, message: "Erro ao enviar e-mail." });
      }
    }

    case "draft_email": {
      const { to, context, tone, language } = args;
      const toneLabel = { formal: "formal e profissional", casual: "casual e amigável", legal: "jurídico e técnico", commercial: "comercial e persuasivo" }[tone || "formal"] || "formal";
      const lang = language === "en" ? "inglês" : "português brasileiro";
      
      try {
        const draft = await internalLLMCall(
          `Você é um redator profissional. Escreva e-mails no tom ${toneLabel} em ${lang}.`,
          `Redija um e-mail com base no contexto:\n${context}\n${to ? `Destinatário: ${to}` : ""}\n\nRetorne APENAS o e-mail (assunto + corpo), sem explicações.`
        );
        return JSON.stringify({ success: true, draft, message: "Rascunho gerado. Revise e confirme para enviar." });
      } catch {
        return JSON.stringify({ success: false, message: "Erro ao gerar rascunho." });
      }
    }

    // ─── Document Search (RAG) ────────────────────────────────────
    case "search_documents": {
      const { query, max_results } = args;
      try {
        const embedding = await generateEmbedding(query);
        if (embedding.length === 0) {
          return JSON.stringify({ success: false, message: "Erro ao gerar embedding para busca." });
        }

        const { data: chunks, error } = await supabase.rpc("search_document_chunks", {
          query_embedding: embedding,
          match_user_id: userId,
          match_count: max_results || 5,
          match_threshold: 0.5,
        });

        if (error) return JSON.stringify({ success: false, message: error.message });
        if (!chunks || chunks.length === 0) {
          return JSON.stringify({ success: true, found: 0, message: "Nenhum trecho relevante encontrado nos seus documentos." });
        }

        // Get document names
        const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
        const { data: docs } = await supabase
          .from("documents")
          .select("id, name")
          .in("id", docIds);
        const docNames: Record<string, string> = {};
        (docs || []).forEach((d: any) => { docNames[d.id] = d.name; });

        const results = chunks.map((c: any) => 
          `[${docNames[c.document_id] || "Documento"}] (relevância: ${(c.similarity * 100).toFixed(0)}%):\n${c.content}`
        ).join("\n\n---\n\n");

        return JSON.stringify({ success: true, found: chunks.length, results });
      } catch (e) {
        return JSON.stringify({ success: false, message: "Erro na busca semântica." });
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

═══════════════════════════════════════════
SKILLS REGISTRY (suas habilidades modulares)
═══════════════════════════════════════════

📅 SKILL: Agenda & Rotina
- Ver agenda (dados em tempo real abaixo)
- Criar eventos → create_calendar_event
- Organizar semana → create_execution_plan

✅ SKILL: Tarefas & Prioridades
- Criar tarefa → create_task
- Listar tarefas → list_tasks
- Completar tarefa → complete_task

🧠 SKILL: Memória
- Salvar preferência/fato → save_memory
- Salvar contexto operacional → save_operational_context
- Buscar memórias → recall_memory

📧 SKILL: E-mail (leitura + envio)
- Dados em tempo real fornecidos abaixo
- Enviar e-mail → send_email (SEMPRE peça confirmação antes!)
- Redigir rascunho → draft_email (mostra para revisão, não envia)

📰 SKILL: Informações
- Notícias e clima fornecidos em tempo real abaixo

📋 SKILL: Planejamento
- Planejar tarefas complexas → create_execution_plan
- Quando o pedido envolve múltiplas etapas, CRIE UM PLANO antes de executar

⚖️ SKILL: Advocacia & Jurídico
- Analisar documento jurídico → analyze_legal_document
- Esboçar peça jurídica → draft_legal_outline
- Comparar documentos → compare_documents
- IMPORTANTE: Seja RIGOROSO e TÉCNICO em análises jurídicas.

📄 SKILL: Documentos & Conhecimento (RAG)
- Buscar nos documentos do usuário → search_documents
- Use quando o usuário perguntar sobre documentos enviados

═══════════════════════════════════════════
REGRAS DE OPERAÇÃO
═══════════════════════════════════════════

CONFIRMAÇÕES INTELIGENTES:
- Ações REVERSÍVEIS (criar tarefa, salvar memória): execute diretamente.
- Ações que ENVOLVEM TERCEIROS (criar evento, enviar email): confirme ANTES.
- Para send_email: SEMPRE mostre o rascunho e peça confirmação (confirmed=false primeiro).

GOVERNANÇA DE MEMÓRIA:
- Salve automaticamente como MEMÓRIA LONGA quando o usuário mencionar preferência, fato pessoal, hábito
- Salve como CONTEXTO OPERACIONAL quando algo estiver em andamento
- NÃO salve informações triviais. Seja silencioso ao salvar.

MODO FOCO:
- Quando ativo: respostas curtas, sem digressões, foco total.

IMPORTANTE: Use os DADOS REAIS fornecidos abaixo para responder sobre e-mails, agenda, notícias e clima.

Estilo de resposta:
- Respostas curtas e objetivas para perguntas simples
- Respostas detalhadas e estruturadas para questões complexas
- Quando executar ferramentas, informe o resultado de forma natural e concisa`;


function buildSystemPrompt(profile?: {
  instructions?: string;
  user_name?: string;
  user_profession?: string;
  user_preferences?: Record<string, string>;
  memories?: string[];
  focus_mode?: boolean;
  focus_until?: string;
  _allProfiles?: { personal?: any; professional?: any };
}, liveData?: { calendar?: string; emails?: string; news?: string; weather?: string }, currentDateTime?: string, operationalContext?: string[], jarvisMode?: string): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // ─── Dynamic Mode Instructions ────────────────────────────────
  const mode = jarvisMode || "personal";
  const allProfiles = profile?._allProfiles;
  
  if (allProfiles) {
    prompt += `\n\n═══════════════════════════════════════════
MODO DINÂMICO
═══════════════════════════════════════════

Seu MODO ATUAL é: **${mode === "professional" ? "PROFISSIONAL" : "PESSOAL"}**. Aplique APENAS o comportamento deste modo.

--- MODO PESSOAL ---`;
    if (allProfiles.personal) {
      if (allProfiles.personal.instructions) prompt += `\nInstruções: ${allProfiles.personal.instructions}`;
      if (allProfiles.personal.user_name) prompt += `\nNome do usuário: ${allProfiles.personal.user_name}`;
      if (allProfiles.personal.user_profession) prompt += `\nProfissão: ${allProfiles.personal.user_profession}`;
    } else {
      prompt += `\n(nenhum perfil pessoal configurado)`;
    }

    prompt += `\n\n--- MODO PROFISSIONAL ---`;
    if (allProfiles.professional) {
      if (allProfiles.professional.instructions) prompt += `\nInstruções: ${allProfiles.professional.instructions}`;
      if (allProfiles.professional.user_name) prompt += `\nNome do usuário: ${allProfiles.professional.user_name}`;
      if (allProfiles.professional.user_profession) prompt += `\nProfissão: ${allProfiles.professional.user_profession}`;
    } else {
      prompt += `\n(nenhum perfil profissional configurado)`;
    }

    prompt += `\n
REGRAS DE TROCA DE MODO:
1. Quando o usuário pedir para trocar de modo (ex: "modo profissional", "modo pessoal", "entrar em modo profissional"), confirme brevemente e PREFIXE sua resposta com [MODE:professional] ou [MODE:personal] (exatamente assim, com colchetes).
2. Após o marcador [MODE:xxx], escreva a confirmação. Exemplo: "[MODE:professional] Certo. Modo profissional ativado."
3. Se detectar que o assunto é claramente do outro modo (ex: assunto jurídico em modo pessoal), SUGIRA a troca: "Parece um assunto profissional. Deseja que eu ative o modo profissional?"
4. NÃO troque automaticamente — apenas sugira.
5. Use APENAS o marcador [MODE:xxx] quando o usuário EXPLICITAMENTE pedir para trocar.`;
  }

  if (currentDateTime) {
    prompt += `\n\n🕐 DATA E HORA ATUAL: ${currentDateTime}\nUse SEMPRE esta data/hora como referência.`;
  }

  if (liveData?.calendar) prompt += `\n\n📅 AGENDA DA SEMANA:\n${liveData.calendar}`;
  if (liveData?.emails) prompt += `\n\n📧 E-MAILS RECENTES:\n${liveData.emails}`;
  if (liveData?.news) prompt += `\n\n📰 NOTÍCIAS DO DIA:\n${liveData.news}`;
  if (liveData?.weather) prompt += `\n\n🌤️ CLIMA ATUAL:\n${liveData.weather}`;

  if (!profile) return prompt;

  // Only add profile-specific info if no allProfiles (backward compat)
  if (!allProfiles) {
    if (profile.instructions) prompt += `\n\nInstruções adicionais:\n${profile.instructions}`;

    const personalInfo: string[] = [];
    if (profile.user_name) personalInfo.push(`Nome: ${profile.user_name}`);
    if (profile.user_profession) personalInfo.push(`Profissão: ${profile.user_profession}`);
    if (profile.user_preferences && Object.keys(profile.user_preferences).length > 0) {
      Object.entries(profile.user_preferences).forEach(([k, v]) => personalInfo.push(`${k}: ${v}`));
    }
    if (personalInfo.length > 0) prompt += `\n\nInformações sobre o usuário:\n${personalInfo.join("\n")}`;
  } else {
    // Add user_preferences from active profile (for city, etc.)
    const activeP = allProfiles[mode as "personal" | "professional"] || allProfiles.personal;
    if (activeP?.user_preferences && Object.keys(activeP.user_preferences).length > 0) {
      const prefs: string[] = [];
      Object.entries(activeP.user_preferences).forEach(([k, v]) => prefs.push(`${k}: ${v}`));
      prompt += `\n\nPreferências do usuário:\n${prefs.join("\n")}`;
    }
  }

  if (profile.memories && profile.memories.length > 0) {
    prompt += `\n\n🧠 MEMÓRIA LONGA:\n${profile.memories.map((m) => `- ${m}`).join("\n")}`;
  }

  if (operationalContext && operationalContext.length > 0) {
    prompt += `\n\n📌 CONTEXTO OPERACIONAL:\n${operationalContext.map((c) => `- ${c}`).join("\n")}`;
  }

  if (profile.focus_mode && profile.focus_until) {
    const remaining = Math.max(0, Math.round((new Date(profile.focus_until).getTime() - Date.now()) / 60000));
    if (remaining > 0) prompt += `\n\n🎯 MODO FOCO ATIVO (${remaining} min restantes). Seja ultra-conciso.`;
  }

  return prompt;
}

// ─── Main Handler ───────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, profile, jarvisMode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let userId: string | null = null;
    let googleToken: string | null = null;
    let liveData: { calendar?: string; emails?: string; news?: string; weather?: string } = {};
    const authHeader = req.headers.get("Authorization");
    const userCity = profile?.user_preferences?.city || "São Paulo";

    const [newsData, weatherData] = await Promise.all([
      fetchNews(),
      fetchWeather(userCity),
    ]);
    liveData.news = newsData;
    liveData.weather = weatherData;

    let operationalContext: string[] = [];

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader?.replace("Bearer ", "");
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          userId = user.id;
          
          const [gToken, opCtxResult] = await Promise.all([
            getValidGoogleToken(supabase, user.id),
            supabase
              .from("operational_context")
              .select("key, value, category")
              .eq("user_id", user.id)
              .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
              .order("updated_at", { ascending: false })
              .limit(20),
          ]);

          googleToken = gToken;
          operationalContext = (opCtxResult.data || []).map((o: any) => `[${o.category}] ${o.key}: ${o.value}`);

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

    const now = new Date();
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const currentDateTime = formatter.format(now);
    const systemPrompt = buildSystemPrompt(profile, liveData, currentDateTime, operationalContext, jarvisMode);

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
          JSON.stringify({ error: "Créditos insuficientes." }),
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
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // ─── Preamble: immediately stream a short spoken phrase before tools run ────
      const preambles = [
        "Certo. Só um instante.",
        "Entendido. Verificando agora.",
        "Um momento, por favor.",
        "Certo, já estou verificando.",
      ];
      const preamble = preambles[Math.floor(Math.random() * preambles.length)];

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Send preamble as a streaming delta so the client speaks it immediately
      const preambleSSE = JSON.stringify({
        choices: [{ delta: { content: preamble + "\n\n" } }],
      });
      writer.write(encoder.encode(`data: ${preambleSSE}\n\n`));

      // ─── Execute ALL tool calls in parallel ─────────────────────
      const toolResultsPromises = toolCalls.map(async (tc: any) => {
        const args = typeof tc.function.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;

        console.log(`Executing tool: ${tc.function.name}`, args);
        const result = await executeTool(tc.function.name, args, userId!, googleToken);

        // Audit logging (fire-and-forget)
        logToolExecution(supabase, userId!, tc.function.name, args, result);

        return {
          role: "tool" as const,
          tool_call_id: tc.id,
          content: result,
        };
      });

      const toolResults = await Promise.all(toolResultsPromises);

      const finalMessages = [
        ...allMessages,
        choice.message,
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
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        writer.close();
        return new Response(readable, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

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

      writer.write(encoder.encode(`data: ${JSON.stringify({ tool_calls: toolMeta })}\n\n`));

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

    // ─── Step 3: No tool calls — use initial response content directly (OPTIMIZED) ─────
    const initialContent = choice?.message?.content || "";
    
    if (initialContent) {
      // Stream the already-available content as SSE without re-calling the LLM
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      (async () => {
        try {
          // Chunk the content into smaller pieces for streaming feel
          const chunkSize = 20;
          for (let i = 0; i < initialContent.length; i += chunkSize) {
            const chunk = initialContent.slice(i, i + chunkSize);
            const sseData = JSON.stringify({
              choices: [{ delta: { content: chunk } }],
            });
            await writer.write(encoder.encode(`data: ${sseData}\n\n`));
          }
          await writer.write(encoder.encode("data: [DONE]\n\n"));
        } finally {
          writer.close();
        }
      })();

      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Fallback: re-call with streaming if no content was returned
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
      return new Response(
        JSON.stringify({ error: "Erro ao processar resposta." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
