import { describe, expect, it } from "vitest";
import { normalizeMarinePayload } from "./marine";

describe("normalizeMarinePayload", () => {
  it("normalizes current values and the next six hourly wave heights", () => {
    const result = normalizeMarinePayload({
      timezone: "Europe/Jersey",
      current: { time: "2026-11-01T12:00", wave_height: 0.8, wave_direction: 225, wave_period: 7, sea_surface_temperature: 15.4 },
      hourly: { time: ["12:00", "13:00", "14:00"], wave_height: [0.8, 0.9, 1.1] },
    }, "2026-11-01T12:01:00.000Z");
    expect(result.current.waveHeightM).toBe(0.8);
    expect(result.current.waveDirectionDeg).toBe(225);
    expect(result.nextHours).toHaveLength(3);
    expect(result.fetchedAt).toBe("2026-11-01T12:01:00.000Z");
  });
  it("keeps unavailable optional variables null", () => {
    const result = normalizeMarinePayload({ current: { time: "2026-11-01T12:00", wave_height: 0.4 } });
    expect(result.current.wavePeriodS).toBeNull();
    expect(result.current.seaTemperatureC).toBeNull();
    expect(result.nextHours).toEqual([]);
  });
  it("rejects missing or invalid wave height", () => {
    expect(() => normalizeMarinePayload({ current: { time: "now" } })).toThrow("wave height");
    expect(() => normalizeMarinePayload({ current: { time: "now", wave_height: -1 } })).toThrow("wave height");
  });
});
