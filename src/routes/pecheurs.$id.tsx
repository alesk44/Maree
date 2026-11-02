import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSharedMarket } from "@/lib/shared-market";
import { Empty, StatusPill } from "@/components/ui-bits";

export const Route = createFileRoute("/pecheurs/$id")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Pêcheur partenaire — Marée Jersey" },
      { name: "description", content: "Profil et prises du jour des pêcheurs vérifiés de Jersey." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { t, gbp, dt } = useLanguage();
  const { id } = Route.useParams();
  const { catches, fishers, loading, error } = useSharedMarket();
  const fisher = fishers.find((item) => item.id === id);
  const history = catches.filter((item) => item.fisherId === id).sort((a, b) => b.landedAt.localeCompare(a.landedAt));

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-10"><p role="status">{t("Chargement du profil pêcheur…")}</p></div>;
  if (error) return <div className="mx-auto max-w-4xl px-4 py-10"><p role="alert" className="text-destructive">{t("Impossible de charger les données du marché.")}</p></div>;
  if (!fisher) return <div className="mx-auto max-w-4xl px-4 py-10"><Empty>{t("Ce profil pêcheur n'est pas disponible.")}</Empty><Link to="/pecheurs" className="mt-4 inline-block text-accent underline">{t("← Tous les pêcheurs")}</Link></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/pecheurs" className="text-sm text-muted-foreground hover:text-accent">{t("← Tous les pêcheurs")}</Link>
      <div className="card mt-4 overflow-hidden">
        <div className="bg-sea p-8 text-primary-foreground">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">{t("Pêcheur vérifié")}</span>
          <h1 className="mt-3 text-4xl font-semibold">{fisher.name}</h1>
          <p className="opacity-90">{fisher.boat} · {t("Port de")} {fisher.port} · {t("depuis")} {fisher.since}</p>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <div><h2 className="text-lg font-semibold">{t("Présentation")}</h2><p className="mt-1 text-muted-foreground">{t(fisher.bio)}</p>
            <p className="mt-3"><strong>{t("Méthode :")}</strong> {t(fisher.method)}</p></div>
          <div><h2 className="text-lg font-semibold">{t("Informations de contact")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("Les coordonnées privées ne sont pas affichées publiquement. Utilisez une demande de réservation pour contacter le pêcheur.")}</p>
            <Link to="/catalogue" className="btn btn-accent mt-4">{t("Voir les prises disponibles")}</Link></div>
        </div>
      </div>
      <h2 className="mb-4 mt-10 text-2xl font-semibold">{t("Prises disponibles")}</h2>
      {history.length === 0 ? <Empty>{t("Aucune prise publiée pour le moment.")}</Empty> : (
        <ul className="card divide-y divide-border">
          {history.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span>{item.emoji} <strong>{t(item.species)}</strong> <span className="text-sm text-muted-foreground">· {t(item.zone)} · {dt(item.landedAt)}</span></span>
              <span className="flex items-center gap-3 text-sm">{item.qtyKg} kg · {gbp(item.priceKg)}/kg <StatusPill s={item.status} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
