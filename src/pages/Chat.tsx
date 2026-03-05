import { useState, useRef, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Volume2, VolumeX, Newspaper, Download, CheckCircle2, CalendarPlus, Paperclip, X, FileText, Briefcase, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import NotificationBell from "@/components/NotificationBell";
import FocusModeToggle from "@/components/FocusModeToggle";
import ReactMarkdown from "react-markdown";
import JarvisAvatar from "@/components/JarvisAvatar";
import VoiceOrb from "@/components/VoiceOrb";
import ToolHUD, { type ToolStatus } from "@/components/ToolHUD";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useMediaRecorderSTT } from "@/hooks/use-media-recorder-stt";
import { useRealtimeSTT } from "@/hooks/use-realtime-stt";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { normalizeNumbersForTTS } from "@/lib/tts-normalize";
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

type ToolCallMeta = {
  tool: string;
  args: any;
  result: { success: boolean; message?: string; [key: string]: any } | null;
};

async function streamChat({
  messages,
  profile,
  sessionState,
  onDelta,
  onDone,
  onError,
  onToolCalls,
  onToolCallsStart,
}: {
  messages: { role: string; content: string }[];
  profile?: any;
  sessionState?: any;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  onToolCalls?: (calls: ToolCallMeta[]) => void;
  onToolCallsStart?: (tools: string[]) => void;
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
    body: JSON.stringify({ messages, profile, jarvisMode: (profile as any)?._jarvisMode, userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone, sessionState }),
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
        // Check for tool_calls metadata event (both old and new schema)
        if (parsed.tool_calls && onToolCalls) {
          onToolCalls(parsed.tool_calls);
          continue;
        }
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.tool_calls_start && onToolCallsStart) {
          onToolCallsStart(delta.tool_calls_start.map((t: any) => t.tool));
          continue;
        }
        if (delta?.tool_calls_meta && onToolCalls) {
          onToolCalls(delta.tool_calls_meta);
          continue;
        }
        const content = delta?.content;
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

// ─── Shared Audio + iOS unlock ───────────────────────────────────────
let sharedAudio: HTMLAudioElement | null = null;

function unlockAudio() {
  if (sharedAudio) return;
  sharedAudio = new Audio();
  sharedAudio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  sharedAudio.play().then(() => {
    sharedAudio!.pause();
    sharedAudio!.currentTime = 0;
  }).catch(() => {});
}

if (typeof window !== "undefined") {
  const unlock = () => {
    unlockAudio();
    window.removeEventListener("touchstart", unlock, true);
    window.removeEventListener("click", unlock, true);
  };
  window.addEventListener("touchstart", unlock, true);
  window.addEventListener("click", unlock, true);
}

// ─── TTS fetch: returns blob URL for playback ──────────────────────
async function fetchTTSAudioUrl(text: string, voiceSettings?: any): Promise<string | null> {
  try {
    const rawClean = stripMarkdown(text);
    if (!rawClean || rawClean.length < 2) return null;
    const cleanText = normalizeNumbersForTTS(rawClean);

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

    if (!response.ok) return null;

    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);
  } catch {
    return null;
  }
}

// ─── Aggressive sentence splitter for low-latency TTS ───────────────
// Splits on . ! ? newline, AND on , ; : — when chunk exceeds MAX_CHUNK_CHARS
const MAX_CHUNK_CHARS = 120;

function extractSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  // Primary split: sentence-ending punctuation or newline
  const primaryRegex = /[^.!?\n]*[.!?]+[\s]|[^\n]+\n/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = primaryRegex.exec(buffer)) !== null) {
    const sentence = buffer.slice(lastIndex, match.index + match[0].length).trim();
    if (sentence.length > 0) {
      // Sub-split long sentences at secondary punctuation
      splitLongChunk(sentence, sentences);
    }
    lastIndex = match.index + match[0].length;
  }

  // If remainder is already long enough, try splitting at secondary punctuation
  const remainder = buffer.slice(lastIndex);
  if (remainder.length > MAX_CHUNK_CHARS) {
    const secondaryRegex = /[,;:—]+\s/g;
    let subLast = 0;
    let subMatch: RegExpExecArray | null;
    let didSplit = false;
    while ((subMatch = secondaryRegex.exec(remainder)) !== null) {
      const part = remainder.slice(subLast, subMatch.index + subMatch[0].length).trim();
      if (part.length > 0) {
        sentences.push(part);
        didSplit = true;
      }
      subLast = subMatch.index + subMatch[0].length;
    }
    if (didSplit) {
      return { sentences, remainder: remainder.slice(subLast) };
    }
  }

  return { sentences, remainder };
}

function splitLongChunk(text: string, out: string[]) {
  if (text.length <= MAX_CHUNK_CHARS) {
    out.push(text);
    return;
  }
  // Try splitting at , ; : —
  const regex = /[,;:—]+\s/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const part = text.slice(last, match.index + match[0].length).trim();
    if (part.length > 0) out.push(part);
    last = match.index + match[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail.length > 0) out.push(tail);
  // If no splits happened, push the whole thing
  if (last === 0) out.push(text);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  "application/pdf", "text/plain", "text/markdown", "text/csv",
  "application/json", "image/png", "image/jpeg", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

type PendingFile = {
  file: File;
  id: string;
  uploading: boolean;
};

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
  const [allProfiles, setAllProfiles] = useState<{ personal: any; professional: any }>({ personal: null, professional: null });
  const [jarvisMode, setJarvisMode] = useState<"personal" | "professional">("personal");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // ─── Session State ref (anti-repetition, tool cache) ────────────
  const sessionStateRef = useRef<{
    lastTopics: string[];
    lastToolResults: Record<string, { data: string; timestamp: number }>;
    lastBriefingTimestamp: number;
    conversationStartedAt: number;
  }>({
    lastTopics: [],
    lastToolResults: {},
    lastBriefingTimestamp: 0,
    conversationStartedAt: Date.now(),
  });

  // ─── Barge-in & TTS chunk queue refs ─────────────────────────────
  const ttsAbortRef = useRef(false);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Latency tracking refs (no re-renders) ─────────────────────
  const latencyRef = useRef<{ t0: number; t1: number; t2: number; logged: boolean }>({ t0: 0, t1: 0, t2: 0, logged: false });

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

  // Realtime STT via ElevenLabs Scribe v2 WebSocket
  const realtimeSTT = useRealtimeSTT({
    language: "pt",
    onPartial: (text) => {
      voiceTranscriptRef.current = text;
      setInput(text);
    },
    onCommit: (text) => {
      voiceTranscriptRef.current = text;
      setInput(text);
      // Auto-send on VAD commit
      if (shouldAutoSendRef.current) {
        setTimeout(() => {
          shouldAutoSendRef.current = false;
          const btn = document.getElementById("jarvis-send-btn");
          btn?.click();
        }, 100);
      }
    },
    onEnd: () => {
      shouldAutoSendRef.current = false;
    },
  });

  // Priority: realtimeSTT > nativeSTT > mediaSTT
  const useRealtimeMode = realtimeSTT.isSupported;
  const useNativeSTT = !useRealtimeMode && stt.isSupported;
  const voiceIsListening = useRealtimeMode ? realtimeSTT.isListening : useNativeSTT ? stt.isListening : mediaSTT.isListening;
  const voiceIsSupported = useRealtimeMode ? realtimeSTT.isSupported : useNativeSTT ? stt.isSupported : mediaSTT.isSupported;
  const voiceIsTranscribing = !useRealtimeMode && !useNativeSTT && mediaSTT.isTranscribing;
  const voiceIsConnecting = useRealtimeMode && realtimeSTT.isConnecting;

  // ─── Stop all TTS (barge-in) ─────────────────────────────────────
  const stopAllTTS = useCallback(() => {
    ttsAbortRef.current = true;
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    // Stop current audio immediately
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    // Also stop Web Speech API fallback
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // ─── Sequential TTS chunk player with 1-chunk lookahead ──────────
  const processTTSQueue = useCallback(async (voiceSettings?: any) => {
    if (ttsPlayingRef.current) return;
    ttsPlayingRef.current = true;

    let prefetchedUrl: string | null = null;
    let prefetchPromise: Promise<string | null> | null = null;
    let prefetch2Promise: Promise<string | null> | null = null;

    while (ttsQueueRef.current.length > 0) {
      if (ttsAbortRef.current) break;

      const chunk = ttsQueueRef.current.shift()!;

      // Use prefetched URL if available, otherwise fetch now
      let audioUrl: string | null;
      if (prefetchedUrl !== null) {
        audioUrl = prefetchedUrl;
        prefetchedUrl = null;
      } else if (prefetchPromise) {
        audioUrl = await prefetchPromise;
        prefetchPromise = null;
        // Promote prefetch2 to primary
        if (prefetch2Promise) {
          prefetchPromise = prefetch2Promise;
          prefetch2Promise = null;
        }
      } else {
        audioUrl = await fetchTTSAudioUrl(chunk, voiceSettings);
      }

      if (ttsAbortRef.current) break;

      // Start prefetching next 2 chunks (lookahead=2 for iPhone gap reduction)
      if (ttsQueueRef.current.length > 0 && !prefetchPromise) {
        const nextChunk = ttsQueueRef.current[0];
        prefetchPromise = fetchTTSAudioUrl(nextChunk, voiceSettings);
      }
      // Prefetch chunk after next into a secondary slot
      if (ttsQueueRef.current.length > 1 && !prefetch2Promise) {
        prefetch2Promise = fetchTTSAudioUrl(ttsQueueRef.current[1], voiceSettings);
      }

      if (audioUrl) {
        const audio = sharedAudio || new Audio();
        audio.src = audioUrl;
        currentAudioRef.current = audio;
        setIsSpeaking(true);

        await new Promise<void>((resolve) => {
          // ─── Record t2 (first TTS play) ──────────────────────
          const onPlay = () => {
            if (latencyRef.current.t2 === 0 && latencyRef.current.t0 > 0) {
              latencyRef.current.t2 = performance.now();
              const t0 = latencyRef.current.t0;
              const t1 = latencyRef.current.t1;
              const t2 = latencyRef.current.t2;
              console.log(`[LATENCY] speechEnd→firstAudio: ${Math.round(t2 - t0)}ms`);
              if (t1 > 0) console.log(`[LATENCY] firstDelta→firstAudio: ${Math.round(t2 - t1)}ms`);
            }
          };
          audio.onplay = onPlay;
          audio.onended = () => {
            currentAudioRef.current = null;
            URL.revokeObjectURL(audioUrl!);
            resolve();
          };
          audio.onerror = () => {
            currentAudioRef.current = null;
            URL.revokeObjectURL(audioUrl!);
            resolve();
          };
          audio.play().catch(() => {
            const fallback = new Audio(audioUrl!);
            currentAudioRef.current = fallback;
            fallback.onended = () => { currentAudioRef.current = null; resolve(); };
            fallback.onerror = () => { currentAudioRef.current = null; resolve(); };
            fallback.play().catch(() => { currentAudioRef.current = null; resolve(); });
          });
        });

        // After playback, resolve the prefetch if it's done
        if (prefetchPromise && ttsQueueRef.current.length > 0) {
          // Don't await here, it'll be awaited on next loop iteration
        }

        if (ttsAbortRef.current) break;
      }
    }

    ttsPlayingRef.current = false;
    if (!ttsAbortRef.current && ttsQueueRef.current.length === 0) {
      setIsSpeaking(false);
    }
  }, []);

  // ─── Enqueue a sentence for TTS ──────────────────────────────────
  const enqueueTTSChunk = useCallback((sentence: string, voiceSettings?: any) => {
    if (ttsAbortRef.current) return;
    ttsQueueRef.current.push(sentence);
    // Start processing if not already running
    processTTSQueue(voiceSettings);
  }, [processTTSQueue]);

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

  // Load ALL profiles (personal + professional)
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      const { data: profiles } = await supabase
        .from("jarvis_profiles")
        .select("*")
        .eq("user_id", user.id);

      if (!profiles || profiles.length === 0) return;

      const { data: mems } = await supabase
        .from("jarvis_memories")
        .select("content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      const memories = mems?.map((m: any) => m.content) || [];

      const buildProfileData = (p: any) => ({
        instructions: p.instructions,
        user_name: p.user_name,
        user_profession: p.user_profession,
        user_preferences: p.user_preferences,
        voice_settings: p.voice_settings,
        focus_mode: p.focus_mode,
        focus_until: p.focus_until,
        memories,
      });

      const personalProfile = profiles.find((p: any) => p.profile_type === "personal");
      const professionalProfile = profiles.find((p: any) => p.profile_type === "professional");

      const newAllProfiles = {
        personal: personalProfile ? buildProfileData(personalProfile) : null,
        professional: professionalProfile ? buildProfileData(professionalProfile) : null,
      };
      setAllProfiles(newAllProfiles);

      // Set active profile based on is_active from DB
      const activeP = profiles.find((p: any) => p.is_active) || personalProfile || profiles[0];
      if (activeP) {
        setActiveProfile(buildProfileData(activeP));
        setJarvisMode(activeP.profile_type as "personal" | "professional");
      }
    };
    loadProfiles();
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

  // ─── File upload helpers ─────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Arquivo "${file.name}" excede 10MB`);
        continue;
      }
      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(md|txt|json|csv)$/i)) {
        toast.error(`Tipo não suportado: ${file.name}`);
        continue;
      }
      newFiles.push({ file, id: `${Date.now()}-${Math.random()}`, uploading: false });
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData.files;
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }, [addFiles]);

  const uploadFile = async (pendingFile: PendingFile): Promise<string | null> => {
    if (!user) return null;
    const { file } = pendingFile;
    const filePath = `${user.id}/${Date.now()}-${file.name}`;

    const { error: storageError } = await supabase.storage
      .from("documents")
      .upload(filePath, file, { contentType: file.type });

    if (storageError) {
      toast.error(`Erro ao enviar ${file.name}`);
      return null;
    }

    const { data: docData, error: docError } = await supabase
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

    if (docError || !docData) {
      toast.error(`Erro ao registrar ${file.name}`);
      return null;
    }

    // Process document (embeddings) in background
    const { data: { session } } = await supabase.auth.getSession();
    supabase.functions.invoke("process-document", {
      body: { document_id: docData.id },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    }).catch(console.error);

    return file.name;
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const hasFiles = pendingFiles.length > 0;
    if ((!text && !hasFiles) || isLoading) return;

    // ─── A) Command Router: profile switching without LLM ─────────
    const modeRegex = /^(jarvis[,]?\s*)?(modo|perfil)\s+(pessoal|profissional)/i;
    const modeMatch = text.match(modeRegex);
    if (modeMatch && !hasFiles) {
      const requested = modeMatch[3].toLowerCase();
      const newMode = requested === "pessoal" ? "personal" : "professional";
      const modeLabel = newMode === "personal" ? "pessoal" : "profissional";

      // Show user message
      const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      persistMessage("user", text);

      if (newMode === jarvisMode) {
        const reply = `Você já está no modo ${modeLabel}.`;
        const assistantMsg: Message = { id: `cmd-${Date.now()}`, role: "assistant", content: reply, timestamp: new Date() };
        setMessages((prev) => [...prev, assistantMsg]);
        persistMessage("assistant", reply);
        if (ttsEnabled) enqueueTTSChunk(reply, activeProfile?.voice_settings);
        return;
      }

      // Switch mode
      setJarvisMode(newMode);
      if (allProfiles[newMode]) setActiveProfile(allProfiles[newMode]);

      // Persist to DB
      if (user) {
        supabase.from("jarvis_profiles").update({ is_active: false }).eq("user_id", user.id).neq("profile_type", newMode).then(() => {
          supabase.from("jarvis_profiles").update({ is_active: true }).eq("user_id", user.id).eq("profile_type", newMode);
        });
      }

      const reply = `Certo. Modo ${modeLabel} ativado.`;
      const assistantMsg: Message = { id: `cmd-${Date.now()}`, role: "assistant", content: reply, timestamp: new Date() };
      setMessages((prev) => [...prev, assistantMsg]);
      persistMessage("assistant", reply);
      if (ttsEnabled) enqueueTTSChunk(reply, allProfiles[newMode]?.voice_settings || activeProfile?.voice_settings);
      return;
    }

    // Reset abort flag for new response
    ttsAbortRef.current = false;
    ttsQueueRef.current = [];

    // Upload pending files first
    let fileContext = "";
    if (hasFiles) {
      setPendingFiles((prev) => prev.map((f) => ({ ...f, uploading: true })));
      const uploadedNames: string[] = [];
      for (const pf of pendingFiles) {
        const name = await uploadFile(pf);
        if (name) uploadedNames.push(name);
      }
      setPendingFiles([]);
      if (uploadedNames.length > 0) {
        fileContext = uploadedNames.map((n) => `📎 Arquivo enviado: ${n}`).join("\n");
      }
    }

    const fullContent = [fileContext, text].filter(Boolean).join("\n");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: fullContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    persistMessage("user", fullContent);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Build profile payload with both profiles and current mode
    const profilePayload = {
      ...activeProfile,
      _jarvisMode: jarvisMode,
      _allProfiles: allProfiles,
    };

    // ─── Record t0 (speech end / send) ──────────────────────────
    latencyRef.current = { t0: performance.now(), t1: 0, t2: 0, logged: false };

    let assistantContent = "";
    // Buffer for accumulating text to detect sentence boundaries
    let sentenceBuffer = "";

    const upsertAssistant = (chunk: string) => {
      // ─── Record t1 (first delta) ────────────────────────────
      if (latencyRef.current.t1 === 0) {
        latencyRef.current.t1 = performance.now();
        const dt = Math.round(latencyRef.current.t1 - latencyRef.current.t0);
        console.log(`[LATENCY] speechEnd→firstDelta: ${dt}ms`);
      }
      assistantContent += chunk;
      
      // Detect [MODE:xxx] marker
      const modeMatch = assistantContent.match(/^\[MODE:(personal|professional)\]\s*/);
      if (modeMatch) {
        const newMode = modeMatch[1] as "personal" | "professional";
        if (newMode !== jarvisMode) {
          setJarvisMode(newMode);
          // Update active profile voice settings to match new mode
          if (allProfiles[newMode]) {
            setActiveProfile(allProfiles[newMode]);
          }
        }
        // Strip marker from displayed content
        assistantContent = assistantContent.replace(/^\[MODE:(personal|professional)\]\s*/, "");
      }
      
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

      // ─── Semantic chunking for TTS ─────────────────────────────
      if (ttsEnabled && !ttsAbortRef.current) {
        sentenceBuffer += chunk;
        const { sentences, remainder } = extractSentences(sentenceBuffer);
        sentenceBuffer = remainder;
        for (const sentence of sentences) {
          enqueueTTSChunk(sentence, activeProfile?.voice_settings);
        }
      }
    };

    try {
      // Clear previous tool statuses
      setToolStatuses([]);

      await streamChat({
        messages: history,
        profile: profilePayload || undefined,
        sessionState: sessionStateRef.current,
        onDelta: upsertAssistant,
        onToolCallsStart: (toolNames) => {
          const now = performance.now();
          setToolStatuses(toolNames.map((tool, i) => ({
            id: `tool-${now}-${i}`,
            tool,
            status: "running" as const,
            startedAt: now,
          })));
        },
        onToolCalls: (calls) => {
          // Mark tools as done in HUD
          const now = performance.now();
          setToolStatuses((prev) => {
            const updated = [...prev];
            for (const tc of calls) {
              const existing = updated.find((s) => s.tool === tc.tool && s.status === "running");
              if (existing) {
                existing.status = tc.result?.success === false ? "error" : "done";
                existing.endedAt = now;
                existing.result = tc.result;
              }
            }
            return updated;
          });

          // Update session state tool cache
          for (const tc of calls) {
            if (tc.result) {
              sessionStateRef.current.lastToolResults[tc.tool] = {
                data: JSON.stringify(tc.result),
                timestamp: Date.now(),
              };
            }
          }

          for (const tc of calls) {
            if (tc.result?.success) {
              const toolLabels: Record<string, string> = {
                create_task: "✅ Tarefa criada",
                complete_task: "✅ Tarefa concluída",
                list_tasks: "📋 Tarefas listadas",
                create_calendar_event: "📅 Evento criado",
                save_memory: "🧠 Memória salva",
                save_operational_context: "📌 Contexto salvo",
                recall_memory: "🔍 Memórias consultadas",
                create_execution_plan: "📋 Plano criado",
                analyze_legal_document: "⚖️ Documento analisado",
                draft_legal_outline: "📝 Esboço jurídico gerado",
                compare_documents: "🔄 Documentos comparados",
                send_email: "📧 E-mail enviado",
                draft_email: "📝 Rascunho gerado",
                search_documents: "🔍 Documentos pesquisados",
              };
              toast.success(toolLabels[tc.tool] || "Ação executada", {
                description: tc.result.message,
              });
            } else if (tc.result && !tc.result.success && !tc.result.ambiguous) {
              toast.error("Erro na ação", { description: tc.result.message });
            }
          }
        },
        onDone: async () => {
          setIsLoading(false);
          if (assistantContent) {
            persistMessage("assistant", assistantContent);
          }

          // Flush remaining text in sentence buffer
          if (ttsEnabled && sentenceBuffer.trim() && !ttsAbortRef.current) {
            enqueueTTSChunk(sentenceBuffer.trim(), activeProfile?.voice_settings);
            sentenceBuffer = "";
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
  }, [input, isLoading, messages, ttsEnabled, conversationId, user, activeProfile, enqueueTTSChunk, pendingFiles, jarvisMode, allProfiles]);

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

  // ─── Toggle voice: tap to start, tap again or silence to stop ──
  const handleOrbToggle = () => {
    if (voiceIsListening) {
      // Stop listening
      shouldAutoSendRef.current = true;
      if (useRealtimeMode) realtimeSTT.stop();
      else if (useNativeSTT) stt.stop();
      else mediaSTT.stop();
    } else {
      // Barge-in: immediately stop Jarvis speaking
      if (isSpeaking || ttsPlayingRef.current) {
        stopAllTTS();
      }
      voiceTranscriptRef.current = "";
      shouldAutoSendRef.current = true;
      if (useRealtimeMode) realtimeSTT.start();
      else if (useNativeSTT) stt.start();
      else mediaSTT.start();
    }
  };

  return (
    <div
      className="flex flex-col h-screen relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-xl"
          >
            <div className="text-center">
              <FileText className="h-12 w-12 text-primary mx-auto mb-3" />
              <p className="text-lg font-heading text-foreground">Solte o arquivo aqui</p>
              <p className="text-sm text-muted-foreground">PDF, TXT, MD, JSON, imagens, DOCX</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.webp,.docx"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center gap-4">
        <JarvisAvatar size="sm" isSpeaking={isLoading || isSpeaking} isListening={voiceIsListening} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-bold text-foreground">Chat com Jarvis</h1>
            <Badge
              variant="outline"
              className={`text-[10px] cursor-pointer select-none transition-colors ${
                jarvisMode === "professional"
                  ? "border-accent text-accent"
                  : "border-primary text-primary"
              }`}
              onClick={() => {
                const newMode = jarvisMode === "personal" ? "professional" : "personal";
                setJarvisMode(newMode);
                if (allProfiles[newMode]) setActiveProfile(allProfiles[newMode]);
                // Persist to DB
                if (user) {
                  supabase.from("jarvis_profiles").update({ is_active: false }).eq("user_id", user.id).neq("profile_type", newMode).then(() => {
                    supabase.from("jarvis_profiles").update({ is_active: true }).eq("user_id", user.id).eq("profile_type", newMode);
                  });
                }
              }}
            >
              {jarvisMode === "professional" ? (
                <><Briefcase className="h-3 w-3 mr-1" /> Profissional</>
              ) : (
                <><User className="h-3 w-3 mr-1" /> Pessoal</>
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {voiceIsConnecting ? "Conectando microfone..." : voiceIsTranscribing ? "Transcrevendo..." : isSpeaking ? "Falando..." : isLoading ? "Processando..." : voiceIsListening ? "Ouvindo..." : "Converse por texto ou voz"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FocusModeToggle />
          <NotificationBell />
          <button
            onClick={() => {
              stopAllTTS();
              setTtsEnabled(!ttsEnabled);
            }}
            className={`p-2 rounded-xl transition-all ${
              ttsEnabled ? "bg-accent/20 text-accent" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
            title={ttsEnabled ? "Desativar voz" : "Ativar voz"}
          >
            {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
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

      {/* ToolHUD */}
      <ToolHUD statuses={toolStatuses} />

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
            onClick={handleOrbToggle}
          />

          <button
            onClick={exportChat}
            className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all"
            title="Exportar conversa"
          >
            <Download size={20} />
          </button>
        </div>

        {/* File chips */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((pf) => (
              <div
                key={pf.id}
                className="flex items-center gap-1.5 bg-secondary/80 text-secondary-foreground rounded-lg px-3 py-1.5 text-xs font-body"
              >
                {pf.uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                <span className="max-w-[120px] truncate">{pf.file.name}</span>
                {!pf.uploading && (
                  <button onClick={() => removeFile(pf.id)} className="ml-0.5 hover:text-destructive transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Text Input */}
        <div className="glass-panel flex items-center gap-3 p-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all"
            title="Anexar arquivo"
            disabled={isLoading}
          >
            <Paperclip size={18} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            onPaste={handlePaste}
            placeholder="Fale com Jarvis..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm font-body outline-none"
            disabled={isLoading}
          />
          <button
            id="jarvis-send-btn"
            onClick={sendMessage}
            disabled={(!input.trim() && pendingFiles.length === 0) || isLoading}
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
