import { motion } from "framer-motion";

const JarvisAvatar = ({ isListening = false, isSpeaking = false, size = "md" }: {
  isListening?: boolean;
  isSpeaking?: boolean;
  size?: "sm" | "md" | "lg";
}) => {
  const sizes = { sm: 40, md: 80, lg: 140 };
  const s = sizes[size];

  return (
    <div className="relative flex items-center justify-center" style={{ width: s, height: s }}>
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-primary/30"
        animate={isSpeaking ? { scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] } : isListening ? { scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] } : {}}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Middle ring */}
      <motion.div
        className="absolute rounded-full border border-primary/20"
        style={{ inset: s * 0.1 }}
        animate={isSpeaking ? { rotate: 360 } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      {/* Core */}
      <motion.div
        className="rounded-full arc-reactor-pulse flex items-center justify-center"
        style={{
          width: s * 0.5,
          height: s * 0.5,
          background: `radial-gradient(circle, hsl(210 100% 65%), hsl(210 100% 40%))`,
        }}
        animate={isSpeaking ? { scale: [1, 1.2, 0.9, 1.1, 1] } : isListening ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: isSpeaking ? 0.8 : 2, repeat: Infinity }}
      >
        <span className="font-display text-primary-foreground font-bold" style={{ fontSize: s * 0.12 }}>
          J
        </span>
      </motion.div>
    </div>
  );
};

export default JarvisAvatar;
