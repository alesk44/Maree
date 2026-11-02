import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSharedMarket } from "@/lib/shared-market";
import { MarineConditionsPanel } from "@/components/marine-conditions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Marée Jersey — La pêche de Jersey, directement à votre cuisine" },
      { name: "description", content: "Mettez en relation pêcheurs de Jersey et restaurants locaux : pêche du jour fraîche et traçable." },
      { property: "og:title", content: "Marée Jersey" },
      { property: "og:description", content: "La pêche de Jersey, directement à votre cuisine." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t, gbp, dt } = useLanguage();
  const translateLabel = t;
  const { catches, fishers, loading, error } = useSharedMarket();
  const available = catches.filter((c) => c.status === "disponible" && c.qtyKg > 0).length;
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 bg-sea" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_18%,rgba(54,190,185,0.24),transparent_48%)]" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-background/35 via-transparent to-black/10" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-foreground md:py-36">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sand-foreground">{t("Jersey · Îles Anglo-Normandes")}</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight md:text-6xl">{t("La pêche de Jersey, directement à votre cuisine")}</h1>
          <p className="mt-4 max-w-xl text-lg opacity-90">{t("Des prises fraîches et traçables, du bateau au restaurant, sans intermédiaire.")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/catalogue" className="btn btn-accent">{t("Voir la pêche du jour")}</Link>
            <Link to="/espace-pecheur" className="btn btn-ghost border-foreground/40 text-foreground">{t("Je suis pêcheur")}</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto -mt-10 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 relative">
        <Stat n={loading ? "—" : available} label="lots réellement disponibles" />
        <Stat n={loading ? "—" : fishers.length} label="pêcheurs vérifiés" />
      </section>
      {error && <p role="alert" className="mx-auto mt-3 max-w-6xl px-4 text-sm text-destructive">{t("Impossible de charger les données du marché.")}</p>}
      {!loading && available === 0 && <p className="mx-auto mt-3 max-w-6xl px-4 text-sm text-muted-foreground">{t("Aucun lot disponible pour le moment. Revenez consulter la pêche du jour.")}</p>}
      <MarineConditionsPanel />
      <section className="mx-auto mt-16 grid max-w-6xl gap-6 px-4 md:grid-cols-3">
        {([
          ["Traçable", "Bateau, zone, heure de capture et de débarquement sur chaque lot."],
          ["Frais", "Tri par fraîcheur et conseils de conservation de la chaîne du froid."],
          ["Local", "Des pêcheurs côtiers de Gorey, St Helier, St Aubin et Rozel."],
        ] as const).map(([t, d]) => (
          <div key={t} className="card p-6">
            <h2 className="text-xl font-semibold text-primary">{translateLabel(t)}</h2>
            <p className="mt-2 text-muted-foreground">{translateLabel(d)}</p>
          </div>
        ))}
      </section>
    </>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  const { t, gbp, dt } = useLanguage();
  return (
    <div className="card p-6 shadow-lg">
      <p className="font-display text-4xl font-semibold text-primary">{n}</p>
      <p className="text-muted-foreground">{t(label)}</p>
    </div>
  );
}