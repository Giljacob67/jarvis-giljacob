import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import JarvisAvatar from "@/components/JarvisAvatar";
import { Loader2 } from "lucide-react";

const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel glow-border-blue p-8 w-full max-w-md space-y-6"
      >
        <div className="flex flex-col items-center gap-4">
          <JarvisAvatar size="lg" isSpeaking />
          <h1 className="font-heading text-2xl font-bold text-gradient-blue">
            {isSignUp ? "Criar Conta" : "Acessar Jarvis"}
          </h1>
          <p className="text-sm text-muted-foreground text-center font-body">
            {isSignUp
              ? "Registre-se para começar a usar o Jarvis"
              : "Faça login para continuar"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="text-xs text-muted-foreground font-body mb-1 block">Nome completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground text-sm font-body outline-none focus:border-primary/50 transition-colors"
                placeholder="Tony Stark"
                required
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground font-body mb-1 block">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground text-sm font-body outline-none focus:border-primary/50 transition-colors"
              placeholder="tony@stark.com"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-body mb-1 block">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground text-sm font-body outline-none focus:border-primary/50 transition-colors"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-heading font-semibold text-sm hover:bg-primary/80 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignUp ? "Criar conta" : "Entrar"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground font-body">
          {isSignUp ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary hover:underline"
          >
            {isSignUp ? "Faça login" : "Registre-se"}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
