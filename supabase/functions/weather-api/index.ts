import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lon, city } = await req.json();

    // If city provided, geocode first using Open-Meteo geocoding
    let latitude = lat || -23.5505;
    let longitude = lon || -46.6333;
    let cityName = city || "São Paulo";

    if (city && !lat) {
      // Geocode city name to coords
      const geoResp = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt`
      );
      const geoData = await geoResp.json();
      if (geoData.results && geoData.results.length > 0) {
        latitude = geoData.results[0].latitude;
        longitude = geoData.results[0].longitude;
        cityName = geoData.results[0].name;
      }
    } else if (lat && lon && !city) {
      // Reverse geocode coords to city name
      const geoResp = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=&count=1&language=pt`
      );
      // Open-Meteo doesn't support reverse geocoding, use nominatim instead
      try {
        const revResp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt`
        );
        const revData = await revResp.json();
        cityName = revData.address?.city || revData.address?.town || revData.address?.municipality || revData.address?.state || "Localização atual";
      } catch {
        cityName = "Localização atual";
      }
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=America/Sao_Paulo`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: "Weather API error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const current = data.current;
    const weatherCode = current.weather_code;

    // Map WMO weather codes to conditions
    const codeMap: Record<number, { condition: string; description: string }> = {
      0: { condition: "Clear", description: "céu limpo" },
      1: { condition: "Clear", description: "predominantemente limpo" },
      2: { condition: "Clouds", description: "parcialmente nublado" },
      3: { condition: "Clouds", description: "nublado" },
      45: { condition: "Clouds", description: "neblina" },
      48: { condition: "Clouds", description: "neblina com geada" },
      51: { condition: "Drizzle", description: "garoa leve" },
      53: { condition: "Drizzle", description: "garoa moderada" },
      55: { condition: "Drizzle", description: "garoa intensa" },
      61: { condition: "Rain", description: "chuva leve" },
      63: { condition: "Rain", description: "chuva moderada" },
      65: { condition: "Rain", description: "chuva forte" },
      71: { condition: "Snow", description: "neve leve" },
      73: { condition: "Snow", description: "neve moderada" },
      75: { condition: "Snow", description: "neve forte" },
      80: { condition: "Rain", description: "pancadas de chuva" },
      81: { condition: "Rain", description: "pancadas moderadas" },
      82: { condition: "Rain", description: "pancadas fortes" },
      95: { condition: "Thunderstorm", description: "trovoadas" },
      96: { condition: "Thunderstorm", description: "trovoadas com granizo" },
      99: { condition: "Thunderstorm", description: "trovoadas com granizo forte" },
    };

    const weather = codeMap[weatherCode] || { condition: "Clouds", description: "indeterminado" };

    return new Response(
      JSON.stringify({
        temp: current.temperature_2m,
        feels_like: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        wind_speed: current.wind_speed_10m,
        condition: weather.condition,
        description: weather.description,
        city: cityName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
