import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type ToolStatus = {
  id: string;
  tool: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  result?: any;
};

const toolDisplayNames: Record<string, string> = {
  create_task: "Criar tarefa",
  list_tasks: "Listar tarefas",
  complete_task: "Completar tarefa",
  create_calendar_event: "Criar evento",
  save_memory: "Salvar memória",
  save_operational_context: "Salvar contexto",
  recall_memory: "Buscar memórias",
  create_execution_plan: "Criar plano",
  analyze_legal_document: "Analisar documento",
  draft_legal_outline: "Esboçar peça jurídica",
  compare_documents: "Comparar documentos",
  send_email: "Enviar e-mail",
  draft_email: "Redigir rascunho",
  search_documents: "Buscar documentos",
};

const toolActionButtons: Record<string, { label: string; route: string }> = {
  create_task: { label: "Abrir tarefas", route: "/tasks" },
  list_tasks: { label: "Ver tarefas", route: "/tasks" },
  complete_task: { label: "Ver tarefas", route: "/tasks" },
  create_calendar_event: { label: "Abrir agenda", route: "/agenda" },
  create_execution_plan: { label: "Ver planos", route: "/plans" },
  search_documents: { label: "Ver arquivos", route: "/files" },
};

interface ToolHUDProps {
  statuses: ToolStatus[];
}

const ToolHUD = ({ statuses }: ToolHUDProps) => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);

  const allDone = statuses.length > 0 && statuses.every((s) => s.status !== "running");

  useEffect(() => {
    if (allDone) {
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [allDone]);

  if (statuses.length === 0 || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="w-full max-w-md mx-auto mb-2"
      >
        <div className="glass-panel rounded-xl p-3 space-y-1.5 border border-border/30">
          <div className="flex items-center gap-1.5 text-[10px] font-display tracking-widest text-muted-foreground uppercase mb-1">
            <Wrench className="h-3 w-3" />
            <span>Ações</span>
          </div>
          {statuses.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs font-body">
              {s.status === "running" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
              )}
              {s.status === "done" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
              )}
              {s.status === "error" && (
                <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
              )}
              <span className="text-foreground/80 flex-1 truncate">
                {s.status === "running"
                  ? `Executando: ${toolDisplayNames[s.tool] || s.tool}…`
                  : `${toolDisplayNames[s.tool] || s.tool}`}
                {s.status === "done" && s.endedAt && s.startedAt && (
                  <span className="text-muted-foreground ml-1">
                    ({Math.round(s.endedAt - s.startedAt)}ms)
                  </span>
                )}
              </span>
              {s.status === "done" && toolActionButtons[s.tool] && (
                <button
                  onClick={() => navigate(toolActionButtons[s.tool].route)}
                  className="text-[10px] text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                >
                  {toolActionButtons[s.tool].label} →
                </button>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ToolHUD;
