import { motion } from "framer-motion";

interface VoiceOrbProps {
  isListening: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  disabled: boolean;
  onPointerDown: () => void;
  onPointerUp: () => void;
}

const VoiceOrb = ({ isListening, isTranscribing, isSpeaking, disabled, onPointerDown, onPointerUp }: VoiceOrbProps) => {
  const size = 100;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center" style={{ width: size + 40, height: size + 40 }}>
        {/* Outer pulsing ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/20"
          animate={
            isListening
              ? { scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }
              : isSpeaking
              ? { scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }
              : {}
          }
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Middle ring */}
        <motion.div
          className="absolute rounded-full border border-primary/15"
          style={{ inset: 10 }}
          animate={isListening ? { rotate: 360 } : {}}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />

        {/* Core orb */}
        <motion.button
          className="rounded-full flex items-center justify-center cursor-pointer select-none touch-none"
          style={{
            width: size,
            height: size,
            background: isListening
              ? `radial-gradient(circle, hsl(210 100% 70%), hsl(210 100% 50%))`
              : isTranscribing
              ? `radial-gradient(circle, hsl(42 90% 60%), hsl(42 90% 45%))`
              : `radial-gradient(circle, hsl(210 100% 60%), hsl(210 100% 35%))`,
            boxShadow: isListening
              ? `0 0 40px hsl(210 100% 55% / 0.5), 0 0 80px hsl(210 100% 55% / 0.2)`
              : `0 0 20px hsl(210 100% 55% / 0.3), 0 0 50px hsl(210 100% 55% / 0.1)`,
          }}
          animate={
            isListening
              ? { scale: [1, 1.08, 0.95, 1.05, 1] }
              : isTranscribing
              ? { scale: [1, 1.03, 1] }
              : { scale: [1, 1.02, 1] }
          }
          transition={{
            duration: isListening ? 0.8 : 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          onPointerDown={disabled ? undefined : onPointerDown}
          onPointerUp={disabled ? undefined : onPointerUp}
          onPointerLeave={isListening ? onPointerUp : undefined}
          disabled={disabled}
        >
          <span className="font-display text-primary-foreground font-bold text-lg select-none">
            {isTranscribing ? "..." : isListening ? "●" : "J"}
          </span>
        </motion.button>
      </div>

      <p className="text-[11px] text-muted-foreground font-body">
        {isTranscribing
          ? "Transcrevendo..."
          : isListening
          ? "Solte para enviar"
          : "Segure para falar"}
      </p>
    </div>
  );
};

export default VoiceOrb;
