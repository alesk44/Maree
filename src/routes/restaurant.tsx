import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchMyOrders, reserveSharedCatch, useSharedMarket, type SharedOrderRow } from "@/lib/shared-market";
import { supabase } from "@/lib/supabase";
import { Empty, OrderSteps, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/restaurant")({
  validateSearch: (s: Record<string, unknown>) => ({ produit: typeof s["produit"] === "string" ? s["produit"] : undefined }),
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
  const [accountTab, setAccountTab] = useState<"activity" | "billing" | "profile">("activity");
  const [profileName, setProfileName] = useState("");

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      setSignedIn(Boolean(auth.user));
      if (auth.user) {
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
        setProfileName(profile?.display_name ?? "");
      }
      setOrders(await fetchMyOrders());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Impossible de charger les commandes."));
    } finally { setOrdersLoading(false); }
  };

  useEffect(() => { void loadOrders(); }, []);
  useEffect(() => { if (!catchId && catches.length) setCatchId(produit ?? catches[0]?.id ?? ""); }, [catches, catchId, produit]);

  const avail = catches.filter((c) => c.status === "disponible" && c.qtyKg > 0);
  const sel = catches.find((c) => c.id === catchId);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signedIn) { toast.error(t("Connectez-vous avec votre compte restaurant avant de réserver.")); return; }
    if (!sel || !slot) { toast.error(t("Complétez le produit et le créneau.")); return; }
    if (!Number.isFinite(qty) || qty < 0.5 || qty > sel.qtyKg) { toast.error(t("Quantité invalide ou supérieure au stock disponible.")); return; }
    if (!Number.isFinite(new Date(slot).getTime())) { toast.error(t("Créneau invalide.")); return; }
    try {
      await reserveSharedCatch({ catchId, qtyKg: qty, slot: new Date(slot).toISOString(), mode, note: note.trim() });
      toast.success(t("Réservation envoyée au pêcheur."));
      setNote("");
      await Promise.all([refresh(), loadOrders()]);
    } catch (e) { toast.error(e instanceof Error ? t(e.message) : t("Impossible d'envoyer la réservation.")); return; }
  };

  return <div className="mx-auto max-w-6xl px-4 py-10">
    <PageHeader title={t("Espace restaurant")} sub={t("Réservez directement la pêche du jour. Aucun paiement dans cette version.")} />
    <section className="mb-6 grid gap-2 sm:grid-cols-3" aria-label={t("Navigation espace restaurant")}>
      <button type="button" className={"btn "+(accountTab==="activity"?"btn-accent":"")} onClick={()=>setAccountTab("activity")}>{t("Activité & commandes")}</button>
      <button type="button" className={"btn "+(accountTab==="billing"?"btn-accent":"")} onClick={()=>setAccountTab("billing")}>{t("Factures & dépenses")}</button>
      <button type="button" className={"btn "+(accountTab==="profile"?"btn-accent":"")} onClick={()=>setAccountTab("profile")}>{t("Mon établissement")}</button>
    </section>
    {accountTab==="billing" && <section className="card mb-8 grid gap-4 p-5">
      <div><h2 className="text-xl font-semibold">{t("Facturation et relevés")}</h2><p className="text-sm text-muted-foreground">{t("Historique des commandes livrées. Les montants sont calculés à partir du prix du lot au moment de l'affichage ; aucun paiement n'est encaissé dans cette version.")}</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={t("Commandes livrées")} value={orders.filter(o=>o.status==="delivered").length} detail={t("Historique")}/>
        <Metric label={t("Total des achats livrés")} value={gbp(orders.filter(o=>o.status==="delivered").reduce((sum,o)=>sum+(catches.find(c=>c.id===o.catch_id)?.priceKg??0)*Number(o.quantity_kg),0))} detail={t("Montant indicatif, non payé")}/>
        <Metric label={t("En attente de livraison")} value={orders.filter(o=>o.status!=="delivered"&&o.status!=="cancelled").length} detail={t("Commandes ouvertes")}/>
      </div>
      {orders.filter(o=>o.status==="delivered").length===0 ? <Empty>{t("Aucune commande livrée à afficher pour le moment.")}</Empty> :
        <ul className="grid gap-2">{orders.filter(o=>o.status==="delivered").map(o=>{const lot=catches.find(c=>c.id===o.catch_id);const total=(lot?.priceKg??0)*Number(o.quantity_kg);return <li key={o.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap justify-between gap-2"><strong>{lot?.emoji} {t(lot?.species??"Produit")} · {Number(o.quantity_kg)} kg</strong><strong>{gbp(total)}</strong></div>
          <p className="text-xs text-muted-foreground">{t("Livrée")} · {dt(o.requested_slot)} · Réf. {o.id.slice(0,8).toUpperCase()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Relevé indicatif — ne constitue pas une facture fiscale ni une preuve de paiement.")}</p>
        </li>})}</ul>}
    </section>}
    {accountTab==="profile" && <section className="card mb-8 grid gap-2 p-5">
      <h2 className="text-xl font-semibold">{t("Mon établissement")}</h2>
      <p><span className="text-muted-foreground">{t("Nom enregistré")} :</span> <strong>{profileName||t("Non renseigné")}</strong></p>
      <p className="text-sm text-muted-foreground">{t("Les coordonnées de facturation, l'adresse et le numéro GST devront être complétés avant l'émission de factures officielles.")}</p>
      <a className="btn btn-accent w-fit" href="/connexion">{t("Modifier mon profil")}</a>
    </section>}

    <section aria-label={t("Vue d'ensemble")} className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={t("Lots disponibles")} value={loading?"—":avail.length} detail={t("Pêche du jour")}/>
      <Metric label={t("Réservations")} value={ordersLoading?"—":orders.length} detail={t("Demandes de votre restaurant")}/>
      <Metric label={t("En attente")} value={ordersLoading?"—":orders.filter((o)=>o.status==="submitted").length} detail={t("À confirmer par le pêcheur")}/>
      <Metric label={t("Quantité réservée")} value={ordersLoading?"—":orders.reduce((n,o)=>n+Number(o.quantity_kg),0).toLocaleString("fr-FR")+" kg"} detail={t("Total de vos demandes")}/>
    </section>
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

function Metric({label,value,detail}:{label:string;value:string|number;detail:string}){return <div className="card rounded-2xl border border-border p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;}
