import { useState, useEffect } from "react";
import { StickyNote, Search, Database, FileText, Plus, RefreshCw, CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NotionResult {
  id: string;
  object: "page" | "database";
  url: string;
  icon?: { type: string; emoji?: string };
  properties?: Record<string, any>;
  title?: Array<{ type: string; text?: { content: string }; plain_text?: string }>;
  last_edited_time?: string;
}

function getTitle(item: NotionResult): string {
  if (item.object === "database" && item.title) {
    return item.title.map((t) => t.plain_text || t.text?.content || "").join("") || "Sem título";
  }
  if (item.properties) {
    const titleProp = Object.values(item.properties).find((p: any) => p.type === "title");
    if (titleProp && (titleProp as any).title?.length) {
      return (titleProp as any).title.map((t: any) => t.plain_text || "").join("") || "Sem título";
    }
  }
  return "Sem título";
}

function getIcon(item: NotionResult): string {
  return item.icon?.emoji || (item.object === "database" ? "🗄️" : "📄");
}

const NotionPage = () => {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NotionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [databases, setDatabases] = useState<NotionResult[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [dbRows, setDbRows] = useState<NotionResult[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const invoke = async (action: string, extra: Record<string, any> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const { data, error } = await supabase.functions.invoke("notion-api", {
      body: { action, ...extra },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  useEffect(() => {
    invoke("status")
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (connected) {
      invoke("list_databases")
        .then((d) => setDatabases(d.results || []))
        .catch(() => {});
    }
  }, [connected]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await invoke("search", { query });
      setResults(data.results || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDb = async (dbId: string) => {
    setSelectedDb(dbId);
    setLoadingDb(true);
    try {
      const data = await invoke("query_database", { database_id: dbId });
      setDbRows(data.results || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleCreatePage = async () => {
    if (!selectedDb || !newPageTitle.trim()) return;
    setCreating(true);
    try {
      // Find title property name from db
      const dbMeta = databases.find((d) => d.id === selectedDb);
      let titleKey = "Name";
      if (dbMeta?.properties) {
        const found = Object.entries(dbMeta.properties).find(([, v]: [string, any]) => v.type === "title");
        if (found) titleKey = found[0];
      }

      await invoke("create_page", {
        parent_id: selectedDb,
        properties: {
          [titleKey]: { title: [{ text: { content: newPageTitle } }] },
        },
      });
      toast.success("Página criada!");
      setNewPageTitle("");
      handleSelectDb(selectedDb);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <StickyNote className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Notion</h1>
            <p className="text-sm text-muted-foreground">Busque, visualize e crie páginas no Notion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : connected ? (
            <span className="flex items-center gap-1 text-sm text-accent">
              <CheckCircle className="h-4 w-4" /> Conectado
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <XCircle className="h-4 w-4" /> Desconectado
            </span>
          )}
        </div>
      </div>

      {connected === false && (
        <Card className="glass-panel border-destructive/30">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Configure o <strong>NOTION_API_KEY</strong> nas configurações do projeto. Crie uma Integration em{" "}
            <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener" className="text-primary underline">
              notion.so/my-integrations
            </a>{" "}
            e compartilhe as páginas desejadas com ela.
          </CardContent>
        </Card>
      )}

      {connected && (
        <>
          {/* Search */}
          <Card className="glass-panel">
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar páginas e databases..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="bg-background/50"
                />
                <Button onClick={handleSearch} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Results */}
          {results.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display">Resultados</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {results.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-3 p-3 rounded-lg bg-background/30 hover:bg-background/50 transition-colors group"
                  >
                    <span className="text-xl">{getIcon(item)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{getTitle(item)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.object}</p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Databases */}
          {databases.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display flex items-center gap-2">
                  <Database className="h-4 w-4" /> Databases
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {databases.map((db) => (
                  <button
                    key={db.id}
                    onClick={() => handleSelectDb(db.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                      selectedDb === db.id ? "bg-primary/10 border border-primary/30" : "bg-background/30 hover:bg-background/50"
                    }`}
                  >
                    <span className="text-xl">{getIcon(db)}</span>
                    <span className="text-sm font-medium text-foreground truncate">{getTitle(db)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Database rows + create */}
          {selectedDb && (
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Páginas do Database
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => handleSelectDb(selectedDb)} disabled={loadingDb}>
                    <RefreshCw className={`h-4 w-4 ${loadingDb ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                {/* Create new page */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Título da nova página..."
                    value={newPageTitle}
                    onChange={(e) => setNewPageTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreatePage()}
                    className="bg-background/50"
                  />
                  <Button onClick={handleCreatePage} disabled={creating || !newPageTitle.trim()} size="sm">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>

                {loadingDb ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : dbRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma página encontrada</p>
                ) : (
                  <div className="space-y-1">
                    {dbRows.map((row) => (
                      <a
                        key={row.id}
                        href={row.url}
                        target="_blank"
                        rel="noopener"
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-background/30 hover:bg-background/50 transition-colors group"
                      >
                        <span className="text-lg">{getIcon(row)}</span>
                        <span className="text-sm text-foreground truncate flex-1">{getTitle(row)}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default NotionPage;
