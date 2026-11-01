export type MarineHour = { time: string; waveHeightM: number | null };
export type MarineConditions = {
  location: string;
  timezone: string;
  current: { time: string; waveHeightM: number; waveDirectionDeg: number | null; wavePeriodS: number | null; seaTemperatureC: number | null };
  nextHours: MarineHour[];
  fetchedAt: string;
};
type OpenMeteoPayload = {
  timezone?: unknown;
  current?: Record<string, unknown>;
  hourly?: { time?: unknown; wave_height?: unknown };
};
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function normalizeMarinePayload(payload: OpenMeteoPayload, fetchedAt = new Date().toISOString()): MarineConditions {
  const current = payload.current;
  if (!current || typeof current.time !== "string") throw new Error("Marine current conditions are missing");
  const waveHeightM = finite(current.wave_height);
  if (waveHeightM === null || waveHeightM < 0) throw new Error("Marine wave height is unavailable");
  const times = payload.hourly?.time;
  const heights = payload.hourly?.wave_height;
  const nextHours: MarineHour[] = [];
  if (Array.isArray(times) && Array.isArray(heights)) {
    for (let i = 0; i < Math.min(times.length, heights.length, 6); i += 1) {
      if (typeof times[i] !== "string") continue;
      nextHours.push({ time: times[i], waveHeightM: finite(heights[i]) });
    }
  }
  return {
    location: "Jersey (zone côtière centrale)",
    timezone: typeof payload.timezone === "string" ? payload.timezone : "Europe/Jersey",
    current: {
      time: current.time,
      waveHeightM,
      waveDirectionDeg: finite(current.wave_direction),
      wavePeriodS: finite(current.wave_period),
      seaTemperatureC: finite(current.sea_surface_temperature),
    },
    nextHours,
    fetchedAt,
  };
}
