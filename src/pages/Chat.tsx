import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Loader2, Volume2, VolumeX } from "lucide-react";
import ReactMarkdown from "react-markdown";
import JarvisAvatar from "@/components/JarvisAvatar";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const errorMsg = data.error || "Erro ao conectar com Jarvis.";
    onError(errorMsg);
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

  // flush remaining
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

const initialMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Bom dia, Senhor. Estou online e pronto para ajudar. Como posso ser útil hoje?",
    timestamp: new Date(),
  },
];

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis();

  const stt = useSpeechRecognition({
    onResult: (transcript) => {
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        onDelta: upsertAssistant,
        onDone: () => {
          setIsLoading(false);
          if (ttsEnabled && assistantContent) {
            speak(assistantContent);
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
  }, [input, isLoading, messages, ttsEnabled, speak]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-6 border-b border-border/50 flex items-center gap-4">
        <JarvisAvatar size="sm" isSpeaking={isLoading || isSpeaking} isListening={stt.isListening} />
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Chat com Jarvis</h1>
          <p className="text-xs text-muted-foreground">
            {isSpeaking ? "Falando..." : isLoading ? "Processando..." : stt.isListening ? "Ouvindo..." : "Converse por texto ou voz"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                className={`max-w-[70%] p-4 rounded-2xl text-sm font-body leading-relaxed ${
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

      {/* Input */}
      <div className="p-4 border-t border-border/50">
        <div className="glass-panel flex items-center gap-3 p-3">
          <button
            onClick={stt.toggle}
            className={`p-2.5 rounded-xl transition-all ${
              stt.isListening
                ? "bg-primary text-primary-foreground arc-reactor-pulse"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
            title={stt.isSupported ? (stt.isListening ? "Parar de ouvir" : "Ativar microfone") : "Navegador não suporta reconhecimento de voz"}
            disabled={!stt.isSupported}
          >
            {stt.isListening ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <button
            onClick={() => {
              if (isSpeaking) stopSpeaking();
              setTtsEnabled(!ttsEnabled);
            }}
            className={`p-2.5 rounded-xl transition-all ${
              ttsEnabled
                ? "bg-accent/20 text-accent-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
            title={ttsEnabled ? "Desativar voz do Jarvis" : "Ativar voz do Jarvis"}
          >
            {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Fale com Jarvis..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm font-body outline-none"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-30 hover:bg-primary/80 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2 font-body">
          Diga "Hey Jarvis" para ativar por voz
        </p>
      </div>
    </div>
  );
};

export default Chat;
