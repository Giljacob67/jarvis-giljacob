import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const HudClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");

  const dateStr = time.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-6"
    >
      <div className="flex items-center justify-center gap-1 font-display">
        <span className="text-7xl md:text-8xl font-bold text-gradient-blue tracking-wider">
          {hours}
        </span>
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="text-7xl md:text-8xl font-bold text-primary"
        >
          :
        </motion.span>
        <span className="text-7xl md:text-8xl font-bold text-gradient-blue tracking-wider">
          {minutes}
        </span>
        <span className="text-3xl md:text-4xl font-medium text-primary/50 self-end mb-3 ml-2">
          {seconds}
        </span>
      </div>
      <p className="text-muted-foreground font-body text-sm mt-2 capitalize tracking-wide">
        {dateStr}
      </p>
    </motion.div>
  );
};

export default HudClock;
