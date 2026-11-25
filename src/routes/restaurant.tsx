import { useLanguage } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchMyOrders, fetchMyMonthlyInvoices, fetchMyMareeCommissionInvoices, declareMareeCommissionInvoicePaid, reserveSharedCatch, requestMyOrderCancellation, respondMyOrderCancellation, setRestaurantFisherBillingMode, useSharedMarket, type SharedOrderRow, type SharedMonthlyInvoiceRow, type SharedMareeCommissionInvoiceRow } from "@/lib/shared-market";
import { supabase } from "@/lib/supabase";
import { Empty, OrderSteps, PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/restaurant")({
  validateSearch: (s: Record<string, unknown>) => ({ produit: typeof s["produit"] === "string" ? s["produit"] : undefined }),
  head: () => ({ meta: [
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { title: "Espace restaurant â€” MarÃ©e Jersey" },
    { name: "description", content: "RÃ©servez la pÃªche du jour pour votre restaurant Ã  Jersey." },
    { property: "og:title", content: "Espace restaurant â€” MarÃ©e Jersey" },
    { property: "og:description", content: "Demandes de rÃ©servation et suivi des commandes." },
  ] }),
  component: Restaurant,
});

function Restaurant() {
  const { t, gbp, dt } = useLanguage();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const { produit } = Route.useSearch();
  const { catches, fishers, loading, error, refresh } = useSharedMarket();
  const [orders, setOrders] = useState<SharedOrderRow[]>([]);
  const [monthlyInvoices, setMonthlyInvoices] = useState<SharedMonthlyInvoiceRow[]>([]);
  const [mareeInvoices, setMareeInvoices] = useState<SharedMareeCommissionInvoiceRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [catchId, setCatchId] = useState(produit ?? "");
  const [qty, setQty] = useState(2);
  const [tipAmount, setTipAmount] = useState(0);
  const [slot, setSlot] = useState("");
  const [mode, setMode] = useState<"livraison" | "retrait">("livraison");
  const [note, setNote] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [accountTab, setAccountTab] = useState<"activity" | "billing" | "profile">("activity");
  const [profileName, setProfileName] = useState("");
  const [billingMode, setBillingMode] = useState<"immediate"|"monthly">("immediate");
  const [mareeFeeRate,setMareeFeeRate]=useState(0.065);
  const [deliveryFeeRate,setDeliveryFeeRate]=useState(0.20);
  const [deliveryFeePayer,setDeliveryFeePayer]=useState<'buyer'|'fisher'>('buyer');

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      setSignedIn(Boolean(auth.user));
      if (auth.user) {
        const {data:commercialRows,error:commercialError}=await supabase.rpc('get_maree_commercial_settings');
        if(commercialError) throw commercialError;
        const commercial=Array.isArray(commercialRows)?commercialRows[0]:commercialRows;
        if(commercial){setMareeFeeRate(Number(commercial.maree_fee_rate));setDeliveryFeeRate(Number(commercial.delivery_fee_rate));setDeliveryFeePayer(commercial.delivery_fee_payer==='fisher'?'fisher':'buyer');}
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
        setProfileName(profile?.display_name ?? "");
      }
      const [nextOrders,nextInvoices,nextMareeInvoices] = await Promise.all([fetchMyOrders(),fetchMyMonthlyInvoices(),fetchMyMareeCommissionInvoices()]);
      setOrders(nextOrders);
      setMonthlyInvoices(nextInvoices);
      setMareeInvoices(nextMareeInvoices);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tRef.current("Impossible de charger les commandes."));
    } finally { setOrdersLoading(false); }
  }, []);

  const avail = catches.filter((c) => c.status === "disponible" && c.qtyKg > 0);
  const sel = catches.find((c) => c.id === catchId);
  const estimatedSubtotal = sel ? Math.round(qty * sel.priceKg * 100) / 100 : 0;
  const estimatedMareeFee = Math.round(estimatedSubtotal * mareeFeeRate * 100) / 100;
  const estimatedDeliveryFee = mode === "livraison" ? Math.round(estimatedSubtotal * deliveryFeeRate * 100) / 100 : 0;
  const estimatedBuyerDeliveryFee = deliveryFeePayer==='buyer'?estimatedDeliveryFee:0;
  const estimatedTotal = estimatedSubtotal + estimatedMareeFee + estimatedBuyerDeliveryFee + tipAmount;
  const deliveredOrders = orders.filter(o=>o.status==="delivered");
  const immediateUnpaid = deliveredOrders.filter(o=>o.billing_mode==="immediate" && o.fisher_payment_status==="unpaid");
  const monthlyUnpaid = monthlyInvoices.filter(i=>i.status==="open");
  const openMonthlyOrderIds = new Set(monthlyUnpaid.flatMap(i=>i.items?.map(item=>item.order_id)??[]));
  const monthlyUnbilled = deliveredOrders.filter(o=>o.billing_mode==="monthly"&&o.fisher_payment_status==="unpaid"&&!openMonthlyOrderIds.has(o.id));
  const fisherDebt = immediateUnpaid.reduce((sum,o)=>sum+Number(o.product_subtotal??0)+Number(o.tip_amount??0)-(o.delivery_fee_payer_snapshot==='fisher'?Number(o.delivery_fee??0):0),0)
    + monthlyUnpaid.reduce((sum,i)=>sum+Number(i.subtotal)+Number(i.tip_total??0)-Number(i.delivery_deduction_total??0),0)
    + monthlyUnbilled.reduce((sum,o)=>sum+Number(o.product_subtotal??0)+Number(o.tip_amount??0)-(o.delivery_fee_payer_snapshot==='fisher'?Number(o.delivery_fee??0):0),0);
  const fisherTipDebt = immediateUnpaid.reduce((sum,o)=>sum+Number(o.tip_amount??0),0)
    + monthlyUnpaid.reduce((sum,i)=>sum+Number(i.tip_total??0),0)
    + monthlyUnbilled.reduce((sum,o)=>sum+Number(o.tip_amount??0),0);
  const fisherPaid = deliveredOrders.filter(o=>o.fisher_payment_status==="paid").reduce((sum,o)=>sum+Number(o.product_subtotal??0)+Number(o.tip_amount??0)-(o.delivery_fee_payer_snapshot==='fisher'?Number(o.delivery_fee??0):0),0);
  const mareeAccrued = deliveredOrders.reduce((sum,o)=>sum+Number(o.maree_fee??0)+(o.delivery_fee_payer_snapshot==='buyer'?Number(o.delivery_fee??0):0),0);
  const mareeSettled = mareeInvoices.filter(i=>i.status==="paid").reduce((sum,i)=>sum+Number(i.commission_total)+Number(i.delivery_total),0);
  const mareeOutstanding = Math.max(0,mareeAccrued-mareeSettled);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
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
  }, [signedIn, loadOrders]);

  useEffect(() => { if (!catchId && catches.length) setCatchId(produit ?? catches[0]?.id ?? ""); }, [catches, catchId, produit]);
  const selectedFisherId = sel?.fisherId;
  useEffect(() => {
    let active = true;
    const loadMode = async () => {
      if (!signedIn || !selectedFisherId) { setBillingMode("immediate"); return; }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("restaurant_fisher_billing_settings").select("billing_mode").eq("restaurant_id", auth.user.id).eq("fisher_id", selectedFisherId).maybeSingle();
      if (active) setBillingMode(data?.billing_mode === "monthly" ? "monthly" : "immediate");
    };
    void loadMode();
    return () => { active = false; };
  }, [signedIn, selectedFisherId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signedIn) { toast.error(t("Connectez-vous avec votre compte restaurant avant de rÃ©server.")); return; }
    if (!sel || !slot) { toast.error(t("ComplÃ©tez le produit et le crÃ©neau.")); return; }
    if (!Number.isFinite(qty) || qty < 0.5 || qty > sel.qtyKg) { toast.error(t("QuantitÃ© invalide ou supÃ©rieure au stock disponible.")); return; }
    if (!Number.isFinite(new Date(slot).getTime())) { toast.error(t("CrÃ©neau invalide.")); return; }
    try {
      if (sel) await setRestaurantFisherBillingMode(sel.fisherId,billingMode);
      await reserveSharedCatch({ catchId, qtyKg: qty, slot: new Date(slot).toISOString(), mode, note: note.trim(), tipAmount });
      toast.success(t("RÃ©servation envoyÃ©e au pÃªcheur."));
      setNote("");
      setTipAmount(0);
      await Promise.all([refresh(), loadOrders()]);
    } catch (e) { toast.error(e instanceof Error ? t(e.message) : t("Impossible d'envoyer la rÃ©servation.")); return; }
  };

  return <div className="mx-auto max-w-6xl px-4 py-10">
    <PageHeader title={t("Espace restaurant")} sub={t("RÃ©servez directement la pÃªche du jour. Aucun paiement dans cette version.")} />
    <Link to="/tracabilite" className="btn btn-accent mb-4 inline-flex">{t("Scanner QR")}</Link>
    <section className="mb-6 grid gap-2 sm:grid-cols-3" aria-label={t("Navigation espace restaurant")}>
      <button type="button" className={"btn "+(accountTab==="activity"?"btn-accent":"")} onClick={()=>setAccountTab("activity")}>{t("ActivitÃ© & commandes")}</button>
      <button type="button" className={"btn "+(accountTab==="billing"?"btn-accent":"")} onClick={()=>setAccountTab("billing")}>{t("Factures & dÃ©penses")}</button>
      <button type="button" className={"btn "+(accountTab==="profile"?"btn-accent":"")} onClick={()=>setAccountTab("profile")}>{t("Mon Ã©tablissement")}</button>
    </section>
    {accountTab==="billing" && <section className="card mb-8 grid gap-4 p-5">
      <div><h2 className="text-xl font-semibold">{t("Facturation et relevÃ©s")}</h2><p className="text-sm text-muted-foreground">{t("Historique des commandes livrÃ©es. Les montants reprennent les prix et frais figÃ©s Ã  la rÃ©servation ; aucun paiement n'est encaissÃ© dans cette version.")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label={t("Commandes livrÃ©es")} value={deliveredOrders.length} detail={t("Historique")}/>
        <Metric label={t("Dette pÃªcheurs")} value={gbp(fisherDebt)} detail={t("Produits et pourboires non rÃ©glÃ©s")}/>
        <Metric label={t("Pourboires Ã  reverser")} value={gbp(fisherTipDebt)} detail={t("100 % destinÃ©s aux pÃªcheurs")}/>
        <Metric label={t("Paiements pÃªcheurs confirmÃ©s")} value={gbp(fisherPaid)} detail={t("RÃ¨glements enregistrÃ©s")}/>
        <Metric label={t("Dette MarÃ©e Ã  rÃ©gler")} value={gbp(mareeOutstanding)} detail={t("RelevÃ©s ouverts ou en vÃ©rification")}/>
        <Metric label={t("Paiements MarÃ©e vÃ©rifiÃ©s")} value={gbp(mareeSettled)} detail={t("RelevÃ©s rÃ©glÃ©s")}/>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">{t("RelevÃ©s mensuels de commission-¶Ó«h‘éì¶»§q«^t0­Èİ
”^Y]\ˆŠ_Hˆİ
Ë™[]™\WÙ™YWÜ^Y\—ÜÛ˜\ÚİOOIØ^Y\‰ÏÉÔ™\İ]\˜[	Î‰Ô0ê˜Ú]\‰Ê_OÜ‚ˆÛ\ÜÓ˜[YOH›]LH^^È^[]]YY›Ü™YÜ›İ[™İ
”™[]°êH[™XØ]Yˆ8 %™HÛÛœİ]YH\È[™H˜Xİ\™Hš\ØØ[HšH[™H™]]™HHZY[Y[ˆŠ_OÜ‚ˆÛOŸJ_Oİ[ŸBˆÜÙXİ[ÛŸBˆØXØÛİ[XOOHœ›Ùš[Hˆ	‰ˆÙXİ[ÛˆÛ\ÜÓ˜[YOH˜Ø\™X‹NÜšYØ\LˆMH‚ˆˆÛ\ÜÓ˜[YOH^^›Û\Ù[ZX›Ûİ
“[Ûˆ0ê]X›\ÜÙ[Y[Š_OÚ‚ˆÜ[ˆÛ\ÜÓ˜[YOH^[]]YY›Ü™YÜ›İ[™İ
“›ÛH[œ™YÚ\İ°êHŠ_HÜÜ[ˆİ›Û™ÏÜ›Ùš[S˜[Y_
“›Ûˆ™[œÙZYÛ°êHŠ_OÜİ›Û™ÏÜ‚ˆÛ\ÜÓ˜[YOH^\ÛH^[]]YY›Ü™YÜ›İ[™İ
“\ÈÛÛÜ™Û›°êY\ÈH˜Xİ\˜][Û‹	ØY™\ÜÙH]H[pê\›ÈÔÕ]œ›Û0ê™HÛÛ\0ê]0ê\È]˜[	ğê[Z\ÜÚ[ÛˆH˜Xİ\™\ÈÙ™šXÚY[\ËˆŠ_OÜ‚ˆHÛ\ÜÓ˜[YOH˜ˆ‹XXØÙ[ËYš]ˆ™YH‹ØÛÛ›™^[Ûˆİ
“[ÙYšY\ˆ[Ûˆ›Ùš[Š_OØO‚ˆÜÙXİ[ÛŸB‚ˆØXØÛİ[XOOH˜Xİ]š]Hˆ	‰ˆ‚ˆÙXİ[Ûˆ\šXK[X™[^İ
•YH	Ù[œÙ[X›HŠ_HÛ\ÜÓ˜[YOH›X‹NÜšYØ\LÈÛN™ÜšYXÛÛËLˆ™ÜšYXÛÛËM‚ˆY]šXÈX™[^İ
“İÈ\ÜÛšX›\ÈŠ_H˜[YO^ÛØY[™ÏÈ¸ %˜]˜Z[›[™İH]Z[^İ
”0ê˜ÚHH›İ\ˆŠ_KÏ‚ˆY]šXÈX™[^İ
”°ê\Ù\˜][ÛœÈŠ_H˜[YO^ÛÜ™\œÓØY[™ÏÈ¸ %›Ü™\œË›[™İH]Z[^İ
‘[X[™\ÈH›İ™H™\İ]\˜[Š_KÏ‚ˆY]šXÈX™[^İ
‘[ˆ][HŠ_H˜[YO^ÛÜ™\œÓØY[™ÏÈ¸ %›Ü™\œË™š[\Š
ÊOO›Ëœİ]\ÏOOHœİX›Z]YŠK›[™İH]Z[^İ
°àÛÛ™š\›Y\ˆ\ˆH0ê˜Ú]\ˆŠ_KÏ‚ˆY]šXÈX™[^İ
”]X[]0êH°ê\Ù\°êYHŠ_H˜[YO^ÛÜ™\œÓØY[™ÏÈ¸ %›Ü™\œËœ™YXÙJ
‹ÊOO›ŠÓ[X™\ŠËœ]X[]WÚÙÊK
KÓØØ[Tİš[™Ê™œ‹Q”ˆŠJÈˆÙÈŸH]Z[^İ
•İ[H›ÜÈ[X[™\ÈŠ_KÏ‚ˆÜÙXİ[Û‚ˆÙ\œ›Üˆ	‰ˆ›ÛOH˜[\ˆÛ\ÜÓ˜[YOH›X‹M^\ÛH^Y\İXİ]™HÙ\œ›ÜŸOÜŸBˆ]ˆÛ\ÜÓ˜[YOH™ÜšYØ\NÎ™ÜšYXÛÛËVÌYœ—ÌKŒYœ—H‚ˆ›Ü›HÛ”İX›Z]^ÜİX›Z]HÛ\ÜÓ˜[YOH˜Ø\™ÜšYØ\MMˆ‚ˆˆÛ\ÜÓ˜[YOH^^›Û\Ù[ZX›Ûİ
“›İ]™[H°ê\Ù\˜][ÛˆŠ_OÚ‚ˆÈ\ÚYÛ™Y[ˆ	‰ˆÛ\ÜÓ˜[YOHœ›İ[™Y[È›Ü™\ˆLÈ^\ÛHİ
ÛÛ›™Xİ^‹]›İ\È]™XÈ›İ™HÛÛ\H™\İ]\˜[İ\ˆ°ê\Ù\™\‹ˆŠ_HHÛ\ÜÓ˜[YOH[™\›[™Hˆ™YH‹ØÛÛ›™^[Ûˆİ
ÛÛ›™^[ÛˆŠ_OØOÜŸBˆÛØY[™ÈÈ›ÛOHœİ]\ÈˆÛ\ÜÓ˜[YOH^\ÛH^[]]YY›Ü™YÜ›İ[™İ
Ú\™Ù[Y[HØ][ÙİYx )ˆŠ_OÜˆˆ]˜Z[›[™İOOHÈ[\Oİ
]Xİ[ˆ›ÙZ]\ÜÛšX›Hİ\ˆH[ÛY[ˆŠ_OÑ[\Oˆˆ‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ
”›ÙZ]Š_BˆÙ[XİÛ\ÜÓ˜[YOH™šY[ˆ˜[YO^ØØ]ÚYHÛÚ[™ÙO^ÊJHOˆÙ]Ø]ÚY
K\™Ù]˜[YJ_O‚ˆØ]˜Z[›X\

ÊHOˆÜ[ÛˆÙ^O^ØËšYH˜[YO^ØËšYOİ
ËœÜXÚY\Ê_H8 %ÙØœ
ËœšXÙRÙÊ_KÚÙÈ
ØËœ]RÙßHÙÊOÛÜ[ÛŠ_BˆÜÙ[Xİ‚ˆÛX™[‚ˆ]ˆÛ\ÜÓ˜[YOH™ÜšYØ\MÛN™ÜšYXÛÛËLˆ‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ
”]X[]0êH
ÙÊHŠ_Bˆ[œ]Û\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^Ì_HX^^ÜÙ[Ëœ]RÙßHİ\^Ì_H˜[YO^Ü]_HÛÚ[™ÙO^ÊJHOˆÙ]]J
ÙK\™Ù]˜[YJ_H™\]Z\™YÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ
“[ÙHŠ_BˆÙ[XİÛ\ÜÓ˜[YOH™šY[ˆ˜[YO^Û[Ù_HÛÚ[™ÙO^ÊJHOˆÙ][ÙJK\™Ù]˜[YH\È›]œ˜Z\ÛÛˆˆœ™]˜Z]Š_O‚ˆÜ[Ûˆ˜[YOH›]œ˜Z\ÛÛˆİ
“]œ˜Z\ÛÛˆŠ_OÛÜ[ÛÜ[Ûˆ˜[YOHœ™]˜Z]İ
”™]˜Z]]HÜŠ_OÛÜ[Û‚ˆÜÙ[Xİ‚ˆÛX™[‚ˆÙ]‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ
‘˜Xİ\˜][Ûˆ]\°êÈHÙH0ê˜Ú]\ˆŠ_BˆÙ[XİÛ\ÜÓ˜[YOH™šY[ˆ˜[YO^Øš[[™Ó[Ù_HÛÚ[™ÙO^ÊJOOœÙ]š[[™Ó[ÙJK\™Ù]˜[YH\Èš[[YYX]HŸ›[ÛHŠ_O‚ˆÜ[Ûˆ˜[YOHš[[YYX]Hİ
°àÚ\]YHÛÛ[X[™HŠ_OÛÜ[ÛÜ[Ûˆ˜[YOH›[ÛHİ
”™[]°êHY[œİY[
0êXÚ0êX[˜ÙH0èÈ›İ\œÊHŠ_OÛÜ[Û‚ˆÜÙ[Xİ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ
Ü°ê[™X]H
]\™HH™\œÙ^JHŠ_Bˆ[œ]Û\ÜÓ˜[YOH™šY[ˆ\OH™]][YK[ØØ[ˆ™\]Z\™Y˜[YO^ÜÛİHÛÚ[™ÙO^ÊJHOˆÙ]Ûİ
K\™Ù]˜[YJ_HÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ
”İ\˜›Ú\™H]H0ê˜Ú]\ˆ
0¨ÊHŠ_Bˆ[œ]Û\ÜÓ˜[YOH™šY[ˆ\OH›[X™\ˆˆZ[^ÌHX^^ÌLHİ\^ÌŒ_H˜[YO^İ\[[İ[HÛÚ[™ÙO^ÊJOOœÙ]\[[İ[
X]›X^
[X™\ŠK\™Ù]˜[YJ_
J_KÏ‚ˆÜ[ˆÛ\ÜÓ˜[YOH^^È^[]]YY›Ü™YÜ›İ[™İ
‘˜Xİ[]Yˆ8 %L	HHİ\˜›Ú\™H™]šY[]H0ê˜Ú]\‹Ø[œÈÛÛ[Z\ÜÚ[ÛˆX\°êYKˆŠ_OÜÜ[‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH™ÜšYØ\LH^\ÛH›Û[YY][Hİ
“›İHŠ_Bˆ^\™XHÛ\ÜÓ˜[YOH™šY[ˆ›İÜÏ^ÌŸH˜[YO^Û›İ_HÛÚ[™ÙO^ÊJHOˆÙ]›İJK\™Ù]˜[YJ_HÏ‚ˆÛX™[‚ˆÜÙ[	‰ˆ]ˆÛ\ÜÓ˜[YOHœ›İ[™Y[È™Ë\ÙXÛÛ™\HM^\ÛH‚ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Ûİ
”°ê\İ[pêHŠ_OÜ‚ˆÜ]_HÙÈHİ
Ù[œÜXÚY\Ê_H0åÈÙØœ
Ù[œšXÙRÙÊ_HHİ›Û™ÏÙØœ
\İ[X]YİXİ[
_OÜİ›Û™ÏÜ‚ˆİ
ÛÛ[Z\ÜÚ[ÛˆX\°êYH™\œÙ^H
Ü˜]_H	Kİ\È[Ù\ÊH‹Ü˜]NŠX\™YQ™YT˜]JŒL
KÑš^Y
Š_J_Hˆİ›Û™ÏÙØœ
\İ[X]YX\™YQ™YJ_OÜİ›Û™ÏÜ‚ˆİ
‘œ˜Z\ÈH]œ˜Z\ÛÛˆŠ_H
Ê[]™\Q™YT˜]JŒL
KÑš^Y
Š_H	JHˆİ›Û™ÏÙØœ
\İ[X]Y[]™\Q™YJ_OÜİ›Û™Ïˆ0­Èİ
”^Y]\ˆŠ_Hˆİ›Û™Ïİ
[]™\Q™YT^Y\OOIØ^Y\‰ÏÉÔ™\İ]\˜[	Î‰Ô0ê˜Ú]\‰Ê_OÜİ›Û™ÏÜ‚ˆİ
”İ\˜›Ú\™H[0êYÜ˜[]H0ê˜Ú]\ˆŠ_Hˆİ›Û™ÏÙØœ
\[[İ[
_OÜİ›Û™ÏÜ‚ˆİ
•İ[\İ[pêHİ\ˆH™\İ]\˜[Š_Hˆİ›Û™ÏÙØœ
\İ[X]Yİ[
_OÜİ›Û™ÏÜ‚ˆÛ\ÜÓ˜[YOH^^È^[]]YY›Ü™YÜ›İ[™İ
“H[Û[›ÙZ]È]Hİ\˜›Ú\™H™]šY[›™[[0êYÜ˜[[Y[]H0ê˜Ú]\‹ˆHİ\˜›Ú\™H‰Ù\İ\ÈÛİ[Z\È0èÛÛ[Z\ÜÚ[Û‹ˆHÛÛ[Z\ÜÚ[ÛˆHØÛÛ[Z\ÜÚ[Û”˜]_H	H™]šY[0èX\°êYHİ\ˆÚ\]YHXÚ]È\Èœ˜Z\ÈH]œ˜Z\ÛÛˆHÙ[]™\T˜]_H	HÛÛ\\]pê\È[š\]Y[Y[[ˆ]œ˜Z\ÛÛ‹ˆÔÕ›ÛˆZ›İ]0êKˆ‹ØÛÛ[Z\ÜÚ[Û”˜]NŠX\™YQ™YT˜]JŒL
KÑš^Y
ŠK[]™\T˜]NŠ[]™\Q™YT˜]JŒL
KÑš^Y
Š_J_OÜ‚ˆÛ\ÜÓ˜[YOH^[]]YY›Ü™YÜ›İ[™Ùš\Ú\œË™š[™

ŠHOˆ‹šYOOHÙ[™š\Ú\’Y
OË˜›Ø]H0­Èİ
[ÙJ_OÜ‚ˆÙ]ŸBˆ]ÛˆÛ\ÜÓ˜[YOH˜ˆˆ\ØX›Y^È\ÚYÛ™Y[ŸOİ
‘[›ŞY\ˆH°ê\Ù\˜][ÛˆŠ_OØ]Û‚ˆÛ\ÜÓ˜[YOH^^È^[]]YY›Ü™YÜ›İ[™İ
“H°ê\Ù\˜][Ûˆ\İ[œ™YÚ\İ°êYH[œÈH˜\ÙH\YğêYH]š\ÚX›H\ˆH0ê˜Ú]\‹ˆŠ_OÜ‚ˆÏŸBˆÙ›Ü›O‚ˆÙXİ[Û‚ˆˆÛ\ÜÓ˜[YOH›X‹M^^›Û\Ù[ZX›Ûİ
“Y\È°ê\Ù\˜][ÛœÈŠ_OÚ‚ˆÛÜ™\œÓØY[™ÈÈÛ\ÜÓ˜[YOH^\ÛH^[]]YY›Ü™YÜ›İ[™İ
Ú\™Ù[Y[\ÈÛÛ[X[™\ø )ˆŠ_OÜˆˆÜ™\œË›[™İOOHÈ[\Oİ
]Xİ[™H°ê\Ù\˜][Ûˆ°êY[Hİ\ˆH[ÛY[ˆŠ_OÑ[\Oˆ‚ˆ[Û\ÜÓ˜[YOH™ÜšYØ\LÈÛÜ™\œË›X\

ÊHOˆÂˆÛÛœİÈHØ]Ú\Ë™š[™


HOˆšYOOHË˜Ø]ÚÚY
NÂˆÛÛœİİ]\ÈH
ÈİX›Z]Yˆ™[›ŞpêYH‹ÛÛ™š\›YYˆ˜ÛÛ™š\›pêYH‹™XYNˆœ°êH‹[]™\™Yˆ›]œ°êYHˆH\È™XÛÜ™İš[™Ë™[›ŞpêYHŸ˜ÛÛ™š\›pêYHŸœ°êHŸ›]œ°êYHŠVÛËœİ]\×HÏÈ™[›ŞpêYHÂˆ™]\›ˆHÙ^O^ÛËšYHÛ\ÜÓ˜[YOH˜Ø\™M‚ˆ]ˆÛ\ÜÓ˜[YOH™›^\İYKX™]ÙY[ˆØ\Lˆİ›Û™ÏØÏË™[[Úš_Hİ
ÏËœÜXÚY\ÈÏÈ”›ÙZ]Š_H0­ÈÓ[X™\ŠËœ]X[]WÚÙÊ_HÙÏÜİ›Û™ÏÜ[ˆÛ\ÜÓ˜[YOH^\ÛH›Û\Ù[ZX›ÛÙØœ
[X™\ŠËİ[Ø[[İ[ÏÊ[X™\ŠËœ›ÙXİÜİXİ[ÏÌ
JÓ[X™\ŠË›X\™YWÙ™YOÏÌ
JÓ[X™\ŠË™[]™\WÙ™YOÏÌ
JÓ[X™\ŠË\Ø[[İ[ÏÌ
JJJ_OÜÜ[Ù]‚ˆÛ\ÜÓ˜[YOH›X‹LH^\ÛH^[]]YY›Ü™YÜ›İ[™İ
Ë™[š[Y[OOH™[]™\HˆÈ“]œ˜Z\ÛÛˆˆˆ”™]˜Z]Š_H0­ÈÙ
Ëœ™\]Y\İYÜÛİ
_OÜ‚ˆÛ\ÜÓ˜[YOH›X‹LÈ^^È^[]]YY›Ü™YÜ›İ[™İ
”›ÙZ]ÈŠ_HÙØœ
[X™\ŠËœ›ÙXİÜİXİ[ÏÌ
J_H0­Èİ
”İ\˜›Ú\™HŠ_HÙØœ
[X™\ŠË\Ø[[İ[ÏÌ
J_H0­Èİ
ÛÛ[Z\ÜÚ[ÛˆŠ_HÙØœ
[X™\ŠË›X\™YWÙ™YOÏÌ
J_H0­Èİ
“]œ˜Z\ÛÛˆŠ_HÙØœ
[X™\ŠË™[]™\WÙ™YOÏÌ
J_OÜ‚ˆÛËœİ]\ÏOOH˜Ø[˜Ù[YÏÜ[ˆÛ\ÜÓ˜[YOHš[›[™KY›^›İ[™YY[™ËY\İXİ]™KÌMHL‹HKLH^^È›Û\Ù[ZX›Û^Y\İXİ]™Hİ
[›[0êYHŠ_OÜÜ[Ó[X™\ŠË˜Ø[˜Ù[][Û—Ü[˜[OÏÌ
OŒ	‰Û\ÜÓ˜[YOH›]Lˆ^\ÛHİ
”0ê[˜[]0êHXØÙ\0êYHŠ_Hˆİ›Û™ÏÙØœ
[X™\ŠË˜Ø[˜Ù[][Û—Ü[˜[JJ_OÜİ›Û™ÏÜŸOÏÜ™\”İ\ÈÏ^Üİ]\ßHÏÛË˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÏOOHœ[™[™È‰‰Û\ÜÓ˜[YOH›]Lˆ›İ[™Y[È™Ë\ÙXÛÛ™\HLÈ^\ÛHİ
‘[X[™H8 &X[›[][Ûˆ\™]™H[›ŞpêYKˆ[ˆ][HHH0êXÚ\Ú[ÛˆH0ê˜Ú]\‹ˆŠ_OÜŸ^ÛË˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÏOOHœ™Z™XİY‰‰Û\ÜÓ˜[YOH›]Lˆ›İ[™Y[È™Ë\ÙXÛÛ™\HLÈ^\ÛHİ
[›[][Ûˆ\™]™H™Y\ğêYKˆHÛÛ[X[™H™\İHXİ]™KˆŠ_OÜŸ^ÛË˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÏOOH›Ù™™\™Y‰‰]ˆÛ\ÜÓ˜[YOH›]LÈ›İ[™Y[È›Ü™\ˆ›Ü™\‹X›Ü™\ˆLÈÛ\ÜÓ˜[YOH^\ÛHİ
“H0ê˜Ú]\ˆXØÙ\H8 &X[›[][ÛˆÛİ\ÈÙ]HÛÛ™][Ûˆˆ0ê[˜[]0êHHŠ_Hİ›Û™ÏÙØœ
[X™\ŠË˜Ø[˜Ù[][Û—Ü[˜[OÏÌ
J_OÜİ›Û™Ï‹ÜÛ\ÜÓ˜[YOH›]LH^^È^[]]YY›Ü™YÜ›İ[™İ
“HÛÛ[X[™H™HÙ\˜H[›[0êYH]x &X\°êÈ›İ™HXØÙ\][Û‹ˆÚH›İ\È™Y\Ù^‹HÛÛ[X[™H™\İHXİ]™KˆŠ_OÜ]ˆÛ\ÜÓ˜[YOH›]Lˆ›^›^XÛÛØ\LˆÛN™›^\›İÈ]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆ‹XXØÙ[^\ÛHˆÛÛXÚÏ^Ø\Ş[˜Ê
OOİ^Ø]ØZ]™\ÜÛ™^SÜ™\Ø[˜Ù[][ÛŠËšYYJNİØ\İœİXØÙ\ÜÊ
[›[][ÛˆÛÛ™š\›pêYKˆŠJNØ]ØZ]ØYÜ™\œÊ
NØ]ØZ]™Yœ™\Ú

NßXØ]Ú
J^İØ\İ™\œ›ÜŠH[œİ[˜Ù[Ùˆ\œ›Üİ
K›Y\ÜØYÙJN
’[\ÜÜÚX›HHÛÛ™š\›Y\ˆ8 &X[›[][Û‹ˆŠJNß__Oİ
XØÙ\\ˆH0ê[˜[]0êH][›[\ˆŠ_OØ]Û]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆ^\ÛHˆÛÛXÚÏ^Ø\Ş[˜Ê
OOİ^Ø]ØZ]™\ÜÛ™^SÜ™\Ø[˜Ù[][ÛŠËšY˜[ÙJNİØ\İœİXØÙ\ÜÊ
“Ù™œ™H™Y\ğêYKÛÛ[X[™HXZ[[YKˆŠJNØ]ØZ]ØYÜ™\œÊ
NßXØ]Ú
J^İØ\İ™\œ›ÜŠH[œİ[˜Ù[Ùˆ\œ›Üİ
K›Y\ÜØYÙJN
’[\ÜÜÚX›HH°ê\Û™™H0è8 &[Ù™œ™KˆŠJNß__Oİ
”™Y\Ù\‹Ø\™\ˆHÛÛ[X[™HŠ_OØ]ÛÙ]Ù]Ÿ^ÊËœİ]\ÏOOHœİX›Z]YŸËœİ]\ÏOOH˜ÛÛ™š\›YYŠI‰›Ë˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÈOOHœ[™[™È‰‰›Ë˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÈOOH›Ù™™\™Y‰‰›Ë˜Ø[˜Ù[][Û—Ü™\]Y\İÜİ]\ÈOOHœ™Z™XİY‰‰]ˆÛ\ÜÓ˜[YOH›]LÈ›İ[™Y[È›Ü™\ˆ›Ü™\‹X›Ü™\ˆLÈÛ\ÜÓ˜[YOH^^È^[]]YY›Ü™YÜ›İ[™Û™]È]JËœ™\]Y\İYÜÛİ
K™Ù][YJ
KQ]K››İÊ
OL
Œ
Œ
ŒLİ
[›[][ÛˆÜ˜]Z]HÜÜÚX›H\Ü]x &pè]˜[HÜ°ê[™X]KˆŠN
“[Ú[œÈH]˜[HÜ°ê[™X]HˆH0ê˜Ú]\ˆ0êXÚYHø &Z[XØÙ\H8 &X[›[][Ûˆ]š^Hİ]H0ê[˜[]0êH0ê]™[Y[Kˆ›İ\È]œ™^ˆXØÙ\\ˆÙ]H0ê[˜[]0êH]˜[8 &X[›[][Û‹ˆŠ_OÜ]Ûˆ\OH˜]ÛˆˆÛ\ÜÓ˜[YOH˜ˆ]LˆËY[^\ÛHˆÛÛXÚÏ^Ø\Ş[˜Ê
OOİ^ØÛÛœİ™\İ[X]ØZ]™\]Y\İ^SÜ™\Ø[˜Ù[][ÛŠËšY
NİØ\İœİXØÙ\ÜÊ™\İ[OOH˜Ø[˜Ù[Yİ
ÛÛ[X[™H[›[0êYHÜ˜]Z][Y[ˆŠN
‘[X[™H˜[œÛZ\ÙH]H0ê˜Ú]\ˆİ\ˆ0êXÚ\Ú[Û‹ˆŠJNØ]ØZ]ØYÜ™\œÊ
NØ]ØZ]™Yœ™\Ú

NßXØ]Ú
J^İØ\İ™\œ›ÜŠH[œİ[˜Ù[Ùˆ\œ›Üİ
K›Y\ÜØYÙJN
’[\ÜÜÚX›HH[X[™\ˆ8 &X[›[][Û‹ˆŠJNß__Oİ
‘[X[™\ˆ8 &X[›[][ÛˆŠ_OØ]ÛÙ]ŸOÏŸBˆÛOÂˆJ_Oİ[ŸBˆÜÙXİ[Û‚ˆÙ]‚ˆÏŸBˆÙ]ÂŸB‚™[˜İ[ÛˆY]šXÊÛX™[˜[YK]Z[NÛX™[œİš[™Îİ˜[YNœİš[™ß[X™\Ù]Z[œİš[™ßJ^Ü™]\›ˆ]ˆÛ\ÜÓ˜[YOH˜Ø\™›İ[™YL›Ü™\ˆ›Ü™\‹X›Ü™\ˆMHÛ\ÜÓ˜[YOH^^È›Û\Ù[ZX›Û\\˜Ø\ÙH˜XÚÚ[™Ë]ÚY\ˆ^[]]YY›Ü™YÜ›İ[™ÛX™[OÜÛ\ÜÓ˜[YOH›]Lˆ›ÛY\Ü^H^LŞ›Û\Ù[ZX›Û^Y›Ü™YÜ›İ[™İ˜[Y_OÜÛ\ÜÓ˜[YOH›]LH^^È^[]]YY›Ü™YÜ›İ[™Ù]Z[OÜÙ]ßB