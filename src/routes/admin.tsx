import { useCallback, useEffect, useState } from "react";
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

type AdminOrder = { id: string; catch_id: string; quantity_kg: number; status: string; created_at: string };
type AdminCatch = { id: string; species: string; price_per_kg: number; fisher_id: string };

type VerificationRequest = {
  id: string;
  user_id: string;
  requested_role: "fisher" | "restaurant";
  business_name: string;
  contact_name: string;
  phone: string;
  registration_number: string | null;
  evidence_note: string;
  created_at: string;
};

function Admin() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [allOrders, setAllOrders] = useState<AdminOrder[]>([]);
  const [allCatches, setAllCatches] = useState<AdminCatch[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        setIsAdmin(false);
        setRequests([]);
        return;
      }
      const { data: adminAccess, error: adminAccessError } = await supabase.rpc("is_current_user_admin");
      if (adminAccessError) throw adminAccessError;
      if (adminAccess !== true) {
        setIsAdmin(false);
        setRequests([]);
        setError(t("Accès réservé à l’équipe d’administration."));
        return;
      }
      setIsAdmin(true);
      const [{ data: orderRows, error: orderError }, { data: catchRows, error: catchError }] = await Promise.all([
        supabase.from("orders").select("id,catch_id,quantity_kg,status,created_at").order("created_at", { ascending: false }),
        supabase.from("catches").select("id,species,price_per_kg,fisher_id"),
      ]);
      if (orderError) throw orderError;
      if (catchError) throw catchError;
      setAllOrders((orderRows ?? []) as AdminOrder[]);
      setAllCatches((catchRows ?? []) as AdminCatch[]);
      const { data, error: requestsError } = await supabase
        .from("verification_requests")
        .select("id,user_id,requested_role,business_name,contact_name,phone,registration_number,evidence_note,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (requestsError) throw requestsError;
      setRequests((data ?? []) as VerificationRequest[]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("Impossible de charger les demandes.");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const review = async (requestId: string, status: "approved" | "rejected") => {
    setBusyId(requestId);
    const { error: reviewError } = await supabase.rpc("review_verification_request", {
      p_request_id: requestId,
      p_status: status,
      p_reviewer_note: notes[requestId]?.trim() || null,
    });
    setBusyId(null);
    if (reviewError) {
      toast.error(reviewError.message);
      return;
    }
    toast.success(status === "approved" ? t("Demande approuvée. Le rôle professionnel a été attribué.") : t("Demande refusée."));
    setRequests((current) => current.filter((request) => request.id !== requestId));
  };

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Marée Jersey · Admin</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{t("Vérifications professionnelles")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("Examinez les demandes avant d’accorder les droits pêcheur ou restaurant.")}</p>
        </div>
        <button className="btn" type="button" onClick={() => void loadRequests()} disabled={loading}>{t("Actualiser")}</button>
      </header>

      {isAdmin && !loading && (() => {
        const lotById = new Map(allCatches.map((lot) => [lot.id, lot]));
        const deliveredBase = allOrders.filter((order) => order.status === "delivered").reduce((sum, order) => sum + (Number(lotById.get(order.catch_id)?.price_per_kg ?? 0) * Number(order.quantity_kg)), 0);
        const fmt = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
        return <section className="grid gap-4">
          <div><h2 className="font-display text-2xl font-semibold">{t("Vue d’ensemble de la plateforme")}</h2><p className="text-sm text-muted-foreground">{t("Estimations calculées sur le prix actuel des lots ; pas encore des encaissements réels.")}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Commandes totales")}</p><p className="mt-1 text-2xl font-semibold">{allOrders.length}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Volume livré (base)")}</p><p className="mt-1 text-2xl font-semibold">{fmt(deliveredBase)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Part pêcheur (6,5 %)")}</p><p className="mt-1 text-2xl font-semibold">{fmt(deliveredBase * .065)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted-foreground">{t("Part restaurant (6,5 %)")}</p><p className="mt-1 text-2xl font-semibold">{fmt(deliveredBase * .065)}</p></div>
          </div>
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div><p className="text-sm text-muted-foreground">{t("Commission Marée Jersey estimée (13 %) sur commandes livrées")}</p><p className="font-display text-3xl font-semibold text-accent">{fmt(deliveredBase * .13)}</p></div>
            <div className="text-sm text-muted-foreground">{t("En attente")}: <strong>{allOrders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length}</strong></div>
          </div>
          <p className="text-xs text-muted-foreground">{t("Important : les prix sont relus depuis les lots, pas figés à la réservation. Ces chiffres sont provisoires. Aucun paiement ni prélèvement de commission n’est activé. La commission totale de 13 % est répartie entre 6,5 % côté pêcheur et 6,5 % côté restaurant.")}</p>
        </section>;
      })()}
      {loading ? (
        <p role="status" className="card p-6 text-sm text-muted-foreground">{t("Chargement des demandes…")}</p>
      ) : !isAdmin ? (
        <section className="card grid gap-3 p-6">
          <p role="alert" className="text-sm">{error ?? t("Connectez-vous avec un compte administrateur.")}</p>
          <Link className="btn btn-accent w-fit" to="/connexion">{t("Connexion")}</Link>
        </section>
      ) : (
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
                    {request.requested_role === "fisher" ? t("Pêcheur / pêcheuse") : t("Restaurant")} · {new Date(request.created_at).toLocaleString()}
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
