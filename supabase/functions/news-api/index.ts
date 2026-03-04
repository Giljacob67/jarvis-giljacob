import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GNEWS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GNEWS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { country = "br", count = 5, lang = "pt" } = await req.json();

    const url = `https://gnews.io/api/v4/top-headlines?country=${country}&lang=${lang}&max=${count}&apikey=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok || data.errors) {
      return new Response(
        JSON.stringify({ error: data.errors?.[0] || "GNews API error" }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const articles = (data.articles || []).map((a: any) => ({
      title: a.title,
      source: a.source?.name || "Desconhecido",
      url: a.url,
      description: a.description,
      image: a.image,
    }));

    return new Response(
      JSON.stringify({ articles }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
