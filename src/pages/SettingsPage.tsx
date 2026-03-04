import { useState, useEffect } from "react";
import { Settings, User, Brain, Trash2, Plus, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ProfileType = "personal" | "professional";

interface JarvisProfile {
  id?: string;
  profile_type: ProfileType;
  is_active: boolean;
  instructions: string;
  user_name: string;
  user_profession: string;
  user_preferences: Record<string, string>;
}

interface Memory {
  id: string;
  content: string;
  category: string;
  created_at: string;
}

const emptyProfile = (type: ProfileType): JarvisProfile => ({
  profile_type: type,
  is_active: type === "personal",
  instructions: "",
  user_name: "",
  user_profession: "",
  user_preferences: {},
});

const SettingsPage = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"profiles" | "memories">("profiles");
  const [selectedProfile, setSelectedProfile] = useState<ProfileType>("personal");
  const [profiles, setProfiles] = useState<Record<ProfileType, JarvisProfile>>({
    personal: emptyProfile("personal"),
    professional: emptyProfile("professional"),
  });
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMemory, setNewMemory] = useState("");
  const [newMemoryCategory, setNewMemoryCategory] = useState("general");
  const [saving, setSaving] = useState(false);
  const [newPrefKey, setNewPrefKey] = useState("");
  const [newPrefValue, setNewPrefValue] = useState("");

  useEffect(() => {
    if (!user) return;
    loadProfiles();
    loadMemories();
  }, [user]);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from("jarvis_profiles")
      .select("*")
      .eq("user_id", user!.id);

    if (data && data.length > 0) {
      const loaded = { ...profiles };
      data.forEach((p: any) => {
        loaded[p.profile_type as ProfileType] = {
          id: p.id,
          profile_type: p.profile_type,
          is_active: p.is_active,
          instructions: p.instructions || "",
          user_name: p.user_name || "",
          user_profession: p.user_profession || "",
          user_preferences: (p.user_preferences as Record<string, string>) || {},
        };
      });
      setProfiles(loaded);
    }
  };

  const loadMemories = async () => {
    const { data } = await supabase
      .from("jarvis_memories")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (data) setMemories(data as Memory[]);
  };

  const saveProfile = async (type: ProfileType) => {
    if (!user) return;
    setSaving(true);
    const p = profiles[type];

    const payload = {
      user_id: user.id,
      profile_type: type,
      is_active: p.is_active,
      instructions: p.instructions,
      user_name: p.user_name,
      user_profession: p.user_profession,
      user_preferences: p.user_preferences,
      updated_at: new Date().toISOString(),
    };

    if (p.id) {
      await supabase.from("jarvis_profiles").update(payload).eq("id", p.id);
    } else {
      const { data } = await supabase.from("jarvis_profiles").insert(payload).select("id").single();
      if (data) {
        setProfiles((prev) => ({
          ...prev,
          [type]: { ...prev[type], id: data.id },
        }));
      }
    }

    setSaving(false);
    toast.success(`Perfil ${type === "personal" ? "Pessoal" : "Profissional"} salvo!`);
  };

  const toggleActive = async (type: ProfileType) => {
    const otherType: ProfileType = type === "personal" ? "professional" : "personal";
    setProfiles((prev) => ({
      ...prev,
      [type]: { ...prev[type], is_active: true },
      [otherType]: { ...prev[otherType], is_active: false },
    }));

    // Save both
    if (profiles[type].id) {
      await supabase.from("jarvis_profiles").update({ is_active: true }).eq("id", profiles[type].id!);
    }
    if (profiles[otherType].id) {
      await supabase.from("jarvis_profiles").update({ is_active: false }).eq("id", profiles[otherType].id!);
    }
    toast.success(`Perfil ${type === "personal" ? "Pessoal" : "Profissional"} ativado!`);
  };

  const updateProfile = (type: ProfileType, field: keyof JarvisProfile, value: any) => {
    setProfiles((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const addPreference = (type: ProfileType) => {
    if (!newPrefKey.trim()) return;
    const prefs = { ...profiles[type].user_preferences, [newPrefKey]: newPrefValue };
    updateProfile(type, "user_preferences", prefs);
    setNewPrefKey("");
    setNewPrefValue("");
  };

  const removePreference = (type: ProfileType, key: string) => {
    const prefs = { ...profiles[type].user_preferences };
    delete prefs[key];
    updateProfile(type, "user_preferences", prefs);
  };

  const addMemory = async () => {
    if (!newMemory.trim() || !user) return;
    const { data } = await supabase
      .from("jarvis_memories")
      .insert({
        user_id: user.id,
        content: newMemory,
        category: newMemoryCategory,
      })
      .select()
      .single();

    if (data) {
      setMemories((prev) => [data as Memory, ...prev]);
      setNewMemory("");
      toast.success("Memória adicionada!");
    }
  };

  const deleteMemory = async (id: string) => {
    await supabase.from("jarvis_memories").delete().eq("id", id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
    toast.success("Memória removida.");
  };

  const profile = profiles[selectedProfile];

  return (
    <div className={`flex flex-col h-screen ${isMobile ? "p-3" : "p-6"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Settings size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Configurações</h1>
          <p className="text-xs text-muted-foreground">Personalize o Jarvis e suas memórias</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("profiles")}
          className={`px-4 py-2 rounded-lg text-sm font-body transition-all ${
            activeTab === "profiles"
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          <User size={14} className="inline mr-1.5" /> Perfis
        </button>
        <button
          onClick={() => setActiveTab("memories")}
          className={`px-4 py-2 rounded-lg text-sm font-body transition-all ${
            activeTab === "memories"
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          <Brain size={14} className="inline mr-1.5" /> Memórias
        </button>
      </div>

      {activeTab === "profiles" && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Profile selector */}
          <div className="flex gap-3">
            {(["personal", "professional"] as ProfileType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedProfile(type)}
                className={`flex-1 p-4 rounded-xl text-sm font-body transition-all border ${
                  selectedProfile === type
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/50 bg-card hover:border-primary/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-foreground">
                    {type === "personal" ? "🏠 Pessoal" : "💼 Profissional"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(type);
                    }}
                    className="text-xs"
                    title={profiles[type].is_active ? "Perfil ativo" : "Ativar perfil"}
                  >
                    {profiles[type].is_active ? (
                      <ToggleRight size={22} className="text-primary" />
                    ) : (
                      <ToggleLeft size={22} className="text-muted-foreground" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {profiles[type].is_active ? "Ativo" : "Inativo"}
                </p>
              </button>
            ))}
          </div>

          {/* Instructions */}
          <div className="glass-panel p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-medium text-foreground">📝 Instruções de comportamento</h3>
            <p className="text-xs text-muted-foreground">
              Defina como o Jarvis deve se comportar neste perfil (tom, regras, estilo de resposta)
            </p>
            <textarea
              value={profile.instructions}
              onChange={(e) => updateProfile(selectedProfile, "instructions", e.target.value)}
              placeholder="Ex: Seja mais informal e use gírias. Priorize respostas curtas. Sempre sugira links relevantes..."
              className="w-full h-32 bg-background/50 border border-border/50 rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          {/* Personal info */}
          <div className="glass-panel p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-medium text-foreground">👤 Informações pessoais</h3>
            <p className="text-xs text-muted-foreground">
              Dados que o Jarvis pode usar para personalizar respostas
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                <input
                  value={profile.user_name}
                  onChange={(e) => updateProfile(selectedProfile, "user_name", e.target.value)}
                  placeholder="Seu nome"
                  className="w-full bg-background/50 border border-border/50 rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Profissão</label>
                <input
                  value={profile.user_profession}
                  onChange={(e) => updateProfile(selectedProfile, "user_profession", e.target.value)}
                  placeholder="Sua profissão"
                  className="w-full bg-background/50 border border-border/50 rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="glass-panel p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-medium text-foreground">⚙️ Preferências</h3>
            <p className="text-xs text-muted-foreground">
              Adicione preferências personalizadas (ex: idioma preferido, fuso horário, etc.)
            </p>
            {Object.entries(profile.user_preferences).length > 0 && (
              <div className="space-y-2">
                {Object.entries(profile.user_preferences).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
                    <span className="text-xs font-medium text-foreground flex-1">{key}</span>
                    <span className="text-xs text-muted-foreground flex-1">{value}</span>
                    <button onClick={() => removePreference(selectedProfile, key)} className="text-destructive hover:text-destructive/80">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newPrefKey}
                onChange={(e) => setNewPrefKey(e.target.value)}
                placeholder="Chave"
                className="flex-1 bg-background/50 border border-border/50 rounded-lg p-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
              />
              <input
                value={newPrefValue}
                onChange={(e) => setNewPrefValue(e.target.value)}
                placeholder="Valor"
                className="flex-1 bg-background/50 border border-border/50 rounded-lg p-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button onClick={() => addPreference(selectedProfile)} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={() => saveProfile(selectedProfile)}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-body text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar perfil"}
          </button>
        </div>
      )}

      {activeTab === "memories" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="glass-panel p-4 rounded-xl space-y-3">
            <h3 className="text-sm font-medium text-foreground">➕ Adicionar memória</h3>
            <p className="text-xs text-muted-foreground">
              Ensine algo ao Jarvis — ele vai lembrar disso nas próximas conversas
            </p>
            <textarea
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder="Ex: Meu time favorito é o Flamengo. Prefiro café sem açúcar. Meu aniversário é 15/03..."
              className="w-full h-20 bg-background/50 border border-border/50 rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/40 transition-colors"
            />
            <div className="flex gap-2">
              <select
                value={newMemoryCategory}
                onChange={(e) => setNewMemoryCategory(e.target.value)}
                className="bg-background/50 border border-border/50 rounded-lg p-2 text-xs text-foreground outline-none"
              >
                <option value="general">Geral</option>
                <option value="preference">Preferência</option>
                <option value="personal">Pessoal</option>
                <option value="work">Trabalho</option>
              </select>
              <button
                onClick={addMemory}
                disabled={!newMemory.trim()}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          </div>

          {memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Brain size={32} className="mx-auto mb-3 opacity-30" />
              Nenhuma memória salva ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="glass-panel p-3 rounded-xl flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{m.content}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {m.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMemory(m.id)}
                    className="text-destructive/60 hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
