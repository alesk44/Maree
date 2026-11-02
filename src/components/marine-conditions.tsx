import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import type { MarineConditions } from "@/lib/marine";

function direction(degrees: number, language: string) {
  const labels = language === "fr"
    ? ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
    : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(degrees / 45) % 8];
}
export function MarineConditionsPanel() {
  const { language } = useLanguage();
  const [data, setData] = useState<MarineConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/marine", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Marine forecast unavailable");
        return response.json() as Promise<MarineConditions>;
      })
      .then((result) => setData(result))
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const index = language === "fr" ? 0 : language === "ro" ? 2 : 1;
  const tr = (values: readonly [string, string, string]) => values[index];
  const locale = language === "fr" ? "fr-FR" : language === "ro" ? "ro-RO" : "en-GB";
  const labels = {
    overview: ["Jersey · aperçu côtier", "Jersey · coastal overview", "Jersey · prezentare de coastă"],
    title: ["Conditions en mer", "Sea conditions", "Condiții maritime"],
    forecast: ["Prévisions marines indicatives", "Indicative marine forecast", "Prognoză marină orientativă"],
    refresh: ["Mise à jour automatique", "Automatic refresh", "Actualizare automată"],
    loading: ["Chargement des conditions marines…", "Loading marine conditions…", "Se încarcă condițiile maritime…"],
    unavailable: ["Les conditions marines sont momentanément indisponibles. Réessayez dans quelques minutes.", "Marine conditions are temporarily unavailable. Please try again shortly.", "Condițiile maritime nu sunt disponibile momentan. Încercați din nou peste câteva minute."],
    height: ["Hauteur des vagues", "Wave height", "Înălțimea valurilor"],
    period: ["Période des vagues", "Wave period", "Perioada valurilor"],
    direction: ["Direction", "Direction", "Direcție"],
    temperature: ["Température de la mer", "Sea temperature", "Temperatura mării"],
    outlook: ["Évolution des vagues · prochaines heures", "Wave outlook · next hours", "Evoluția valurilor · următoarele ore"],
    fetched: ["Dernière récupération : ", "Last fetched: ", "Ultima actualizare: "],
    source: ["Source : Open-Meteo Marine API", "Source: Open-Meteo Marine API", "Sursă: Open-Meteo Marine API"],
    safety: ["Information indicative uniquement : la résolution et la précision près des côtes sont limitées. Ce panneau ne constitue pas un avis de navigation ni une évaluation de sécurité. Consultez les bulletins et autorités maritimes officiels avant toute sortie.", "Indicative information only: resolution and accuracy near the coast are limited. This panel is not navigation or safety advice. Consult official marine forecasts and authorities before going to sea.", "Informații orientative: rezoluția și precizia în apropierea coastelor sunt limitate. Acest panou nu reprezintă un aviz de navigație sau o evaluare a siguranței. Consultați buletinele și autoritățile maritime oficiale înainte de orice ieșire pe mare."]
  } as const;
  const formatTime = (value: string) => new Intl.DateTimeFormat(locale, { timeZone: "Europe/Jersey", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return (
    <section aria-labelledby="marine-title" className="mx-auto mt-12 max-w-6xl px-4">
      <div className="card overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{tr(labels.overview)}</p>
            <h2 id="marine-title" className="mt-1 text-xl font-semibold">{tr(labels.title)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tr(labels.forecast)}</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{tr(labels.refresh)}</span>
        </div>
        {loading && <p role="status" className="mt-5 text-sm text-muted-foreground">{tr(labels.loading)}</p>}
        {error && <p role="alert" className="mt-5 text-sm text-muted-foreground">{tr(labels.unavailable)}</p>}
        {data && <div className="mt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={tr(labels.height)} value={data.current.waveHeightM.toFixed(1) + " m"} />
            <Metric label={tr(labels.period)} value={data.current.wavePeriodS === null ? "—" : data.current.wavePeriodS.toFixed(0) + " s"} />
            <Metric label={tr(labels.direction)} value={data.current.waveDirectionDeg === null ? "—" : direction(data.current.waveDirectionDeg, language) + " · " + Math.round(data.current.waveDirectionDeg) + "°"} />
            <Metric label={tr(labels.temperature)} value={data.current.seaTemperatureC === null ? "—" : data.current.seaTemperatureC.toFixed(1) + " °C"} />
          </div>
          {data.nextHours.length > 0 && <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-sm font-semibold">{tr(labels.outlook)}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {data.nextHours.map((hour) => <div key={hour.time} className="rounded-xl bg-secondary/70 p-3 text-center">
                <p className="text-xs text-muted-foreground">{formatTime(hour.time)}</p>
                <p className="mt-1 font-semibold tabular-nums">{hour.waveHeightM === null ? "—" : hour.waveHeightM.toFixed(1) + " m"}</p>
              </div>)}
            </div>
          </div>}
          <p className="mt-4 text-xs text-muted-foreground">{tr(labels.fetched) + formatTime(data.fetchedAt) + " · "}{tr(labels.source)} · <a className="underline underline-offset-2" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></p>
        </div>}
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">{tr(labels.safety)}</p>
      </div>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-secondary/70 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p></div>;
}
