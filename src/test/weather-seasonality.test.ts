import { describe, expect, it } from "vitest";
import { normalizeWeatherPayload } from "@/lib/weather";
import { getJerseySeason, getSeasonalSeafood } from "@/lib/seasonality";

describe("Jersey weather normalization", () => {
  it("normalizes MET Norway forecast data and converts wind speed to km/h", () => {
    const payload = {
      properties: {
        meta: { updated_at: "2026-11-02T06:00:00Z" },
        timeseries: [
          { time: "2026-11-02T07:00:00Z", data: { instant: { details: { air_temperature: 12, wind_speed: 5, wind_from_direction: 225, relative_humidity: 80 } }, next_1_hours: { details: { precipitation_amount: 0.4 }, summary: { symbol_code: "rain" } } } },
          { time: "2026-11-02T08:00:00Z", data: { instant: { details: { air_temperature: 13, wind_speed: 6 } } } },
          { time: "2026-11-02T09:00:00Z", data: { instant: { details: { air_temperature: 14, wind_speed: 7 } } } },
        ],
      },
    };
    const result = normalizeWeatherPayload(payload, Date.parse("2026-11-02T07:30:00Z"));
    expect(result.current.temperatureC).toBe(13);
    expect(result.current.windSpeedKmh).toBeCloseTo(21.6);
    expect(result.current.windDirectionDeg).toBeNull();
    expect(result.nextHours).toHaveLength(1);
  });

  it("rejects malformed or empty forecasts", () => {
    expect(() => normalizeWeatherPayload({ properties: { timeseries: [] } })).toThrow("Weather forecast is empty");
    expect(() => normalizeWeatherPayload({ properties: { timeseries: [{ time: "bad" }] } })).toThrow("Weather forecast has no valid timestamps");
  });
});

describe("Jersey seasonality", () => {
  it("uses Jersey local time to identify autumn in November", () => {
    expect(getJerseySeason(new Date("2026-11-02T12:00:00Z")).season).toBe("autumn");
    expect(getJerseySeason(new Date("2026-11-02T12:00:00Z")).month).toBe(11);
  });

  it("recommends chancre crab in November and keeps lobster within its season", () => {
    const items = getSeasonalSeafood(11);
    expect(items.find((item) => item.name === "Chancre crab")?.status).toBe("best_now");
    expect(items.find((item) => item.name === "Jersey lobster")?.status).toBe("in_season");
  });

  it("never labels local finfish as guaranteed stock", () => {
    const item = getSeasonalSeafood(11).find((entry) => entry.name.startsWith("Bass"));
    expect(item?.status).toBe("watch_daily_landing");
  });
});
