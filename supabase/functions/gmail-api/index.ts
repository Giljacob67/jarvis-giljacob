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

  // Check if token is expired (with 5 min buffer)
  if (new Date(data.expires_at) <= new Date(Date.now() + 5 * 60 * 1000)) {
    // Refresh token
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

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return atob(base64);
  }
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, messageId, query, to, subject, body, maxResults } = await req.json();
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
      return new Response(JSON.stringify({ error: "Gmail not connected", code: "NOT_CONNECTED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gmailHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    if (action === "list") {
      const params = new URLSearchParams({
        maxResults: String(maxResults || 20),
        q: query || "",
      });
      const resp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        { headers: gmailHeaders }
      );
      const data = await resp.json();

      if (!data.messages || data.messages.length === 0) {
        return new Response(JSON.stringify({ messages: [], resultSizeEstimate: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch metadata for each message
      const details = await Promise.all(
        data.messages.slice(0, maxResults || 20).map(async (msg: any) => {
          const r = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: gmailHeaders }
          );
          return r.json();
        })
      );

      const emails = details.map((d: any) => ({
        id: d.id,
        threadId: d.threadId,
        snippet: d.snippet,
        from: getHeader(d.payload?.headers, "From"),
        subject: getHeader(d.payload?.headers, "Subject"),
        date: getHeader(d.payload?.headers, "Date"),
        labelIds: d.labelIds || [],
        isUnread: d.labelIds?.includes("UNREAD"),
      }));

      return new Response(JSON.stringify({ messages: emails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "read") {
      const resp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: gmailHeaders }
      );
      const data = await resp.json();

      let bodyText = "";
      const parts = data.payload?.parts || [];
      if (parts.length > 0) {
        const textPart = parts.find((p: any) => p.mimeType === "text/plain");
        const htmlPart = parts.find((p: any) => p.mimeType === "text/html");
        const part = htmlPart || textPart;
        if (part?.body?.data) {
          bodyText = decodeBase64Url(part.body.data);
        }
      } else if (data.payload?.body?.data) {
        bodyText = decodeBase64Url(data.payload.body.data);
      }

      // Mark as read
      await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
        {
          method: "POST",
          headers: gmailHeaders,
          body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        }
      );

      return new Response(JSON.stringify({
        id: data.id,
        threadId: data.threadId,
        from: getHeader(data.payload?.headers, "From"),
        to: getHeader(data.payload?.headers, "To"),
        subject: getHeader(data.payload?.headers, "Subject"),
        date: getHeader(data.payload?.headers, "Date"),
        body: bodyText,
        labelIds: data.labelIds,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send") {
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

      const resp = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: gmailHeaders,
          body: JSON.stringify({ raw: encoded }),
        }
      );

      const data = await resp.json();
      if (data.error) {
        await supabase.from("activity_logs").insert({
          user_id: user.id, action_type: "email_sent", title: `E-mail para ${to}`,
          description: subject || "", status: "error", metadata: { error: data.error.message },
        });
        return new Response(JSON.stringify({ error: data.error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("activity_logs").insert({
        user_id: user.id, action_type: "email_sent", title: `E-mail enviado para ${to}`,
        description: subject || "", status: "success", metadata: { message_id: data.id },
      });

      return new Response(JSON.stringify({ success: true, id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-api error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
