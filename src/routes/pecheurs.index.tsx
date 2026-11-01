import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSharedMarket } from "@/lib/shared-market";
import { Empty, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/pecheurs/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Pêcheurs partenaires — Marée Jersey" },
      { name: "description", content: "Les pêcheurs côtiers de Jersey partenaires de Marée Jersey." },
      { property: "og:title", content: "Pêcheurs partenaires — Marée Jersey" },
      { property: "og:description", content: "Découvrez les bateaux et méthodes de pêche." },
    ],
  }),
  component: function FishersPage() {
    const { t } = useLanguage();
    const { fishers, catches, loading, error } = useSharedMarket();
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("Pêcheurs partenaires")} sub={t("Découvrez les pêcheurs vérifiés qui publient leur pêche du jour.")} />
        {error && <p role="alert" className="mb-4 text-sm text-destructive">{t("Impossible de charger les données du marché.")}</p>}
        {loading && <p role="status" className="mb-4 text-sm text-muted-foreground">{t("Chargement des pêcheurs…")}</p>}
        {!loading && fishers.length === 0 && <Empty>{t("Aucun pêcheur vérifié n'est encore inscrit.")}</Empty>}
        <div className="grid gap-5 sm:grid-cols-2">
          {fishers.map((f) => (
            <Link key={f.id} to="/pecheurs/$id" params={{ id: f.id }} className="card block p-6 transition hover:shadow-lg">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sea font-display text-xl text-primary-foreground">{f.name.split(" ").map((p) => p[0]).join("")}</div>
                <div>
                  <h2 className="text-xl font-semibold">{f.name}</h2>
                  <p className="text-sm text-muted-foreground">{f.boat} · {f.port} · {t(f.method)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm">{t(f.bio)}</p>
              <p className="mt-2 text-xs text-accent font-semibold">{catches.filter((c) => c.fisherId === f.id).length}{t("lots publiés →")}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  },
});