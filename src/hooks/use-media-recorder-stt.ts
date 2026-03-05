import { useState, useRef, useCallback } from "react";

const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-stt`;

interface UseMediaRecorderSTTOptions {
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
  silenceTimeout?: number; // ms of silence before auto-stop (default 2000)
}

export function useMediaRecorderSTT({ onResult, onEnd, silenceTimeout = 2000 }: UseMediaRecorderSTTOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const clearSilenceDetection = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up silence detection via AudioContext
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

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
        // Clean up silence detection
        clearSilenceDetection();

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

      // Start silence detection loop
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastSoundTime = Date.now();

      const checkSilence = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        if (avg > 10) {
          // Sound detected
          lastSoundTime = Date.now();
        } else if (Date.now() - lastSoundTime > silenceTimeout) {
          // Silence detected for too long - auto stop
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          return;
        }

        rafRef.current = requestAnimationFrame(checkSilence);
      };

      // Give a grace period before starting silence detection (1.5s)
      silenceTimerRef.current = setTimeout(() => {
        checkSilence();
      }, 1500);
    } catch (err) {
      console.error("Microphone access error:", err);
      setIsListening(false);
    }
  }, [onResult, onEnd, silenceTimeout, clearSilenceDetection]);

  const stop = useCallback(() => {
    clearSilenceDetection();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [clearSilenceDetection]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return {
    isListening,
    isTranscribing,
    isSupported: typeof navigator !== "undefined" && !!navigator.mediaDevices,
    start,
    stop,
    toggle,
  };
}
