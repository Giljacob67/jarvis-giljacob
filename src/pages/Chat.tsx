import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff } from "lucide-react";
import JarvisAvatar from "@/components/JarvisAvatar";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

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
  const [isListening, setIsListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulated response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Entendido, Senhor. Estou processando sua solicitação. As integrações com IA serão ativadas quando o Lovable Cloud for configurado.",
          timestamp: new Date(),
        },
      ]);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-6 border-b border-border/50 flex items-center gap-4">
        <JarvisAvatar size="sm" isSpeaking={false} isListening={isListening} />
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Chat com Jarvis</h1>
          <p className="text-xs text-muted-foreground">Converse por texto ou voz</p>
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
                {msg.content}
                <p className="text-[10px] text-muted-foreground mt-2">
                  {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/50">
        <div className="glass-panel flex items-center gap-3 p-3">
          <button
            onClick={() => setIsListening(!isListening)}
            className={`p-2.5 rounded-xl transition-all ${
              isListening
                ? "bg-primary text-primary-foreground arc-reactor-pulse"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {isListening ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Fale com Jarvis..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm font-body outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
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
