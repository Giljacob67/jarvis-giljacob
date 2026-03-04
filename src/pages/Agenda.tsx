import { useState, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Pencil,
  MapPin,
  Clock,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { format, parseISO, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

interface EventForm {
  summary: string;
  description: string;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

const emptyForm: EventForm = {
  summary: "",
  description: "",
  location: "",
  startDate: "",
  startTime: "09:00",
  endDate: "",
  endTime: "10:00",
};

const Agenda = () => {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Check connection
  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase.functions.invoke("gmail-auth", {
          body: { action: "check_connection" },
        });
        setConnected(data?.connected || false);
      } catch {
        setConnected(false);
      }
    };
    check();
  }, []);

  // Fetch events for current month
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const timeMin = startOfMonth(currentMonth).toISOString();
      const timeMax = endOfMonth(currentMonth).toISOString();
      const { data, error } = await supabase.functions.invoke("calendar-api", {
        body: { action: "list", timeMin, timeMax },
      });
      if (error) throw error;
      setEvents(data?.events || []);
    } catch (e: any) {
      toast.error("Erro ao carregar eventos");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    if (connected) fetchEvents();
  }, [connected, fetchEvents]);

  // Connect Google
  const handleConnect = async () => {
    try {
      const redirectUri = window.location.origin + "/agenda";
      const { data } = await supabase.functions.invoke("gmail-auth", {
        body: { action: "get_auth_url", redirectUri },
      });
      if (data?.url) window.location.href = data.url;
    } catch {
      toast.error("Erro ao conectar com Google");
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    const exchange = async () => {
      try {
        const redirectUri = window.location.origin + "/agenda";
        const { data, error } = await supabase.functions.invoke("gmail-auth", {
          body: { action: "exchange_code", code, redirectUri },
        });
        if (error) throw error;
        if (data?.success) {
          setConnected(true);
          toast.success("Google conectado com sucesso!");
          window.history.replaceState({}, "", "/agenda");
        }
      } catch {
        toast.error("Erro ao trocar código OAuth");
      }
    };
    exchange();
  }, []);

  const getEventDate = (event: CalendarEvent) => {
    return event.start.dateTime ? parseISO(event.start.dateTime) : event.start.date ? parseISO(event.start.date) : new Date();
  };

  const eventsForSelectedDate = events.filter((e) => isSameDay(getEventDate(e), selectedDate));

  const datesWithEvents = events.map((e) => getEventDate(e));

  // Open create dialog
  const openCreate = () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    setForm({ ...emptyForm, startDate: dateStr, endDate: dateStr });
    setEditingEvent(null);
    setDialogOpen(true);
  };

  // Open edit dialog
  const openEdit = (event: CalendarEvent) => {
    const start = event.start.dateTime ? parseISO(event.start.dateTime) : null;
    const end = event.end.dateTime ? parseISO(event.end.dateTime) : null;
    setForm({
      summary: event.summary || "",
      description: event.description || "",
      location: event.location || "",
      startDate: start ? format(start, "yyyy-MM-dd") : event.start.date || "",
      startTime: start ? format(start, "HH:mm") : "09:00",
      endDate: end ? format(end, "yyyy-MM-dd") : event.end.date || "",
      endTime: end ? format(end, "HH:mm") : "10:00",
    });
    setEditingEvent(event);
    setDialogOpen(true);
  };

  // Save event
  const handleSave = async () => {
    if (!form.summary.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const startDateTime = `${form.startDate}T${form.startTime}:00`;
      const endDateTime = `${form.endDate}T${form.endTime}:00`;

      const body: any = {
        action: editingEvent ? "update" : "create",
        summary: form.summary,
        description: form.description,
        location: form.location,
        startDateTime,
        endDateTime,
      };
      if (editingEvent) body.eventId = editingEvent.id;

      const { data, error } = await supabase.functions.invoke("calendar-api", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(editingEvent ? "Evento atualizado!" : "Evento criado!");
      setDialogOpen(false);
      fetchEvents();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar evento");
    } finally {
      setSaving(false);
    }
  };

  // Delete event
  const handleDelete = async (eventId: string) => {
    try {
      const { error } = await supabase.functions.invoke("calendar-api", {
        body: { action: "delete", eventId },
      });
      if (error) throw error;
      toast.success("Evento deletado!");
      fetchEvents();
    } catch {
      toast.error("Erro ao deletar evento");
    }
  };

  // Not connected state
  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="glass-panel p-8 text-center max-w-md glow-blue">
          <CalendarIcon className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">Conectar Google Calendar</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Conecte sua conta Google para visualizar e gerenciar seus eventos do calendário.
          </p>
          <Button onClick={handleConnect} className="gap-2">
            <CalendarIcon className="w-4 h-4" />
            Conectar Google
          </Button>
        </div>
      </div>
    );
  }

  if (connected === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-6 h-full overflow-auto">
      {/* Calendar Panel */}
      <div className="glass-panel p-4 lg:p-6 glow-border-blue shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground text-lg">Agenda</h2>
          <Button size="sm" onClick={openCreate} className="gap-1">
            <Plus className="w-4 h-4" />
            Novo
          </Button>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(d) => d && setSelectedDate(d)}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          locale={ptBR}
          className="pointer-events-auto"
          modifiers={{ hasEvent: datesWithEvents }}
          modifiersClassNames={{ hasEvent: "bg-primary/20 font-bold text-primary" }}
        />
      </div>

      {/* Events List */}
      <div className="glass-panel p-4 lg:p-6 flex-1 glow-border-blue overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-foreground">
            {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
          </h3>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {eventsForSelectedDate.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum evento neste dia.</p>
        ) : (
          <div className="space-y-3">
            {eventsForSelectedDate.map((event) => {
              const start = event.start.dateTime ? parseISO(event.start.dateTime) : null;
              const end = event.end.dateTime ? parseISO(event.end.dateTime) : null;
              return (
                <div
                  key={event.id}
                  className="glass-panel p-4 hover:glow-blue transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground truncate">{event.summary}</h4>
                      {start && end && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="w-3 h-3" />
                          {format(start, "HH:mm")} – {format(end, "HH:mm")}
                        </div>
                      )}
                      {event.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{event.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(event)} className="h-7 w-7">
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(event.id)} className="h-7 w-7 text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingEvent ? "Editar Evento" : "Novo Evento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="summary">Título</Label>
              <Input
                id="summary"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Título do evento"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="startDate">Data início</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="startTime">Hora início</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="endDate">Data fim</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="endTime">Hora fim</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="location">Local</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Local do evento"
              />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descrição do evento"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingEvent ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Agenda;
