import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createSharedCatch, fetchMyOrders, fetchMyMonthlyInvoices, confirmFisherInvoicePaid, markFisherOrderPaid, updateMyCatch, updateMyOrderStatus, useSharedMarket, type SharedOrderRow, type SharedMonthlyInvoiceRow } from "@/lib/shared-market";
import { supabase } from "@/lib/supabase";
import { Empty, OrderSteps, PageHeader, StatusPill } from "@/components/ui-bits";
import type { Status } from "@/lib/store";

export const Route = createFileRoute("/espace-pecheur")({
  head: () => ({ meta: [
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { title: "Espace pêcheur — Marée Jersey" },
    { name: "description", content: "Publiez votre prise du jour et gérez les demandes des restaurants." },
    { property: "og:title", content: "Espace pêcheur — Marée Jersey" },
    { property: "og:description", content: "Publication des prises et gestion des demandes." },
  ] }),
  component: FisherSpace,
});

const EMOJI: Record<string,string> = { Casiers:"🦀", Ligne:"🐟", Plongée:"🐚", "Filet maillant":"🐠" };
const nextStatus = { confirmed:"ready", ready:"delivered" } as const;
const labelStatus = { submitted:"envoyée", confirmed:"confirmée", ready:"prête", delivered:"livrée" } as const;

function FisherSpace() {
  const { t, gbp, dt } = useLanguage();
  const { fishers, catches, loading, error, refresh } = useSharedMarket();
  const [userId,setUserId] = useState<string|null>(null);
  const [profileLoading,setProfileLoading] = useState(true);
  const [accountTab,setAccountTab] = useState<"activity"|"sales"|"profile">("activity");
  const [orders,setOrders] = useState<SharedOrderRow[]>([]);
  const [monthlyInvoices,setMonthlyInvoices] = useState<SharedMonthlyInvoiceRow[]>([]);
  const [verificationStatus,setVerificationStatus] = useState<"pending"|"rejected"|null>(null);
  const [verificationNote,setVerificationNote] = useState<string|null>(null);
  const [fisherProfile,setFisherProfile] = useState({
    boat_name:"",home_port:"",fishing_method:"",vessel_type:"",crew_size:"",
    fishing_licence_number:"",bio:"",since_year:""
  });
  const [savingProfile,setSavingProfile] = useState(false);
  const [form,setForm] = useState({ species:"", zone:"", qtyKg:10, priceKg:15, grade:"", storage:"Sur glace pilée 0–2 °C", caughtAt:"", landedAt:"" });
  const up = (k:string,v:string|number) => setForm((f)=>({...f,[k]:v}));
  const me = fishers.find((f)=>f.id===userId);
  const mine = catches.filter((c)=>c.fisherId===userId);
  const myOrders = orders.filter((o)=>mine.some((c)=>c.id===o.catch_id));
  const weeklyActivity = Array.from({length:7},(_,index)=>{
    const day=new Date(); day.setHours(0,0,0,0); day.setDate(day.getDate()-(6-index));
    const next=new Date(day); next.setDate(next.getDate()+1);
    return {key:day.toISOString().slice(0,10),label:day.toLocaleDateString(undefined,{weekday:"short"}),count:mine.filter((item)=>{const landed=new Date(item.landedAt);return landed>=day&&landed<next;}).length};
  });
  const maxDailyActivity=Math.max(1,...weeklyActivity.map((day)=>day.count));
  const deliveredOrders=myOrders.filter(o=>o.status==="delivered");
  const immediateReceivables=deliveredOrders.filter(o=>o.billing_mode==="immediate"&&o.fisher_payment_status==="unpaid");
  const openMonthlyInvoices=monthlyInvoices.filter(i=>i.status==="open");
  const openMonthlyOrderIds=new Set(openMonthlyInvoices.flatMap(i=>i.items?.map(item=>item.order_id)??[]));
  const monthlyUnbilled=deliveredOrders.filter(o=>o.billing_mode==="monthly"&&o.fisher_payment_status==="unpaid"&&!openMonthlyOrderIds.has(o.id));
  const receivableTotal=immediateReceivables.reduce((sum,o)=>sum+Number(o.product_subtotal??0)+Number(o.tip_amount??0)-(o.delivery_fee_payer_snapshot==='fisher'?Number(o.delivery_fee??0):0),0)
    +openMonthlyInvoices.reduce((sum,i)=>sum+Number(i.subtotal)+Number(i.tip_total??0)-Number(i.delivery_deduction_total??0)+Number(i.cancellation_indemnity_total??0),0)
    +monthlyUnbilled.reduce((sum,o)=>sum+Number(o.product_subtotal??0)+Number(o.tip_amount??0)-(o.delivery_fee_payer_snapshot==='fisher'?Number(o.delivery_fee??0):0),0);
  const tipsEarned=deliveredOrders.reduce((sum,o)=>sum+Number(o.tip_amount??0),0);
  // Paid monthly invoices also mark their underlying orders as paid in mark_fisher_invoice_paid.
  // Count settled order value once; adding paid invoice totals here would double-count monthly settlements.
  const paymentsReceived=deliveredOrders.filter(o=>o.fisher_payment_status==="paid").reduce((sum,o)=>sum+Number(o.product_subtotal??0)+Number(o.tip_amount??0)-(o.delivery_fee_payer_snapshot==='fisher'?Number(o.delivery_fee??0):0),0)
    +monthlyInvoices.filter(i=>i.status==="paid").reduce((sum,i)=>sum+(i.cancellation_indemnities??[]).filter(item=>item.status==="paid").reduce((lineTotal,item)=>lineTotal+Number(item.amount),0),0);

  const load = async () => {
    setProfileLoading(true);
    try {
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError) throw authError;
      setUserId(user?.id??null);
      if(user) {
        const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).single();
        if(profileError) throw profileError;
        if(profile.role!=="fisher") {
          const {data:request,error:requestError}=await supabase.from("verification_requests")
            .select("status,reviewer_note").eq("user_id",user.id).eq("requested_role","fisher")
            .order("created_at",{ascending:false}).limit(1).maybeSingle();
          if(requestError) throw requestError;
          setVerificationStatus(request?.status==="pending"?"pending":request?.status==="rejected"?"rejected":null);
          setVerificationNote(request?.reviewer_note??null);
        } else {
          const {data:details,error:detailsError}=await supabase.from("profiles")
            .select("boat_name,home_port,fishing_method,vessel_type,crew_size,bio,since_year")
            .eq("id",user.id).single();
          if(detailsError) throw detailsError;
          const {data:privateDetails,error:privateDetailsError}=await supabase.rpc("get_my_fisher_private_details").maybeSingle();
          if(privateDetailsError) throw privateDetailsError;
          setFisherProfile({
            boat_name:details.boat_name??"",home_port:details.home_port??"",fishing_method:details.fishing_method??"",
            vessel_type:details.vessel_type??"",crew_size:details.crew_size==null?"":String(details.crew_size),
            fishing_licence_number:(privateDetails as {fishing_licence_number?:string|null}|null)?.fishing_licence_number??"",bio:details.bio??"",
            since_year:details.since_year==null?"":String(details.since_year)
          });
          const [nextOrders,nextInvoices] = await Promise.all([fetchMyOrders(),fetchMyMonthlyInvoices()]);
          setOrders(nextOrders);
          setMonthlyInvoices(nextInvoices);
        }
      }
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de charger le profil.")); return; }
    finally { setProfileLoading(false); }
  };
  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    if(!userId || !me) return;
    let active=true;
    const channel=supabase.channel("fisher-orders-"+userId)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},async()=>{
        if(!active) return;
        try {
          const nextOrders=await fetchMyOrders();
          if(active) setOrders(nextOrders);
          if(active) await refresh();
        } catch(e) {
          if(active) toast.error(e instanceof Error ? t(e.message) : t("Impossible de charger les commandes."));
        }
      })
      .subscribe();
    return ()=>{
      active=false;
      void supabase.removeChannel(channel);
    };
  },[userId,me,refresh,t]);

  const publish = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!me || !userId) { toast.error(t("Connectez-vous avec un compte pêcheur vérifié.")); return; }
    if(!form.species.trim()||!form.zone.trim()||!form.caughtAt||!form.landedAt) { toast.error(t("Espèce, zone et horaires sont requis.")); return; }
    const caught=new Date(form.caughtAt), landed=new Date(form.landedAt);
    if(!Number.isFinite(caught.getTime())||!Number.isFinite(landed.getTime())||landed<caught) { toast.error(t("Les horaires de capture et de débarquement sont invalides.")); return; }
    if(landed.getTime()>Date.now()) { toast.error(t("L’heure de débarquement ne peut pas être dans le futur. Vérifiez l’heure locale et réessayez.")); return; }
    if(!me.method.trim()) { toast.error(t("Renseignez d’abord votre méthode de pêche dans Mon profil professionnel.")); setAccountTab("profile"); return; }
    if(!Number.isFinite(form.qtyKg)||form.qtyKg<0.5||!Number.isFinite(form.priceKg)||form.priceKg<0) { toast.error(t("Quantité ou prix invalide.")); return; }
    try {
      await createSharedCatch({species:form.species.trim(),zone:form.zone.trim(),qtyKg:form.qtyKg,priceKg:form.priceKg,grade:form.grade.trim(),storage:form.storage,caughtAt:caught.toISOString(),landedAt:landed.toISOString(),fisherId:userId,method:me.method,emoji:EMOJI[me.method]??"🐟",status:"disponible"});
      toast.success(t("Prise publiée dans le catalogue partagé."));
      setForm((f)=>({...f,species:"",grade:""}));
      await refresh();
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de publier cette prise.")); }
  };

  const saveFisherProfile = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!userId) return;
    const crew= fisherProfile.crew_size.trim()===""?null:Number(fisherProfile.crew_size);
    const year= fisherProfile.since_year.trim()===""?null:Number(fisherProfile.since_year);
    if(crew!==null&&(!Number.isInteger(crew)||crew<1||crew>100)){toast.error(t("Nombre d’équipiers invalide."));return;}
    if(year!==null&&(!Number.isInteger(year)||year<1900||year>2100)){toast.error(t("Année de début invalide."));return;}
    setSavingProfile(true);
    const {error}=await supabase.from("profiles").update({
      boat_name:fisherProfile.boat_name.trim()||null,home_port:fisherProfile.home_port.trim()||null,
      fishing_method:fisherProfile.fishing_method.trim()||null,vessel_type:fisherProfile.vessel_type.trim()||null,
      crew_size:crew,fishing_licence_number:fisherProfile.fishing_licence_number.trim()||null,
      bio:fisherProfile.bio.trim()||null,since_year:year
    }).eq("id",userId);
    setSavingProfile(false);
    if(error) toast.error(t("Une erreur technique est survenue. Réessayez.")); else {toast.success(t("Profil pêcheur enregistré."));await refresh();}
  };

  const saveCatch = async (id:string,patch:{qtyKg?:number;priceKg?:number;status?:Status}) => {
    try {
      await updateMyCatch(id,{
        ...(patch.qtyKg!==undefined?{remainingKg:patch.qtyKg}:{}),
        ...(patch.priceKg!==undefined?{priceKg:patch.priceKg}:{}),
        ...(patch.status!==undefined?{status:({disponible:"available",réservé:"reserved",épuisé:"sold_out"} as const)[patch.status]}:{})
      });
      toast.success(t("Lot mis à jour."));
      await refresh();
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de modifier ce lot.")); }
  };

  const confirmInvoicePayment = async (invoiceId:string) => {
    const method=window.prompt(t("Mode de règlement reçu (ex. virement bancaire) :"));
    if(method===null) return;
    const reference=window.prompt(t("Référence du règlement (facultatif) :"));
    if(reference===null) return;
    try {
      await confirmFisherInvoicePaid(invoiceId,method.trim()||null,reference.trim()||null);
      toast.success(t("Règlement confirmé et enregistré."));
      setMonthlyInvoices(await fetchMyMonthlyInvoices());
      setOrders(await fetchMyOrders());
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de confirmer ce règlement.")); }
  };

  const confirmOrderPayment = async (orderId:string) => {
    const method=window.prompt(t("Mode de règlement reçu (ex. virement bancaire) :"));
    if(method===null) return;
    const reference=window.prompt(t("Référence du règlement (facultatif) :"));
    if(reference===null) return;
    try {
      await markFisherOrderPaid(orderId,method.trim()||null,reference.trim()||null);
      toast.success(t("Règlement confirmé et enregistré."));
      setOrders(await fetchMyOrders());
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de confirmer ce règlement.")); }
  };

  const decideOrder = async (order:SharedOrderRow,status:"confirmed"|"cancelled") => {
    try {
      await updateMyOrderStatus(order.id,status);
      toast.success(status==="confirmed"?t("Commande acceptée."):t("Commande refusée."));
      setOrders(await fetchMyOrders());
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Une erreur technique est survenue. Réessayez.")); }
  };

  const decideLateCancellation = async (order:SharedOrderRow,approve:boolean) => {
    let penalty=0;
    if(approve){
      const raw=window.prompt(t("Pénalité à appliquer en GBP (0 si aucune pénalité) :"),"0");
      if(raw===null)return;
      penalty=Number(raw);
      if(!Number.isFinite(penalty)||penalty<0){toast.error(t("Montant de pénalité invalide."));return;}
    }
    try{
      const {error}=await supabase.rpc("decide_order_cancellation",{p_order_id:order.id,p_approve:approve,p_penalty:penalty});
      if(error)throw error;
      toast.success(approve?t("Offre d’annulation et pénalité envoyées au restaurant."):t("Annulation refusée."));
      setOrders(await fetchMyOrders());
      await refresh();
    }catch(e){toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de traiter cette demande."));}
  };

  const advance = async (order:SharedOrderRow) => {
    const target=nextStatus[order.status as keyof typeof nextStatus];
    if(!target) return;
    try {
      await updateMyOrderStatus(order.id,target);
      toast.success(t("Statut de commande mis à jour."));
      setOrders(await fetchMyOrders());
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de modifier la commande.")); }
  };

  if(profileLoading||loading) return <div className="mx-auto max-w-6xl px-4 py-10"><p role="status">{t("Chargement de votre espace pêcheur…")}</p></div>;
  if(!userId) return <div className="mx-auto max-w-3xl px-4 py-10"><PageHeader title={t("Espace pêcheur")} sub={t("Connectez-vous pour commencer votre demande de compte pêcheur.")}/><p className="card p-5"><a className="underline" href="/connexion">{t("Se connecter")}</a></p></div>;
  if(!me) return <main className="mx-auto grid max-w-3xl gap-5 px-4 py-10">
    <PageHeader title={t("Demande de compte pêcheur")} sub={t("L’accès professionnel est activé uniquement après validation manuelle de votre activité.")}/>
    <section className="card grid gap-3 p-6">
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold w-fit">{verificationStatus==="pending"?t("Demande en attente"):verificationStatus==="rejected"?t("Demande refusée"):t("Aucune demande validée")}</span>
      <h2 className="text-xl font-semibold">{verificationStatus==="pending"?t("Votre dossier est en cours d’examen"):verificationStatus==="rejected"?t("Votre demande nécessite des corrections"):t("Commencez par faire vérifier votre activité")}</h2>
      <p className="text-sm text-muted-foreground">{verificationStatus==="pending"?t("Vous pourrez compléter votre bateau, votre méthode de pêche et les informations de votre équipage dès que l’équipe aura approuvé votre demande."):t("Avant toute publication de pêche, envoyez les informations de votre activité et attendez la validation de l’équipe Marée Jersey.")}</p>
      {verificationNote&&<p className="rounded-lg bg-secondary p-3 text-sm">{verificationNote}</p>}
      <a className="btn btn-accent w-fit" href="/verification">{verificationStatus==="pending"?t("Voir ma demande"):t("Envoyer / corriger ma demande")}</a>
    </section>
  </main>;

  return <div className="mx-auto max-w-6xl px-4 py-10">
    <PageHeader title={t("Espace pêcheur")} sub={t("Connecté en tant que {name} — {boat}",{name:me.name,boat:me.boat})}/>
    <Link to="/tracabilite" className="btn btn-accent mb-4 inline-flex">{t("Scanner QR")}</Link>
    <section className="mb-6 grid gap-2 sm:grid-cols-3" aria-label={t("Navigation espace pêcheur")}>
      <button type="button" className={"btn "+(accountTab==="activity"?"btn-accent":"")} onClick={()=>setAccountTab("activity")}>{t("Activité & commandes")}</button>
      <button type="button" className={"btn "+(accountTab==="sales"?"btn-accent":"")} onClick={()=>setAccountTab("sales")}>{t("Ventes & relevés")}</button>
      <button type="button" className={"btn "+(accountTab==="profile"?"btn-accent":"")} onClick={()=>setAccountTab("profile")}>{t("Mon profil professionnel")}</button>
    </section>
    {accountTab==="sales" && <section className="card mb-8 grid gap-4 p-5">
      <div><h2 className="text-xl font-semibold">{t("Mes ventes et relevés")}</h2><p className="text-sm text-muted-foreground">{t("Synthèse calculée sur les commandes livrées. Aucun paiement en ligne n'est encaissé ; vous pouvez confirmer un règlement reçu hors plateforme.")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label={t("Ventes livrées")} value={deliveredOrders.length} detail={t("Commandes terminées")}/>
        <Metric label={t("Produits vendus")} value={gbp(deliveredOrders.reduce((sum,o)=>sum+Number(o.product_subtotal??0),0))} detail={t("Montant produits brut")}/>
        <Metric label={t("Pourboires reçus")} value={gbp(tipsEarned)} detail={t("100 % pour vous, sans commission")}/>
        <Metric label={t("À recevoir")} value={gbp(receivableTotal)} detail={t("Commandes et relevés non réglés")}/>
        <Metric label={t("Paiements reçus")} value={gbp(paymentsReceived)} detail={t("Règlements confirmés")}/>
        <Metric label={t("En attente")} value={myOrders.filter(o=>o.status!=="delivered"&&o.status!=="cancelled").length} detail={t("Commandes à traiter")}/>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">{t("Mes factures mensuelles et règlements")}</h3>
        {monthlyInvoices.length===0?<Empty>{t("Aucun relevé mensuel généré pour le moment.")}</Empty>:
          <ul className="grid gap-2">{monthlyInvoices.map(i=><li key={i.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap justify-between gap-2"><strong>{t("Période")} {i.period_start} — {i.period_end}</strong><strong>{gbp(Number(i.subtotal)+Number(i.tip_total??0)-Number(i.delivery_deduction_total??0)+Number(i.cancellation_indemnity_total??0))}</strong></div>
            <p className="text-xs text-muted-foreground">{t("Produits")} : {gbp(Number(i.subtotal))} · {t("Pourboires")} : {gbp(Number(i.tip_total??0))} · {t("Livraison déduite")} : {gbp(Number(i.delivery_deduction_total??0))} · {t("Indemnités d’annulation")} : {gbp(Number(i.cancellation_indemnity_total??0))}</p>
            <p className="text-sm text-muted-foreground">{t("Échéance")} : {i.due_date} · {i.status==="paid"?t("Réglée"):i.status==="void"?t("Annulée"):t("En attente de règlement")}</p>
            {i.items?.length ? <ul className="mt-2 grid gap-1 border-t border-border pt-2 text-xs">{i.items.map(item=><li key={item.order_id} className="flex flex-wrap justify-between gap-2"><span>Commande {item.order_id.slice(0,8).toUpperCase()} · {Number(item.quantity_kg)} kg × {gbp(Number(item.unit_price))}/kg · {t("Pourboire")} {gbp(Number(item.tip_amount??0))} · {t("Livraison déduite")} {gbp(Number(item.delivery_deduction??0))}</span><strong>{gbp(Number(item.product_subtotal)+Number(item.tip_amount??0)-Number(item.delivery_deduction??0))}</strong></li>)}</ul> : null}
            {i.cancellation_indemnities?.length ? <ul className="mt-2 grid gap-1 border-t border-border pt-2 text-xs">{i.cancellation_indemnities.map(item=><li key={item.id} className="flex justify-between gap-2"><span>{t("Indemnité d’annulation")} · {item.order_id.slice(0,8).toUpperCase()} · {item.status==="paid"?t("Réglée"):t("À régler")}</span><strong>{gbp(Number(item.amount))}</strong></li>)}</ul> : null}
            {i.paid_at&&<p className="text-xs text-muted-foreground">{t("Règlement reçu")} : {dt(i.paid_at)} {i.payment_method||""} {i.payment_reference||""}</p>}
            {i.status==="open"&&<button type="button" className="btn btn-accent mt-3" onClick={()=>void confirmInvoicePayment(i.id)}>{t("Confirmer que le restaurant a réglé")}</button>}
          </li>)}</ul>}
      </div>
      {myOrders.filter(o=>o.status==="delivered").length===0?<Empty>{t("Aucune vente livrée pour le moment.")}</Empty>:
        <ul className="grid gap-2">{myOrders.filter(o=>o.status==="delivered").map(o=>{const lot=mine.find(c=>c.id===o.catch_id);const total=Number(o.product_subtotal??0);const deliveryDeduction=o.delivery_fee_payer_snapshot==='fisher'?Number(o.delivery_fee??0):0;const fisherNet=total+Number(o.tip_amount??0)-deliveryDeduction;return <li key={o.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap justify-between gap-2"><strong>{lot?.emoji} {t(lot?.species??"Produit")} · {Number(o.quantity_kg)} kg</strong><strong>{gbp(fisherNet)}</strong></div>
          <p className="text-xs text-muted-foreground">{t("Livrée")} · {dt(o.delivered_at??o.requested_slot)} · Réf. {o.id.slice(0,8).toUpperCase()}</p>
          <p className="mt-1 text-sm font-medium">{t("Votre montant produits")} : <strong>{gbp(total)}</strong> · {t("Livraison déduite")} : <strong>{gbp(deliveryDeduction)}</strong> · {t("Pourboire")} : <strong>{gbp(Number(o.tip_amount??0))}</strong></p>
          {o.billing_mode==="immediate"&&o.fisher_payment_status==="unpaid"&&<button type="button" className="btn btn-accent mt-3" onClick={()=>void confirmOrderPayment(o.id)}>{t("Confirmer le règlement reçu")}</button>}
          {o.fisher_payment_status==="paid"&&<p className="mt-2 text-xs text-muted-foreground">{t("Réglé")} · {o.fisher_paid_at?dt(o.fisher_paid_at):""} {o.fisher_payment_method??""} {o.fisher_payment_reference??""}</p>}
          <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("Détails complémentaires")}</summary><p className="mt-1">{t("Commission Marée (payée par le restaurant)")} : {gbp(Number(o.maree_fee??0))} · {t("Livraison payée par")} : {t(o.delivery_fee_payer_snapshot==='fisher'?'Vous (déduite de votre règlement)':'le restaurant')} · {gbp(Number(o.delivery_fee??0))}</p></details>
        </li>})}</ul>}
    </section>}
    {accountTab==="profile" && <form onSubmit={saveFisherProfile} className="card mb-8 grid gap-4 p-5">
      <div><h2 className="text-xl font-semibold">{t("Mon profil professionnel")}</h2><p className="text-sm text-muted-foreground">{t("Complétez les informations de votre bateau et de votre activité après validation du compte.")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <L t={t("Nom du bateau")}><input className="field" maxLength={120} value={fisherProfile.boat_name} onChange={e=>setFisherProfile(p=>({...p,boat_name:e.target.value}))}/></L>
        <L t={t("Port d’attache")}><input className="field" maxLength={120} value={fisherProfile.home_port} onChange={e=>setFisherProfile(p=>({...p,home_port:e.target.value}))}/></L>
        <L t={t("Type de bateau")}><input className="field" maxLength={120} value={fisherProfile.vessel_type} onChange={e=>setFisherProfile(p=>({...p,vessel_type:e.target.value}))} placeholder={t("Ex. chalutier, vedette, open boat")}/></L>
        <L t={t("Méthode de pêche")}><input className="field" maxLength={100} value={fisherProfile.fishing_method} onChange={e=>setFisherProfile(p=>({...p,fishing_method:e.target.value}))}/></L>
        <L t={t("Nombre d’équipiers")}><input className="field" type="number" min={1} max={100} step={1} value={fisherProfile.crew_size} onChange={e=>setFisherProfile(p=>({...p,crew_size:e.target.value}))}/></L>
        <L t={t("Année de début d’activité")}><input className="field" type="number" min={1900} max={2100} value={fisherProfile.since_year} onChange={e=>setFisherProfile(p=>({...p,since_year:e.target.value}))}/></L>
        <L t={t("Numéro de licence de pêche")}><input className="field" maxLength={120} value={fisherProfile.fishing_licence_number} onChange={e=>setFisherProfile(p=>({...p,fishing_licence_number:e.target.value}))}/></L>
      </div>
      <L t={t("Présentation de votre activité")}><textarea className="field" rows={4} maxLength={2000} value={fisherProfile.bio} onChange={e=>setFisherProfile(p=>({...p,bio:e.target.value}))}/></L>
      <button className="btn btn-accent w-fit" disabled={savingProfile}>{savingProfile?t("Enregistrement…"):t("Enregistrer mon profil professionnel")}</button>
    </form>}

    {accountTab==="activity" && <>
    <section aria-label={t("Vue d'ensemble")} className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={t("Lots publiés")} value={mine.length} detail={t("Toutes vos prises")}/>
      <Metric label={t("Stock disponible")} value={mine.filter((c)=>c.status==="disponible").reduce((n,c)=>n+c.qtyKg,0).toLocaleString("fr-FR")+" kg"} detail={t("Quantité actuellement en vente")}/>
      <Metric label={t("Demandes reçues")} value={myOrders.length} detail={t("Réservations de restaurants")}/>
      <Metric label={t("À traiter")} value={myOrders.filter((o)=>o.status==="submitted").length} detail={t("Nouvelles demandes")}/>
    </section>
    <section className="card mb-8 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{t("Activité des débarquements")}</h2><p className="text-xs text-muted-foreground">{t("Nombre de lots débarqués sur les sept derniers jours")}</p></div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{t("7 derniers jours")}</span>
      </div>
      <div className="grid grid-cols-7 items-end gap-2" role="img" aria-label={weeklyActivity.map((day)=>day.label+": "+day.count).join(", ")}>
        {weeklyActivity.map((day)=><div key={day.key} className="flex min-w-0 flex-col items-center gap-2">
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{day.count}</span>
          <div className="flex h-24 w-full items-end rounded-lg bg-secondary p-1"><div className="w-full rounded-md bg-accent" style={{height:(day.count/maxDailyActivity*100)+"%"}} /></div>
          <span className="text-[10px] capitalize text-muted-foreground">{day.label}</span>
        </div>)}
      </div>
      {mine.length===0&&<p className="mt-3 text-xs text-muted-foreground">{t("Le graphique apparaîtra dès la publication de vos premières prises.")}</p>}
    </section>
    {error&&<p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={publish} className="card grid gap-3 p-6">
        <h2 className="text-xl font-semibold">{t("Publier une prise du jour")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <L t={t("Espèce")}><input required className="field" value={form.species} onChange={(e)=>up("species",e.target.value)} placeholder={t("ex. Maquereau")}/></L>
          <L t={t("Zone")}><input required className="field" value={form.zone} onChange={(e)=>up("zone",e.target.value)} placeholder={t("ex. Baie de St Ouen")}/></L>
          <L t={t("Capture")}><input required className="field" type="datetime-local" value={form.caughtAt} onChange={(e)=>up("caughtAt",e.target.value)}/></L>
          <L t={t("Débarquement")}><input required className="field" type="datetime-local" value={form.landedAt} onChange={(e)=>up("landedAt",e.target.value)}/></L>
          <L t={t("Quantité (kg)")}><input required className="field" type="number" min={0.5} step={0.5} value={form.qtyKg} onChange={(e)=>up("qtyKg",+e.target.value)}/></L>
          <L t={t("Prix (£/kg)")}><input required className="field" type="number" min={0} step={0.5} value={form.priceKg} onChange={(e)=>up("priceKg",+e.target.value)}/></L>
          <L t={t("Calibre / qualité")}><input className="field" value={form.grade} onChange={(e)=>up("grade",e.target.value)}/></L>
          <L t={t("Méthode")}><input className="field" value={me.method?t(me.method):t("À renseigner dans Mon profil professionnel")} disabled/></L>
        </div>
        <L t={t("Conseils de conservation")}><input className="field" value={form.storage} onChange={(e)=>up("storage",e.target.value)}/></L>
        <button className="btn">{t("Publier")}</button>
      </form>
      <section>
        <h2 className="mb-3 text-xl font-semibold">{t("Mes lots")}</h2>
        {mine.length===0?<Empty>{t("Aucun lot publié.")}</Empty>:<ul className="grid gap-3">{mine.map((c)=><li key={c.id} className="card p-4">
          <div className="flex items-center justify-between"><strong>{c.emoji} {t(c.species)}</strong><StatusPill s={c.status}/></div>
          <p className="text-xs text-muted-foreground">{t("Débarqué")} {dt(c.landedAt)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs">{t("Quantité kg")}<input className="field" type="number" min={0} step={0.5} defaultValue={c.qtyKg} onBlur={(e)=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0&&n!==c.qtyKg)void saveCatch(c.id,{qtyKg:n,status:n===0?"épuisé":"disponible"});}}/></label>
            <label className="grid gap-1 text-xs">{t("Prix £/kg")}<input className="field" type="number" min={0} step={0.5} defaultValue={c.priceKg} onBlur={(e)=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0&&n!==c.priceKg)void saveCatch(c.id,{priceKg:n});}}/></label>
          </div>
          {c.status!=="épuisé"&&<button type="button" className="mt-2 text-sm font-semibold text-destructive" onClick={()=>void saveCatch(c.id,{qtyKg:0,status:"épuisé"})}>{t("Marquer épuisé")}</button>}
        </li>)}</ul>}
        <h2 className="mt-8 mb-3 text-xl font-semibold">{t("Demandes reçues")}</h2>
        {myOrders.length===0?<Empty>{t("Aucune demande reçue.")}</Empty>:<ul className="grid gap-3">{myOrders.map((o)=>{
          const c=catches.find((x)=>x.id===o.catch_id);
          return <li key={o.id} className="card p-4">
            <strong>{c?.emoji} {Number(o.quantity_kg)} kg {t(c?.species??"Produit")}</strong>
            <p className="mb-2 text-sm text-muted-foreground">{t(o.fulfilment==="delivery"?"Livraison":"Retrait")} · {dt(o.requested_slot)} {o.note&&"· "+o.note}</p>
            {o.status==="cancelled"?<><span className="inline-flex rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive">{t("Refusée / annulée")}</span>{Number(o.cancellation_penalty??0)>0&&<p className="mt-2 text-sm">{t("Pénalité fixée")} : <strong>{gbp(Number(o.cancellation_penalty))}</strong></p>}</>:<OrderSteps s={labelStatus[o.status as keyof typeof labelStatus]}/>}{o.cancellation_request_status==="rejected"&&<p className="mt-2 text-sm text-muted-foreground">{t("Annulation tardive refusée par le pêcheur.")}</p>}
            {o.cancellation_request_status==="offered"&&<p className="mt-3 rounded-lg bg-secondary p-3 text-sm">{t("Offre envoyée au restaurant :")} <strong>{gbp(Number(o.cancellation_penalty??0))}</strong>. {t("En attente de son accord.")}</p>}
            {o.cancellation_request_status==="pending"&&<div className="mt-3 rounded-lg border border-border p-3"><p className="text-sm font-semibold">{t("Demande d’annulation tardive")}</p><p className="mb-2 text-xs text-muted-foreground">{t("Vous décidez d’accepter ou de refuser. En cas d’acceptation, vous fixez la pénalité en GBP (0 est autorisé).")}</p><div className="flex flex-col gap-2 sm:flex-row"><button type="button" className="btn btn-accent text-sm" onClick={()=>void decideLateCancellation(o,true)}>{t("Accepter et fixer la pénalité")}</button><button type="button" className="btn text-sm text-destructive" onClick={()=>void decideLateCancellation(o,false)}>{t("Refuser l’annulation")}</button></div></div>}
            {o.status==="submitted"&&o.cancellation_request_status!=="pending"&&o.cancellation_request_status!=="offered"&&<div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" className="btn btn-accent w-full justify-center text-sm sm:w-auto" onClick={()=>void decideOrder(o,"confirmed")}>{t("Accepter la commande")}</button><button type="button" className="btn w-full justify-center border border-destructive/40 text-sm text-destructive sm:w-auto" onClick={()=>void decideOrder(o,"cancelled")}>{t("Refuser")}</button></div>}
            {o.status in nextStatus&&o.cancellation_request_status!=="pending"&&o.cancellation_request_status!=="offered"&&<button type="button" className="btn btn-accent mt-3 text-sm" onClick={()=>void advance(o)}>{t("Passer à l'étape suivante")}</button>}
          </li>;
        })}</ul>}
      </section>
    </div>
    </>}
  </div>;
}

function Metric({label,value,detail}:{label:string;value:string|number;detail:string}){return <div className="card rounded-2xl border border-border p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;}

function L({t,children}:{t:string;children:React.ReactNode}){return <label className="grid gap-1 text-sm font-medium">{t}{children}</label>;}
