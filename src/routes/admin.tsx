import { useCallback, useEffect, useState } from "react";
import { AdminMfaBackupSetup, AdminMfaGate } from "@/components/admin-mfa-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Marée Jersey" },
      { name: "description", content: "Gestion sécurisée des demandes de vérification Marée Jersey." },
    ],
  }),
  component: Admin,
});

type AdminOrder = { id: string; catch_id: string; quantity_kg: number; status: string; created_at: string; product_subtotal:number|string|null; maree_fee:number|string|null; delivery_fee:number|string|null; delivery_fee_payer_snapshot:'buyer'|'fisher'; tip_amount:number|string; fisher_payment_status:"unpaid"|"paid"|"waived" };
type AdminCommissionInvoice = { id:string; restaurant_id:string; period_start:string; period_end:string; due_date:string; commission_total:number|string; delivery_total:number|string; status:"open"|"declared_paid"|"paid"|"void"; declared_at:string|null; payment_method:string|null; payment_reference:string|null };
type VerificationDocument = { id:string; request_id:string; original_filename:string; document_type:string; file_path:string; expires_at:string|null; review_status:string; reviewer_note:string|null; signed_url?:string|null };

type VerificationRequest = {
  id: string;
  user_id: string;
  requested_role: "fisher" | "restaurant";
  business_name: string;
  contact_name: string;
  phone: string;
  registration_number: string | null;
  evidence_note: string;
  fisher_category: "independent" | "professional" | null;
  compliance_details: Record<string, unknown> | null;
  created_at: string;
};

function Admin() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [allOrders, setAllOrders] = useState<AdminOrder[]>([]);
  const [commissionInvoices, setCommissionInvoices] = useState<AdminCommissionInvoice[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportingError,setReportingError] = useState<string|null>(null);
  const [mareeFeePercent,setMareeFeePercent]=useState('6.5');
  const [deliveryFeePercent,setDeliveryFeePercent]=useState('20');
  const [deliveryFeePayer,setDeliveryFeePayer]=useState<'buyer'|'fisher'>('buyer');
  const [commercialError,setCommercialError]=useState<string|null>(null);
  const [savingCommercial,setSavingCommercial]=useState(false);

  const documentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      fishing_licence: "Licence de pêche",
      vessel_registration: "Immatriculation du bateau",
      business_licence: "Business licence",
      safety_training: "Formation sécurité",
      species_permit: "Permis espèces / engins",
      food_business_registration: "Enregistrement Food Business",
      food_safety_plan: "Plan hygiène / HACCP",
      other: "Autre",
    };
    return t(labels[type] ?? "Autre");
  };
  const complianceLabels: Record<string, string> = {
    vessel_name: "Nom du bateau (si applicable)",
    home_port: "Port d’attache",
    fishing_licence_ref: "Référence licence de pêche commerciale (si applicable)",
    vessel_registration_ref: "Immatriculation / registre du navire (si applicable)",
    business_licence_ref: "Business licence",
    safety_training_ref: "Formation ou certificat de sécurité (si applicable)",
    species_permits: "Permis particuliers / espèces / engins (si applicable)",
    food_business_ref: "Enregistrement Food Business / Environmental Health (si applicable)",
    food_safety_system: "Système de sécurité alimentaire adapté (HACCP si requis)",
    clean_water_ice: "Eau potable et glace propre adaptées au contact alimentaire",
    cold_chain: "Maîtrise du refroidissement et de la chaîne du froid",
    clean_equipment: "Surfaces, outils et contenants nettoyés et désinfectés",
    personal_hygiene: "Hygiène personnelle et tenue de travail adaptées",
    separation_and_contamination: "Prévention des contaminations croisées",
    catch_traceability: "Traçabilité de l’origine, date, zone et lot de chaque prise",
    legal_sales_confirmation: "Je confirme que mon activité et la vente sont autorisées selon les règles qui me sont applicables à Jersey",
    notes: "Notes complémentaires",
  };

  const reviewDocument = async (documentId: string, reviewStatus: "pending" | "approved" | "rejected" | "not_applicable") => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { toast.error(t("Session administrateur requise.")); return; }
    const { error: updateError } = await supabase.from("verification_documents").update({ review_status: reviewStatus, reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq("id", documentId);
    if (updateError) { toast.error(t("Une erreur technique est survenue. Réessayez.")); return; }
    setDocuments((current) => current.map((doc) => doc.id === documentId ? { ...doc, review_status: reviewStatus } : doc));
    toast.success(t("Statut du justificatif mis à jour."));
  };

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        setIsAdmin(false);
        setMfaRequired(false);
        setRequests([]);
        return;
      }
      const { data: adminAccess, error: adminAccessError } = await supabase.rpc("is_current_user_admin");
      if (adminAccessError) throw adminAccessError;
      if (adminAccess !== true) {
        setIsAdmin(false);
        setMfaRequired(false);
        setRequests([]);
        setError(t("Accès réservé à l’équipe d’administration."));
        return;
      }
      setIsAdmin(true);
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== "aal2") {
        setMfaRequired(true);
        setLoading(false);
        return;
      }
      setMfaRequired(false);
      // Load verification requests independently so a reporting query cannot
      // prevent admins from reviewing pending fishermen/restaurants.
      const { data: data, error: requestsError } = await supabase
        .from("verification_requests")
        .select("id,user_id,requested_role,business_name,contact_name,phone,registration_number,evidence_note,fisher_category,compliance_details,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (requestsError) throw requestsError;
      setRequests((data ?? []) as VerificationRequest[]);
      const requestIds = (data ?? []).map((item) => item.id);
      if (requestIds.length) {
        const { data: docs, error: docsError } = await supabase.from("verification_documents").select("id,request_id,original_filename,document_type,file_path,expires_at,review_status,reviewer_note").in("request_id", requestIds);
        if (docsError) throw docsError;
        const hydrated = await Promise.all((docs ?? []).map(async (doc) => { const { data: signed } = await supabase.storage.from("fisher-compliance").createSignedUrl(doc.file_path, 300); return { ...doc, signed_url: signed?.signedUrl ?? null }; }));
        setDocuments(hydrated as VerificationDocument[]);
      } else setDocuments([]);

      // Dashboard figures are secondary: a metrics/RLS issue must not block approvals.
      const { data: orderRows, error: orderError } = await supabase.from("orders")
        .select("id,catch_id,quantity_kg,status,created_at,product_subtotal,maree_fee,delivery_fee,delivery_fee_payer_snapshot,tip_amount,fisher_payment_status")
        .order("created_at", { ascending: false });
      if (!orderError) {
        setAllOrders((orderRows ?? []) as AdminOrder[]);
        setReportingError(null);
      } else {
        setAllOrders([]);
        setReportingError(t("Données financières indisponibles : vérifiez la synchronisation du schéma Supabase."));
      }
      const { data: commissionRows, error: commissionError } = await supabase
        .from("maree_monthly_commission_invoices")
        .select("id,restaurant_id,period_start,period_end,due_date,commission_total,delivery_total,status,declared_at,payment_method,payment_reference")
        .order("period_start", { ascending: false });
      if (!commissionError) setCommissionInvoices((commissionRows ?? []) as AdminCommissionInvoice[]);
      if (commissionError) {
        setReportingError(t("Relevés financiers Marée indisponibles : vérifiez la synchronisation du schéma Supabase."));
        console.warn("Marée commission statements could not be loaded", commissionError);
      }
      const {data:commercialRows,error:commercialLoadError}=await supabase.rpc('get_maree_commercial_settings');
      if(commercialLoadError){setCommercialError(t('Paramètres commerciaux indisponibles.'));console.warn('Commercial settings could not be loaded',commercialLoadError);}
      else {const commercial=Array.isArray(commercialRows)?commercialRows[0]:commercialRows;if(commercial){setMareeFeePercent((Number(commercial.maree_fee_rate)*100).toString());setDeliveryFeePercent((Number(commercial.delivery_fee_rate)*100).toString());setDeliveryFeePayer(commercial.delivery_fee_payer==='fisher'?'fisher':'buyer');setCommercialError(null);}}
      if (orderError) {
        console.warn("Admin reporting data could not be fully loaded", { orderError });
      }
    } catch (cause) {
      setError(t("Impossible de charger les demandes."));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const handleMfaVerified = useCallback(() => { void loadRequests(); }, [loadRequests]);

  const saveCommercialSettings = async () => {
    const commission=Number(mareeFeePercent),delivery=Number(deliveryFeePercent);
    if(!Number.isFinite(commission)||commission<0||commission>100||!Number.isFinite(delivery)||delivery<0||delivery>100){toast.error(t('Les taux doivent être compris entre 0 et 100 %.'));return;}
    setSavingCommercial(true);
    try {
      const {error:saveError}=await supabase.rpc('update_maree_commercial_settings',{p_maree_fee_percent:commission,p_delivery_fee_percent:delivery,p_delivery_fee_payer:deliveryFeePayer});
      if(saveError) throw saveError;
      toast.success(t('Paramètres commerciaux enregistrés. Les nouvelles commandes utiliseront ces valeurs.'));
      setCommercialError(null);
    } catch (saveError) {
      toast.error(t('Impossible d’enregistrer les paramètres commerciaux.'));
      console.warn('Commercial settings update failed',saveError);
    } finally {
      setSavingCommercial(false);
    }
  };

  const verifyCommissionPayment = async (invoiceId: string) => {
    setBusyId(invoiceId);
    const { error: verifyError } = await supabase.rpc("verify_maree_commission_invoice_paid", { p_invoice_id: invoiceId });
    setBusyId(null);
    if (verifyError) { toast.error(t("Une erreur technique est survenue. Réessayez.")); return; }
    toast.success(t("Paiement Marée vérifié et enregistré."));
    setCommissionInvoices((current) => current.map((invoice) => invoice.id === invoiceId ? { ...invoice, status: "paid" } : invoice));
  };

  const review = async (requestId: string, status: "approved" | "rejected") => {
    setBusyId(requestId);
    const { error: reviewError } = await supabase.rpc("review_verification_request", {
      p_request_id: requestId,
      p_status: status,
      p_reviewer_note: notes[requestId]?.trim() || null,
    });
    setBusyId(null);
    if (reviewError) {
      toast.error(t("Une erreur technique est survenue. Réessayez."));
      return;
    }
    toast.success(status === "approved" ? t("Demande approuvée. Le rôle professionnel a été attribué.") : t("Demande refusée."));
    setRequests((current) => current.filter((request) => request.id !== requestId));
  };

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Marée Jersey · {t("Admin")}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{t("Vérifications professionnelles")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("Examinez les demandes avant d’accorder les droits pêcheur ou restaurant.")}</p>
        </div>
        <button className="btn" type="button" onClick={() => void loadRequests()} disabled={loading}>{t("Actualiser")}</button>
      </header>

      {isAdmin && mfaRequired && <AdminMfaGate onVerified={handleMfaVerified} />}
      {isAdmin && !loading && !mfaRequired && <AdminMfaBackupSetup />}

      {isAdmin && !loading && !mfaRequired && <section className="card grid gap-4 p-5">
        <div><h2 className="font-display text-2xl font-semibold">{t('Paramètres commerciaux')}</h2><p className="text-sm text-muted-foreground">{t('Ces réglages s’appliquent uniquement aux nouvelles réservations. Les commandes existantes conservent leurs taux et leur payeur d’origine.')}</p></div>
        {commercialError&&<p role="alert" className="text-sm text-destructive">{commercialError}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">{t('Commission Marée (%)')}<input className="field" type="number" min="0" max="100" step="0.01" value={mareeFeePercent} onChange={e=>setMareeFeePercent(e.target.value)}/></label>
          <label className="grid gap-1 text-sm font-medium">{t('Frais de livraison (%)')}<input className="field" type="number" min="0" max="100" step="0.01" value={deliveryFeePercent} onChange={e=>setDeliveryFeePercent(e.target.value)}/></label>
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">{t('Qui paie les frais de livraison ?')}<select className="field" value={deliveryFeePayer} onChange={e=>setDeliveryFeePayer(e.target.value as 'buyer'|'fisher')}><option value="buyer">{t('Acheteur / restaurant')}</option><option value="fisher">{t('Pêcheur — déduit de son règlement')}</option></select></label>
        </div>
        <p className="text-xs text-muted-foreground">{t('Si le pêcheur paie, les frais sont retenus sur son montant à recevoir et ne sont pas ajoutés au relevé Marée du restaurant. Le choix est figé sur chaque commande.')}</p>
        <button type="button" className="btn btn-accent w-fit" disabled={savingCommercial||Boolean(commercialError)} onClick={()=>void saveCommercialSettings()}>{savingCommercial?t('Enregistrement…'):t('Enregistrer les paramètres')}</button>
      </section>}
      {isAdmin && !loading && !mfaRequired && (() => {
        const deliveredOrders = allOrders.filter((order) => order.status === "delivered");
        const deliveredBase = deliveredOrders.reduce((sum, order) => sum + Number(order.product_subtotal ?? 0), 0);
        const tips = deliveredOrders.reduce((sum,order)=>sum+Number(order.tip_amount??0),0);
        const fisherDue = deliveredOrders.filter(order=>order.fisher_payment_status==="unpaid").reduce((sum,order)=>sum+Number(order.product_subtotal??0)+Number(order.tip_amount??0)-(order.delivery_fee_payer_snapshot==='fisher'?Number(order.delivery_fee??0):0),0);
        const fisherPaid = deliveredOrders.filter(order=>order.fisher_payment_status==="paid").reduce((sum,order)=>sum+Number(order.product_subtotal??0)+Number(order.tip_amount??0)-(order.delivery_fee_payer_snapshot==='fisher'?Number(order.delivery_fee??0):0),0);
        const mareeCommission = deliveredOrders.reduce((sum, order) => sum + Number(order.maree_fee ?? 0), 0);
        const mareeDeliveryBuyer = deliveredOrders.reduce((sum, order) => sum + (order.delivery_fee_payer_snapshot==='buyer'?Number(order.delivery_fee ?? 0):0), 0);
        const mareeDeliveryFisher = deliveredOrders.reduce((sum, order) => sum + (order.delivery_fee_payer_snapshot==='fisher'?Number(order.delivery_fee ?? 0):0), 0);
        const mareeDelivery = mareeDeliveryBuyer + mareeDeliveryFisher;
        const mareePaid = commissionInvoices.filter(invoice=>invoice.status==="paid").reduce((sum,invoice)=>sum+Number(invoice.commission_total)+Number(invoice.delivery_total),0);
        const mareeOutstanding = Math.max(0,mareeCommission+mareeDeliveryBuyer-mareePaid);
        const fmt = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
        return <section className="grid gap-4">
          <div><h2 className="font-display text-2xl font-semibold">{t("Vue d’ensemble de la plateforme")}</h2><p className="text-sm text-muted-foreground">{t("Montants calculés à partir des snapshots de commande ; aucun encaissement réel n’est activé.")}</p></div>
          {reportingError&&<p role="alert" className="text-sm text-destructive">{reportingError}</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Commandes totales")}</p><p className="mt-1 text-2xl font-semibold">{allOrders.length}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Volume livré (base)")}</p><p className="mt-1 text-2xl font-semibold">{fmt(deliveredBase)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Pourboires")}</p><p className="mt-1 text-2xl font-semibold">{fmt(tips)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Dette pêcheurs")}</p><p className="mt-1 text-2xl font-semibold">{fmt(fisherDue)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Paiements pêcheurs confirmés")}</p><p className="mt-1 text-2xl font-semibold">{fmt(fisherPaid)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Commission Marée ({rate} %)",{rate:(Number(mareeFeePercent)||0).toString()})}</p><p className="mt-1 text-2xl font-semibold">{fmt(mareeCommission)}</p></div>
          </div>
          <div className="card grid gap-3 p-5 sm:grid-cols-2">
            <div><p className="text-sm text-muted-foreground">{t("Frais de livraison Marée")}</p><p className="font-display text-3xl font-semibold text-accent">{fmt(mareeDelivery)}</p><p className="text-xs text-muted-foreground">{t("Dont retenus sur les pêcheurs")}: {fmt(mareeDeliveryFisher)}</p></div>
            <div><p className="text-sm text-muted-foreground">{t("Dette Marée à régler")}</p><p className="font-display text-3xl font-semibold">{fmt(mareeOutstanding)}</p></div>
            <div><p className="text-sm text-muted-foreground">{t("Paiements Marée vérifiés")}</p><p className="font-display text-3xl font-semibold">{fmt(mareePaid)}</p></div>
            <div className="text-sm text-muted-foreground">{t("En attente")}: <strong>{allOrders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length}</strong></div>
          </div>
          <p className="text-xs text-muted-foreground">{t("Les montants proviennent des prix et frais figés à la réservation : la livraison est soit facturée au restaurant, soit retenue sur le règlement du pêcheur. La commission Marée reste due par le restaurant. Aucun paiement en ligne n’est activé.")}</p>
        </section>;
      })()}
      {isAdmin && !loading && !mfaRequired && <section className="card grid gap-3 p-5">
        <div><h2 className="font-display text-2xl font-semibold">{t("Commissions Marée à vérifier")}</h2><p className="text-sm text-muted-foreground">{t("Les restaurants déclarent leurs règlements hors plateforme. Seule cette validation administrative marque le relevé comme payé.")}</p></div>
        {commissionInvoices.length===0 ? <p className="text-sm text-muted-foreground">{t("Aucun relevé mensuel de commission généré.")}</p> :
          <ul className="grid gap-2">{commissionInvoices.map((invoice)=><li key={invoice.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap justify-between gap-2"><strong>{t("Restaurant")} · {invoice.restaurant_id.slice(0,8).toUpperCase()} · {invoice.period_start} — {invoice.period_end}</strong><strong>{new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(invoice.commission_total)+Number(invoice.delivery_total))}</strong></div>
            <p className="text-xs text-muted-foreground">{t("Commission Marée")} : {new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(invoice.commission_total))} · {t("Livraison facturée au restaurant")} : {new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(invoice.delivery_total))}</p>
            <p className="text-sm text-muted-foreground">{t("Échéance")} : {invoice.due_date} · {invoice.status==="paid"?t("Vérifié / payé"):invoice.status==="declared_paid"?t("Déclaré — à vérifier"):invoice.status==="void"?t("Annulé"):t("Ouvert — non déclaré")}</p>
            {invoice.payment_method&&<p className="text-xs text-muted-foreground">{invoice.payment_method} {invoice.payment_reference?("· "+invoice.payment_reference):""}</p>}
            {invoice.status==="declared_paid"&&<button type="button" className="btn btn-accent mt-3" disabled={busyId!==null} onClick={()=>void verifyCommissionPayment(invoice.id)}>{t("Vérifier le paiement reçu")}</button>}
          </li>)}</ul>}
      </section>}
      {loading ? (
        <p role="status" className="card p-6 text-sm text-muted-foreground">{t("Chargement des demandes…")}</p>
      ) : !isAdmin ? (
        <section className="card grid gap-3 p-6">
          <p role="alert" className="text-sm">{error ?? t("Connectez-vous avec un compte administrateur.")}</p>
          <Link className="btn btn-accent w-fit" to="/connexion">{t("Connexion")}</Link>
        </section>
      ) : mfaRequired ? null : (
        <>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <section className="card grid gap-2 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Demandes en attente")}</p>
            <p className="font-display text-3xl font-semibold">{requests.length}</p>
          </section>
          {requests.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted-foreground">{t("Aucune demande en attente.")}</div>
          ) : requests.map((request) => (
            <article key={request.id} className="card grid gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{request.business_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {request.requested_role === "fisher" ? t("Pêcheur / pêcheuse") : t("Restaurant")} · {new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : language === "ro" ? "ro-RO" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Jersey" }).format(new Date(request.created_at))}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{t("En attente")}</span>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">{t("Responsable")}</dt><dd className="font-medium">{request.contact_name}</dd></div>
                <div><dt className="text-muted-foreground">{t("Téléphone professionnel")}</dt><dd className="font-medium">{request.phone}</dd></div>
                <div><dt className="text-muted-foreground">{t("Numéro d’enregistrement")}</dt><dd className="font-medium">{request.registration_number || "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t("Identifiant du compte")}</dt><dd className="break-all font-mono text-xs">{request.user_id}</dd></div>
              </dl>
              <div className="rounded-lg bg-secondary p-4 text-sm">
                <p className="mb-1 font-semibold">{t("Informations fournies")}</p>
                <p className="whitespace-pre-wrap">{request.evidence_note}</p>
              </div>
              {request.requested_role === "fisher" && <div className="rounded-lg border p-4 text-sm">
                <strong>{request.fisher_category === "independent" ? t("Petit pêcheur indépendant") : t("Pêcheur professionnel")}</strong>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(request.compliance_details ?? {}).filter(([key, value]) => key in complianceLabels && value !== null && value !== "").map(([key, value]) => <div key={key} className="rounded-md bg-secondary/50 p-2"><dt className="text-xs text-muted-foreground">{t(complianceLabels[key] ?? "Autre")}</dt><dd className="mt-1 break-words font-medium">{typeof value === "boolean" ? t(value ? "Oui" : "Non") : String(value)}</dd></div>)}</dl>
                <p className="mt-2 text-xs text-muted-foreground">{t("Déclarations à contrôler avec les justificatifs avant approbation.")}</p>
              </div>}
              {request.requested_role === "fisher" && <section className="grid gap-2 rounded-lg border p-4"><h3 className="font-semibold">{t("Justificatifs privés")}</h3>{documents.filter((doc) => doc.request_id === request.id).length === 0 ? <p className="text-sm text-muted-foreground">{t("Aucun justificatif déposé.")}</p> : documents.filter((doc) => doc.request_id === request.id).map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"><div><p className="text-sm font-medium">{documentTypeLabel(doc.document_type)} · {doc.original_filename}</p><p className="text-xs text-muted-foreground">{doc.expires_at ? t("Expiration") + " : " + doc.expires_at : t("Expiration non renseignée")} · {t(doc.review_status === "pending" ? "À examiner" : doc.review_status === "approved" ? "Validé" : doc.review_status === "rejected" ? "Refusé" : "Non applicable")}{doc.expires_at && new Date(doc.expires_at + "T00:00:00") < new Date() ? " · " + t("Expiré") : doc.expires_at && new Date(doc.expires_at + "T00:00:00") < new Date(Date.now() + 30*86400000) ? " · " + t("Expire sous 30 jours") : ""}</p><select className="field mt-1 text-xs" value={doc.review_status} onChange={(event) => void reviewDocument(doc.id, event.target.value as "pending" | "approved" | "rejected" | "not_applicable")}><option value="pending">{t("À examiner")}</option><option value="approved">{t("Validé")}</option><option value="rejected">{t("Refusé")}</option><option value="not_applicable">{t("Non applicable")}</option></select></div>{doc.signed_url && <a className="text-sm underline" href={doc.signed_url} target="_blank" rel="noreferrer">{t("Ouvrir (lien privé 5 min)")}</a>}</div>)}</section>}
              <label className="grid gap-1 text-sm font-medium">
                {t("Note à l’utilisateur (facultatif)")}
                <textarea className="field" rows={2} maxLength={2000} value={notes[request.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-accent" type="button" disabled={busyId !== null} onClick={() => void review(request.id, "approved")}>
                  {busyId === request.id ? t("Traitement…") : t("Approuver et attribuer le rôle")}
                </button>
                <button className="btn border border-destructive/40 text-destructive" type="button" disabled={busyId !== null} onClick={() => void review(request.id, "rejected")}>
                  {t("Refuser")}
                </button>
              </div>
            </article>
          ))}
        </>
      )}
      <p className="text-xs text-muted-foreground">{t("Les décisions sont vérifiées côté base de données. Seul un administrateur autorisé peut traiter une demande.")}</p>
    </main>
  );
}
