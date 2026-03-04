import { useState, useRef, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Volume2, VolumeX, Newspaper, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import JarvisAvatar from "@/components/JarvisAvatar";
import VoiceOrb from "@/components/VoiceOrb";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useMediaRecorderSTT } from "@/hooks/use-media-recorder-stt";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

async function streamChat({
  messages,
  profile,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  profile?: any;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ messages, profile }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError(data.error || "Erro ao conectar com Jarvis.");
    return;
  }

  if (!resp.body) {
    onError("Resposta vazia do servidor.");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { done = true; break; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  if (buffer.trim()) {
    for (let raw of buffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/---+/g, '')
    .replace(/\|/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function playElevenLabsTTS(text: string, voiceSettings?: any): Promise<boolean> {
  try {
    const cleanText = stripMarkdown(text);
    if (!cleanText) return false;

    const vs = voiceSettings || {};
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        text: cleanText,
        voiceId: vs.voice_id,
        speed: vs.speed,
        stability: vs.stability,
        similarity_boost: vs.similarity_boost,
        style: vs.style,
      }),
    });

    if (!response.ok) return false;

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    return new Promise((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(true); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve(false); };
      audio.play().catch(() => resolve(false));
    });
  } catch {
    return false;
  }
}

const Chat = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const voiceTranscriptRef = useRef("");
  const shouldAutoSendRef = useRef(false);
  const [activeProfile, setActiveProfile] = useState<any>(null);

  const stt = useSpeechRecognition({
    onResult: (transcript) => {
      voiceTranscriptRef.current = voiceTranscriptRef.current
        ? voiceTranscriptRef.current + " " + transcript
        : transcript;
      setInput(voiceTranscriptRef.current);
    },
    onEnd: () => {
      if (shouldAutoSendRef.current && voiceTranscriptRef.current.trim()) {
        setTimeout(() => {
          shouldAutoSendRef.current = false;
          const btn = document.getElementById("jarvis-send-btn");
          btn?.click();
        }, 100);
      }
      shouldAutoSendRef.current = false;
    },
  });

  const mediaSTT = useMediaRecorderSTT({
    onResult: (transcript) => {
      voiceTranscriptRef.current = transcript;
      setInput(transcript);
    },
    onEnd: () => {
      if (shouldAutoSendRef.current && voiceTranscriptRef.current.trim()) {
        setTimeout(() => {
          shouldAutoSendRef.current = false;
          const btn = document.getElementById("jarvis-send-btn");
          btn?.click();
        }, 100);
      }
      shouldAutoSendRef.current = false;
    },
  });

  const useNativeSTT = stt.isSupported;
  const voiceIsListening = useNativeSTT ? stt.isListening : mediaSTT.isListening;
  const voiceIsSupported = useNativeSTT ? stt.isSupported : mediaSTT.isSupported;
  const voiceIsTranscribing = !useNativeSTT && mediaSTT.isTranscribing;

  // Load or create conversation
  useEffect(() => {
    if (!user) return;
    const loadConversation = async () => {
      const { data: convos } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      let convId: string;
      if (convos && convos.length > 0) {
        convId = convos[0].id;
      } else {
        const { data: newConvo } = await supabase
          .from("conversations")
          .insert({ user_id: user.id, title: "Nova conversa" })
          .select("id")
          .single();
        convId = newConvo!.id;
      }
      setConversationId(convId);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (msgs && msgs.length > 0) {
        setMessages(
          msgs.map((m: any) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.created_at),
          }))
        );
      } else {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: "Bom dia, Senhor. Estou online e pronto para ajudar. Como posso ser útil hoje?",
            timestamp: new Date(),
          },
        ]);
      }
    };
    loadConversation();
  }, [user]);

  // Load active profile
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const { data: profiles } = await supabase
        .from("jarvis_profiles")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);

      if (profiles && profiles.length > 0) {
        const p = profiles[0] as any;
        const { data: mems } = await supabase
          .from("jarvis_memories")
          .select("content")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        setActiveProfile({
          instructions: p.instructions,
          user_name: p.user_name,
          user_profession: p.user_profession,
          user_preferences: p.user_preferences,
          voice_settings: p.voice_settings,
          memories: mems?.map((m: any) => m.content) || [],
        });
      }
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const persistMessage = async (role: "user" | "assistant", content: string) => {
    if (!user || !conversationId) return;
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role,
      content,
    });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    persistMessage("user", text);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let assistantContent = "";

    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      const content = assistantContent;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id.startsWith("stream-")) {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content } : m
          );
        }
        return [
          ...prev,
          { id: "stream-" + Date.now(), role: "assistant", content, timestamp: new Date() },
        ];
      });
    };

    try {
      await streamChat({
        messages: history,
        profile: activeProfile || undefined,
        onDelta: upsertAssistant,
        onDone: async () => {
          setIsLoading(false);
          if (assistantContent) {
            persistMessage("assistant", assistantContent);
          }
          if (ttsEnabled && assistantContent) {
            setIsSpeaking(true);
            const played = await playElevenLabsTTS(assistantContent, activeProfile?.voice_settings);
            if (!played) {
              const utterance = new SpeechSynthesisUtterance(stripMarkdown(assistantContent));
              utterance.lang = "pt-BR";
              utterance.onend = () => setIsSpeaking(false);
              utterance.onerror = () => setIsSpeaking(false);
              window.speechSynthesis.speak(utterance);
              return;
            }
            setIsSpeaking(false);
          }
        },
        onError: (msg) => {
          toast.error(msg);
          setIsLoading(false);
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Erro de conexão com Jarvis.");
      setIsLoading(false);
    }
  }, [input, isLoading, messages, ttsEnabled, conversationId, user, activeProfile]);

  const exportChat = () => {
    const text = messages
      .map((m) => `[${m.timestamp.toLocaleString("pt-BR")}] ${m.role === "user" ? "Você" : "Jarvis"}: ${m.content}`)
      .join("\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat exportado!");
  };

  const handleOrbDown = () => {
    voiceTranscriptRef.current = "";
    shouldAutoSendRef.current = true;
    if (useNativeSTT) stt.start(); else mediaSTT.start();
  };

  const handleOrbUp = () => {
    shouldAutoSendRef.current = true;
    if (useNativeSTT) stt.stop(); else mediaSTT.stop();
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center gap-4">
        <JarvisAvatar size="sm" isSpeaking={isLoading || isSpeaking} isListening={voiceIsListening} />
        <div className="flex-1">
          <h1 className="font-heading text-xl font-bold text-foreground">Chat com Jarvis</h1>
          <p className="text-xs text-muted-foreground">
            {voiceIsTranscribing ? "Transcrevendo..." : isSpeaking ? "Falando..." : isLoading ? "Processando..." : voiceIsListening ? "Ouvindo..." : "Converse por texto ou voz"}
          </p>
        </div>
        <button
          onClick={() => {
            if (isSpeaking) window.speechSynthesis.cancel();
            setTtsEnabled(!ttsEnabled);
            setIsSpeaking(false);
          }}
          className={`p-2 rounded-xl transition-all ${
            ttsEnabled ? "bg-accent/20 text-accent" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
          title={ttsEnabled ? "Desativar voz" : "Ativar voz"}
        >
          {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? "p-3" : "p-6"} space-y-4`}>
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 mt-1">
                  <JarvisAvatar size="sm" />
                </div>
              )}
              <div
                className={`${isMobile ? "max-w-[85%]" : "max-w-[70%]"} p-4 rounded-2xl text-sm font-body leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary/15 text-foreground border border-primary/20"
                    : "glass-panel glow-border-blue text-foreground"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
                <p className="text-[10px] text-muted-foreground mt-2">
                  {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 justify-start">
            <div className="flex-shrink-0 mt-1">
              <JarvisAvatar size="sm" isSpeaking />
            </div>
            <div className="glass-panel glow-border-blue p-4 rounded-2xl">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      {/* Voice Orb + Input Area */}
      <div className="p-4 border-t border-border/50 space-y-3">
        {/* Orb + Quick Actions */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setNewsOpen(true)}
            className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
            title="Notícias do dia"
          >
            <Newspaper size={20} />
          </button>

          <VoiceOrb
            isListening={voiceIsListening}
            isTranscribing={voiceIsTranscribing}
            isSpeaking={isSpeaking}
            disabled={!voiceIsSupported || voiceIsTranscribing || isLoading}
            onPointerDown={handleOrbDown}
            onPointerUp={handleOrbUp}
          />

          <button
            onClick={exportChat}
            className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
            title="Exportar conversa"
          >
            <Download size={20} />
          </button>
        </div>

        {/* Text Input */}
        <div className="glass-panel flex items-center gap-3 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Fale com Jarvis..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm font-body outline-none"
            disabled={isLoading}
          />
          <button
            id="jarvis-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-30 hover:bg-primary/80 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* News Dialog */}
      <Dialog open={newsOpen} onOpenChange={setNewsOpen}>
        <DialogContent className="glass-panel border-border/50">
          <DialogHeader>
            <DialogTitle className="font-display text-sm tracking-widest text-accent">JORNAL DO DIA</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Configure a API de notícias para ver as manchetes do dia aqui.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chat;
