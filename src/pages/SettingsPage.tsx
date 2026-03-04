import { useState, useEffect } from "react";
import { Settings, User, Brain, Trash2, Plus, Save, ToggleLeft, ToggleRight, Volume2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ProfileType = "personal" | "professional";

interface VoiceSettings {
  voice_id: string;
  speed: number;
  stability: number;
  similarity_boost: number;
  style: number;
}

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voice_id: "eUAnqvLQWNX29twcYLUM",
  speed: 1.2,
  stability: 0.6,
  similarity_boost: 0.9,
  style: 0.3,
};

const VOICE_OPTIONS = [
  // 🟣 Educacional / Notícias
  { id: "eUAnqvLQWNX29twcYLUM", name: "Dyego - Notícias (Padrão)", category: "📰 Educacional" },
  { id: "6pQlwCgfwffNdI3jjzM6", name: "Fernando Borges - Calmo e Versátil", category: "📰 Educacional" },
  // 🔵 Narração
  { id: "lWq4KDY8znfkV0DrK8Vb", name: "Yasmin Alves - Leve e Musical", category: "🎙️ Narração" },
  { id: "CstacWqMhJQlnfLPxRG4", name: "Will - Profundo e Afetuoso", category: "🎙️ Narração" },
  { id: "h96v1HCJtcisNNeagp0R", name: "Will - Suspense", category: "🎙️ Narração" },
  { id: "QWzA13xdHsD8GLBwVILU", name: "Will - Dramático e Cativante", category: "🎙️ Narração" },
  { id: "IlrWo5tGgTuxNTHyGhWD", name: "Vagner de Souza - Claro e Articulado", category: "🎙️ Narração" },
  { id: "vr6MVhO51WHYH7ev2Qn9", name: "Onildo Rocha - Maduro e Calmo", category: "🎙️ Narração" },
  { id: "7s3YtmzXx3fjwUtedUN0", name: "Helena - Histórias Infantis", category: "🎙️ Narração" },
  { id: "dX7gRq1dIvLTgUaWpEFn", name: "Rafael Valente - Jovem e Cativante", category: "🎙️ Narração" },
  { id: "MZxV5lN3cv7hi1376O0m", name: "Ana Dias - Envolvente e Suave", category: "🎙️ Narração" },
  { id: "oJebhZNaPllxk6W0LSBA", name: "Carla - Histórias Infantis", category: "🎙️ Narração" },
  { id: "x3mAOLD9WzlmrFCwA1S3", name: "Evelin Perdomo - Suave e Expressiva", category: "🎙️ Narração" },
  { id: "YNOujSUmHtgN6anjqXPf", name: "Victor Power - Sábio e Profundo", category: "🎙️ Narração" },
  { id: "7i7dgyCkKt4c16dLtwT3", name: "David - Trailer Épico", category: "🎙️ Narração" },
  { id: "hwnuNyWkl9DjdTFykrN6", name: "Adriano - Profundo e Robusto", category: "🎙️ Narração" },
  { id: "33B4UnXyTNbgLmdEDh5P", name: "Keren - Doce e Rítmica", category: "🎙️ Narração" },
  { id: "lRbfoJL2IRJBT7ma6o7n", name: "Rita - Jovem e Vibrante", category: "🎙️ Narração" },
  { id: "Eyspt3SYhZzXd1Jd3J8O", name: "Bia - Direta e Assertiva", category: "🎙️ Narração" },
  { id: "y3X5crcIDtFawPx7bcNq", name: "Eliel - Grave e Comandante", category: "🎙️ Narração" },
  { id: "QJd9SLe6MVCdF6DR0EAu", name: "Gabby - Calma e Suave", category: "🎙️ Narração" },
  { id: "x6uRgOliu4lpcrqMH3s1", name: "Flavio Francisco - Profundo e Cativante", category: "🎙️ Narração" },
  { id: "YbP0Eq5RE5uOoCEl7F3T", name: "Weverton - Jovem e Energético", category: "🎙️ Narração" },
  { id: "hd5xzUNI8bF3Lvk3KkTO", name: "Juliana Barbieri - Expressiva", category: "🎙️ Narração" },
  { id: "EIkHVdkuarjkYUyMnoes", name: "Nelton - Profundo e Consistente", category: "🎙️ Narração" },
  // 🟢 Conversacional
  { id: "ec54d9BmuMSN4IinPrjv", name: "Will - Natural e Conversacional", category: "💬 Conversacional" },
  { id: "NQ10OlqJ7vYH6XwegHSW", name: "Lucke - Direto e Neutro", category: "💬 Conversacional" },
  { id: "ZxeM4498ujGNHYhQXtLS", name: "Davi - Amigável e Diplomático", category: "💬 Conversacional" },
  { id: "cyD08lEy76q03ER1jZ7y", name: "Scheila - Séria e Direta", category: "💬 Conversacional" },
  { id: "Zk0wRqIFBWGMu2lIk7hw", name: "Marcio - Ousado e Cativante", category: "💬 Conversacional" },
  { id: "7u8qsX4HQsSHJ0f8xsQZ", name: "João Pedro - Dinâmico", category: "💬 Conversacional" },
  { id: "xWdpADtEio43ew1zGxUQ", name: "Matheus Santos - Amigável e Calmo", category: "💬 Conversacional" },
  { id: "MjS9ecoVZlOFzvnemirW", name: "Muhammad Umm - Formal e Didático", category: "💬 Conversacional" },
  // 🟡 Mídias Sociais
  { id: "4za2kOXGgUd57HRSQ1fn", name: "Lendário - Alegre e Vibrante", category: "📱 Social Media" },
  { id: "0YziWIrqiRTHCxeg1lyc", name: "Will - Dinâmico e Cativante", category: "📱 Social Media" },
  { id: "iScHbNW8K33gNo3lGgbo", name: "Marianne - Doce e Calma", category: "📱 Social Media" },
  // 🔴 Comercial
  { id: "UNlPbm2VdUhPl6lNL6D6", name: "Diego - Locutor Confiante", category: "📢 Comercial" },
  { id: "UaeEQHfiDI8l58WWXiwS", name: "Leonardo Hamaral - Quente e Confiante", category: "📢 Comercial" },
  // 🎭 Personagens
  { id: "tS45q0QcrDHqHoaWdCDR", name: "Lax - Engraçado e Sarcástico", category: "🎭 Personagens" },
  { id: "9pDzHy2OpOgeXM8SeL0t", name: "Borges - Calmo e Confiante", category: "🎭 Personagens" },
  { id: "ycxdm1PRMs962FxyyuJ0", name: "Otto - Intimidante e Épico", category: "🎭 Personagens" },
  { id: "oQL5kq26ctJzupM0mJot", name: "Noel Natal - Caloroso e Festivo", category: "🎭 Personagens" },
];

interface JarvisProfile {
  id?: string;
  profile_type: ProfileType;
  is_active: boolean;
  instructions: string;
  user_name: string;
  user_profession: string;
  user_preferences: Record<string, string>;
  voice_settings: VoiceSettings;
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
  voice_settings: { ...DEFAULT_VOICE_SETTINGS },
});

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

const SettingsPage = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"profiles" | "voice" | "memories">("profiles");
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
  const [testingVoice, setTestingVoice] = useState(false);

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
          voice_settings: (p.voice_settings as VoiceSettings) || { ...DEFAULT_VOICE_SETTINGS },
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
      user_preferences: p.user_preferences as any,
      voice_settings: p.voice_settings as any,
      updated_at: new Date().toISOString(),
    };

    if (p.id) {
      await supabase.from("jarvis_profiles").update(payload as any).eq("id", p.id);
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

  const updateVoiceSetting = (key: keyof VoiceSettings, value: any) => {
    const activeType = profiles.personal.is_active ? "personal" : "professional";
    setProfiles((prev) => ({
      ...prev,
      [activeType]: {
        ...prev[activeType],
        voice_settings: { ...prev[activeType].voice_settings, [key]: value },
      },
    }));
  };

  const testVoice = async () => {
    const activeType = profiles.personal.is_active ? "personal" : "professional";
    const vs = profiles[activeType].voice_settings;
    setTestingVoice(true);
    try {
      const response = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          text: "Olá Senhor, esta é a voz configurada para o seu assistente Jarvis. Como posso ajudá-lo hoje?",
          voiceId: vs.voice_id,
          speed: vs.speed,
          stability: vs.stability,
          similarity_boost: vs.similarity_boost,
          style: vs.style,
        }),
      });
      if (!response.ok) {
        toast.error("Erro ao testar voz");
        setTestingVoice(false);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setTestingVoice(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setTestingVoice(false); };
      audio.play();
    } catch {
      toast.error("Erro ao testar voz");
      setTestingVoice(false);
    }
  };

  const saveVoiceSettings = async () => {
    const activeType = profiles.personal.is_active ? "personal" : "professional";
    await saveProfile(activeType);
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
  const activeType = profiles.personal.is_active ? "personal" : "professional";
  const voiceSettings = profiles[activeType].voice_settings;

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
      <div className="flex gap-2 mb-6 flex-wrap">
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
          onClick={() => setActiveTab("voice")}
          className={`px-4 py-2 rounded-lg text-sm font-body transition-all ${
            activeTab === "voice"
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          <Volume2 size={14} className="inline mr-1.5" /> Voz
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
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">🌤️ Cidade (para clima e notícias)</label>
                <input
                  value={profile.user_preferences?.city || ""}
                  onChange={(e) => {
                    const prefs = { ...profile.user_preferences, city: e.target.value };
                    updateProfile(selectedProfile, "user_preferences", prefs);
                  }}
                  placeholder="Ex: Campo Grande, São Paulo, Curitiba..."
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
            {Object.entries(profile.user_preferences).filter(([key]) => key !== "city").length > 0 && (
              <div className="space-y-2">
                {Object.entries(profile.user_preferences).filter(([key]) => key !== "city").map(([key, value]) => (
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

      {activeTab === "voice" && (
        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="glass-panel p-4 rounded-xl space-y-4">
            <h3 className="text-sm font-medium text-foreground">🎙️ Voz do Jarvis</h3>
            <p className="text-xs text-muted-foreground">
              Escolha a voz e ajuste velocidade, estabilidade e estilo. As configurações se aplicam ao perfil ativo ({activeType === "personal" ? "Pessoal" : "Profissional"}).
            </p>

            {/* Voice select */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Voz</label>
              <select
                value={voiceSettings.voice_id}
                onChange={(e) => updateVoiceSetting("voice_id", e.target.value)}
                className="w-full bg-background/50 border border-border/50 rounded-lg p-2.5 text-sm text-foreground outline-none focus:border-primary/40 transition-colors"
              >
                {Array.from(new Set(VOICE_OPTIONS.map((v) => v.category))).map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {VOICE_OPTIONS.filter((v) => v.category === cat).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Speed */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs text-muted-foreground">Velocidade</label>
                <span className="text-xs font-medium text-foreground">{voiceSettings.speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.7"
                max="1.2"
                step="0.05"
                value={voiceSettings.speed}
                onChange={(e) => updateVoiceSetting("speed", parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Lenta (0.7x)</span>
                <span>Rápida (1.2x)</span>
              </div>
            </div>

            {/* Stability */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs text-muted-foreground">Estabilidade</label>
                <span className="text-xs font-medium text-foreground">{(voiceSettings.stability * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={voiceSettings.stability}
                onChange={(e) => updateVoiceSetting("stability", parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Expressiva</span>
                <span>Estável</span>
              </div>
            </div>

            {/* Similarity */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs text-muted-foreground">Fidelidade da voz</label>
                <span className="text-xs font-medium text-foreground">{(voiceSettings.similarity_boost * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={voiceSettings.similarity_boost}
                onChange={(e) => updateVoiceSetting("similarity_boost", parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Variada</span>
                <span>Original</span>
              </div>
            </div>

            {/* Style */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs text-muted-foreground">Estilo / Expressividade</label>
                <span className="text-xs font-medium text-foreground">{(voiceSettings.style * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={voiceSettings.style}
                onChange={(e) => updateVoiceSetting("style", parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Neutro</span>
                <span>Dramático</span>
              </div>
            </div>
          </div>

          {/* Test + Save buttons */}
          <div className="flex gap-3">
            <button
              onClick={testVoice}
              disabled={testingVoice}
              className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground font-body text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 border border-border/50"
            >
              <Play size={16} />
              {testingVoice ? "Reproduzindo..." : "Testar voz"}
            </button>
            <button
              onClick={saveVoiceSettings}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-body text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={16} />
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
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
