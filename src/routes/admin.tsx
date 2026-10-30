import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { actions, useStore } from "@/lib/store";
import { DemoBadge, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Tableau de bord — Marée Jersey" },
      { name: "description", content: "Tableau de bord de démonstration, traçabilité et chaîne du froid." },
      { property: "og:title", content: "Tableau de bord — Marée Jersey" },
      { property: "og:description", content: "Indicateurs et bonnes pratiques de fraîcheur." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { t, gbp } = useLanguage();
  const { catches, orders, fishers } = useStore();
  const kg = catches.filter((c) => c.status === "disponible").reduce((sum, item) => sum + item.qtyKg, 0);
  const value = orders.reduce((sum, order) => sum + order.qtyKg * (catches.find((item) => item.id === order.catchId)?.priceKg ?? 0), 0);
  const stats: [string, string | number][] = [
    ["Lots publiés", catches.length],
    ["Kg disponibles", kg],
    ["Demandes", orders.length],
    ["Valeur indicative", gbp(value)],
    ["Pêcheurs", fishers.length],
    ["Épuisés", catches.filter((item) => item.status === "épuisé").length],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("Tableau de bord")} sub={t("Vue d'ensemble de démonstration.")}>
        <DemoBadge />
      </PageHeader>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-muted-foreground">{t(label)}</p>
            <p className="font-display text-3xl font-semibold text-primary">{value}</p>
          </div>
        ))}
      </div>
      <button
        className="btn btn-ghost mt-4"
        onClick={() => {
          actions.reset();
          toast(t("Données de démonstration réinitialisées."));
        }}
      >
        {t("Réinitialiser les données de démo")}
      </button>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <Info title={t("Traçabilité")} items={[
          "Chaque lot indique bateau, pêcheur, zone, heure de capture et de débarquement.",
          "Conserver les bons de débarquement et numéros de lot.",
          "Afficher espèce (nom commercial et scientifique) et méthode de pêche.",
        ]} />
        <Info title={t("Fraîcheur")} items={[
          "Œil bombé et brillant, branchies rouges, odeur marine légère.",
          "Crustacés et coquillages vendus vivants.",
          "Privilégier un délai capture → cuisine inférieur à 24 h.",
        ]} />
        <Info title={t("Chaîne du froid")} items={[
          "Poisson sur glace pilée, 0–2 °C, jamais au contact de l'eau de fonte.",
          "Crustacés vivants 4–8 °C, sous linge humide.",
          "Transport en caisses isothermes, températures relevées à la remise.",
        ]} />
      </div>
    </div>
  );
}

function Info({ title, items }: { title: string; items: string[] }) {
  const { t } = useLanguage();
  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-primary">{title}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
        {items.map((item) => <li key={item}>{t(item)}</li>)}
      </ul>
    </div>
  );
}
