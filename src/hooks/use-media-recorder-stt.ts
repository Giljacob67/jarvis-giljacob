import { useState, useRef, useCallback } from "react";

const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-stt`;

interface UseMediaRecorderSTTOptions {
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
}

export function useMediaRecorderSTT({ onResult, onEnd }: UseMediaRecorderSTTOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Use webm on most browsers, mp4 on Safari
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          setIsListening(false);
          onEnd?.();
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        setIsTranscribing(true);

        try {
          const formData = new FormData();
          const ext = mimeType.includes("webm") ? "webm" : "m4a";
          formData.append("audio", blob, `recording.${ext}`);

          const resp = await fetch(STT_URL, {
            method: "POST",
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: formData,
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data.text?.trim()) {
              onResult?.(data.text.trim());
            }
          }
        } catch (err) {
          console.error("STT transcription error:", err);
        } finally {
          setIsTranscribing(false);
          setIsListening(false);
          onEnd?.();
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect chunks every second
      setIsListening(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      setIsListening(false);
    }
  }, [onResult, onEnd]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return {
    isListening,
    isTranscribing,
    isSupported: typeof navigator !== "undefined" && !!navigator.mediaDevices,
    start,
    stop,
  };
}
