import { useState, useRef, useCallback, useEffect } from "react";

const SCRIBE_TOKEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`;
const SCRIBE_WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

interface UseRealtimeSTTOptions {
  onPartial?: (text: string) => void;
  onCommit?: (text: string) => void;
  onEnd?: () => void;
  language?: string;
}

export function useRealtimeSTT({
  onPartial,
  onCommit,
  onEnd,
  language = "pt",
}: UseRealtimeSTTOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [partialText, setPartialText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        // Send EOS
        wsRef.current.send(JSON.stringify({ type: "eos" }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsListening(false);
    setIsConnecting(false);
    setPartialText("");
  }, []);

  const start = useCallback(async () => {
    if (isListening || isConnecting) return;
    setIsConnecting(true);

    try {
      // 1. Get single-use token (use user session if available)
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const tokenResp = await fetch(SCRIBE_TOKEN_URL, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!tokenResp.ok) {
        throw new Error("Failed to get scribe token");
      }

      const { token } = await tokenResp.json();

      // 2. Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // 3. Connect WebSocket
      const ws = new WebSocket(SCRIBE_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send config
        ws.send(
          JSON.stringify({
            type: "config",
            token,
            model_id: "scribe_v2_realtime",
            language_code: language,
            commit_strategy: "vad",
            encoding: "pcm_s16le",
            sample_rate: 16000,
          })
        );

        setIsListening(true);
        setIsConnecting(false);

        // 4. Start sending audio
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);

        // ScriptProcessorNode for compatibility (Safari/iOS support)
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          // Convert float32 to int16
          const int16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          // Send as base64
          const bytes = new Uint8Array(int16.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          ws.send(
            JSON.stringify({
              type: "audio",
              data: btoa(binary),
            })
          );
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "partial_transcript" && msg.text) {
            setPartialText(msg.text);
            onPartial?.(msg.text);
          } else if (msg.type === "committed_transcript" && msg.text) {
            setPartialText("");
            onCommit?.(msg.text);
          } else if (msg.type === "error") {
            console.error("Scribe WS error:", msg);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = (err) => {
        console.error("Scribe WS connection error:", err);
        cleanup();
        onEnd?.();
      };

      ws.onclose = () => {
        cleanup();
        onEnd?.();
      };
    } catch (err) {
      console.error("Realtime STT start error:", err);
      cleanup();
      onEnd?.();
    }
  }, [isListening, isConnecting, language, onPartial, onCommit, onEnd, cleanup]);

  const stop = useCallback(() => {
    cleanup();
    onEnd?.();
  }, [cleanup, onEnd]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    isListening,
    isConnecting,
    isTranscribing: false,
    partialText,
    isSupported: typeof navigator !== "undefined" && !!navigator.mediaDevices,
    start,
    stop,
    toggle,
  };
}
