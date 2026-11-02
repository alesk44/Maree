import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchMyOrders, fetchMyMonthlyInvoices, fetchMyMareeCommissionInvoices, declareMareeCommissionInvoicePaid, reserveSharedCatch, requestMyOrderCancellation, respondMyOrderCancellation, setRestaurantFisherBillingMode, useSharedMarket, type SharedOrderRow, type SharedMonthlyInvoiceRow, type SharedMareeCommissionInvoiceRow } from "@/lib/shared-market";
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
  const [monthlyInvoices, setMonthlyInvoices] = useState<SharedMonthlyInvoiceRow[]>([]);
  const [mareeInvoices, setMareeInvoices] = useState<SharedMareeCommissionInvoiceRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [catchId, setCatchId] = useState(produit ?? "");
  const [qty, setQty] = useState(2);
  const [slot, setSlot] = useState("");
  const [mode, setMode] = useState<"livraison" | "retrait">("livraison");
  const [note, setNote] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [accountTab, setAccountTab] = useState<"activity" | "billing" | "profile">("activity");
  const [profileName, setProfileName] = useState("");
  const [billingMode, setBillingMode] = useState<"immediate"|"monthly">("immediate");

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      setSignedIn(Boolean(auth.user));
      if (auth.user) {
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
        setProfileName(profile?.display_name ?? "");
      }
      const [nextOrders,nextInvoices,nextMareeInvoices] = await Promise.all([fetchMyOrders(),fetchMyMonthlyInvoices(),fetchMyMareeCommissionInvoices()]);
      setOrders(nextOrders);
      setMonthlyInvoices(nextInvoices);
      setMareeInvoices(nextMareeInvoices);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Impossible de charger les commandes."));
    } finally { setOrdersLoading(false); }
  };

  const avail = catches.filter((c) => c.status === "disponible" && c.qtyKg > 0);
  const sel = catches.find((c) => c.id === catchId);
  const estimatedSubtotal = sel ? Math.round(qty * sel.priceKg * 100) / 100 : 0;
  const estimatedMareeFee = Math.round(estimatedSubtotal * 0.065 * 100) / 100;
  const estimatedDeliveryFee = mode === "livraison" ? Math.round(estimatedSubtotal * 0.20 * 100) / 100 : 0;
  const estimatedTotal = estimatedSubtotal + estimatedMareeFee + estimatedDeliveryFee;

  useEffect(() => { void loadOrders(); }, []);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      channel = supabase
        .channel(`restaurant-orders-${data.user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${data.user.id}`,
        }, () => { if (active) void loadOrders(); })
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [signedIn]);

  useEffect(() => { if (!catchId && catches.length) setCatchId(produit ?? catches[0]?.id ?? ""); }, [catches, catchId, produit]);
  useEffect(() => {
    let active = true;
    const loadMode = async () => {
      if (!signedIn || !sel) { setBillingMode("immediate"); return; }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("restaurant_fisher_billing_settings").select("billing_mode").eq("restaurant_id", auth.user.id).eq("fisher_id", sel.fisherId).maybeSingle();
      if (active) setBillingMode(data?.billing_mode === "monthly" ? "monthly" : "immediate");
    };
    void loadMode();
    return () => { active = false; };
  }, [signedIn, sel?.fisherId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signedIn) { toast.error(t("Connectez-vous avec votre compte restaurant avant de réserver.")); return; }
    if (!sel || !slot) { toast.error(t("Complétez le produit et le créneau.")); return; }
    if (!Number.isFinite(qty) || qty < 0.5 || qty > sel.qtyKg) { toast.error(t("Quantité invalide ou supérieure au stock disponible.")); return; }
    if (!Number.isFinite(new Date(slot).getTime())) { toast.error(t("Créneau invalide.")); return; }
    try {
      if (sel) await setRestaurantFisherBillingMode(sel.fisherId,billingMode);
      await reserveSharedCatch({ catchId, qtyKg: qty, slot: new Date(slot).toISOString(), mode, note: note.trim() });
      toast.success(t("Réservation envoyée au pêcheur."));
      setNote("");
      await Promise.all([refresh(), loadOrders()]);
    } catch (e) { toast.error(e instanceof Error ? t(e.message) : t("Impossible d'envoyer la réservation.")); return; }
  };

  return <div className="mx-auto max-w-6xl px-4 py-10">
    <PageHeader title={t("Espace restaurant")} sub={t("Réservez directement la pêche du jour. Aucun paiement dans cette version.")} />
    <Link to="/tracabilite" className="btn btn-accent mb-4 inline-flex">{t("Scanner QR")}</Link>
    <section className="mb-6 grid gap-2 sm:grid-cols-3" aria-label={t("Navigation espace restaurant")}>
      <button type="button" className={"btn "+(accountTab==="activity"?"btn-accent":"")} onClick={()=>setAccountTab("activity")}>{t("Activité & commandes")}</button>
      <button type="button" className={"btn "+(accountTab==="billing"?"btn-accent":"")} onClick={()=>setAccountTab("billing")}>{t("Factures & dépenses")}</button>
      <button type="button" className={"btn "+(accountTab==="profile"?"btn-accent":"")} onClick={()=>setAccountTab("profile")}>{t("Mon établissement")}</button>
    </section>
    {accountTab==="billing" && <section className="card mb-8 grid gap-4 p-5">
      <div><h2 className="text-xl font-semibold">{t("Facturation et relevés")}</h2><p className="text-sm text-muted-foreground">{t("Historique des commandes livrées. Les montants reprennent les prix et frais figés à la réservation ; aucun paiement n'est encaissé dans cette version.")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("Commandes livrées")} value={orders.filter(o=>o.status==="delivered").length} detail={t("Historique")}/>
        <Metric label={t("Produits dus aux pêcheurs")} value={gbp(orders.filter(o=>o.status==="delivered").reduce((sum,o)=>sum+Number(o.product_subtotal??0),0))} detail={t("Sous-total produits")}/>
        <Metric label={t("Commission Marée (6,5 %)")} value={gbp(orders.filter(o=>o.status==="delivered").reduce((sum,o)=>sum+Number(o.maree_fee??0),0))} detail={t("Sur chaque achat, livraison ou retrait")}/>
        <Metric label={t("Livraison Marée (20 %)")} value={gbp(orders.filter(o=>o.status==="delivered").reduce((sum,o)=>sum+Number(o.delivery_fee??0),0))} detail={t("Uniquement si livraison")}/>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">{t("Relevés mensuels de commission Marée")}</h3>
        <p className="text-xs text-muted-foreground">{t("Ces relevés regroupent séparément la commission de 6,5 % et les frais de livraison de 20 % dus à Marée par le restaurant. Ils sont distincts des factures produits dues aux pêcheurs. Une déclaration de paiement reste à vérifier par l’administration.")}</p>
        {mareeInvoices.length===0 ? <Empty>{t("Aucun relevé mensuel de commission pour le moment.")}</Empty> :
          <ul className="grid gap-2">{mareeInvoices.map(i=><li key={i.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap justify-between gap-2"><strong>{t("Période")} {i.period_start} — {i.period_end}</strong><strong>{gbp(Number(i.commission_total)+Number(i.delivery_total))}</strong></div>
            <p className="text-xs text-muted-foreground">{t("Commission Marée (6,5 %)")} : {gbp(Number(i.commission_total))} · {t("Livraison Marée (20 %)")} : {gbp(Number(i.delivery_total))}</p>
            <p className="text-sm text-muted-foreground">{t("Échéance")} : {i.due_date} · {i.status==="paid"?t("Paiement vérifié par Marée"):i.status==="declared_paid"?t("Paiement déclaré — vérification Marée en attente"):i.status==="void"?t("Annulé"):t("À régler à Marée")}</p>
            {i.items?.length ? <ul className="mt-2 grid gap-1 border-t border-border pt-2 text-xs">{i.items.map(item=><li key={item.order_id} className="flex flex-wrap justify-between gap-2"><span>Commande {item.order_id.slice(0,8).toUpperCase()} · {item.fulfilment==="delivery"?t("Livraison"):t("Retrait")} · {gbp(Number(item.product_subtotal))} {t("produits")}</span><strong>{t("Commission")} : {gbp(Number(item.commission_amount))} · {t("Livraison")} : {gbp(Number(item.delivery_amount))}</strong></li>)}</ul> : null}
            {i.payment_method&&<p className="text-xs text-muted-foreground">{t("Mode")} : {i.payment_method} {i.payment_reference?("· "+t("Référence")+" : "+i.payment_reference):""}</p>}
            {i.status==="open"&&<button type="button" className="btn btn-accent mt-3" onClick={async()=>{
              const method=window.prompt(t("Mode de paiement effectué (ex. virement bancaire)"));
              if(method===null)return;
              const reference=window.prompt(t("Référence du paiement (facultatif)"));
              try {
                await declareMareeCommissionInvoicePaid(i.id,method,reference);
                toast.success(t("Paiement déclaré. Il sera vérifié par l’administration Marée."));
                await loadOrders();
              } catch(e) { toast.error(e instanceof Error?e.message:t("Impossible de déclarer le paiement.")); }
            }}>{t("Déclarer le paiement effectué")}</button>}
          </li>)}</ul>}
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">{t("Factures mensuelles des pêcheurs")}</h3>
        {monthlyInvoices.length===0 ? <Empty>{t("Aucune facture mensuelle pour le moment. Elles apparaîtront après la génération mensuelle.")}</Empty> :
          <ul className="grid gap-2">{monthlyInvoices.map(i=><li key={i.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap justify-between gap-2"><strong>{t("Période")} {i.period_start} — {i.period_end}</strong><strong>{gbp(Number(i.subtotal))}</strong></div>
            <p className="text-sm text-muted-foreground">{t("Pêcheur")} · {i.fisher_id.slice(0,8).toUpperCase()} · {t("Échéance")} : {i.due_date} · {i.status==="paid"?t("Réglée"):i.status==="void"?t("Refusée par le pêcheur"):t("À régler au pêcheur")}</p>
            {i.items?.length ? <ul className="mt-2 grid gap-1 border-t border-border pt-2 text-xs">{i.items.map(item=><li key={item.order_id} className="flex flex-wrap justify-between gap-2"><span>Commande {item.order_id.slice(0,8).toUpperCase()} · {Number(item.quantity_kg)} kg × {gbp(Number(item.unit_price))}/kg</span><strong>{gbp(Number(item.product_subtotal))}</strong></li>)}</ul> : null}
            {i.paid_at&&<p className="text-xs text-muted-foreground">{t("Règlement confirmé")} : {dt(i.paid_at)} {i.payment_method||""} {i.payment_reference||""}</p>}
          </li>)}</ul>}
      </div>
      {orders.filter(o=>o.status==="delivered").length===0 ? <Empty>{t("Aucune commande livrée à afficher pour le moment.")}</Empty> :
        <ul className="grid gap-2">{orders.filter(o=>o.status==="delivered").map(o=>{const lot=catches.find(c=>c.id===o.catch_id);const products=Number(o.product_subtotal??0);return <li key={o.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap justify-between gap-2"><strong>{lot?.emoji} {t(lot?.species??"Produit")} · {Number(o.quantity_kg)} kg</strong><strong>{gbp(Number(o.total_amount??(products+Number(o.maree_fee??0)+Number(o.delivery_fee??0))))}</strong></div>
          <p className="text-xs text-muted-foreground">{t("Livrée")} · {dt(o.delivered_at??o.requested_slot)} · Réf. {o.id.slice(0,8).toUpperCase()}</p>
          <p className="mt-1 text-sm">{t("Produits")} : {gbp(products)} · {t("Commission Marée (6,5 %)")} : {gbp(Number(o.maree_fee??0))} · {t("Livraison (20 %)")} : {gbp(Number(o.delivery_fee??0))}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Relevé indicatif — ne constitue pas une facture fiscale ni une preuve de paiement.")}</p>
        </li>})}</ul>}
    </section>}
    {accountTab==="profile" && <section className="card mb-8 grid gap-2 p-5">
      <h2 className="text-xl font-semibold">{t("Mon établissement")}</h2>
      <p><span className="text-muted-foreground">{t("Nom enregistré")} :</span> <strong>{profileName||t("Non renseigné")}</strong></p>
      <p className="text-sm text-muted-foreground">{t("Les coordonnées de facturation, l'adresse et le numéro GST devront être complétés avant l'émission de factures officielles.")}</p>
      <a className="btn btn-accent w-fit" href="/connexion">{t("Modifier mon profil")}</a>
    </section>}

    {accountTab==="activity" && <>
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
          <label className="grid gap-1 text-sm font-medium">{t("Facturation auprès de ce pêcheur")}
            <select className="field" value={billingMode} onChange={(e)=>setBillingMode(e.target.value as "immediate"|"monthly")}>
              <option value="immediate">{t("À chaque commande")}</option><option value="monthly">{t("Relevé mensuel (échéance à 7 jours)")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">{t("Créneau (heure de Jersey)")}
            <input className="field" type="datetime-local" required value={slot} onChange={(e) => setSlot(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">{t("Note")}
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {sel && <div className="rounded-lg bg-secondary p-4 text-sm">
            <p className="font-semibold">{t("Résumé")}</p>
            <p>{qty} kg de {t(sel.species)} × {gbp(sel.priceKg)} = <strong>{gbp(estimatedSubtotal)}</strong></p>
            <p>{t("Commission Marée Jersey (6,5 %, tous modes)")} : <strong>{gbp(estimatedMareeFee)}</strong></p>
            <p>{t("Frais de livraison Marée Jersey (20 %, livraison uniquement)")} : <strong>{gbp(estimatedDeliveryFee)}</strong></p>
            <p>{t("Total estimé pour le restaurant")} : <strong>{gbp(estimatedTotal)}</strong></p>
            <p className="text-xs text-muted-foreground">{t("Le montant produits revient au pêcheur. La commission de 6,5 % revient à Marée pour chaque achat, livraison ou retrait. Les frais de livraison de 20 % sont appliqués uniquement en livraison. GST non ajouté.")}</p>
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
              {o.status==="cancelled"?<><span className="inline-flex rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive">{t("Annulée")}</span>{Number(o.cancellation_penalty??0)>0&&<p className="mt-2 text-sm">{t("Pénalité acceptée")} : <strong>{gbp(Number(o.cancellation_penalty))}</strong></p>}</>:<><OrderSteps s={status} />{o.cancellation_request_status==="pending"&&<p className="mt-2 rounded-lg bg-secondary p-3 text-sm">{t("Demande d’annulation tardive envoyée. En attente de la décision du pêcheur.")}</p>}{o.cancellation_request_status==="rejected"&&<p className="mt-2 rounded-lg bg-secondary p-3 text-sm">{t("Annulation tardive refusée. La commande reste active.")}</p>}{o.cancellation_request_status==="offered"&&<div className="mt-3 rounded-lg border border-border p-3"><p className="text-sm">{t("Le pêcheur accepte l’annulation sous cette condition : pénalité de")} <strong>{gbp(Number(o.cancellation_penalty??0))}</strong>.</p><p className="mt-1 text-xs text-muted-foreground">{t("La commande ne sera annulée qu’après votre acceptation. Si vous refusez, la commande reste active.")}</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><button type="button" className="btn btn-accent text-sm" onClick={async()=>{try{await respondMyOrderCancellation(o.id,true);toast.success(t("Annulation confirmée."));await loadOrders();await refresh();}catch(e){toast.error(e instanceof Error?t(e.message):t("Impossible de confirmer l’annulation."));}}}>{t("Accepter la pénalité et annuler")}</button><button type="button" className="btn text-sm" onClick={async()=>{try{await respondMyOrderCancellation(o.id,false);toast.success(t("Offre refusée, commande maintenue."));await loadOrders();}catch(e){toast.error(e instanceof Error?t(e.message):t("Impossible de répondre à l’offre."));}}}>{t("Refuser, garder la commande")}</button></div></div>}{(o.status==="submitted"||o.status==="confirmed")&&o.cancellation_request_status!=="pending"&&o.cancellation_request_status!=="offered"&&o.cancellation_request_status!=="rejected"&&<div className="mt-3 rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{new Date(o.requested_slot).getTime()-Date.now()>=24*60*60*1000?t("Annulation gratuite possible jusqu’à 24 h avant le créneau."):t("Moins de 24 h avant le créneau : le pêcheur décide s’il accepte l’annulation et fixe toute pénalité éventuelle. Vous devrez accepter cette pénalité avant l’annulation.")}</p><button type="button" className="btn mt-2 w-full text-sm" onClick={async()=>{try{const result=await requestMyOrderCancellation(o.id);toast.success(result==="cancelled"?t("Commande annulée gratuitement."):t("Demande transmise au pêcheur pour décision."));await loadOrders();await refresh();}catch(e){toast.error(e instanceof Error?t(e.message):t("Impossible de demander l’annulation."));}}}>{t("Demander l’annulation")}</button></div>}</>}
            </li>;
          })}</ul>}
      </section>
    </div>
    </>}
  </div>;
}

function Metric({label,value,detail}:{label:string;value:string|number;detail:string}){return <div className="card rounded-2xl border border-border p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;}
