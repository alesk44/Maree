import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";
import { useLanguage } from "@/lib/i18n";
import { fetchPublicCatchTraceability, type PublicCatchTraceability } from "@/lib/shared-market";

export const Route = createFileRoute("/tracabilite_/$token")({
  head: () => ({
    meta: [
      { title: "Traçabilité du lot — Marée Jersey" },
      { name: "description", content: "Consultez les informations déclarées pour ce lot de produits de la mer." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PublicTraceabilityPage,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function PublicTraceabilityPage() {
  const { token } = Route.useParams();
  const { t, dt } = useLanguage();
  const [record, setRecord] = useState<PublicCatchTraceability | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    if (!UUID.test(token)) {
      setUnavailable(true);
      setLoading(false);
      return () => { active = false; };
    }
    void fetchPublicCatchTraceability(token).then((value) => {
      if (!active) return;
      setRecord(value);
      setUnavailable(value === null);
    }).catch(() => {
      if (active) setUnavailable(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const timelineLabel = (event: PublicCatchTraceability["timeline"][number]["event"]) => {
    if (event === "catch_published") return t("Lot publié par le pêcheur");
    if (event === "landed") return t("Débarquement déclaré par le pêcheur");
    if (event === "external_code_scanned") return t("Référence QR externe enregistrée — non vérifiée");
    return t("Pesée déclarée");
  };

  return <div className="mx-auto max-w-3xl px-4 py-10">
    <PageHeader title={t("Traçabilité du lot")} sub="Marée Jersey" />
    {loading && <p role="status" className="card p-5">{t("Chargement…")}</p>}
    {!loading && unavailable && <p role="status" className="card p-5">{t("Aucun lot de traçabilité ne correspond à ce lien.")}</p>}
    {record && <>
      <section className="card grid gap-4 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{t(record.species)}</h2>
            <p className="text-sm text-muted-foreground">{record.fisher.name ?? "Marée Jersey"}{record.fisher.boat ? ` · ${record.fisher.boat}` : ""}</p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{t("Traçabilité")}</span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label={t("Zone")} value={t(record.zone)} />
          <Fact label={t("Capture")} value={dt(record.caughtAt)} />
          <Fact label={t("Débarquement")} value={dt(record.landedAt)} />
          <Fact label={t("Quantité (kg)")} value={`${Number(record.quantityKg).toLocaleString()} kg`} />
          <Fact label={t("Méthode")} value={t(record.method)} />
          {record.fisher.homePort && <Fact label={t("Port d’attache")} value={t(record.fisher.homePort)} />}
          {record.grade && <Fact label={t("Calibre")} value={t(record.grade)} />}
          <Fact label={t("Conseils de conservation")} value={t(record.storageInstructions)} />
        </dl>
      </section>
      <section className="card mt-5 p-5 sm:p-7">
        <h2 className="text-lg font-semibold">{t("Historique de traçabilité")}</h2>
        <ol className="mt-4 grid gap-4 border-l border-border pl-4">
          {record.timeline.map((event, index) => <li key={`${event.event}-${event.occurredAt}-${index}`} className="relative">
            <span className="absolute -left-[1.34rem] top-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            <p className="font-medium">{timelineLabel(event.event)}</p>
            <p className="text-sm text-muted-foreground">{dt(event.occurredAt)}{event.quantityKg === null ? "" : ` · ${Number(event.quantityKg).toLocaleString()} kg`}</p>
          </li>)}
        </ol>
      </section>
      <p className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-900 dark:text-amber-200">{t("Données déclarées par le pêcheur. Ce QR n'est ni une certification officielle ni une validation de légalité, de fraîcheur ou de sécurité sanitaire.")}</p>
    </>}
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-secondary/60 p-3">
    <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-sm">{value}</dd>
  </div>;
}
