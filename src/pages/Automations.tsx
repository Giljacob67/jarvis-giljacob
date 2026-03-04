import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Plus, Play, Pencil, Trash2, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Automation {
  id: string;
  name: string;
  description: string;
  webhook_url: string;
  last_triggered_at: string | null;
  last_status: string | null;
  created_at: string;
}

interface FormData {
  name: string;
  description: string;
  webhook_url: string;
}

const emptyForm: FormData = { name: "", description: "", webhook_url: "" };

const Automations = () => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Automation[];
    },
    enabled: !!session,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (editingId) {
        const { error } = await supabase
          .from("automations")
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("automations")
          .insert({ ...data, user_id: session!.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Automação atualizada!" : "Automação criada!");
    },
    onError: () => toast.error("Erro ao salvar automação."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação excluída!");
    },
    onError: () => toast.error("Erro ao excluir."),
  });

  const triggerMutation = useMutation({
    mutationFn: async (automationId: string) => {
      setTriggeringId(automationId);
      const { data, error } = await supabase.functions.invoke("make-webhook", {
        body: { automation_id: automationId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      if (data?.success) {
        toast.success("Webhook disparado com sucesso!");
      } else {
        toast.error("Webhook retornou erro.");
      }
      setTriggeringId(null);
    },
    onError: () => {
      toast.error("Falha ao disparar webhook.");
      setTriggeringId(null);
    },
  });

  const openEdit = (a: Automation) => {
    setEditingId(a.id);
    setForm({ name: a.name, description: a.description || "", webhook_url: a.webhook_url });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const statusBadge = (status: string | null) => {
    if (!status || status === "pending") return <Badge variant="outline" className="gap-1 border-muted-foreground/30 text-muted-foreground"><Clock className="h-3 w-3" /> Pendente</Badge>;
    if (status === "success") return <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><CheckCircle2 className="h-3 w-3" /> Sucesso</Badge>;
    return <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><XCircle className="h-3 w-3" /> Erro</Badge>;
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Faça login para gerenciar automações.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 glow-blue">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Automações</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus webhooks do Make</p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Automação
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : automations.length === 0 ? (
        <Card className="glass-panel glow-border-blue">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Zap className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma automação cadastrada.</p>
            <Button onClick={openNew} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Criar primeira automação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AnimatePresence>
            {automations.map((a) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                layout
              >
                <Card className="glass-panel hover:glow-border-blue transition-all duration-300">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{a.name}</CardTitle>
                        {a.description && (
                          <CardDescription className="line-clamp-2">{a.description}</CardDescription>
                        )}
                      </div>
                      {statusBadge(a.last_status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {a.last_triggered_at
                          ? `Último disparo: ${new Date(a.last_triggered_at).toLocaleString("pt-BR")}`
                          : "Nunca disparado"}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(a)}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(a.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => triggerMutation.mutate(a.id)}
                          disabled={triggeringId === a.id}
                          className="gap-1.5"
                        >
                          {triggeringId === a.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Disparar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Automação" : "Nova Automação"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Atualize os dados da automação." : "Cadastre um webhook do Make para disparar manualmente."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim() || !form.webhook_url.trim()) {
                toast.error("Nome e URL do webhook são obrigatórios.");
                return;
              }
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Sync Gmail → Notion"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Opcional: descreva o que esta automação faz"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">URL do Webhook (Make)</label>
              <Input
                value={form.webhook_url}
                onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                placeholder="https://hook.us1.make.com/..."
                type="url"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingId ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Automations;
