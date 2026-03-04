import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, RefreshCw, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TelegramMessage {
  message_id: number;
  from: { id: number; first_name: string; last_name?: string; username?: string; is_bot: boolean };
  chat: { id: number; first_name?: string; last_name?: string; username?: string; type: string };
  date: number;
  text?: string;
}

interface Chat {
  id: number;
  name: string;
  username?: string;
  lastMessage?: string;
  lastDate?: number;
}

interface BotInfo {
  id: number;
  first_name: string;
  username: string;
}

const Telegram = () => {
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [webhookActive, setWebhookActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const callTelegram = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("telegram-bot", {
      body: { action, ...params },
    });
    if (error) throw error;
    return data;
  }, []);

  const fetchBotInfo = useCallback(async () => {
    try {
      const data = await callTelegram("get_me");
      if (data.ok) setBotInfo(data.result);
      else toast.error("Falha ao conectar ao bot: " + (data.description || "Erro desconhecido"));
    } catch (e: any) {
      toast.error("Erro ao verificar bot: " + e.message);
    }
  }, [callTelegram]);

  const fetchUpdates = useCallback(async () => {
    try {
      const data = await callTelegram("get_updates");
      if (!data.ok) return;

      const msgs: TelegramMessage[] = data.result
        .filter((u: any) => u.message?.text)
        .map((u: any) => u.message);

      setMessages(msgs);

      const chatMap = new Map<number, Chat>();
      for (const msg of msgs) {
        const chatId = msg.chat.id;
        const existing = chatMap.get(chatId);
        if (!existing || msg.date > (existing.lastDate || 0)) {
          chatMap.set(chatId, {
            id: chatId,
            name: [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || `Chat ${chatId}`,
            username: msg.chat.username,
            lastMessage: msg.text,
            lastDate: msg.date,
          });
        }
      }
      setChats(Array.from(chatMap.values()).sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0)));
    } catch (e: any) {
      console.error("Erro ao buscar updates:", e.message);
    }
  }, [callTelegram]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedChat) return;
    setSending(true);
    try {
      const data = await callTelegram("send_message", { chat_id: selectedChat, text: input });
      if (data.ok) {
        setMessages((prev) => [...prev, data.result]);
        setInput("");
        setTimeout(fetchUpdates, 500);
      } else {
        toast.error("Erro ao enviar: " + (data.description || "Erro desconhecido"));
      }
    } catch (e: any) {
      toast.error("Erro ao enviar mensagem: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const activateWebhook = useCallback(async () => {
    try {
      const data = await callTelegram("set_webhook");
      if (data.ok) {
        setWebhookActive(true);
        toast.success("Jarvis IA ativado! O bot responderá automaticamente.");
      } else {
        toast.error("Erro ao ativar webhook: " + (data.description || ""));
      }
    } catch (e: any) {
      toast.error("Erro ao ativar webhook: " + e.message);
    }
  }, [callTelegram]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchBotInfo();
      await activateWebhook();
      setLoading(false);
    };
    init();
  }, [fetchBotInfo, activateWebhook]);

  // No more polling - webhook handles incoming messages
  // Keep manual refresh for viewing history

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedChat]);

  const chatMessages = messages.filter((m) => m.chat.id === selectedChat);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Sidebar - Chat list */}
      <div className="w-80 flex flex-col border rounded-lg bg-card">
        {/* Bot status */}
        <div className="p-3 border-b flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          {botInfo ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{botInfo.first_name}</p>
              <p className="text-xs text-muted-foreground">@{botInfo.username}</p>
            </div>
          ) : (
            <p className="text-sm text-destructive">Bot não conectado</p>
          )}
          <Badge variant="outline" className="text-xs">
            {botInfo ? (webhookActive ? "IA Ativa" : "Online") : "Offline"}
          </Badge>
        </div>

        {/* Chat list */}
        <ScrollArea className="flex-1">
          {chats.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma conversa ainda. Envie uma mensagem para o bot no Telegram.
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat.id)}
                className={cn(
                  "w-full p-3 text-left border-b hover:bg-accent/50 transition-colors",
                  selectedChat === chat.id && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{chat.name}</p>
                    {chat.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate">{chat.lastMessage}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </ScrollArea>

        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full" onClick={fetchUpdates}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col border rounded-lg bg-card">
        {!selectedChat ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecione uma conversa para começar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="p-3 border-b">
              <p className="font-medium text-sm">
                {chats.find((c) => c.id === selectedChat)?.name || `Chat ${selectedChat}`}
              </p>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {chatMessages.map((msg) => {
                  const isBot = msg.from.is_bot;
                  return (
                    <div key={msg.message_id} className={cn("flex", isBot ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg px-3 py-2 text-sm",
                          isBot
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        <p>{msg.text}</p>
                        <p className={cn("text-[10px] mt-1", isBot ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {new Date(msg.date * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t flex gap-2">
              <Input
                placeholder="Digite uma mensagem..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                disabled={sending}
              />
              <Button onClick={sendMessage} disabled={sending || !input.trim()} size="icon">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Telegram;
