import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("NEWS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "NEWS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { country = "br", count = 5 } = await req.json();

    const url = `https://newsapi.org/v2/top-headlines?country=${country}&pageSize=${count}&apiKey=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok || data.status !== "ok") {
      return new Response(
        JSON.stringify({ error: data.message || "News API error" }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const articles = (data.articles || []).map((a: any) => ({
      title: a.title,
      source: a.source?.name || "Desconhecido",
      url: a.url,
      description: a.description,
      image: a.urlToImage,
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
