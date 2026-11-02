import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import type { JerseyWeather } from "@/lib/weather";
import { getJerseySeason, getSeasonalSeafood } from "@/lib/seasonality";

const SEASON_LABELS = {
  winter: ["Hiver", "Winter", "Iarnă"],
  spring: ["Printemps", "Spring", "Primăvară"],
  summer: ["Été", "Summer", "Vară"],
  autumn: ["Automne", "Autumn", "Toamnă"],
} as const;

function windDirection(degrees: number | null, language: string) {
  if (degrees === null) return "—";
  const labels = language === "fr"
    ? ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
    : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(degrees / 45) % 8];
}

export function WeatherSeasonPanel() {
  const { language } = useLanguage();
  const [weather, setWeather] = useState<JerseyWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/weather", { signal: controller.signal });
        if (!response.ok) throw new Error("Weather unavailable");
        const result = await response.json() as JerseyWeather;
        if (active) { setWeather(result); setError(false); }
      } catch {
        if (active && !controller.signal.aborted) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const refresh = window.setInterval(() => { if (!controller.signal.aborted) void load(); }, 30 * 60 * 1000);
    return () => { active = false; controller.abort(); window.clearInterval(refresh); };
  }, []);

  const season = getJerseySeason();
  const seafood = getSeasonalSeafood(season.month);
  const langIndex = language === "fr" ? 0 : language === "ro" ? 2 : 1;
  const labels = {
    weather: ["Météo à Jersey", "Jersey weather", "Vremea în Jersey"],
    current: ["Conditions actuelles", "Current conditions", "Condiții actuale"],
    wind: ["Vent", "Wind", "Vânt"],
    humidity: ["Humidité", "Humidity", "Umiditate"],
    rain: ["Pluie prochaine heure", "Rain next hour", "Ploaie în următoarea oră"],
    forecast: ["Tendance météo · prochaines heures", "Weather outlook · next hours", "Prognoză · următoarele ore"],
    season: ["Saison actuelle", "Current season", "Sezonul actual"],
    seafood: ["Produits de la mer à privilégier", "Seafood to look for", "Produse marine de urmărit"],
    best: ["Période de meilleure qualité", "Best quality period", "Perioadă de calitate optimă"],
    inSeason: ["En saison", "In season", "În sezon"],
    daily: ["Selon les débarquements du jour", "Check today's landings", "În funcție de capturile zilei"],
    disclaimer: ["La saisonnalité indique une tendance générale, pas une garantie de stock. Vérifiez les lots réellement publiés, la traçabilité, la taille minimale et les règles de pêche en vigueur à Jersey.", "Seasonality is a general guide, not a stock guarantee. Check actual published lots, traceability, minimum sizes and current Jersey fishing rules.", "Sezonalitatea este doar orientativă, nu o garanție de stoc. Verificați capturile publicate, trasabilitatea, dimensiunile minime și regulile actuale de pescuit din Jersey."],
    unavailable: ["Météo indisponible pour le moment.", "Weather is temporarily unavailable.", "Vremea nu este disponibilă momentan."],
    attribution: ["Données météo : MET Norway · CC BY 4.0", "Weather data: MET Norway · CC BY 4.0", "Date meteo: MET Norway · CC BY 4.0"],
  };
  const tr = (values: readonly string[]) => values[langIndex];
  const locale = language === "fr" ? "fr-FR" : language === "ro" ? "ro-RO" : "en-GB";
  const time = (value: string) => new Intl.DateTimeFormat(locale, { timeZone: "Europe/Jersey", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const monthName = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Jersey", month: "long" }).format(new Date());
  const seasonName = SEASON_LABELS[season.season][langIndex];

  return (
    <section aria-labelledby="weather-season-title" className="mx-auto mt-8 max-w-6xl px-4">
      <div className="card overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Jersey · {monthName}</p>
            <h2 id="weather-season-title" className="mt-1 text-xl font-semibold">{tr(labels.weather)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tr(labels.current)} · {seasonName}</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{tr(labels.season)} : {seasonName}</span>
        </div>
        {loading && <p role="status" className="mt-5 text-sm text-muted-foreground">Loading…</p>}
        {error && <p role="alert" className="mt-5 text-sm text-muted-foreground">{tr(labels.unavailable)}</p>}
        {weather && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Température" value={weather.current.temperatureC === null ? "—" : weather.current.temperatureC.toFixed(1) + " °C"} />
              <Metric label={tr(labels.wind)} value={weather.current.windSpeedKmh === null ? "—" : weather.current.windSpeedKmh.toFixed(0) + " km/h · " + windDirection(weather.current.windDirectionDeg, language)} />
              <Metric label={tr(labels.humidity)} value={weather.current.humidityPercent === null ? "—" : weather.current.humidityPercent.toFixed(0) + " %"} />
              <Metric label={tr(labels.rain)} value={weather.current.precipitationMm === null ? "—" : weather.current.precipitationMm.toFixed(1) + " mm"} />
            </div>
            {weather.nextHours.length > 0 && <div className="mt-5 border-t border-border pt-4">
              <p className="mb-3 text-sm font-semibold">{tr(labels.forecast)}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {weather.nextHours.map((hour) => <div key={hour.time} className="rounded-xl bg-secondary/70 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{time(hour.time)}</p>
                  <p className="mt-1 font-semibold tabular-nums">{hour.temperatureC === null ? "—" : hour.temperatureC.toFixed(0) + "°"}</p>
                  <p className="text-xs text-muted-foreground">{hour.precipitationMm === null ? "—" : hour.precipitationMm.toFixed(1) + " mm"}</p>
                </div>)}
              </div>
            </div>}
            <p className="mt-4 text-xs text-muted-foreground">{tr(labels.attribution)} · <a href="https://api.met.no/" target="_blank" rel="noreferrer" className="underline underline-offset-2">MET Norway</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline underline-offset-2">CC BY 4.0</a></p>
          </>
        )}
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-lg font-semibold">{tr(labels.seafood)}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seafood.map((item) => {
              const status = item.status === "best_now" ? tr(labels.best) : item.status === "in_season" ? tr(labels.inSeason) : tr(labels.daily);
              return <article key={item.name} className="rounded-xl bg-secondary/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-semibold">{item.name}</h4><span className="text-xs text-accent">{status}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">{item.months}</p>
                <p className="mt-2 text-sm">{item.note}</p>
              </article>;
            })}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{tr(labels.disclaimer)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Seasonality sources: <a href="https://www.jersey.com/inspire-me/inspiration/jerseys-local-produce/" target="_blank" rel="noreferrer" className="underline">Visit Jersey</a> · <a href="https://jerseymarkets.je/traders/fin-feather/" target="_blank" rel="noreferrer" className="underline">Jersey Markets</a> · <a href="https://www.gov.je/Industry/FarmingFishing/Fishing/pages/fishingregulations.aspx" target="_blank" rel="noreferrer" className="underline">Government of Jersey</a></p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-secondary/70 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p></div>;
}
