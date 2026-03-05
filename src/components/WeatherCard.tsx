import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Loader2, CloudOff, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const weatherIcons: Record<string, typeof Sun> = {
  Clear: Sun,
  Clouds: Cloud,
  Rain: CloudRain,
  Drizzle: CloudDrizzle,
  Thunderstorm: CloudLightning,
  Snow: CloudSnow,
};

const WeatherCard = () => {
  const { user } = useAuth();
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoAttempted, setGeoAttempted] = useState(false);

  // Try geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoAttempted(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoAttempted(true);
      },
      () => {
        setGeoAttempted(true);
      },
      { timeout: 5000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  // Load city from active profile as fallback
  const { data: profileCity } = useQuery({
    queryKey: ["weather-city", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("jarvis_profiles")
        .select("user_preferences")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .limit(1);
      const prefs = data?.[0]?.user_preferences as Record<string, string> | null;
      return prefs?.city || "São Paulo";
    },
    enabled: !!user && geoAttempted && !geoCoords,
  });

  const fallbackCity = profileCity || "São Paulo";

  const { data, isLoading, error } = useQuery({
    queryKey: ["weather", geoCoords?.lat, geoCoords?.lon, geoCoords ? null : fallbackCity],
    queryFn: async () => {
      const body = geoCoords
        ? { lat: geoCoords.lat, lon: geoCoords.lon }
        : { city: fallbackCity };
      const { data, error } = await supabase.functions.invoke("weather-api", { body });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
    enabled: geoAttempted && (!!geoCoords || !!fallbackCity),
  });

  const Icon = data?.condition ? (weatherIcons[data.condition] || Cloud) : Cloud;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-panel p-5 glow-blue"
    >
      <h3 className="font-display text-xs tracking-widest text-primary mb-3">CLIMA</h3>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error || !data ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <CloudOff size={28} />
          <div>
            <p className="text-sm">Indisponível</p>
            <p className="text-xs">Configure a API de clima</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Icon size={36} className="text-primary" />
          <div>
            <p className="text-3xl font-display font-bold text-foreground">{Math.round(data.temp)}°C</p>
            <p className="text-sm text-muted-foreground capitalize">{data.description}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {geoCoords && <MapPin size={10} />}
              {data.city}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default WeatherCard;