import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/email-review")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
    action: search.action === "approved" || search.action === "rejected" ? search.action : "",
  }),
  head: () => ({ meta: [{ title: "Confirmation administrateur — Marée Jersey" }] }),
  component: EmailReviewPage,
});

function EmailReviewPage() {
  const { token, action } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);
  const valid = token.length === 64 && (action === "approved" || action === "rejected");

  const confirm = async () => {
    if (!valid || busy || result) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("review-verification-email-action", {
      body: { token, action },
    });
    setBusy(false);
    if (error || !data?.ok) {
      toast.error(data?.error ?? error?.message ?? "Lien invalide ou expiré.");
      return;
    }
    setResult(action as "approved" | "rejected");
    toast.success(action === "approved" ? "Compte approuvé." : "Demande refusée.");
  };

  return <main className="mx-auto grid max-w-xl gap-5 px-4 py-12">
    <section className="card grid gap-4 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Marée Jersey · Confirmation sécurisée</p>
      <h1 className="font-display text-3xl font-semibold">Décision sur une demande</h1>
      {!valid ? <p role="alert" className="text-sm text-destructive">Ce lien est incomplet ou invalide.</p>
        : result ? <p role="status" className="text-sm">{result === "approved" ? "Le compte a été approuvé et ses droits professionnels ont été activés." : "La demande a été refusée."}</p>
        : <>
          <p className="text-sm text-muted-foreground">{action === "approved" ? "Tu vas approuver cette demande et attribuer le rôle professionnel demandé." : "Tu vas refuser cette demande. Le compte ne recevra pas les droits professionnels."}</p>
          <p className="text-xs text-muted-foreground">La décision ne sera prise qu'après ce clic. Le lien est à usage unique et expire après 24 heures.</p>
          <button className={action === "approved" ? "btn btn-accent" : "btn border border-destructive/40 text-destructive"} type="button" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Traitement…" : action === "approved" ? "Confirmer l’approbation" : "Confirmer le refus"}
          </button>
        </>}
      <Link className="btn w-fit" to="/admin">Ouvrir l’espace administrateur</Link>
    </section>
  </main>;
}
