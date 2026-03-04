import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

const PlaceholderPage = ({ title, subtitle, icon: Icon }: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}) => {
  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-screen">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel p-12 text-center max-w-md glow-blue"
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Icon size={28} className="text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground text-sm font-body">{subtitle}</p>
        <div className="mt-6 px-4 py-2 rounded-lg bg-secondary/50 text-xs text-muted-foreground font-mono">
          Integração pendente • Conecte via Configurações
        </div>
      </motion.div>
    </div>
  );
};

export default PlaceholderPage;
