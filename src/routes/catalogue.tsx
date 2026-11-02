import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { Catch } from "@/lib/store";
import { useSharedMarket } from "@/lib/shared-market";
import { DemoBadge, Empty, PageHeader, StatusPill } from "@/components/ui-bits";

export const Route = createFileRoute("/catalogue")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Pêche du jour — Marée Jersey" },
      { name: "description", content: "Catalogue de la pêche du jour à Jersey : espèces, bateaux, zones, prix au kilo." },
      { property: "og:title", content: "Pêche du jour — Marée Jersey" },
      { property: "og:description", content: "Produits de la mer frais et traçables autour de Jersey." },
    ],
  }),
  component: Catalogue,
});

function Catalogue() {
  const { t, gbp, dt } = useLanguage();
  const { catches, fishers, loading, error } = useSharedMarket();
  const [q, setQ] = useState("");
  const [species, setSpecies] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [maxPrice, setMaxPrice] = useState(50);
  const [sort, setSort] = useState<"fresh" | "price">("fresh");

  const speciesList = [...new Set(catches.map((c) => c.species))];
  const methods = [...new Set(catches.map((c) => c.method))];
  const list = useMemo(() => {
    const r = catches.filter((c) =>
      (!q || (c.species + c.zone + c.grade).toLowerCase().includes(q.toLowerCase())) &&
      (!species || c.species === species) && (!status || c.status === status) &&
      (!method || c.method === method) && c.priceKg <= maxPrice);
    return r.sort((a, b) => sort === "fresh" ? b.landedAt.localeCompare(a.landedAt) : a.priceKg - b.priceKg);
  }, [catches, q, species, status, method, maxPrice, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("Pêche du jour")} sub={t("Lots publiés par les pêcheurs partenaires.")} />
      {loading && <p role="status" className="mb-4 text-sm text-muted-foreground">{t("Chargement des prises partagées…")}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 p-3 text-sm">{t("Catalogue indisponible :")} {error}</p>}
      {!loading && !error && catches.length === 0 && <p className="mb-4 text-sm text-muted-foreground">{t("Aucune prise réelle publiée pour le moment.")}</p>}
      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input className="field lg:col-span-2" placeholder={t("Rechercher espèce, zone…")} aria-label={t("Recherche")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field" aria-label={t("Espèce")} value={species} onChange={(e) => setSpecies(e.target.value)}>
          <option value="">{t("Toutes espèces")}</option>{speciesList.map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
        <select className="field" aria-label={t("Disponibilité")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("Tous statuts")}</option><option value="disponible">{t("Disponible")}</option><option value="réservé">{t("Réservé")}</option><option value="épuisé">{t("Épuisé")}</option>
        </select>
        <select className="field" aria-label={t("Méthode")} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">{t("Toutes méthodes")}</option>{methods.map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
        <select className="field" aria-label={t("Tri")} value={sort} onChange={(e) => setSort(e.target.value as "fresh" | "price")}>
          <option value="fresh">{t("Plus frais d'abord")}</option><option value="price">{t("Prix croissant")}</option>
        </select>
        <label className="flex items-center gap-3 text-sm sm:col-span-2 lg:col-span-6">{t("Prix max :")} <strong>{gbp(maxPrice)}/kg</strong>
          <input type="range" min={5} max={50} value={maxPrice} onChange={(e) => setMaxPrice(+e.target.value)} className="flex-1 accent-accent" />
        </label>
      </div>
      {list.length === 0 ? <Empty>{t("Aucun lot ne correspond à vos filtres.")}</Empty> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => <CatchCard key={c.id} c={c} fisher={fishers.find((f) => f.id === c.fisherId)?.name ?? "—"} boat={fishers.find((f) => f.id === c.fisherId)?.boat ?? ""} />)}
        </div>
      )}
    </div>
  );
}

function CatchCard({ c, fisher, boat }: { c: Catch; fisher: string; boat: string }) {
  const { t, gbp, dt } = useLanguage();
  return (
    <article className="card overflow-hidden">
      <div className="flex h-32 items-center justify-center bg-sea text-6xl" aria-hidden>{c.emoji}</div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-semibold">{t(c.species)}</h2><StatusPill s={c.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          <Link to="/pecheurs/$id" params={{ id: c.fisherId }} className="underline-offset-2 hover:underline">{fisher}</Link> · {boat}
        </p>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="font-display text-2xl font-semibold text-primary">{gbp(c.priceKg)}<span className="text-sm text-muted-foreground">/kg</span></span>
          <span className="text-sm font-semibold">{c.qtyKg} kg</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{t("Zone")}</dt><dd>{t(c.zone)}</dd>
          <dt className="text-muted-foreground">{t("Capture")}</dt><dd>{dt(c.caughtAt)}</dd>
          <dt className="text-muted-foreground">{t("Débarquement")}</dt><dd>{dt(c.landedAt)}</dd>
          <dt className="text-muted-foreground">{t("Calibre")}</dt><dd>{t(c.grade)}</dd>
          <dt className="text-muted-foreground">{t("Méthode")}</dt><dd>{t(c.method)}</dd>
        </dl>
        <p className="mt-3 rounded-md bg-muted p-2 text-xs">❄️ {t(c.storage)}</p>
        {c.status === "disponible" && c.qtyKg > 0 && (
          <Link to="/restaurant" search={{ produit: c.id }} className="btn mt-4 w-full">{t("Réserver")}</Link>
        )}
      </div>
    </article>
  );
}