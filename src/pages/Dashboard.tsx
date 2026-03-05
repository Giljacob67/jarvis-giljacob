import { motion } from "framer-motion";
import { Mail, Calendar, CheckSquare, TrendingUp, AlertTriangle, Loader2, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isToday, isBefore, startOfDay } from "date-fns";
import HudClock from "@/components/HudClock";
import WeatherCard from "@/components/WeatherCard";
import NewsCard from "@/components/NewsCard";
import { useNavigate } from "react-router-dom";

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const Dashboard = () => {
  const { session } = useAuth();
  const token = session?.access_token;
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").single();
      return data;
    },
    enabled: !!session,
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .order("priority", { ascending: true })
        .order("due_date", { ascending: true });
      const all = data || [];
      const todayStart = startOfDay(new Date());
      const todayTasks = all.filter((t: any) => t.due_date && isToday(new Date(t.due_date)) && t.status !== "completed");
      const overdue = all.filter((t: any) => t.due_date && isBefore(new Date(t.due_date), todayStart) && t.status !== "completed");
      const top3 = [...overdue, ...todayTasks].slice(0, 3);
      const pending = all.filter((t: any) => t.status !== "completed");
      return { total: pending.length, overdue: overdue.length, todayCount: todayTasks.length, top3 };
    },
    enabled: !!session,
  });


  const { data: emailData, isLoading: emailsLoading } = useQuery({
    queryKey: ["dashboard-emails"],
    queryFn: async () => {
      const resp = await fetch(`${BASE_URL}/functions/v1/gmail-api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: API_KEY,
        },
        body: JSON.stringify({ action: "list", maxResults: 20, query: "" }),
      });
      const data = await resp.json();
      if (data.error) return { connected: false, total: 0, unread: 0, urgent: 0 };
      const messages = data.messages || [];
      const unread = messages.filter((m: any) => m.isUnread).length;
      return { connected: true, total: messages.length, unread, urgent: Math.min(unread, 3) };
    },
    enabled: !!token,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ["dashboard-calendar"],
    queryFn: async () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
      const { data, error } = await supabase.functions.invoke("calendar-api", {
        body: { action: "list", timeMin: startOfDay, timeMax: endOfDay },
      });
      if (error || data?.error) return { connected: false, count: 0, next: null };
      const events = data?.events || [];
      const upcoming = events
        .filter((e: any) => {
          const dt = e.start.dateTime ? new Date(e.start.dateTime) : null;
          return dt && dt > now;
        })
        .sort((a: any, b: any) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
      const next = upcoming[0]
        ? `${upcoming[0].summary} às ${format(parseISO(upcoming[0].start.dateTime), "HH:mm")}`
        : null;
      return { connected: true, count: events.length, next };
    },
    enabled: !!token,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: activityLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(6);
      return data || [];
    },
    enabled: !!session,
  });

  const briefingCards = [
    {
      icon: Mail,
      title: "E-mails",
      value: emailData?.connected ? `${emailData.unread} não lidos` : "Não conectado",
      detail: emailData?.connected
        ? emailData.unread > 0 ? `${emailData.urgent} aguardando resposta` : "Tudo em dia!"
        : "Conecte o Gmail",
      color: "text-primary",
      glow: "glow-blue",
      loading: emailsLoading,
    },
    {
      icon: Calendar,
      title: "Agenda",
      value: calendarData?.connected ? `${calendarData.count} eventos hoje` : "Não conectado",
      detail: calendarData?.connected
        ? calendarData.next ? `Próximo: ${calendarData.next}` : "Sem mais eventos hoje"
        : "Conecte o Google",
      color: "text-accent",
      glow: "glow-gold",
      loading: calendarLoading,
    },
    {
      icon: CheckSquare,
      title: "Tarefas",
      value: tasksData ? `${tasksData.total} pendentes` : "—",
      detail: tasksData?.overdue ? `${tasksData.overdue} atrasada(s)` : "Tudo em dia!",
      color: "text-primary",
      glow: "glow-blue",
      loading: tasksLoading,
      onClick: () => navigate("/tasks"),
    },
    {
      icon: TrendingUp,
      title: "Atividade",
      value: `${activityLogs?.length || 0} ações`,
      detail: "Ações recentes registradas",
      color: "text-accent",
      glow: "glow-gold",
      loading: logsLoading,
    },
  ];

  const actionTypeIcons: Record<string, typeof Mail> = {
    email: Mail,
    calendar: Calendar,
    chat: CheckSquare,
    automation: TrendingUp,
  };

  const isLoaded = !emailsLoading && !calendarLoading;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* HUD Clock */}
      <HudClock />

      {/* Weather + News Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WeatherCard />
        <NewsCard />
      </div>

      {/* Briefing Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="glass-panel p-6 glow-blue relative overflow-hidden"
      >
        <div className="absolute inset-0 scanline pointer-events-none" />
        <h2 className="font-display text-sm tracking-widest text-primary mb-3">BRIEFING DIÁRIO</h2>
        {isLoaded ? (
          <p className="text-foreground font-body leading-relaxed">
            {profile?.full_name && (
              <>{new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite"}, <span className="text-primary font-semibold">{profile.full_name.split(" ")[0]}</span>. </>
            )}
            {emailData?.connected && emailData.unread > 0 && (
              <>Você tem <span className="text-primary font-semibold">{emailData.unread} e-mails não lidos</span>. </>
            )}
            {calendarData?.connected && calendarData.count > 0 && (
              <>Há <span className="text-accent font-semibold">{calendarData.count} eventos</span> na sua agenda hoje. </>
            )}
            {tasksData && tasksData.overdue > 0 && (
              <><span className="text-destructive font-semibold">{tasksData.overdue} tarefa(s) atrasada(s)</span>. </>
            )}
            {tasksData && tasksData.todayCount > 0 && (
              <><span className="text-accent font-semibold">{tasksData.todayCount} tarefa(s)</span> para hoje. </>
            )}
            {(!emailData?.connected || emailData.unread === 0) && (!calendarData?.connected || calendarData.count === 0) && (!tasksData || tasksData.total === 0) && (
              <span className="text-muted-foreground">Tudo tranquilo por aqui. Nenhum item urgente no momento.</span>
            )}
          </p>
        ) : (
          <Skeleton className="h-5 w-3/4" />
        )}
      </motion.div>

      {/* Top Priorities */}
      {tasksData && tasksData.top3.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel p-5 glow-blue">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm tracking-widest text-primary">PRIORIDADES DO DIA</h2>
            <button onClick={() => navigate("/tasks")} className="text-xs text-primary hover:underline">Ver todas</button>
          </div>
          <div className="space-y-2">
            {tasksData.top3.map((task: any) => {
              const priorityColors: Record<number, string> = { 1: "bg-destructive", 2: "bg-accent", 3: "bg-primary" };
              return (
                <div key={task.id} className="flex items-center gap-3 py-1.5">
                  <div className={`w-2 h-2 rounded-full ${priorityColors[task.priority] || "bg-primary"}`} />
                  <span className="text-sm text-foreground flex-1">{task.title}</span>
                  {task.due_date && (
                    <span className="text-[10px] text-muted-foreground">{format(new Date(task.due_date), "dd/MM")}</span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {briefingCards.map((card) => (
          <motion.div key={card.title} variants={item} className={`glass-panel p-5 ${card.glow} ${(card as any).onClick ? "cursor-pointer hover:border-primary/30 transition-colors" : ""}`} onClick={(card as any).onClick}>
            <div className="flex items-center gap-3 mb-3">
              <card.icon size={20} className={card.color} />
              <span className="font-heading text-sm font-semibold text-foreground">{card.title}</span>
            </div>
            {card.loading ? (
              <>
                <Skeleton className="h-7 w-20 mb-1" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <p className="font-display text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.detail}</p>
              </>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="glass-panel p-6"
      >
        <h2 className="font-display text-sm tracking-widest text-primary mb-4">ATIVIDADE RECENTE</h2>
        {logsLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : activityLogs && activityLogs.length > 0 ? (
          <div className="space-y-3">
            {activityLogs.map((log) => {
              const Icon = actionTypeIcons[log.action_type] || AlertTriangle;
              const time = format(new Date(log.created_at), "HH:mm");
              return (
                <div key={log.id} className="flex items-center gap-4 py-2 border-b border-border/30 last:border-0">
                  <span className="text-xs text-muted-foreground font-mono w-12">{time}</span>
                  <Icon size={16} className="text-primary/70" />
                  <span className="text-sm text-foreground/80">{log.title}</span>
                  <span className={`text-xs ml-auto px-2 py-0.5 rounded-full ${
                    log.status === "success" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                  }`}>
                    {log.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
        )}
      </motion.div>
    </div>
  );
};

export default Dashboard;
