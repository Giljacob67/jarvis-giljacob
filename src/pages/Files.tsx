import { useState, useEffect, useCallback, useRef } from "react";
import { FolderOpen, RefreshCw, Search, Loader2, LogOut, FileText, Image, Video, Music, Table, FileSpreadsheet, Presentation, ExternalLink, File, Upload, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  iconLink?: string;
  webViewLink?: string;
  thumbnailLink?: string;
};

type JarvisDocument = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  chunk_count: number;
  created_at: string;
};

// Custom hook to interact with Google Drive API via Edge Functions
function useDriveApi() {
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
    const resp = await fetch(`${BASE_URL}/functions/v1/drive-api`, {
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

const mimeIcons: Record<string, typeof FileText> = {
  "application/vnd.google-apps.document": FileText,
  "application/vnd.google-apps.spreadsheet": FileSpreadsheet,
  "application/vnd.google-apps.presentation": Presentation,
  "application/vnd.google-apps.folder": FolderOpen,
  "application/pdf": FileText,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileText,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": Table,
};

function getFileIcon(mimeType: string) {
  if (mimeIcons[mimeType]) return mimeIcons[mimeType];
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("video/")) return Video;
  if (mimeType.startsWith("audio/")) return Music;
  return File;
}

function formatFileSize(bytes?: string | number) {
  const n = typeof bytes === "string" ? parseInt(bytes) : (bytes || 0);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

const statusIcons: Record<string, typeof CheckCircle2> = {
  ready: CheckCircle2,
  processing: Clock,
  error: AlertCircle,
  no_text: AlertCircle,
};

const statusLabels: Record<string, string> = {
  ready: "Indexado",
  processing: "Processando...",
  error: "Erro",
  no_text: "Sem texto",
};

const Files = () => {
  const { session, user } = useAuth();
  const { callAuth, callApi } = useDriveApi();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState("jarvis");

  // Jarvis Documents state
  const [documents, setDocuments] = useState<JarvisDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Jarvis documents
  const loadDocuments = useCallback(async () => {
    if (!user) return;
    setDocsLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) setDocuments(data as any[]);
    } catch {
      toast.error("Erro ao carregar documentos");
    } finally {
      setDocsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadDocuments();
  }, [user, loadDocuments]);

  // Upload document
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !session) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 20MB)");
      return;
    }

    setUploading(true);
    try {
      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: file.name,
          file_path: filePath,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          status: "processing",
        })
        .select("id")
        .single();

      if (docError) throw docError;

      toast.success(`"${file.name}" enviado! Processando...`);
      loadDocuments();

      // Trigger processing
      await fetch(`${BASE_URL}/functions/v1/process-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: API_KEY,
        },
        body: JSON.stringify({ document_id: doc.id }),
      });

      // Reload to get updated status
      setTimeout(loadDocuments, 3000);
    } catch (err: any) {
      toast.error("Erro ao enviar: " + (err.message || "Erro desconhecido"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete document
  const deleteDocument = async (doc: JarvisDocument) => {
    if (!user) return;
    try {
      // Delete chunks first (cascade should handle but be safe)
      await supabase.from("document_chunks").delete().eq("document_id", doc.id);
      await supabase.from("documents").delete().eq("id", doc.id);
      
      // Delete from storage (best effort)
      const { data: docData } = await supabase
        .from("documents")
        .select("file_path")
        .eq("id", doc.id)
        .single();
      
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success(`"${doc.name}" removido`);
    } catch {
      toast.error("Erro ao remover documento");
    }
  };

  // Drive connection
  useEffect(() => {
    if (!session) return;
    callAuth({ action: "check_connection" }).then((data) => {
      setConnected(data.connected);
      if (data.connected) loadFiles();
    });
  }, [session]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && session) {
      callAuth({
        action: "exchange_code",
        code,
        redirectUri: window.location.origin + "/files",
      }).then((data) => {
        if (data.success) {
          setConnected(true);
          loadFiles();
          toast.success("Google Drive conectado!");
          window.history.replaceState({}, "", "/files");
        } else {
          toast.error("Erro ao conectar: " + (data.error || "Desconhecido"));
        }
      });
    }
  }, [session]);

  const loadFiles = useCallback(async (query?: string, append = false, token?: string) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await callApi({
        action: "list",
        query: query || "",
        pageToken: token || undefined,
      });
      if (data.error) {
        if (data.code === "NOT_CONNECTED") setConnected(false);
        else toast.error(data.error);
        return;
      }
      setFiles((prev) => append ? [...prev, ...(data.files || [])] : (data.files || []));
      setNextPageToken(data.nextPageToken);
    } catch {
      toast.error("Erro ao carregar arquivos");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [callApi]);

  const connectDrive = async () => {
    const data = await callAuth({ action: "get_auth_url", redirectUri: window.location.origin + "/files" });
    if (data.url) window.location.href = data.url;
    else toast.error("Erro ao gerar URL de autenticação");
  };

  const disconnectDrive = async () => {
    await callAuth({ action: "disconnect" });
    setConnected(false);
    setFiles([]);
    toast.success("Google Drive desconectado");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center gap-3">
        <FolderOpen className="h-5 w-5 text-primary" />
        <h1 className="font-heading text-lg font-bold text-foreground flex-1">Arquivos</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="jarvis" className="flex-1">📄 Documentos Jarvis</TabsTrigger>
            <TabsTrigger value="drive" className="flex-1">☁️ Google Drive</TabsTrigger>
          </TabsList>
        </div>

        {/* Jarvis Documents Tab */}
        <TabsContent value="jarvis" className="flex-1 flex flex-col mt-0">
          {/* Upload area */}
          <div className="p-4 border-b border-border/30">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.json,.doc,.docx"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full gap-2"
              variant="outline"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? "Enviando..." : "Enviar documento (PDF, TXT, MD, JSON)"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Documentos são indexados para busca semântica via chat com Jarvis
            </p>
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto">
            {docsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum documento enviado</p>
                <p className="text-xs text-muted-foreground">Envie PDFs ou textos para o Jarvis pesquisar</p>
              </div>
            ) : (
              <AnimatePresence>
                {documents.map((doc, i) => {
                  const StatusIcon = statusIcons[doc.status] || Clock;
                  const statusColor = doc.status === "ready" ? "text-green-500" : doc.status === "processing" ? "text-yellow-500" : "text-destructive";
                  return (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 p-4 border-b border-border/20 hover:bg-secondary/50 transition-colors group"
                    >
                      <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText size={18} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <StatusIcon size={12} className={statusColor} />
                          <span className={statusColor}>{statusLabels[doc.status] || doc.status}</span>
                          {doc.chunk_count > 0 && <span>· {doc.chunk_count} trechos</span>}
                          <span>· {formatFileSize(doc.size_bytes)}</span>
                          <span>· {formatDate(doc.created_at)}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteDocument(doc)}
                      >
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Refresh button */}
          <div className="p-3 border-t border-border/30">
            <Button variant="ghost" size="sm" onClick={loadDocuments} className="w-full gap-2">
              <RefreshCw size={14} />
              Atualizar
            </Button>
          </div>
        </TabsContent>

        {/* Google Drive Tab */}
        <TabsContent value="drive" className="flex-1 flex flex-col mt-0">
          {connected === false ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6">
              <div className="p-6 rounded-full bg-primary/10 border border-primary/20">
                <FolderOpen className="h-12 w-12 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-heading font-bold text-foreground">Conectar Google Drive</h2>
                <p className="text-muted-foreground text-sm max-w-md">
                  Conecte sua conta Google para acessar arquivos do Drive.
                </p>
              </div>
              <Button onClick={connectDrive} className="gap-2">
                <FolderOpen size={16} />
                Conectar Google Drive
              </Button>
            </div>
          ) : connected === null ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Drive header */}
              <div className="p-3 border-b border-border/30 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar no Drive..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setNextPageToken(null);
                        loadFiles(searchQuery);
                      }
                    }}
                    className="pl-9"
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => loadFiles(searchQuery)}>
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </Button>
                <Button variant="ghost" size="icon" onClick={disconnectDrive} title="Desconectar">
                  <LogOut size={16} />
                </Button>
              </div>

              {/* Drive file list */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <FolderOpen className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Nenhum arquivo encontrado</p>
                  </div>
                ) : (
                  <>
                    <AnimatePresence>
                      {files.map((file, i) => {
                        const IconComp = getFileIcon(file.mimeType);
                        return (
                          <motion.a
                            key={file.id}
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.015 }}
                            className="flex items-center gap-3 p-4 border-b border-border/20 hover:bg-secondary/50 transition-colors group"
                          >
                            {file.thumbnailLink ? (
                              <img
                                src={file.thumbnailLink}
                                alt=""
                                className="h-9 w-9 rounded object-cover flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <IconComp size={18} className="text-primary" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{formatDate(file.modifiedTime)}</span>
                                {file.size && <span>· {formatFileSize(file.size)}</span>}
                              </div>
                            </div>
                            <ExternalLink size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </motion.a>
                        );
                      })}
                    </AnimatePresence>

                    {nextPageToken && (
                      <div className="p-4 flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadFiles(searchQuery, true, nextPageToken)}
                          disabled={loadingMore}
                        >
                          {loadingMore ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                          Carregar mais
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Files;
