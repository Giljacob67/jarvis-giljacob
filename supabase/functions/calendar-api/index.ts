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

async function getValidToken(supabase: any, userId: string): Promise<string | null> {
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
    if (tokenData.error) {
      console.error("Token refresh error:", tokenData);
      return null;
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    await supabase
      .from("google_tokens")
      .update({
        access_token: tokenData.access_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return tokenData.access_token;
  }

  return data.access_token;
}

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, eventId, timeMin, timeMax, summary, description, location, startDateTime, endDateTime, startDate, endDate } = await req.json();
    const authHeader = req.headers.get("Authorization");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getValidToken(supabase, user.id);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Google not connected", code: "NOT_CONNECTED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    if (action === "list") {
      const now = new Date();
      const defaultMin = timeMin || now.toISOString();
      const defaultMax = timeMax || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const params = new URLSearchParams({
        timeMin: defaultMin,
        timeMax: defaultMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });

      const resp = await fetch(`${CALENDAR_BASE}/calendars/primary/events?${params}`, { headers: calHeaders });
      const data = await resp.json();

      if (data.error) {
        return new Response(JSON.stringify({ error: data.error.message }), {
          status: data.error.code || 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ events: data.items || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      const resp = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${eventId}`, { headers: calHeaders });
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const event: any = {
        summary: summary || "Sem título",
        description: description || "",
        location: location || "",
      };

      if (startDate && endDate) {
        event.start = { date: startDate };
        event.end = { date: endDate };
      } else {
        event.start = { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        event.end = { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      }

      const resp = await fetch(`${CALENDAR_BASE}/calendars/primary/events`, {
        method: "POST",
        headers: calHeaders,
        body: JSON.stringify(event),
      });

      const data = await resp.json();
      if (data.error) {
        await supabase.from("activity_logs").insert({
          user_id: user.id, action_type: "calendar_event", title: `Evento: ${summary || "Sem título"}`,
          description: "Erro ao criar evento", status: "error", metadata: { error: data.error.message },
        });
        return new Response(JSON.stringify({ error: data.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("activity_logs").insert({
        user_id: user.id, action_type: "calendar_event", title: `Evento criado: ${summary || "Sem título"}`,
        description: description || "", status: "success", metadata: { event_id: data.id },
      });

      return new Response(JSON.stringify({ success: true, event: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const updates: any = {};
      if (summary !== undefined) updates.summary = summary;
      if (description !== undefined) updates.description = description;
      if (location !== undefined) updates.location = location;

      if (startDate && endDate) {
        updates.start = { date: startDate };
        updates.end = { date: endDate };
      } else if (startDateTime && endDateTime) {
        updates.start = { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        updates.end = { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      }

      const resp = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
        method: "PATCH",
        headers: calHeaders,
        body: JSON.stringify(updates),
      });

      const data = await resp.json();
      if (data.error) {
        return new Response(JSON.stringify({ error: data.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, event: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const resp = await fetch(`${CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
        method: "DELETE",
        headers: calHeaders,
      });

      if (resp.status === 204 || resp.ok) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      return new Response(JSON.stringify({ error: data.error?.message || "Failed to delete" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calendar-api error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
