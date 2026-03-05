import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Get all users with pending tasks
    const { data: overdueTasks } = await supabase
      .from("tasks")
      .select("id, user_id, title, due_date, priority")
      .lt("due_date", todayStr)
      .neq("status", "completed");

    const { data: todayTasks } = await supabase
      .from("tasks")
      .select("id, user_id, title, due_date, priority")
      .eq("due_date", todayStr)
      .neq("status", "completed");

    const { data: tomorrowTasks } = await supabase
      .from("tasks")
      .select("id, user_id, title, due_date, priority")
      .eq("due_date", tomorrowStr)
      .neq("status", "completed");

    // Check expiring operational contexts (expire in next 24h)
    const { data: expiringContexts } = await supabase
      .from("operational_context")
      .select("id, user_id, key, value, category, expires_at")
      .lt("expires_at", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .gt("expires_at", now.toISOString());

    const notifications: Array<{
      user_id: string;
      type: string;
      title: string;
      body: string;
      metadata: any;
    }> = [];

    // Group overdue tasks by user
    const overdueByUser = groupByUser(overdueTasks || []);
    for (const [userId, tasks] of Object.entries(overdueByUser)) {
      const count = tasks.length;
      const highPriority = tasks.filter((t: any) => t.priority === 1);
      notifications.push({
        user_id: userId,
        type: "deadline_overdue",
        title: `⚠️ ${count} tarefa(s) atrasada(s)`,
        body: highPriority.length > 0
          ? `Prioridade alta: ${highPriority.map((t: any) => t.title).join(", ")}`
          : `Tarefas: ${tasks.slice(0, 3).map((t: any) => t.title).join(", ")}${count > 3 ? ` e mais ${count - 3}` : ""}`,
        metadata: { task_ids: tasks.map((t: any) => t.id), count },
      });
    }

    // Group today tasks by user (morning briefing)
    const todayByUser = groupByUser(todayTasks || []);
    for (const [userId, tasks] of Object.entries(todayByUser)) {
      const count = tasks.length;
      notifications.push({
        user_id: userId,
        type: "daily_briefing",
        title: `📋 ${count} tarefa(s) para hoje`,
        body: tasks.slice(0, 3).map((t: any) => `• ${t.title}`).join("\n"),
        metadata: { task_ids: tasks.map((t: any) => t.id), count },
      });
    }

    // Tomorrow deadline alerts
    const tomorrowByUser = groupByUser(tomorrowTasks || []);
    for (const [userId, tasks] of Object.entries(tomorrowByUser)) {
      notifications.push({
        user_id: userId,
        type: "deadline_approaching",
        title: `🔔 ${tasks.length} tarefa(s) vencem amanhã`,
        body: tasks.map((t: any) => `• ${t.title}`).join("\n"),
        metadata: { task_ids: tasks.map((t: any) => t.id) },
      });
    }

    // Expiring operational contexts
    const ctxByUser = groupByUser(expiringContexts || []);
    for (const [userId, contexts] of Object.entries(ctxByUser)) {
      for (const ctx of contexts) {
        notifications.push({
          user_id: userId,
          type: "context_expiring",
          title: `📌 Contexto expirando: ${(ctx as any).key}`,
          body: (ctx as any).value,
          metadata: { context_id: (ctx as any).id },
        });
      }
    }

    // Deduplicate: don't send if same type+title already exists today
    let inserted = 0;
    for (const notif of notifications) {
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", notif.user_id)
        .eq("type", notif.type)
        .eq("title", notif.title)
        .gte("created_at", todayStr)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("notifications").insert(notif);
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: notifications.length, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("proactive-check error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function groupByUser(items: any[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const item of items) {
    if (!map[item.user_id]) map[item.user_id] = [];
    map[item.user_id].push(item);
  }
  return map;
}
