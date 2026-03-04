import { motion } from "framer-motion";
import { Mail, Calendar, CheckSquare, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import JarvisAvatar from "@/components/JarvisAvatar";

const briefingCards = [
  {
    icon: Mail,
    title: "E-mails",
    value: "12 não lidos",
    detail: "3 urgentes aguardando resposta",
    color: "text-primary",
    glow: "glow-blue",
  },
  {
    icon: Calendar,
    title: "Agenda",
    value: "4 eventos hoje",
    detail: "Próximo: Reunião de equipe às 14:00",
    color: "text-accent",
    glow: "glow-gold",
  },
  {
    icon: CheckSquare,
    title: "Tarefas",
    value: "7 pendentes",
    detail: "2 com prazo hoje",
    color: "text-primary",
    glow: "glow-blue",
  },
  {
    icon: TrendingUp,
    title: "Produtividade",
    value: "85%",
    detail: "Acima da média semanal",
    color: "text-accent",
    glow: "glow-gold",
  },
];

const recentActivity = [
  { time: "08:30", action: "E-mail enviado para cliente@empresa.com", icon: Mail },
  { time: "09:15", action: "Reunião agendada: Sprint Planning", icon: Calendar },
  { time: "10:00", action: "Tarefa concluída: Revisão de proposta", icon: CheckSquare },
  { time: "11:45", action: "Alerta: prazo do projeto Alpha amanhã", icon: AlertTriangle },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const Dashboard = () => {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Bom dia, Senhor.</h1>
          <p className="text-muted-foreground font-body mt-1">
            <Clock size={14} className="inline mr-1" />
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <JarvisAvatar size="md" isSpeaking />
      </motion.div>

      {/* Briefing Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="glass-panel p-6 glow-blue relative overflow-hidden"
      >
        <div className="absolute inset-0 scanline pointer-events-none" />
        <h2 className="font-display text-sm tracking-widest text-primary mb-3">BRIEFING DIÁRIO</h2>
        <p className="text-foreground font-body leading-relaxed">
          Você tem <span className="text-primary font-semibold">3 e-mails urgentes</span> e{" "}
          <span className="text-accent font-semibold">4 reuniões</span> agendadas para hoje.
          Há <span className="text-primary font-semibold">2 tarefas</span> com prazo para hoje.
          Recomendo priorizar a resposta ao cliente da Empresa Alpha.
        </p>
      </motion.div>

      {/* Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {briefingCards.map((card) => (
          <motion.div key={card.title} variants={item} className={`glass-panel p-5 ${card.glow}`}>
            <div className="flex items-center gap-3 mb-3">
              <card.icon size={20} className={card.color} />
              <span className="font-heading text-sm font-semibold text-foreground">{card.title}</span>
            </div>
            <p className="font-display text-2xl font-bold text-foreground">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.detail}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="glass-panel p-6"
      >
        <h2 className="font-display text-sm tracking-widest text-primary mb-4">ATIVIDADE RECENTE</h2>
        <div className="space-y-3">
          {recentActivity.map((act, i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b border-border/30 last:border-0">
              <span className="text-xs text-muted-foreground font-mono w-12">{act.time}</span>
              <act.icon size={16} className="text-primary/70" />
              <span className="text-sm text-foreground/80">{act.action}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;
