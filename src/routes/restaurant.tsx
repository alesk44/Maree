import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actions, useStore } from "@/lib/store";
import { DemoBadge, Empty, OrderSteps, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/restaurant")({
  validateSearch: (s: Record<string, unknown>) => ({ produit: typeof s.produit === "string" ? s.produit : undefined }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Espace restaurant — Marée Jersey" },
      { name: "description", content: "Réservez la pêche du jour pour votre restaurant à Jersey." },
      { property: "og:title", content: "Espace restaurant — Marée Jersey" },
      { property: "og:description", content: "Demandes de réservation et suivi des commandes." },
    ],
  }),
  component: Restaurant,
});

function Restaurant() {
  const { t, gbp, dt } = useLanguage();
  const { produit } = Route.useSearch();
  const { catches, orders, fishers } = useStore();
  const avail = catches.filter((c) => c.status === "disponible" && c.qtyKg > 0);
  const [catchId, setCatchId] = useState(produit ?? avail[0]?.id ?? "");
  const [qty, setQty] = useState(2);
  const [restaurant, setRestaurant] = useState("");
  const [contact, setContact] = useState("");
  const [slot, setSlot] = useState("");
  const [mode, setMode] = useState<"livraison" | "retrait">("livraison");
  const [note, setNote] = useState("");
  const sel = catches.find((c) => c.id === catchId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel || !restaurant || !slot) return toast.error(t("Complétez produit, restaurant et créneau."));
    if (qty <= 0 || qty > sel.qtyKg) return toast.error(t("Quantité entre 0,5 et {max} kg.", { max: sel.qtyKg }));
    actions.addOrder({ catchId, restaurant, contact, qtyKg: qty, slot: new Date(slot).toISOString(), mode, note });
    toast.success(t("Demande enregistrée (démo) — rien n'a été envoyé au pêcheur."));
    setNote("");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader title={t("Espace restaurant")} sub={t("Envoyez une demande de réservation. Aucun paiement dans cette version.")}><DemoBadge /></PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <form onSubmit={submit} className="card grid gap-4 p-6">
          <h2 className="text-xl font-semibold">{t("Nouvelle demande")}</h2>
          {avail.length === 0 ? <Empty>{t("Aucun produit disponible pour le moment.")}</Empty> : (<>
            <label className="grid gap-1 text-sm font-medium">{t("Produit")}
              <select className="field" value={catchId} onChange={(e) => setCatchId(e.target.value)}>
                {avail.map((c) => <option key={c.id} value={c.id}>{t(c.species)} — {gbp(c.priceKg)}/kg ({c.qtyKg} kg)</option>)}
              </select></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">{t("Quantité (kg)")}
                <input className="field" type="number" min={0.5} step={0.5} value={qty} onChange={(e) => setQty(+e.target.value)} /></label>
              <label className="grid gap-1 text-sm font-medium">{t("Mode")}
                <select className="field" value={t(mode)} onChange={(e) => setMode(e.target.value as "livraison" | "retrait")}>
                  <option value="livraison">{t("Livraison")}</option><option value="retrait">{t("Retrait au port")}</option></select></label>
            </div>
            <label className="grid gap-1 text-sm font-medium">{t("Créneau (heure de Jersey)")}
              <input className="field" type="datetime-local" required value={slot} onChange={(e) => setSlot(e.target.value)} /></label>
            <label className="grid gap-1 text-sm font-medium">{t("Restaurant")}
              <input className="field" required value={restaurant} onChange={(e) => setRestaurant(e.target.value)} placeholder={t("Nom de l'établissement")} /></label>
            <label className="grid gap-1 text-sm font-medium">{t("Contact")}
              <input className="field" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("email ou téléphone")} /></label>
            <label className="grid gap-1 text-sm font-medium">{t("Note")}
              <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            {sel && <div className="rounded-lg bg-secondary p-4 text-sm">
              <p className="font-semibold">{t("Résumé")}</p>
              <p>{qty} kg de {t(sel.species)} × {gbp(sel.priceKg)} = <strong>{gbp(qty * sel.priceKg)}</strong>{t("(indicatif)")}</p>
              <p className="text-muted-foreground">{fishers.find((f) => f.id === sel.fisherId)?.boat} · {t(mode)}</p>
            </div>}
            <button className="btn">{t("Envoyer la demande")}</button>
            <p className="text-xs text-muted-foreground">{t("Prototype : la demande est enregistrée dans ce navigateur et visible dans l'espace pêcheur ; aucune notification n'est envoyée.")}</p>
          </>)}
        </form>
        <section>
          <h2 className="mb-4 text-xl font-semibold">{t("Mes demandes")}</h2>
          {orders.length === 0 ? <Empty>{t("Aucune demande pour l'instant.")}</Empty> : (
            <ul className="grid gap-3">
              {orders.map((o) => { const c = catches.find((x) => x.id === o.catchId); return (
                <li key={o.id} className="card p-4">
                  <div className="flex justify-between gap-2"><strong>{c?.emoji} {t(c?.species ?? "Produit")} · {o.qtyKg} kg</strong><span className="text-sm">{c ? gbp(c.priceKg * o.qtyKg) : ""}</span></div>
                  <p className="mb-3 text-sm text-muted-foreground">{t(o.restaurant)} · {t(o.mode)}{t("le")} {dt(o.slot)}</p>
                  <OrderSteps s={o.status} />
                </li>); })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}