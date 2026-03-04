import { useState, useEffect, useCallback } from "react";
import { FolderOpen, RefreshCw, Search, Loader2, LogOut, FileText, Image, Video, Music, Table, FileSpreadsheet, Presentation, ExternalLink, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";

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

function formatFileSize(bytes?: string) {
  if (!bytes) return "";
  const n = parseInt(bytes);
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

const Files = () => {
  const { session } = useAuth();
  const { callAuth, callApi } = useDriveApi();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!session) return;
    callAuth({ action: "check_connection" }).then((data) => {
      setConnected(data.connected);
      if (data.connected) loadFiles();
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
        if (data.code === "NOT_CONNECTED") {
          setConnected(false);
        } else {
          toast.error(data.error);
        }
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
    const data = await callAuth({
      action: "get_auth_url",
      redirectUri: window.location.origin + "/files",
    });
    if (data.url) {
      window.location.href = data.url;
    } else {
      toast.error("Erro ao gerar URL de autenticação");
    }
  };

  const disconnectDrive = async () => {
    await callAuth({ action: "disconnect" });
    setConnected(false);
    setFiles([]);
    toast.success("Google Drive desconectado");
  };

  // Not connected
  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6">
        <div className="p-6 rounded-full bg-primary/10 border border-primary/20">
          <FolderOpen className="h-12 w-12 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-heading font-bold text-foreground">Conectar Google Drive</h1>
          <p className="text-muted-foreground text-sm max-w-md">
            Conecte sua conta Google para acessar e buscar arquivos do Drive diretamente pelo Jarvis.
          </p>
        </div>
        <Button onClick={connectDrive} className="gap-2">
          <FolderOpen size={16} />
          Conectar Google Drive
        </Button>
      </div>
    );
  }

  // Loading check
  if (connected === null) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center gap-3">
        <FolderOpen className="h-5 w-5 text-primary" />
        <h1 className="font-heading text-lg font-bold text-foreground flex-1">Arquivos</h1>
        <Button variant="ghost" size="icon" onClick={() => loadFiles(searchQuery)} title="Atualizar">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </Button>
        <Button variant="ghost" size="icon" onClick={disconnectDrive} title="Desconectar Drive">
          <LogOut size={16} />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar arquivos..."
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
      </div>

      {/* File list */}
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
    </div>
  );
};

export default Files;
