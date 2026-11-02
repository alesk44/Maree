export type WeatherHour = {
  time: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  symbolCode: string | null;
};

export type JerseyWeather = {
  location: string;
  timezone: string;
  fetchedAt: string;
  updatedAt: string | null;
  current: WeatherHour & { windDirectionDeg: number | null; humidityPercent: number | null };
  nextHours: WeatherHour[];
};

type MetNoTimeseries = {
  time?: unknown;
  data?: {
    instant?: { details?: Record<string, unknown> };
    next_1_hours?: { summary?: { symbol_code?: unknown }; details?: { precipitation_amount?: unknown } };
  };
};
type MetNoPayload = { properties?: { meta?: { updated_at?: unknown }; timeseries?: unknown } };

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseHour(item: MetNoTimeseries): WeatherHour {
  const details = item.data?.instant?.details ?? {};
  const precipitation = numberOrNull(item.data?.next_1_hours?.details?.precipitation_amount);
  const symbol = item.data?.next_1_hours?.summary?.symbol_code;
  return {
    time: typeof item.time === "string" ? item.time : "",
    temperatureC: numberOrNull(details["air_temperature"]),
    precipitationMm: precipitation,
    windSpeedKmh: numberOrNull(details["wind_speed"]) === null ? null : (numberOrNull(details.wind_speed) as number) * 3.6,
    symbolCode: typeof symbol === "string" ? symbol : null,
  };
}

export function normalizeWeatherPayload(payload: MetNoPayload, now = Date.now()): JerseyWeather {
  const rows = payload.properties?.timeseries;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Weather forecast is empty");
  const parsed = rows.map((row) => ({ source: row as MetNoTimeseries, hour: parseHour(row as MetNoTimeseries) }))
    .filter((entry) => entry.hour.time && Number.isFinite(Date.parse(entry.hour.time)));
  if (parsed.length === 0) throw new Error("Weather forecast has no valid timestamps");
  const futureIndex = parsed.findIndex((entry) => Date.parse(entry.hour.time) >= now);
  const currentIndex = futureIndex === -1 ? parsed.length - 1 : futureIndex;
  const currentEntry = parsed[currentIndex];
  if (!currentEntry) throw new Error("Weather forecast current conditions are missing");
  const currentRow = currentEntry.hour;
  const details = currentEntry.source.data?.instant?.details ?? {};
  return {
    location: "Saint Helier, Jersey",
    timezone: "Europe/Jersey",
    fetchedAt: new Date(now).toISOString(),
    updatedAt: typeof payload.properties?.meta?.updated_at === "string" ? payload.properties.meta.updated_at : null,
    current: {
      ...currentRow,
      windDirectionDeg: numberOrNull(details["wind_from_direction"]),
      humidityPercent: numberOrNull(details["relative_humidity"]),
    },
    nextHours: parsed.slice(currentIndex + 1).filter((entry, index) => index % 2 === 0).slice(0, 6).map((entry) => entry.hour),
  };
}
