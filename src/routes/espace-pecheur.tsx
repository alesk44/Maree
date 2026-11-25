import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createSharedCatch, fetchMyOrders, fetchMyMonthlyInvoices, confirmFisherInvoicePaid, markFisherOrderPaid, updateMyCatch, updateMyOrderStatus, useSharedMarket, type SharedOrderRow, type SharedMonthlyInvoiceRow } from "@/lib/shared-market";
import { supabase } from "@/lib/supabase";
import { Empty, OrderSteps, PageHeader, StatusPill } from "@/components/ui-bits";
import type { Status } from "@/lib/store";

export const Route = createFileRoute("/espace-pecheur")({
  head: () => ({ meta: [
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { title: "Espace pÃªcheur â€” MarÃ©e Jersey" },
    { name: "description", content: "Publiez votre prise du jour et gÃ©rez les demandes des restaurants." },
    { property: "og:title", content: "Espace pÃªcheur â€” MarÃ©e Jersey" },
    { property: "og:description", content: "Publication des prises et gestion des demandes." },
  ] }),
  component: FisherSpace,
});

const EMOJI: Record<string,string> = { Casiers:"ğŸ¦€", Ligne:"ğŸŸ", PlongÃ©e:"ğŸš", "Filet maillant":"ğŸ " };
const nextStatus = { confirmed:"ready", ready:"delivered" } as const;
const labelStatus = { submitted:"envoyÃ©e", confirmed:"confirmÃ©e", ready:"prÃªte", delivered:"livrÃ©e" } as const;

function FisherSpace() {
  const { t, gbp, dt } = useLanguage();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
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
  const [form,setForm] = useState({ species:"", zone:"", qtyKg:10, priceKg:15, grade:"", storage:"Sur glace pilÃ©e 0â€“2 Â°C", caughtAt:"", landedAt:"" });
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

  const load = useCallback(async () => {
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
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? tRef.current(e.message) : tRef.current("Impossible de charger le profil.")); return; }
    finally { setProfileLoading(false); }
  }, []);
  useEffect(()=>{void load();},[load]);
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
    if(!me || !userId) { toast.error(t("Connectez-vous avec un compte pÃªcheur vÃ©rifiÃ©.")); return; }
    if(!form.species.trim()||!form.zone.trim()||!form.caughtAt||!form.landedAt) { toast.error(t("EspÃ¨ce, zone et horaires sont requis.")); return; }
    const caught=new Date(form.caughtAt), landed=new Date(form.landedAt);
    if(!Number.isFinite(caught.getTime())||!Number.isFinite(landed.getTime())||landed<caught) { toast.error(t("Les horaires de capture et de dÃ©barquement sont invalides.")); return; }
    if(landed.getTime()>Date.now()) { toast.error(t("Lâ€™heure de dÃ©barquement ne peut pas Ãªtre dans le futur. VÃ©rifiez lâ€™heure locale et rÃ©essayez.")); return; }
    if(!me.method.trim()) { toast.error(t("Renseignez dâ€™abord votre mÃ©thode de pÃªche dans Mon profil professionnel.")); setAccountTab("profile"); return; }
    if(!Number.isFinite(form.qtyKg)||form.qtyKg<0.5||!Number.isFinite(form.priceKg)||form.priceKg<0) { toast.error(t("QuantitÃ© ou prix invalide.")); return; }
    try {
      await createSharedCatch({species:form.species.trim(),zone:form.zone.trim(),qtyKg:form.qtyKg,priceKg:form.priceKg,grade:form.grade.trim(),storage:form.storage,caughtAt:caught.toISOString(),landedAt:landed.toISOString(),fisherId:userId,method:me.method,emoji:EMOJI[me.method]??"ğŸŸ",status:"disponible"});
      toast.success(t("Prise publiÃ©e dans le catalogue partagÃ©."));
      setForm((f)=>({...f,species:"",grade:""}));
      await refresh();
    } catch(e) { toast.error(e instanceof Error && !("code" in e) ? t(e.message) : t("Impossible de publier cette prise.")); }
  };

  const saveFisherProfile = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!userId) return;
    const crew= fisherProfile.crew_size.trim()===""?null:Number(fisherProfile.crew_size);
    const year= fisherProfile.since_year.trim()===""?null:Number(fisherProfile.since_year);
    if(crew!==null&&(!Number.isInteger(crew)||crew<1||crew>100)){toast.error(t("Nombre dâ€™Ã©quipiers invalide."));return;}
    if(year!==null&&(!Number.isInteger(year)||year<1900||year>2100)){toast.error(t("AnnÃ©e de dÃ©but invalide."));return;}
    setSavingProfile(true);
    const {error}=await supabase.from("profiles").update({
      boat_name:fisherProfile.boat_name.trim()||null,home_port:fisherProfile.home_port.trim()||null,
      fishing_method:fisherProfile.fishing_method.trim()||null,vessel_type:fisherProfile.vessel_type.trim()||null,
      crew_size:crew,fishing_licence_number:fisherProfile.fishing_licence_number.trim()||null,
      bio:fisherProfile.bio.trim()||null,since_year:year
    }).eq("id",userId);
    setSavingProfile(false);
    if(error) toast.error(t("Une erreur technique est survenue. RÃ©essayez.")); else {toast.success(t("Profil pÃªcheur enregistrÃ©."));await refresh();}
  };

  const saveCatch = async (id:string,patch:{qtyKg?:number;priceKg?:number;status?:Status}) => {
    try {
      await updateMyCatch(id,{
-ıó[h‘éì¶»§q«^t^pêYH\ˆŠ_Hˆİ
Ë™[]™\WÙ™YWÜ^Y\—ÜÛ˜\ÚİOOIÙš\Ú\‰ÏÉÕ›İ\È
0êYZ]HH›İ™H°êÛ[Y[
IÎ‰ÛH™\İ]\˜[	Ê_H0­ÈÙØœ
[X™\ŠË™[]™\WÙ™YOÏÌ
J_OÜÙ]Z[Ï‚ˆÛOŸJ_Oİ[ŸBˆÜÙXİ[ÛŸBˆØXØÛİ[XOOHœ›Ùš[Hˆ	‰ˆ›Ü›HÛ”İX›Z]^ÜØ]™Qš\Ú\”›Ùš[_HÛ\ÜÓ˜[YOH˜Ø\™X‹NÜšYØ\MMH‚ˆ]ˆÛ\ÜÓ˜[YOH^^›Û\Ù[ZX›Ûİ
“[Ûˆ›Ùš[›Ù™\ÜÚ[Û›™[Š_OÚÛ\ÜÓ˜[YOH^\ÛH^[]]YY›Ü™YÜ›İ[™İ
ÛÛ\0ê]^ˆ\È[™›Ü›X][ÛœÈH›İ™H˜]X]H]H›İ™HXİ]š]0êH\°êÈ˜[Y][ÛˆHÛÛ\KˆŠ_OÜÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH™ÜšYØ\LÈÛN™ÜšYXÛÛËLˆ‚ˆ^İ
“›ÛHH˜]X]HŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆX^[™İ^ÌLŒH˜[YO^Ùš\Ú\”›Ùš[K˜›Ø]Û˜[Y_HÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œ›Ø]Û˜[YN™K\™Ù]˜[Y_JJ_KÏÓ‚ˆ^İ
”Ü8 &X]XÚHŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆX^[™İ^ÌLŒH˜[YO^Ùš\Ú\”›Ùš[KšÛYWÜÜHÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œÛYWÜÜ™K\™Ù]˜[Y_JJ_KÏÓ‚ˆ^İ
•\HH˜]X]HŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆX^[™İ^ÌLŒH˜[YO^Ùš\Ú\”›Ùš[K™\ÜÙ[İ\_HÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œ™\ÜÙ[İ\N™K\™Ù]˜[Y_JJ_HXÙZÛ\^İ
‘^ˆÚ[]Y\‹™Y]KÜ[ˆ›Ø]Š_KÏÓ‚ˆ^İ
“pê]ÙHH0ê˜ÚHŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆX^[™İ^ÌLH˜[YO^Ùš\Ú\”›Ùš[K™š\Ú[™×ÛY]ÙHÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œš\Ú[™×ÛY]Ù™K\™Ù]˜[Y_JJ_KÏÓ‚ˆ^İ
“›ÛXœ™H8 &pê\]Z\Y\œÈŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^Ì_HX^^ÌLHİ\^Ì_H˜[YO^Ùš\Ú\”›Ùš[K˜Ü™]×ÜÚ^™_HÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œÜ™]×ÜÚ^™N™K\™Ù]˜[Y_JJ_KÏÓ‚ˆ^İ
[›°êYHH0êX]8 &XXİ]š]0êHŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^ÌNLHX^^ÌŒLH˜[YO^Ùš\Ú\”›Ùš[KœÚ[˜ÙWŞYX\ŸHÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œÚ[˜ÙWŞYX\™K\™Ù]˜[Y_JJ_KÏÓ‚ˆ^İ
“[pê\›ÈHXÙ[˜ÙHH0ê˜ÚHŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆX^[™İ^ÌLŒH˜[YO^Ùš\Ú\”›Ùš[K™š\Ú[™×ÛXÙ[˜ÙWÛ[X™\ŸHÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œš\Ú[™×ÛXÙ[˜ÙWÛ[X™\™K\™Ù]˜[Y_JJ_KÏÓ‚ˆÙ]‚ˆ^İ
”°ê\Ù[][ÛˆH›İ™HXİ]š]0êHŠ_O^\™XHÛ\ÜÓ˜[YOH™šY[ˆ›İÜÏ^ÍHX^[™İ^ÌŒH˜[YO^Ùš\Ú\”›Ùš[K˜š[ßHÛÚ[™ÙO^ÙOOœÙ]š\Ú\”›Ùš[JOŠË‹‹œš[Î™K\™Ù]˜[Y_JJ_KÏÓ‚ˆ]ÛˆÛ\ÜÓ˜[YOH˜ˆ‹XXØÙ[ËYš]ˆ\ØX›Y^ÜØ]š[™Ô›Ùš[_OÜØ]š[™Ô›Ùš[Oİ
‘[œ™YÚ\İ™[Y[8 )ˆŠN
‘[œ™YÚ\İ™\ˆ[Ûˆ›Ùš[›Ù™\ÜÚ[Û›™[Š_OØ]Û‚ˆÙ›Ü›OŸB‚ˆØXØÛİ[XOOH˜Xİ]š]Hˆ	‰ˆ‚ˆÙXİ[Ûˆ\šXK[X™[^İ
•YH	Ù[œÙ[X›HŠ_HÛ\ÜÓ˜[YOH›X‹NÜšYØ\LÈÛN™ÜšYXÛÛËLˆ™ÜšYXÛÛËM‚ˆY]šXÈX™[^İ
“İÈX›pê\ÈŠ_H˜[YO^ÛZ[™K›[™İH]Z[^İ
•İ]\È›ÜÈš\Ù\ÈŠ_KÏ‚ˆY]šXÈX™[^İ
”İØÚÈ\ÜÛšX›HŠ_H˜[YO^ÛZ[™K™š[\Š
ÊOO˜Ëœİ]\ÏOOH™\ÜÛšX›HŠKœ™YXÙJ
‹ÊOO›ŠØËœ]RÙË
KÓØØ[Tİš[™Ê™œ‹Q”ˆŠJÈˆÙÈŸH]Z[^İ
”]X[]0êHXİY[[Y[[ˆ™[HŠ_KÏ‚ˆY]šXÈX™[^İ
‘[X[™\È™péİY\ÈŠ_H˜[YO^Û^SÜ™\œË›[™İH]Z[^İ
”°ê\Ù\˜][ÛœÈH™\İ]\˜[ÈŠ_KÏ‚ˆY]šXÈX™[^İ
°à˜Z]\ˆŠ_H˜[YO^Û^SÜ™\œË™š[\Š
ÊOO›Ëœİ]\ÏOOHœİX›Z]YŠK›[™İH]Z[^İ
“›İ]™[\È[X[™\ÈŠ_KÏ‚ˆÜÙXİ[Û‚ˆÙXİ[ÛˆÛ\ÜÓ˜[YOH˜Ø\™X‹NMHÛNœMˆ‚ˆ]ˆÛ\ÜÓ˜[YOH›X‹MH›^›^]Ü˜\][\ËY[™\İYKX™]ÙY[ˆØ\Lˆ‚ˆ]ˆÛ\ÜÓ˜[YOH^[È›Û\Ù[ZX›Ûİ
Xİ]š]0êH\È0êX˜\œ]Y[Y[ÈŠ_OÚÛ\ÜÓ˜[YOH^^È^[]]YY›Ü™YÜ›İ[™İ
“›ÛXœ™HHİÈ0êX˜\œ]pê\Èİ\ˆ\ÈÙ\\›šY\œÈ›İ\œÈŠ_OÜÙ]‚ˆÜ[ˆÛ\ÜÓ˜[YOHœ›İ[™YY[™Ë\ÙXÛÛ™\HLÈKLH^^È^[]]YY›Ü™YÜ›İ[™İ
È\›šY\œÈ›İ\œÈŠ_OÜÜ[‚ˆÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH™ÜšYÜšYXÛÛËMÈ][\ËY[™Ø\Lˆˆ›ÛOHš[YÈˆ\šXK[X™[^İÙYZÛPXİ]š]K›X\

^JOO™^K›X™[
ÈˆŠÙ^K˜Ûİ[
Kš›Ú[Š‹Š_O‚ˆİÙYZÛPXİ]š]K›X\

^JOO]ˆÙ^O^Ù^KšÙ^_HÛ\ÜÓ˜[YOH™›^Z[‹]ËL›^XÛÛ][\ËXÙ[\ˆØ\Lˆ‚ˆÜ[ˆÛ\ÜÓ˜[YOH^^È›Û\Ù[ZX›ÛX[\‹[[\È^[]]YY›Ü™YÜ›İ[™Ù^K˜Ûİ[OÜÜ[‚ˆ]ˆÛ\ÜÓ˜[YOH™›^LËY[][\ËY[™›İ[™Y[È™Ë\ÙXÛÛ™\HLH]ˆÛ\ÜÓ˜[YOHËY[›İ[™Y[Y™ËXXØÙ[ˆİ[O^ŞÚZYÚŠ^K˜Ûİ[ÛX^Z[PXİ]š]JŒL
JÈ‰HŸ_HÏÙ]‚ˆÜ[ˆÛ\ÜÓ˜[YOH^VÌLHØ\][^™H^[]]YY›Ü™YÜ›İ[™Ù^K›X™[OÜÜ[‚ˆÙ]Š_BˆÙ]‚ˆÛZ[™K›[™İOOL	‰Û\ÜÓ˜[YOH›]LÈ^^È^[]]YY›Ü™YÜ›İ[™İ
“HÜ˜\\]YH\\˜pë˜H0êÈHX›XØ][ÛˆH›ÜÈ™[Zpê™\Èš\Ù\ËˆŠ_OÜŸBˆÜÙXİ[Û‚ˆÙ\œ›Ü‰‰›ÛOH˜[\ˆÛ\ÜÓ˜[YOH›X‹M^\ÛH^Y\İXİ]™HÙ\œ›ÜŸOÜŸBˆ]ˆÛ\ÜÓ˜[YOH™ÜšYØ\NÎ™ÜšYXÛÛËLˆ‚ˆ›Ü›HÛ”İX›Z]^ÜX›\ÚHÛ\ÜÓ˜[YOH˜Ø\™ÜšYØ\LÈMˆ‚ˆˆÛ\ÜÓ˜[YOH^^›Û\Ù[ZX›Ûİ
”X›Y\ˆ[™Hš\ÙHH›İ\ˆŠ_OÚ‚ˆ]ˆÛ\ÜÓ˜[YOH™ÜšYØ\LÈÛN™ÜšYXÛÛËLˆ‚ˆ^İ
‘\Ü0êÙHŠ_O[œ]™\]Z\™YÛ\ÜÓ˜[YOH™šY[ˆ˜[YO^Ù›Ü›KœÜXÚY\ßHÛÚ[™ÙO^ÊJOO\
œÜXÚY\È‹K\™Ù]˜[YJ_HXÙZÛ\^İ
™^ˆX\]Y\™X]HŠ_KÏÓ‚ˆ^İ
–›Û™HŠ_O[œ]™\]Z\™YÛ\ÜÓ˜[YOH™šY[ˆ˜[YO^Ù›Ü›K›Û™_HÛÚ[™ÙO^ÊJOO\
›Û™H‹K\™Ù]˜[YJ_HXÙZÛ\^İ
™^ˆ˜ZYHHİİY[ˆŠ_KÏÓ‚ˆ^İ
Ø\\™HŠ_O[œ]™\]Z\™YÛ\ÜÓ˜[YOH™šY[ˆ\OH™]][YK[ØØ[ˆ˜[YO^Ù›Ü›K˜Ø]YÚ]HÛÚ[™ÙO^ÊJOO\
˜Ø]YÚ]‹K\™Ù]˜[YJ_KÏÓ‚ˆ^İ
‘0êX˜\œ]Y[Y[Š_O[œ]™\]Z\™YÛ\ÜÓ˜[YOH™šY[ˆ\OH™]][YK[ØØ[ˆ˜[YO^Ù›Ü›K›[™Y]HÛÚ[™ÙO^ÊJOO\
›[™Y]‹K\™Ù]˜[YJ_KÏÓ‚ˆ^İ
”]X[]0êH
ÙÊHŠ_O[œ]™\]Z\™YÛ\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^Ì_Hİ\^Ì_H˜[YO^Ù›Ü›Kœ]RÙßHÛÚ[™ÙO^ÊJOO\
œ]RÙÈ‹
ÙK\™Ù]˜[YJ_KÏÓ‚ˆ^İ
”š^
0¨ËÚÙÊHŠ_O[œ]™\]Z\™YÛ\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^ÌHİ\^Ì_H˜[YO^Ù›Ü›KœšXÙRÙßHÛÚ[™ÙO^ÊJOO\
œšXÙRÙÈ‹
ÙK\™Ù]˜[YJ_KÏÓ‚ˆ^İ
Ø[Xœ™HÈ]X[]0êHŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆ˜[YO^Ù›Ü›K™Ü˜Y_HÛÚ[™ÙO^ÊJOO\
™Ü˜YH‹K\™Ù]˜[YJ_KÏÓ‚ˆ^İ
“pê]ÙHŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆ˜[YO^ÛYK›Y]Ùİ
YK›Y]Ù
N
°à™[œÙZYÛ™\ˆ[œÈ[Ûˆ›Ùš[›Ù™\ÜÚ[Û›™[Š_H\ØX›YÏÓ‚ˆÙ]‚ˆ^İ
ÛÛœÙZ[ÈHÛÛœÙ\˜][ÛˆŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆ˜[YO^Ù›Ü›KœİÜ˜YÙ_HÛÚ[™ÙO^ÊJOO\
œİÜ˜YÙH‹K\™Ù]˜[YJ_KÏÓ‚ˆ]ÛˆÛ\ÜÓ˜[YOH˜ˆİ
”X›Y\ˆŠ_OØ]Û‚ˆÙ›Ü›O‚ˆÙXİ[Û‚ˆˆÛ\ÜÓ˜[YOH›X‹LÈ^^›Û\Ù[ZX›Ûİ
“Y\ÈİÈŠ_OÚ‚ˆÛZ[™K›[™İOOLÏ[\Oİ
]Xİ[ˆİX›pêKˆŠ_OÑ[\O[Û\ÜÓ˜[YOH™ÜšYØ\LÈÛZ[™K›X\

ÊOOHÙ^O^ØËšYHÛ\ÜÓ˜[YOH˜Ø\™M‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆİ›Û™ÏØË™[[Úš_Hİ
ËœÜXÚY\Ê_OÜİ›Û™Ïİ]\Ô[Ï^ØËœİ]\ßKÏÙ]‚ˆÛ\ÜÓ˜[YOH^^È^[]]YY›Ü™YÜ›İ[™İ
‘0êX˜\œ]pêHŠ_HÙ
Ë›[™Y]
_OÜ‚ˆ]ˆÛ\ÜÓ˜[YOH›]LÈÜšYÜšYXÛÛËLˆØ\Lˆ‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^^Èİ
”]X[]0êHÙÈŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^ÌHİ\^Ì_HY˜][˜[YO^ØËœ]RÙßHÛ›\^ÊJOOØÛÛœİS[X™\ŠK\™Ù]˜[YJNÚYŠ[X™\‹š\Ñš[š]JŠI‰›L	‰›ˆOOXËœ]RÙÊ]›ÚYØ]™PØ]Ú
ËšYÜ]RÙÎ›‹İ]\Î›OOLÈ°ê\Z\ğêHˆ™\ÜÛšX›HŸJNß_KÏÛX™[‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^^Èİ
”š^0¨ËÚÙÈŠ_O[œ]Û\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^ÌHİ\^Ì_HY˜][˜[YO^ØËœšXÙRÙßHÛ›\^ÊJOOØÛÛœİS[X™\ŠK\™Ù]˜[YJNÚYŠ[X™\‹š\Ñš[š]JŠI‰›L	‰›ˆOOXËœšXÙRÙÊ]›ÚYØ]™PØ]Ú
ËšYÜšXÙRÙÎ›ŸJNß_KÏÛX™[‚ˆÙ]‚ˆØËœİ]\ÈOOH°ê\Z\ğêH‰‰]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH›]Lˆ^\ÛH›Û\Ù[ZX›Û^Y\İXİ]™HˆÛÛXÚÏ^Ê
OO›ÚYØ]™PØ]Ú
ËšYÜ]RÙÎŒİ]\Îˆ°ê\Z\ğêHŸJ_Oİ
“X\œ]Y\ˆ0ê\Z\ğêHŠ_OØ]ÛŸBˆÛOŠ_Oİ[ŸBˆˆÛ\ÜÓ˜[YOH›]NX‹LÈ^^›Û\Ù[ZX›Ûİ
‘[X[™\È™péİY\ÈŠ_OÚ‚ˆÛ^SÜ™\œË›[™İOOLÏ[\Oİ
]Xİ[™H[X[™H™péİYKˆŠ_OÑ[\O[Û\ÜÓ˜[YOH™ÜšYØ\LÈÛ^SÜ™\œË›X\

ÊOOÂˆÛÛœİÏXØ]Ú\Ë™š[™


OOšYOO[Ë˜Ø]ÚÚY
NÂˆ™]\›ˆHÙ^O^ÛËšYHÛ\ÜÓ˜[YOH˜Ø\™M‚ˆİ›Û™ÏØÏË™[[Úš_HÓ[X™\ŠËœ]X[]WÚÙÊ_HÙÈİ
ÏËœÜXÚY\ÏÏÈ”›ÙZ]Š_OÜİ›Û™Ï‚ˆÛ\ÜÓ˜[YOH›X‹Lˆ^\ÛH^[]]YY›Ü™YÜ›İ[™İ
Ë™[š[Y[OOH™[]™\HÈ“]œ˜Z\ÛÛˆˆ”™]˜Z]Š_H0­ÈÙ
Ëœ™\]Y\İYÜÛİ
_HÛË››İI‰ˆ°­ÈŠÛË››İ_OÜ‚ˆÛËœİ]\ÏOOH˜Ø[˜Ù[YÏÜ[ˆÛ\ÜÓ˜[YOHš[›[™KY›^›İ[™YY[™ËY\İXİ]™KÌMHL‹HKLH^^È›Û\Ù[ZX›Û^Y\İXİ]™Hİ
”™Y\ğêYHÈ[›[0êYHŠ_OÜÜ[Ó[X™\ŠË˜Ø[˜Ù[][Û—Ü[˜[OÏÌ
OŒ	‰Û\ÜÓ˜[YOH›]Lˆ^\ÛHİ
”0ê[˜[]0êHš^0êYHŠ_Hˆİ›Û™ÏÙØœ
[X™\ŠË˜Ø[˜Ù[][Û—Ü[˜[JJ_OÜİ›Û™ÏÜŸOÏÜ™\”İ\ÈÏ^ÛX™[İ]\ÖÛËœİ]\È\ÈÙ^[Ùˆ\[ÙˆX™[İ]\×_KÏŸ^ÛË˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÏOOHœ™Z™XİY‰‰Û\ÜÓ˜[YOH›]Lˆ^\ÛH^[]]YY›Ü™YÜ›İ[™İ
[›[][Ûˆ\™]™H™Y\ğêYH\ˆH0ê˜Ú]\‹ˆŠ_OÜŸBˆÛË˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÏOOH›Ù™™\™Y‰‰Û\ÜÓ˜[YOH›]LÈ›İ[™Y[È™Ë\ÙXÛÛ™\HLÈ^\ÛHİ
“Ù™œ™H[›ŞpêYH]H™\İ]\˜[ˆŠ_Hİ›Û™ÏÙØœ
[X™\ŠË˜Ø[˜Ù[][Û—Ü[˜[OÏÌ
J_OÜİ›Û™Ï‹ˆİ
‘[ˆ][HHÛÛˆXØÛÜ™ˆŠ_OÜŸBˆÛË˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÏOOHœ[™[™È‰‰]ˆÛ\ÜÓ˜[YOH›]LÈ›İ[™Y[È›Ü™\ˆ›Ü™\‹X›Ü™\ˆLÈÛ\ÜÓ˜[YOH^\ÛH›Û\Ù[ZX›Ûİ
‘[X[™H8 &X[›[][Ûˆ\™]™HŠ_OÜÛ\ÜÓ˜[YOH›X‹Lˆ^^È^[]]YY›Ü™YÜ›İ[™İ
•›İ\È0êXÚY^ˆ8 &XXØÙ\\ˆİHH™Y\Ù\‹ˆ[ˆØ\È8 &XXØÙ\][Û‹›İ\Èš^^ˆH0ê[˜[]0êH[ˆĞ”
\İ]]Üš\ğêJKˆŠ_OÜ]ˆÛ\ÜÓ˜[YOH™›^›^XÛÛØ\LˆÛN™›^\›İÈ]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆ‹XXØÙ[^\ÛHˆÛÛXÚÏ^Ê
OO›ÚYXÚYS]PØ[˜Ù[][ÛŠËYJ_Oİ
XØÙ\\ˆ]š^\ˆH0ê[˜[]0êHŠ_OØ]Û]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆ^\ÛH^Y\İXİ]™HˆÛÛXÚÏ^Ê
OO›ÚYXÚYS]PØ[˜Ù[][ÛŠË˜[ÙJ_Oİ
”™Y\Ù\ˆ8 &X[›[][ÛˆŠ_OØ]ÛÙ]Ù]ŸBˆÛËœİ]\ÏOOHœİX›Z]Y‰‰›Ë˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÈOOHœ[™[™È‰‰›Ë˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÈOOH›Ù™™\™Y‰‰]ˆÛ\ÜÓ˜[YOH›]LÈ›^›^XÛÛØ\LˆÛN™›^\›İÈ]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆ‹XXØÙ[ËY[\İYKXÙ[\ˆ^\ÛHÛNËX]]ÈˆÛÛXÚÏ^Ê
OO›ÚYXÚYSÜ™\ŠË˜ÛÛ™š\›YYŠ_Oİ
XØÙ\\ˆHÛÛ[X[™HŠ_OØ]Û]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆËY[\İYKXÙ[\ˆ›Ü™\ˆ›Ü™\‹Y\İXİ]™KÍ^\ÛH^Y\İXİ]™HÛNËX]]ÈˆÛÛXÚÏ^Ê
OO›ÚYXÚYSÜ™\ŠË˜Ø[˜Ù[YŠ_Oİ
”™Y\Ù\ˆŠ_OØ]ÛÙ]ŸBˆÛËœİ]\È[ˆ™^İ]\É‰›Ë˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÈOOHœ[™[™È‰‰›Ë˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÈOOH›Ù™™\™Y‰‰]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆ‹XXØÙ[]LÈ^\ÛHˆÛÛXÚÏ^Ê
OO›ÚYY˜[˜ÙJÊ_Oİ
”\ÜÙ\ˆ0è	ğê]\HİZ]˜[HŠ_OØ]ÛŸBˆÛOÂˆJ_Oİ[ŸBˆÜÙXİ[Û‚ˆÙ]‚ˆÏŸBˆÙ]ÂŸB‚™[˜İ[ÛˆY]šXÊÛX™[˜[YK]Z[NÛX™[œİš[™Îİ˜[YNœİš[™ß[X™\Ù]Z[œİš[™ßJ^Ü™]\›ˆ]ˆÛ\ÜÓ˜[YOH˜Ø\™›İ[™YL›Ü™\ˆ›Ü™\‹X›Ü™\ˆMHÛ\ÜÓ˜[YOH^^È›Û\Ù[ZX›Û\\˜Ø\ÙH˜XÚÚ[™Ë]ÚY\ˆ^[]]YY›Ü™YÜ›İ[™ÛX™[OÜÛ\ÜÓ˜[YOH›]Lˆ›ÛY\Ü^H^LŞ›Û\Ù[ZX›Û^Y›Ü™YÜ›İ[™İ˜[Y_OÜÛ\ÜÓ˜[YOH›]LH^^È^[]]YY›Ü™YÜ›İ[™Ù]Z[OÜÙ]ßB‚™[˜İ[Ûˆ
İÚ[™[ŸNİœİš[™ÎØÚ[™[”™XXİ”™XXİ›Ù_J^Ü™]\›ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ^ØÚ[™[ŸOÛX™[ßB