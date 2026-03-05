import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Check, Trash2, Calendar as CalIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, isToday, isBefore, startOfDay, endOfWeek, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

type Filter = "today" | "week" | "overdue" | "all";

const priorityConfig = {
  1: { label: "Alta", class: "bg-destructive/20 text-destructive border-destructive/30" },
  2: { label: "Média", class: "bg-accent/20 text-accent border-accent/30" },
  3: { label: "Baixa", class: "bg-primary/20 text-primary border-primary/30" },
} as const;

const Tasks = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("today");
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState(2);
  const [newDueDate, setNewDueDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .order("priority", { ascending: true })
        .order("due_date", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!newTitle.trim() || !user) return;
      await supabase.from("tasks").insert({
        user_id: user.id,
        title: newTitle.trim(),
        priority: newPriority,
        due_date: newDueDate || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setNewTitle("");
    },
  });

  const toggleTask = useMutation({
    mutationFn: async (task: any) => {
      const done = task.status === "completed";
      await supabase.from("tasks").update({
        status: done ? "pending" : "completed",
        completed_at: done ? null : new Date().toISOString(),
      }).eq("id", task.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("tasks").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const filtered = tasks.filter((t: any) => {
    if (filter === "today") return t.due_date && isToday(new Date(t.due_date));
    if (filter === "week") return t.due_date && new Date(t.due_date) <= weekEnd;
    if (filter === "overdue") return t.due_date && isBefore(new Date(t.due_date), todayStart) && t.status !== "completed";
    return true;
  });

  const pending = filtered.filter((t: any) => t.status !== "completed");
  const completed = filtered.filter((t: any) => t.status === "completed");

  const filters: { key: Filter; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "week", label: "Semana" },
    { key: "overdue", label: "Atrasadas" },
    { key: "all", label: "Todas" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="font-display text-lg tracking-widest text-primary">TAREFAS</h1>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-heading whitespace-nowrap transition-colors ${
              filter === f.key
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-card/60 text-muted-foreground border border-border/50 hover:text-foreground"
            }`}
          >
            {f.label}
            {f.key === "overdue" && tasks.filter((t: any) => t.due_date && isBefore(new Date(t.due_date), todayStart) && t.status !== "completed").length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive text-[10px]">
                {tasks.filter((t: any) => t.due_date && isBefore(new Date(t.due_date), todayStart) && t.status !== "completed").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* New task form */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Nova tarefa..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask.mutate()}
            className="flex-1 bg-background/50 border-border/50"
          />
          <Button size="icon" onClick={() => addTask.mutate()} disabled={!newTitle.trim()} className="shrink-0">
            <Plus size={18} />
          </Button>
        </div>
        <div className="flex gap-2 items-center text-xs">
          <div className="flex gap-1">
            {([1, 2, 3] as const).map((p) => (
              <button
                key={p}
                onClick={() => setNewPriority(p)}
                className={`px-2 py-1 rounded border text-[10px] font-heading transition-colors ${
                  newPriority === p ? priorityConfig[p].class : "border-border/30 text-muted-foreground"
                }`}
              >
                {priorityConfig[p].label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="bg-background/50 border border-border/50 rounded px-2 py-1 text-xs text-foreground ml-auto"
          />
        </div>
      </motion.div>

      {/* Task list */}
      {isLoading ? (
        <div className="text-center text-muted-foreground text-sm py-8">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {pending.map((task: any) => (
            <TaskItem key={task.id} task={task} onToggle={() => toggleTask.mutate(task)} onDelete={() => deleteTask.mutate(task.id)} />
          ))}
          {completed.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground pt-4 pb-1 font-heading">Concluídas ({completed.length})</p>
              {completed.map((task: any) => (
                <TaskItem key={task.id} task={task} onToggle={() => toggleTask.mutate(task)} onDelete={() => deleteTask.mutate(task.id)} />
              ))}
            </>
          )}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">Nenhuma tarefa encontrada.</p>
          )}
        </div>
      )}
    </div>
  );
};

function TaskItem({ task, onToggle, onDelete }: { task: any; onToggle: () => void; onDelete: () => void }) {
  const done = task.status === "completed";
  const overdue = task.due_date && isBefore(new Date(task.due_date), startOfDay(new Date())) && !done;
  const p = (task.priority as 1 | 2 | 3) || 2;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={`glass-panel p-3 flex items-center gap-3 ${done ? "opacity-50" : ""} ${overdue ? "border-destructive/30" : ""}`}
    >
      <button onClick={onToggle} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        done ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
      }`}>
        {done && <Check size={12} className="text-primary-foreground" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityConfig[p].class}`}>
            {priorityConfig[p].label}
          </span>
          {task.due_date && (
            <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
              <CalIcon size={10} />
              {format(new Date(task.due_date), "dd/MM")}
            </span>
          )}
        </div>
      </div>

      <button onClick={onDelete} className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0">
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
}

export default Tasks;
