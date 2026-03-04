import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Zap, MessageSquare, Mail, Calendar, Send,
  CheckCircle2, XCircle, Loader2, Filter
} from "lucide-react";
import { formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const ACTION_TYPES = [
  { value: "all", label: "Todos", icon: ClipboardList },
  { value: "automation_trigger", label: "Automação", icon: Zap },
  { value: "chat_message", label: "Chat", icon: MessageSquare },
  { value: "email_sent", label: "E-mail", icon: Mail },
  { value: "calendar_event", label: "Agenda", icon: Calendar },
  { value: "telegram_message", label: "Telegram", icon: Send },
];

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "all", label: "Tudo" },
];

const PAGE_SIZE = 50;

function getActionIcon(type: string) {
  const found = ACTION_TYPES.find((a) => a.value === type);
  const Icon = found?.icon || ClipboardList;
  return <Icon className="h-4 w-4" />;
}

function getActionColor(type: string) {
  const colors: Record<string, string> = {
    automation_trigger: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    chat_message: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    email_sent: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    calendar_event: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    telegram_message: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  };
  return colors[type] || "bg-muted text-muted-foreground";
}

function getPeriodDate(period: string): string | null {
  if (period === "all") return null;
  if (period === "today") return startOfDay(new Date()).toISOString();
  if (period === "7d") return subDays(new Date(), 7).toISOString();
  if (period === "30d") return subDays(new Date(), 30).toISOString();
  return null;
}

export default function ActivityLog() {
  const [actionFilter, setActionFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("30d");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["activity-logs", actionFilter, periodFilter, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (actionFilter !== "all") query = query.eq("action_type", actionFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const periodDate = getPeriodDate(periodFilter);
      if (periodDate) query = query.gte("created_at", periodDate);

      const { data, error } = await query;
      if (error) throw error;
      return data as Array<{
        id: string; user_id: string; action_type: string; title: string;
        description: string; status: string; metadata: Record<string, unknown>; created_at: string;
      }>;
    },
  });

  const logs = data || [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Log de Atividades</h1>
          <p className="text-sm text-muted-foreground">Histórico de ações executadas pelo Jarvis</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg border bg-card">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma atividade encontrada</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="relative flex gap-4 py-3 pl-0">
                {/* Icon dot */}
                <div className={`relative z-10 flex items-center justify-center h-10 w-10 rounded-full border shrink-0 ${getActionColor(log.action_type)}`}>
                  {getActionIcon(log.action_type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground truncate">{log.title}</span>
                    <Badge
                      variant={log.status === "success" ? "default" : "destructive"}
                      className="text-[10px] px-1.5 py-0 h-5 gap-1"
                    >
                      {log.status === "success" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {log.status === "success" ? "OK" : "Erro"}
                    </Badge>
                  </div>
                  {log.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.description}</p>
                  )}
                  <span className="text-[11px] text-muted-foreground/60">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Load more */}
      {logs.length === PAGE_SIZE && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
