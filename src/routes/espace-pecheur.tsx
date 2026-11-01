import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createSharedCatch, fetchMyOrders, updateMyCatch, updateMyOrderStatus, useSharedMarket, type SharedOrderRow } from "@/lib/shared-market";
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
const nextStatus = { submitted:"confirmed", confirmed:"ready", ready:"delivered" } as const;
const labelStatus = { submitted:"envoyée", confirmed:"confirmée", ready:"prête", delivered:"livrée", cancelled:"envoyée" } as const;

function FisherSpace() {
  const { t, gbp, dt } = useLanguage();
  const { fishers, catches, loading, error, refresh } = useSharedMarket();
  const [userId,setUserId] = useState<string|null>(null);
  const [profileLoading,setProfileLoading] = useState(true);
  const [orders,setOrders] = useState<SharedOrderRow[]>([]);
  const [form,setForm] = useState({ species:"", zone:"", qtyKg:10, priceKg:15, grade:"", storage:"Sur glace pilée 0–2 °C", caughtAt:"", landedAt:"" });
  const up = (k:string,v:string|number) => setForm((f)=>({...f,[k]:v}));
  const me = fishers.find((f)=>f.id===userId);
  const mine = catches.filter((c)=>c.fisherId===userId);
  const myOrders = orders.filter((o)=>mine.some((c)=>c.id===o.catch_id));

  const load = async () => {
    setProfileLoading(true);
    try {
      const {data:{user},error:authError}=await supabase.auth.getUser();
      if(authError) throw authError;
      setUserId(user?.id??null);
      if(user) {
        const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).single();
        if(profileError) throw profileError;
        if(profile.role!=="fisher") throw new Error("Ce compte n'est pas vérifié comme pêcheur.");
        setOrders(await fetchMyOrders());
      }
    } catch(e) { toast.error(e instanceof Error?t(e.message):t("Impossible de charger le profil.")); }
    finally { setProfileLoading(false); }
  };
  useEffect(()=>{void load();},[]);

  const publish = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!me || !userId) return toast.error(t("Connectez-vous avec un compte pêcheur vérifié."));
    if(!form.species.trim()||!form.zone.trim()||!form.caughtAt||!form.landedAt) return toast.error(t("Espèce, zone et horaires sont requis."));
    const caught=new Date(form.caughtAt), landed=new Date(form.landedAt);
    if(!Number.isFinite(caught.getTime())||!Number.isFinite(landed.getTime())||landed<caught) return toast.error(t("Les horaires de capture et de débarquement sont invalides."));
    if(!Number.isFinite(form.qtyKg)||form.qtyKg<0.5||!Number.isFinite(form.priceKg)||form.priceKg<0) return toast.error(t("Quantité ou prix invalide."));
    try {
      await createSharedCatch({species:form.species.trim(),zone:form.zone.trim(),qtyKg:form.qtyKg,priceKg:form.priceKg,grade:form.grade.trim(),storage:form.storage,caughtAt:caught.toISOString(),landedAt:landed.toISOString(),fisherId:userId,method:me.method,emoji:EMOJI[me.method]??"🐟",status:"disponible"});
      toast.success(t("Prise publiée dans le catalogue partagé."));
      setForm((f)=>({...f,species:"",grade:""}));
      await refresh();
    } catch(e) { toast.error(e instanceof Error?t(e.message):t("Impossible de publier cette prise.")); }
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
    } catch(e) { toast.error(e instanceof Error?t(e.message):t("Impossible de modifier ce lot.")); }
  };

  const advance = async (order:SharedOrderRow) => {
    const target=nextStatus[order.status as keyof typeof nextStatus];
    if(!target) return;
    try {
      await updateMyOrderStatus(order.id,target);
      toast.success(t("Statut de commande mis à jour."));
      setOrders(await fetchMyOrders());
    } catch(e) { toast.error(e instanceof Error?t(e.message):t("Impossible de modifier la commande.")); }
  };

  if(profileLoading||loading) return <div className="mx-auto max-w-6xl px-4 py-10"><p role="status">{t("Chargement de votre espace pêcheur…")}</p></div>;
  if(!userId||!me) return <div className="mx-auto max-w-3xl px-4 py-10"><PageHeader title={t("Espace pêcheur")} sub={t("Connectez-vous avec un compte pêcheur vérifié pour gérer vos prises.")}/><p className="card p-5"><a className="underline" href="/connexion">{t("Se connecter")}</a></p></div>;

  return <div className="mx-auto max-w-6xl px-4 py-10">
    <PageHeader title={t("Espace pêcheur")} sub={t("Connecté en tant que {name} — {boat}",{name:me.name,boat:me.boat})}/>
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
          <L t={t("Méthode")}><input className="field" value={t(me.method)} disabled/></L>
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
            <OrderSteps s={labelStatus[o.status]}/>
            {o.status in nextStatus&&<button className="btn btn-accent mt-3 text-sm" onClick={()=>void advance(o)}>{t("Passer à l'étape suivante")}</button>}
          </li>;
        })}</ul>}
      </section>
    </div>
  </div>;
}

function L({t,children}:{t:string;children:React.ReactNode}){return <label className="grid gap-1 text-sm font-medium">{t}{children}</label>;}
