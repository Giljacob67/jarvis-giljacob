import { useState, useEffect, useCallback } from "react";
import { Mail, RefreshCw, Send, ArrowLeft, Loader2, LogOut, Search, Inbox, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type EmailSummary = {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  isUnread: boolean;
};

type EmailDetail = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
};

function useGmailAuth() {
  const { session } = useAuth();

  const callAuth = useCallback(async (body: any) => {
    const resp = await fetch(`${BASE_URL}/functions/v1/gmail-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: API_KEY,
      },
      body: JSON.stringify(body),
    });
    return resp.json();
  }, [session]);

  const callApi = useCallback(async (body: any) => {
    const resp = await fetch(`${BASE_URL}/functions/v1/gmail-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: API_KEY,
      },
      body: JSON.stringify(body),
    });
    return resp.json();
  }, [session]);

  return { callAuth, callApi };
}

const Emails = () => {
  const { user, session } = useAuth();
  const { callAuth, callApi } = useGmailAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Check connection on mount
  useEffect(() => {
    if (!session) return;
    callAuth({ action: "check_connection" }).then((data) => {
      setConnected(data.connected);
      if (data.connected) loadEmails();
    });
  }, [session]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && session) {
      callAuth({
        action: "exchange_code",
        code,
        redirectUri: window.location.origin + "/emails",
      }).then((data) => {
        if (data.success) {
          setConnected(true);
          loadEmails();
          toast.success("Gmail conectado com sucesso!");
          window.history.replaceState({}, "", "/emails");
        } else {
          toast.error("Erro ao conectar: " + (data.error || "Desconhecido"));
        }
      });
    }
  }, [session]);

  const loadEmails = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      const data = await callApi({ action: "list", maxResults: 20, query: query || "" });
      if (data.error) {
        if (data.code === "NOT_CONNECTED") {
          setConnected(false);
        } else {
          toast.error(data.error);
        }
        return;
      }
      setEmails(data.messages || []);
    } catch {
      toast.error("Erro ao carregar e-mails");
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  const openEmail = async (id: string) => {
    setLoadingEmail(true);
    try {
      const data = await callApi({ action: "read", messageId: id });
      if (data.error) {
        toast.error(data.error);
        return;
      }
      setSelectedEmail(data);
      // Mark as read locally
      setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, isUnread: false } : e)));
    } catch {
      toast.error("Erro ao abrir e-mail");
    } finally {
      setLoadingEmail(false);
    }
  };

  const sendEmail = async () => {
    if (!composeTo || !composeSubject) {
      toast.error("Preencha destinatário e assunto");
      return;
    }
    setSending(true);
    try {
      const data = await callApi({
        action: "send",
        to: composeTo,
        subject: composeSubject,
        body: composeBody,
      });
      if (data.success) {
        toast.success("E-mail enviado!");
        setShowCompose(false);
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        loadEmails();
      } else {
        toast.error(data.error || "Erro ao enviar");
      }
    } catch {
      toast.error("Erro ao enviar e-mail");
    } finally {
      setSending(false);
    }
  };

  const connectGmail = async () => {
    const data = await callAuth({
      action: "get_auth_url",
      redirectUri: window.location.origin + "/emails",
    });
    if (data.url) {
      window.location.href = data.url;
    } else {
      toast.error("Erro ao gerar URL de autenticação");
    }
  };

  const disconnectGmail = async () => {
    await callAuth({ action: "disconnect" });
    setConnected(false);
    setEmails([]);
    setSelectedEmail(null);
    toast.success("Gmail desconectado");
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    } catch {
      return dateStr;
    }
  };

  const extractName = (from: string) => {
    const match = from.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : from.split("@")[0];
  };

  // Not connected state
  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6">
        <div className="p-6 rounded-full bg-primary/10 border border-primary/20">
          <Mail className="h-12 w-12 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-heading font-bold text-foreground">Conectar Gmail</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Conecte sua conta Google para ler, enviar e gerenciar seus e-mails diretamente pelo Jarvis.
          </p>
        </div>
        <Button onClick={connectGmail} className="gap-2">
          <Mail size={16} />
          Conectar conta Google
        </Button>
      </div>
    );
  }

  // Loading connection check
  if (connected === null) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Compose view
  if (showCompose) {
    return (
      <div className="flex flex-col h-screen">
        <div className="p-4 border-b border-border/50 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setShowCompose(false)}>
            <ArrowLeft size={18} />
          </Button>
          <h2 className="font-heading font-semibold text-foreground">Novo E-mail</h2>
        </div>
        <div className="flex-1 p-6 space-y-4 max-w-2xl">
          <Input
            placeholder="Para: email@exemplo.com"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
          />
          <Input
            placeholder="Assunto"
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
          />
          <Textarea
            placeholder="Escreva sua mensagem..."
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            className="min-h-[300px] resize-none"
          />
          <Button onClick={sendEmail} disabled={sending} className="gap-2">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar
          </Button>
        </div>
      </div>
    );
  }

  // Email detail view
  if (selectedEmail) {
    return (
      <div className="flex flex-col h-screen">
        <div className="p-4 border-b border-border/50 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedEmail(null)}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-semibold text-foreground truncate">{selectedEmail.subject || "(Sem assunto)"}</h2>
            <p className="text-xs text-muted-foreground">{selectedEmail.from}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-foreground">{extractName(selectedEmail.from)}</p>
              <p className="text-xs text-muted-foreground">Para: {selectedEmail.to}</p>
            </div>
            <p className="text-xs text-muted-foreground">{formatDate(selectedEmail.date)}</p>
          </div>
          <div className="border-t border-border/30 pt-4">
            {selectedEmail.body.includes("<") ? (
              <div
                className="prose prose-sm prose-invert max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-foreground font-body">{selectedEmail.body}</pre>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Email list view
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center gap-3">
        <Inbox className="h-5 w-5 text-primary" />
        <h1 className="font-heading text-lg font-bold text-foreground flex-1">E-mails</h1>
        <Button variant="ghost" size="icon" onClick={() => setShowCompose(true)} title="Novo e-mail">
          <Pencil size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => loadEmails(searchQuery)} title="Atualizar">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </Button>
        <Button variant="ghost" size="icon" onClick={disconnectGmail} title="Desconectar Gmail">
          <LogOut size={16} />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar e-mails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadEmails(searchQuery)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum e-mail encontrado</p>
          </div>
        ) : (
          <AnimatePresence>
            {emails.map((email, i) => (
              <motion.button
                key={email.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => openEmail(email.id)}
                className={`w-full text-left p-4 border-b border-border/20 hover:bg-secondary/50 transition-colors ${
                  email.isUnread ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${email.isUnread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                        {extractName(email.from)}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(email.date)}</span>
                    </div>
                    <p className={`text-sm truncate mt-0.5 ${email.isUnread ? "font-medium text-foreground" : "text-foreground/70"}`}>
                      {email.subject || "(Sem assunto)"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{email.snippet}</p>
                  </div>
                  {email.isUnread && (
                    <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  )}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default Emails;
