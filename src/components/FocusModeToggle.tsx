import { useState, useEffect } from "react";
import { Target, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const FOCUS_DURATIONS = [25, 50, 90]; // Pomodoro-inspired

const FocusModeToggle = () => {
  const { user } = useAuth();
  const [focusActive, setFocusActive] = useState(false);
  const [focusUntil, setFocusUntil] = useState<Date | null>(null);
  const [remainingMin, setRemainingMin] = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  // Load focus state from profile
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("jarvis_profiles")
        .select("focus_mode, focus_until")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);

      if (data && data.length > 0) {
        const p = data[0] as any;
        if (p.focus_mode && p.focus_until && new Date(p.focus_until) > new Date()) {
          setFocusActive(true);
          setFocusUntil(new Date(p.focus_until));
        } else if (p.focus_mode) {
          // Expired, turn off
          await supabase.from("jarvis_profiles").update({ focus_mode: false, focus_until: null }).eq("user_id", user.id).eq("is_active", true);
        }
      }
    };
    load();
  }, [user]);

  // Countdown timer
  useEffect(() => {
    if (!focusActive || !focusUntil) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.round((focusUntil.getTime() - Date.now()) / 60000));
      setRemainingMin(diff);
      if (diff <= 0) {
        setFocusActive(false);
        setFocusUntil(null);
        toast.success("🎯 Sessão de foco encerrada! Bom trabalho.");
        if (user) {
          supabase.from("jarvis_profiles").update({ focus_mode: false, focus_until: null }).eq("user_id", user.id).eq("is_active", true);
        }
      }
    }, 10000);
    // Initial
    setRemainingMin(Math.max(0, Math.round((focusUntil.getTime() - Date.now()) / 60000)));
    return () => clearInterval(interval);
  }, [focusActive, focusUntil, user]);

  const startFocus = async (minutes: number) => {
    if (!user) return;
    const until = new Date(Date.now() + minutes * 60 * 1000);
    await supabase.from("jarvis_profiles").update({
      focus_mode: true,
      focus_until: until.toISOString(),
    }).eq("user_id", user.id).eq("is_active", true);
    setFocusActive(true);
    setFocusUntil(until);
    setShowPicker(false);
    toast.success(`🎯 Modo foco ativado por ${minutes} minutos`);
  };

  const stopFocus = async () => {
    if (!user) return;
    await supabase.from("jarvis_profiles").update({ focus_mode: false, focus_until: null }).eq("user_id", user.id).eq("is_active", true);
    setFocusActive(false);
    setFocusUntil(null);
    toast("Modo foco desativado");
  };

  if (focusActive) {
    return (
      <button
        onClick={stopFocus}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/20 text-accent text-xs font-semibold animate-pulse transition-all hover:bg-accent/30"
        title="Clique para desativar o modo foco"
      >
        <Target size={14} />
        <span>{remainingMin}min</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="p-2 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
        title="Modo foco"
      >
        <Target size={18} />
      </button>

      {showPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
          <div className="absolute right-0 top-12 z-50 glass-panel rounded-xl p-3 space-y-2 min-w-[140px]">
            <p className="text-[10px] font-display tracking-widest text-primary">MODO FOCO</p>
            {FOCUS_DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => startFocus(d)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-primary/10 transition-colors"
              >
                <Timer size={12} className="text-primary" />
                {d} minutos
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FocusModeToggle;
