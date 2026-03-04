import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const userId = claimsData.claims.sub;
    const { automation_id, payload } = await req.json();

    if (!automation_id) {
      return new Response(JSON.stringify({ error: "automation_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch automation (RLS ensures user can only access their own)
    const { data: automation, error: fetchError } = await supabase
      .from("automations")
      .select("*")
      .eq("id", automation_id)
      .single();

    if (fetchError || !automation) {
      return new Response(JSON.stringify({ error: "Automation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger the Make webhook
    let status = "success";
    try {
      const webhookResponse = await fetch(automation.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation_id,
          automation_name: automation.name,
          triggered_by: userId,
          triggered_at: new Date().toISOString(),
          ...(payload || {}),
        }),
      });

      if (!webhookResponse.ok) {
        status = "error";
      }
    } catch {
      status = "error";
    }

    // Update last trigger info using service role to bypass RLS for update
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await serviceClient
      .from("automations")
      .update({
        last_triggered_at: new Date().toISOString(),
        last_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", automation_id);

    // Log activity
    await serviceClient.from("activity_logs").insert({
      user_id: userId,
      action_type: "automation_trigger",
      title: `Automação disparada: ${automation.name}`,
      description: status === "success" ? "Webhook executado com sucesso" : "Erro ao executar webhook",
      status,
      metadata: { automation_id, automation_name: automation.name },
    });

    return new Response(
      JSON.stringify({ success: status === "success", status }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
