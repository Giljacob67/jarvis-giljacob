import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp, Play, CheckCircle2, AlertCircle, Clock, Pause } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Plan = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Step = {
  id: string;
  plan_id: string;
  step_index: number;
  title: string;
  tool_name: string | null;
  tool_args: any;
  status: string;
  result: string | null;
  requires_confirmation: boolean;
  created_at: string;
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendente", color: "border-muted-foreground text-muted-foreground", icon: Clock },
  running: { label: "Executando", color: "border-primary text-primary", icon: Loader2 },
  paused: { label: "Pausado", color: "border-accent text-accent", icon: Pause },
  done: { label: "Concluído", color: "border-green-400 text-green-400", icon: CheckCircle2 },
  failed: { label: "Falhou", color: "border-destructive text-destructive", icon: AlertCircle },
  needs_confirmation: { label: "Aguardando confirmação", color: "border-accent text-accent", icon: Pause },
};

const Plans = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [steps, setSteps] = useState<Record<string, Step[]>>({});
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadPlans();
  }, [user]);

  const loadPlans = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("execution_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPlans((data as any[]) || []);
    setLoading(false);
  };

  const loadSteps = async (planId: string) => {
    if (steps[planId]) return;
    const { data } = await supabase
      .from("execution_steps")
      .select("*")
      .eq("plan_id", planId)
      .order("step_index", { ascending: true });
    setSteps((prev) => ({ ...prev, [planId]: (data as any[]) || [] }));
  };

  const togglePlan = (planId: string) => {
    if (expandedPlan === planId) {
      setExpandedPlan(null);
    } else {
      setExpandedPlan(planId);
      loadSteps(planId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Planos de Execução</h1>
        <Badge variant="outline" className="text-xs">
          {plans.length} plano{plans.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {plans.length === 0 ? (
        <Card className="glass-panel border-border/30">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground text-sm">
              Nenhum plano criado ainda. Peça ao Jarvis para criar um plano complexo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const config = statusConfig[plan.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const isExpanded = expandedPlan === plan.id;
            const planSteps = steps[plan.id] || [];

            return (
              <Card key={plan.id} className="glass-panel border-border/30 overflow-hidden">
                <CardHeader
                  className="p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => togglePlan(plan.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusIcon className={`h-4 w-4 ${config.color} ${plan.status === "running" ? "animate-spin" : ""}`} />
                      <CardTitle className="text-sm font-body">{plan.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                        {config.label}
                      </Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(plan.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </CardHeader>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CardContent className="p-4 pt-0 space-y-2">
                        {planSteps.length === 0 ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                        ) : (
                          planSteps.map((step) => {
                            const stepConfig = statusConfig[step.status] || statusConfig.pending;
                            const StepIcon = stepConfig.icon;
                            return (
                              <div key={step.id} className="flex items-start gap-2 p-2 rounded-lg bg-secondary/10">
                                <StepIcon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${stepConfig.color} ${step.status === "running" ? "animate-spin" : ""}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-body text-foreground/90">{step.step_index + 1}. {step.title}</p>
                                  {step.tool_name && (
                                    <p className="text-[10px] text-muted-foreground">Ferramenta: {step.tool_name}</p>
                                  )}
                                  {step.result && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{step.result}</p>
                                  )}
                                </div>
                                <Badge variant="outline" className={`text-[9px] ${stepConfig.color} flex-shrink-0`}>
                                  {stepConfig.label}
                                </Badge>
                              </div>
                            );
                          })
                        )}
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Plans;
