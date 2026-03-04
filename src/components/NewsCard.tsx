import { useQuery } from "@tanstack/react-query";
import { Newspaper, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

type NewsItem = {
  title: string;
  source: string;
  url: string;
};

const NewsCard = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["news"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("news-api", {
        body: { country: "br", count: 5 },
      });
      if (error) throw error;
      return data?.articles as NewsItem[];
    },
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass-panel p-5 glow-gold"
    >
      <h3 className="font-display text-xs tracking-widest text-accent mb-3">NOTÍCIAS</h3>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : error || !data ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <AlertCircle size={28} />
          <div>
            <p className="text-sm">Indisponível</p>
            <p className="text-xs">Configure a API de notícias</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 4).map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <p className="text-sm text-foreground/80 group-hover:text-accent transition-colors line-clamp-1">
                {item.title}
              </p>
              <p className="text-[10px] text-muted-foreground">{item.source}</p>
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default NewsCard;
