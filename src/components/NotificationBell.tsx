import { useState, useEffect } from "react";
import { Bell, X, CheckCheck, Clock, AlertTriangle, FileText, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  metadata: any;
};

const typeIcons: Record<string, typeof Bell> = {
  deadline_overdue: AlertTriangle,
  daily_briefing: FileText,
  deadline_approaching: Clock,
  context_expiring: Clock,
};

const typeColors: Record<string, string> = {
  deadline_overdue: "text-destructive",
  daily_briefing: "text-primary",
  deadline_approaching: "text-accent",
  context_expiring: "text-muted-foreground",
};

const NotificationBell = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      setNotifications((data as Notification[]) || []);
    };

    fetchNotifications();

    // Realtime subscription
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    setNotifications([]);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute right-0 top-12 z-50 w-80 max-h-96 overflow-hidden glass-panel glow-blue rounded-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b border-border/50">
                <h3 className="font-display text-xs tracking-widest text-primary">NOTIFICAÇÕES</h3>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary transition-colors" title="Marcar como lidas">
                      <CheckCheck size={14} />
                    </button>
                  )}
                  <button onClick={clearAll} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="Limpar tudo">
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto max-h-72">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhuma notificação
                  </div>
                ) : (
                  notifications.map((n) => {
                    const Icon = typeIcons[n.type] || Bell;
                    const color = typeColors[n.type] || "text-muted-foreground";
                    return (
                      <div
                        key={n.id}
                        className={`p-3 border-b border-border/30 last:border-0 ${!n.read ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon size={14} className={`${color} mt-0.5 flex-shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                            {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">{n.body}</p>}
                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                              {format(new Date(n.created_at), "dd/MM HH:mm")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
