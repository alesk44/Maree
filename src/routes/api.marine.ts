import { createFileRoute } from "@tanstack/react-router";
import { normalizeMarinePayload } from "@/lib/marine";

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
  "CDN-Cache-Control": "max-age=900, stale-while-revalidate=1800",
  "Vary": "Accept-Encoding",
};

export const Route = createFileRoute("/api/marine")({
  server: {
    handlers: {
      GET: async () => {
        const url = new URL(MARINE_URL);
        url.search = new URLSearchParams({
          latitude: "49.1868",
          longitude: "-2.1066",
          current: "wave_height,wave_direction,wave_period,sea_surface_temperature",
          hourly: "wave_height",
          forecast_hours: "6",
          timezone: "Europe/Jersey",
          cell_selection: "sea",
        }).toString();
        try {
          const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
          if (!response.ok) {
            return Response.json({ error: "Marine forecast temporarily unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
          }
          const payload: unknown = await response.json();
          if (!payload || typeof payload !== "object") throw new Error("Invalid marine response");
          const data = normalizeMarinePayload(payload as Parameters<typeof normalizeMarinePayload>[0]);
          return Response.json(data, { headers: CACHE_HEADERS });
        } catch {
          return Response.json({ error: "Marine forecast temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
