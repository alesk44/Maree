import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actions, useStore, ORDER_STEPS, type Status } from "@/lib/store";
import { DemoBadge, Empty, OrderSteps, PageHeader, StatusPill } from "@/components/ui-bits";

export const Route = createFileRoute("/espace-pecheur")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Espace pêcheur — Marée Jersey" },
      { name: "description", content: "Publiez votre prise du jour et gérez les demandes des restaurants." },
      { property: "og:title", content: "Espace pêcheur — Marée Jersey" },
      { property: "og:description", content: "Publication des prises et gestion des demandes." },
    ],
  }),
  component: FisherSpace,
});

const EMOJI: Record<string, string> = { Casiers: "🦀", Ligne: "🐟", Plongée: "🐚", "Filet maillant": "🐠" };

function FisherSpace() {
  const { t, gbp, dt } = useLanguage();
  const { fishers, catches, orders } = useStore();
  const [fid, setFid] = useState("f1");
  const me = fishers.find((f) => f.id === fid) ?? fishers[0];
  const mine = catches.filter((c) => c.fisherId === fid);
  const myOrders = orders.filter((o) => mine.some((c) => c.id === o.catchId));
  const [form, setForm] = useState({ species: "", zone: "", qtyKg: 10, priceKg: 15, grade: "", storage: "Sur glace pilée 0–2 °C", caughtAt: "", landedAt: "" });
  const up = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  if (!me) return null;

  const publish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.species.trim() || !form.zone.trim() || !form.caughtAt || !form.landedAt) return toast.error(t("Espèce, zone et horaires sont requis."));
    try {
      actions.addCatch({ ...form, species: form.species.trim(), zone: form.zone.trim(), grade: form.grade.trim(), caughtAt: new Date(form.caughtAt).toISOString(), landedAt: new Date(form.landedAt).toISOString(), fisherId: fid, method: me.method, emoji: EMOJI[me.method] ?? "🐟", status: "disponible" });
      toast.success(t("Prise publiée dans le catalogue (enregistrée localement)."));
      setForm((f) => ({ ...f, species: "", grade: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? t(error.message) : t("Impossible de publier cette prise."));
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("Espace pêcheur")} sub={t("Sans authentification dans ce prototype : choisissez un profil de démonstration.")}>
        <div className="flex items-center gap-2"><DemoBadge />
          <select className="field w-auto" aria-label={t("Profil pêcheur")} value={fid} onChange={(e) => setFid(e.target.value)}>
            {fishers.map((f) => <option key={f.id} value={f.id}>{f.name} — {f.boat}</option>)}
          </select></div>
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={publish} className="card grid gap-3 p-6">
          <h2 className="text-xl font-semibold">{t("Publier une prise du jour")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <L t={t("Espèce")}><input className="field" value={form.species} onChange={(e) => up("species", e.target.value)} placeholder={t("ex. Maquereau")} /></L>
            <L t={t("Zone")}><input className="field" value={form.zone} onChange={(e) => up("zone", e.target.value)} placeholder={t("ex. Baie de St Ouen")} /></L>
            <L t={t("Capture")}><input className="field" type="datetime-local" value={form.caughtAt} onChange={(e) => up("caughtAt", e.target.value)} /></L>
            <L t={t("Débarquement")}><input className="field" type="datetime-local" value={form.landedAt} onChange={(e) => up("landedAt", e.target.value)} /></L>
            <L t={t("Quantité (kg)")}><input className="field" type="number" min={0} step={0.5} value={form.qtyKg} onChange={(e) => up("qtyKg", +e.target.value)} /></L>
            <L t={t("Prix (£/kg)")}><input className="field" type="number" min={0} step={0.5} value={form.priceKg} onChange={(e) => up("priceKg", +e.target.value)} /></L>
            <L t={t("Calibre / qualité")}><input className="field" value={form.grade} onChange={(e) => up("grade", e.target.value)} /></L>
            <L t={t("Méthode")}><input className="field" value={t(me.method)} disabled /></L>
          </div>
          <L t={t("Conseils de conservation")}><input className="field" value={form.storage} onChange={(e) => up("storage", e.target.value)} /></L>
          <button className="btn">{t("Publier")}</button>
        </form>
        <section>
          <h2 className="mb-3 text-xl font-semibold">{t("Mes lots")}</h2>
          {mine.length === 0 ? <Empty>{t("Aucun lot publié.")}</Empty> : (
            <ul className="grid gap-3">
              {mine.map((c) => (
                <li key={c.id} className="card p-4">
                  <div className="flex items-center justify-between"><strong>{c.emoji} {t(c.species)}</strong><StatusPill s={c.status} /></div>
                  <p className="text-xs text-muted-foreground">{t("Débarqué")} {dt(c.landedAt)}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <input className="field" type="number" aria-label={t("Quantité kg")} min={0} step={0.5} value={c.qtyKg} onChange={(e) => actions.updateCatch(c.id, { qtyKg: +e.target.value })} />
                    <input className="field" type="number" aria-label={t("Prix £/kg")} min={0} step={0.5} value={c.priceKg} onChange={(e) => actions.updateCatch(c.id, { priceKg: +e.target.value })} />
                    <select className="field" aria-label={t("Statut")} value={c.status} onChange={(e) => actions.updateCatch(c.id, { status: e.target.value as Status })}>
                      <option value="disponible">{t("disponible")}</option><option value="réservé">{t("réservé")}</option><option value="épuisé">{t("épuisé")}</option></select>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>kg · £/kg ({gbp(c.priceKg)})</span>
                    {c.status !== "épuisé" && <button type="button" className="font-semibold text-destructive" onClick={() => { actions.updateCatch(c.id, { status: "épuisé", qtyKg: 0 }); toast(t("Lot marqué épuisé.")); }}>{t("Marquer épuisé")}</button>}</div>
                </li>))}
            </ul>)}
          <h2 className="mt-8 mb-3 text-xl font-semibold">{t("Demandes reçues")}</h2>
          {myOrders.length === 0 ? <Empty>{t("Aucune demande reçue.")}</Empty> : (
            <ul className="grid gap-3">
              {myOrders.map((o) => { const c = catches.find((x) => x.id === o.catchId); if (!c) return null; const i = ORDER_STEPS.indexOf(o.status); return (
                <li key={o.id} className="card p-4">
                  <strong>{t(o.restaurant)}</strong> — {o.qtyKg} kg {t(c.species)}
                  <p className="mb-2 text-sm text-muted-foreground">{t(o.mode)}{t("le")} {dt(o.slot)} {o.contact && `· ${o.contact}`}{o.note && ` · « ${o.note} »`}</p>
                  <OrderSteps s={o.status} />
                  {i < 3 && <button className="btn btn-accent mt-3 text-sm" onClick={() => { actions.setOrderStatus(o.id, ORDER_STEPS[i + 1]); toast.success(t("Statut : {status}", { status: t(ORDER_STEPS[i + 1]) })); }}>{t("Passer à « {status} »", { status: t(ORDER_STEPS[i + 1]) })}</button>}
                </li>); })}
            </ul>)}
        </section>
      </div>
    </div>
  );
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium">{t}{children}</label>;
}