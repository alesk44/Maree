import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { fishers, useStore } from "@/lib/store";
import { DemoBadge, Empty, StatusPill } from "@/components/ui-bits";

export const Route = createFileRoute("/pecheurs/$id")({
  loader: ({ params }) => {
    const f = fishers.find((x) => x.id === params.id);
    if (!f) throw notFound();
    return { name: f.name, boat: f.boat };
  },
  head: ({ loaderData }) => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: `${loaderData?.name ?? "Pêcheur"} — Marée Jersey` },
      { name: "description", content: `Profil du pêcheur ${loaderData?.name ?? ""}, bateau ${loaderData?.boat ?? ""}.` },
      { property: "og:title", content: `${loaderData?.name ?? "Pêcheur"} — Marée Jersey` },
      { property: "og:description", content: "Profil, méthode de pêche et historique des prises." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { t, gbp, dt } = useLanguage();
  const { id } = Route.useParams();
  const { catches } = useStore();
  const f = fishers.find((x) => x.id === id);
  if (!f) throw notFound();
  const hist = catches.filter((c) => c.fisherId === id).sort((a, b) => b.landedAt.localeCompare(a.landedAt));
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/pecheurs" className="text-sm text-muted-foreground">{t("← Tous les pêcheurs")}</Link>
      <div className="card mt-4 overflow-hidden">
        <div className="bg-sea p-8 text-primary-foreground">
          <DemoBadge />
          <h1 className="mt-3 text-4xl font-semibold">{f.name}</h1>
          <p className="opacity-90">{f.boat} · Port de {f.port} · depuis {f.since}</p>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <div><h2 className="text-lg font-semibold">{t("Présentation")}</h2><p className="mt-1 text-muted-foreground">{t(f.bio)}</p>
            <p className="mt-3"><strong>{t("Méthode :")}</strong> {t(f.method)}</p></div>
          <div><h2 className="text-lg font-semibold">{t("Coordonnées (démo)")}</h2>
            <p className="mt-1">{f.phone}</p><p>{f.email}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("Coordonnées fictives — ne pas appeler.")}</p></div>
        </div>
      </div>
      <h2 className="mt-10 mb-4 text-2xl font-semibold">{t("Historique des prises")}</h2>
      {hist.length === 0 ? <Empty>{t("Aucune prise publiée.")}</Empty> : (
        <ul className="card divide-y">
          {hist.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span>{c.emoji} <strong>{t(c.species)}</strong> <span className="text-sm text-muted-foreground">· {t(c.zone)} · {dt(c.landedAt)}</span></span>
              <span className="flex items-center gap-3 text-sm">{c.qtyKg} kg · {gbp(c.priceKg)}/kg <StatusPill s={c.status} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}