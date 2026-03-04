import { useRef, useCallback, useState } from "react";

interface UseSpeechSynthesisOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
}

export function useSpeechSynthesis({
  lang = "pt-BR",
  rate = 1,
  pitch = 0.9,
}: UseSpeechSynthesisOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = pitch;

      // Try to find a PT-BR voice
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(
        (v) => v.lang === "pt-BR" || v.lang.startsWith("pt")
      );
      if (ptVoice) utterance.voice = ptVoice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [lang, rate, pitch]
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, speak, stop };
}
