import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchMyOrders, reserveSharedCatch, useSharedMarket, type SharedOrderRow } from "@/lib/shared-market";
import { supabase } from "@/lib/supabase";
import { Empty, OrderSteps, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/restaurant")({
  validateSearch: (s: Record<string, unknown>) => ({ produit: typeof s.produit === "string" ? s.produit : undefined }),
  head: () => ({ meta: [
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { title: "Espace restaurant — Marée Jersey" },
    { name: "description", content: "Réservez la pêche du jour pour votre restaurant à Jersey." },
    { property: "og:title", content: "Espace restaurant — Marée Jersey" },
    { property: "og:description", content: "Demandes de réservation et suivi des commandes." },
  ] }),
  component: Restaurant,
});

function Restaurant() {
  const { t, gbp, dt } = useLanguage();
  const { produit } = Route.useSearch();
  const { catches, fishers, loading, error, refresh } = useSharedMarket();
  const [orders, setOrders] = useState<SharedOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [catchId, setCatchId] = useState(produit ?? "");
  const [qty, setQty] = useState(2);
  const [slot, setSlot] = useState("");
  const [mode, setMode] = useState<"livraison" | "retrait">("livraison");
  const [note, setNote] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      setSignedIn(Boolean(auth.user));
      setOrders(await fetchMyOrders());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Impossible de charger les commandes."));
    } finally { setOrdersLoading(false); }
  };

  useEffect(() => { void loadOrders(); }, []);
  useEffect(() => { if (!catchId && catches.length) setCatchId(produit ?? catches[0].id); }, [catches, catchId, produit]);

  const avail = catches.filter((c) => c.status === "disponible" && c.qtyKg > 0);
  const sel = catches.find((c) => c.id === catchId);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signedIn) return toast.error(t("Connectez-vous avec votre compte restaurant avant de réserver."));
    if (!sel || !slot) return toast.error(t("Complétez le produit et le créneau."));
    if (!Number.isFinite(qty) || qty < 0.5 || qty > sel.qtyKg) return toast.error(t("Quantité invalide ou supérieure au stock disponible."));
    if (!Number.isFinite(new Date(slot).getTime())) return toast.error(t("Créneau invalide."));
    try {
      await reserveSharedCatch({ catchId, qtyKg: qty, slot: new Date(slot).toISOString(), mode, note: note.trim() });
      toast.success(t("Réservation envoyée au pêcheur."));
      setNote("");
      await Promise.all([refresh(), loadOrders()]);
    } catch (e) { toast.error(e instanceof Error ? t(e.message) : t("Impossible d'envoyer la réservation.")); }
  };

  return <div className="mx-auto max-w-6xl px-4 py-10">
    <PageHeader title={t("Espace restaurant")} sub={t("Réservez directement la pêche du jour. Aucun paiement dans cette version.")} />
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={submit} className="card grid gap-4 p-6">
        <h2 className="text-xl font-semibold">{t("Nouvelle réservation")}</h2>
        {!signedIn && <p className="rounded-lg border p-3 text-sm">{t("Connectez-vous avec votre compte restaurant pour réserver.")} <a className="underline" href="/connexion">{t("Connexion")}</a></p>}
        {loading ? <p role="status" className="text-sm text-muted-foreground">{t("Chargement du catalogue…")}</p> : avail.length === 0 ? <Empty>{t("Aucun produit disponible pour le moment.")}</Empty> : <>
          <label className="grid gap-1 text-sm font-medium">{t("Produit")}
            <select className="field" value={catchId} onChange={(e) => setCatchId(e.target.value)}>
              {avail.map((c) => <option key={c.id} value={c.id}>{t(c.species)} — {gbp(c.priceKg)}/kg ({c.qtyKg} kg)</option>)}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">{t("Quantité (kg)")}
              <input className="field" type="number" min={0.5} max={sel?.qtyKg} step={0.5} value={qty} onChange={(e) => setQty(+e.target.value)} required />
            </label>
            <label className="grid gap-1 text-sm font-medium">{t("Mode")}
              <select className="field" value={mode} onChange={(e) => setMode(e.target.value as "livraison" | "retrait")}>
                <option value="livraison">{t("Livraison")}</option><option value="retrait">{t("Retrait au port")}</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">{t("Créneau (heure de Jersey)")}
            <input className="field" type="datetime-local" required value={slot} onChange={(e) => setSlot(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">{t("Note")}
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {sel && <div className="rounded-lg bg-secondary p-4 text-sm">
            <p className="font-semibold">{t("Résumé")}</p>
            <p>{qty} kg de {t(sel.species)} × {gbp(sel.priceKg)} = <strong>{gbp(qty * sel.priceKg)}</strong></p>
            <p className="text-muted-foreground">{fishers.find((f) => f.id === sel.fisherId)?.boat} · {t(mode)}</p>
          </div>}
          <button className="btn" disabled={!signedIn}>{t("Envoyer la réservation")}</button>
          <p className="text-xs text-muted-foreground">{t("La réservation est enregistrée dans la base partagée et visible par le pêcheur.")}</p>
        </>}
      </form>
      <section>
        <h2 className="mb-4 text-xl font-semibold">{t("Mes réservations")}</h2>
        {ordersLoading ? <p className="text-sm text-muted-foreground">{t("Chargement des commandes…")}</p> : orders.length === 0 ? <Empty>{t("Aucune réservation réelle pour le moment.")}</Empty> :
          <ul className="grid gap-3">{orders.map((o) => {
            const c = catches.find((x) => x.id === o.catch_id);
            const status = ({ submitted:"envoyée", confirmed:"confirmée", ready:"prête", delivered:"livrée" } as Record<string, "envoyée"|"confirmée"|"prête"|"livrée">)[o.status] ?? "envoyée";
            return <li key={o.id} className="card p-4">
              <div className="flex justify-between gap-2"><strong>{c?.emoji} {t(c?.species ?? "Produit")} · {Number(o.quantity_kg)} kg</strong><span className="text-sm">{c ? gbp(c.priceKg * Number(o.quantity_kg)) : ""}</span></div>
              <p className="mb-3 text-sm text-muted-foreground">{t(o.fulfilment === "delivery" ? "Livraison" : "Retrait")} · {dt(o.requested_slot)}</p>
              <OrderSteps s={status} />
            </li>;
          })}</ul>}
      </section>
    </div>
  </div>;
}
