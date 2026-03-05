import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_VOICE_ID = "eUAnqvLQWNX29twcYLUM";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId, speed, stability, similarity_boost, style, model } = await req.json();
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const truncatedText = text.slice(0, 5000);
    const voice = voiceId || DEFAULT_VOICE_ID;

    // Clamp values to ElevenLabs allowed ranges
    const safeSpeed = Math.min(1.2, Math.max(0.7, speed ?? 1.2));
    const safeStability = Math.min(1, Math.max(0, stability ?? 0.6));
    const safeSimilarity = Math.min(1, Math.max(0, similarity_boost ?? 0.9));
    const safeStyle = Math.min(1, Math.max(0, style ?? 0.3));

    // Use turbo model for lower latency, fallback to multilingual
    const modelId = model || "eleven_turbo_v2_5";

    // Use streaming endpoint for faster time-to-first-byte
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: truncatedText,
          model_id: modelId,
          apply_text_normalization: "on",
          voice_settings: {
            stability: safeStability,
            similarity_boost: safeSimilarity,
            style: safeStyle,
            use_speaker_boost: true,
            speed: safeSpeed,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the response directly back to the client
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e) {
    console.error("elevenlabs-tts error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
