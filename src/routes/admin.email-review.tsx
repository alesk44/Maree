import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/admin/email-review")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
    action: search["action"] === "approved" || search["action"] === "rejected" ? search["action"] : "",
  }),
  head: () => ({ meta: [
    { title: "Confirmation administrateur — Marée Jersey" },
    { name: "referrer", content: "no-referrer" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: EmailReviewPage,
});

function EmailReviewPage() {
  const { token, action } = Route.useSearch();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);
  const valid = token.length === 64 && (action === "approved" || action === "rejected");

  const confirm = async () => {
    if (!valid || busy || result) return;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      toast.error(t("Connectez-vous avec le compte administrateur dans un autre onglet, puis revenez confirmer ici."));
      return;
    }

    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") {
      toast.error(t("Une session administrateur avec MFA vérifiée est obligatoire pour confirmer cette décision."));
      return;
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_current_user_admin");
    if (adminError || isAdmin !== true) {
      toast.error(t("Accès administrateur non autorisé."));
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("review-verification-email-action", {
      body: { token, action },
    });
    setBusy(false);
    if (error || !data?.ok) {
      toast.error(data?.error ?? error?.message ?? t("Lien invalide ou expiré."));
      return;
    }
    setResult(action as "approved" | "rejected");
    toast.success(action === "approved" ? t("Compte approuvé.") : t("Demande refusée."));
  };

  return <main className="mx-auto grid max-w-xl gap-5 px-4 py-12">
    <section className="card grid gap-4 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("Marée Jersey · Confirmation sécurisée")}</p>
      <h1 className="font-display text-3xl font-semibold">{t("Décision sur une demande")}</h1>
      {!valid ? <p role="alert" className="text-sm text-destructive">{t("Ce lien est incomplet ou invalide.")}</p>
        : result ? <p role="status" className="text-sm">{result === "approved" ? t("Le compte a été approuvé et ses droits professionnels ont été activés.") : t("La demande a été refusée.")}</p>
        : <>
          <p className="text-sm text-muted-foreground">{action === "approved" ? t("Tu vas approuver cette demande et attribuer le rôle professionnel demandé.") : t("Tu vas refuser cette demande. Le compte ne recevra pas les droits professionnels.")}</p>
          <p className="text-xs text-muted-foreground">{t("La décision ne sera prise qu'après ce clic. Le lien est à usage unique et expire après 24 heures.")}</p>
          <button className={action === "approved" ? "btn btn-accent" : "btn border border-destructive/40 text-destructive"} type="button" disabled={busy} onClick={() => void confirm()}>
            {busy ? t("Traitement…") : action === "approved" ? t("Confirmer l’approbation") : t("Confirmer le refus")}
          </button>
        </>}
      <Link className="btn w-fit" to="/admin">{t("Ouvrir l’espace administrateur")}</Link>
    </section>
  </main>;
}
