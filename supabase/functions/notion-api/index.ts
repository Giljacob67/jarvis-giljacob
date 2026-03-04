import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function notionFetch(path: string, options: RequestInit = {}) {
  const apiKey = Deno.env.get("NOTION_API_KEY");
  if (!apiKey) throw new Error("NOTION_API_KEY not configured");

  const res = await fetch(`${NOTION_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, query, database_id, page_id, properties, parent_id } = await req.json();

    let result;

    switch (action) {
      case "search":
        result = await notionFetch("/search", {
          method: "POST",
          body: JSON.stringify({
            query: query || "",
            sort: { direction: "descending", timestamp: "last_edited_time" },
            page_size: 20,
          }),
        });
        break;

      case "list_databases":
        result = await notionFetch("/search", {
          method: "POST",
          body: JSON.stringify({
            filter: { value: "database", property: "object" },
            page_size: 20,
          }),
        });
        break;

      case "query_database":
        if (!database_id) throw new Error("database_id required");
        result = await notionFetch(`/databases/${database_id}/query`, {
          method: "POST",
          body: JSON.stringify({ page_size: 50 }),
        });
        break;

      case "get_page":
        if (!page_id) throw new Error("page_id required");
        result = await notionFetch(`/pages/${page_id}`);
        break;

      case "create_page":
        if (!parent_id || !properties) throw new Error("parent_id and properties required");
        result = await notionFetch("/pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { database_id: parent_id },
            properties,
          }),
        });
        break;

      case "status":
        // Simple connectivity check
        result = await notionFetch("/users/me");
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
