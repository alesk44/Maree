import { createFileRoute } from "@tanstack/react-router";
import { normalizeWeatherPayload } from "@/lib/weather";

const WEATHER_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=600, stale-while-revalidate=1800",
  "CDN-Cache-Control": "max-age=900, stale-while-revalidate=1800",
  "Vary": "Accept-Encoding",
};

export const Route = createFileRoute("/api/weather")({
  server: {
    handlers: {
      GET: async () => {
        const url = new URL(WEATHER_URL);
        url.search = new URLSearchParams({ lat: "49.1868", lon: "-2.1066" }).toString();
        try {
          const response = await fetch(url, {
            headers: {
              Accept: "application/geo+json, application/json",
              "User-Agent": "Maree Jersey/1.0 https://github.com/alesk44/Maree",
            },
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) {
            return Response.json({ error: "Weather forecast temporarily unavailable" }, {
              status: 502,
              headers: { "Cache-Control": "no-store" },
            });
          }
          const payload: unknown = await response.json();
          if (!payload || typeof payload !== "object") throw new Error("Invalid weather response");
          const data = normalizeWeatherPayload(payload as Parameters<typeof normalizeWeatherPayload>[0]);
          return Response.json(data, { headers: CACHE_HEADERS });
        } catch {
          return Response.json({ error: "Weather forecast temporarily unavailable" }, {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
