import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { AuthError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/connexion")({
  head: () => ({
    meta: [
      { title: "Connexion — Marée Jersey" },
      { name: "description", content: "Connexion et création de compte Marée Jersey." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "update">("signin");
  const [busy, setBusy] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSessionEmail(data.session?.user.email ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSessionEmail(session?.user.email ?? null);
      if (event === "PASSWORD_RECOVERY") setMode("update");
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || (mode !== "reset" && password.length < 8)) {
      toast.error(t("Entrez un e-mail valide et un mot de passe d'au moins 8 caractères."));
      return;
    }
    if (mode === "signup" && !displayName.trim()) {
      toast.error(t("Entrez votre nom ou celui de votre établissement."));
      return;
    }
    setBusy(true);
    setNeedsEmailConfirmation(false);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/connexion?flow=recovery` });
        if (error) throw error;
        toast.success(t("Si cette adresse correspond à un compte, un e-mail de réinitialisation va être envoyé."));
      } else if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMode("signin");
        setPassword("");
        toast.success(t("Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter."));
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() }, emailRedirectTo: `${window.location.origin}/connexion` },
        });
        if (error) throw error;
        if (data.session) {
          setSessionEmail(data.user?.email ?? email.trim());
          toast.success(t("Compte créé. Vous êtes connecté en tant que restaurant."));
        } else {
          setNeedsEmailConfirmation(true);
          toast.success(t("Compte créé. Vérifiez votre e-mail pour confirmer l'adresse."));
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setSessionEmail(data.user.email ?? email.trim());
        toast.success(t("Connexion réussie."));
      }
    } catch (error) {
      const message = error as AuthError;
      toast.error(message?.message ?? t("La connexion a échoué."));
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/connexion` },
      });
      if (error) throw error;
    } catch (error) {
      const message = error as AuthError;
      toast.error(message?.message ?? t("La connexion avec Google a échoué."));
      setBusy(false);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    else {
      setSessionEmail(null);
      toast.success(t("Vous êtes déconnecté."));
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="card grid gap-5 p-6 sm:p-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Marée Jersey</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{t("Compte sécurisé")}</h1>
          <p className="mt-2 text-muted-foreground">{t("Créez un compte restaurant ou connectez-vous pour continuer.")}</p>
        </div>
        {sessionEmail && mode !== "update" ? (
          <div className="grid gap-4">
            <p className="rounded-lg bg-secondary p-4 text-sm">{t("Connecté en tant que")} <strong>{sessionEmail}</strong></p>
            <p className="text-sm text-muted-foreground">{t("Les comptes créés ici reçoivent le rôle restaurant. L'accès pêcheur est accordé séparément après vérification.")}</p>
            <button className="btn" onClick={signOut}>{t("Se déconnecter")}</button>
            <Link to="/catalogue" className="btn btn-accent">{t("Voir la pêche du jour")}</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary p-1">
              <button type="button" className={"rounded-md px-3 py-2 text-sm font-semibold " + (mode === "signin" ? "bg-background shadow" : "")} onClick={() => setMode("signin")}>{t("Connexion")}</button>
              <button type="button" className={"rounded-md px-3 py-2 text-sm font-semibold " + (mode === "signup" ? "bg-background shadow" : "")} onClick={() => setMode("signup")}>{t("Créer un compte")}</button>
              <button type="button" className={"rounded-md px-3 py-2 text-sm font-semibold " + (mode === "reset" ? "bg-background shadow" : "")} onClick={() => setMode("reset")}>{t("Mot de passe oublié")}</button>
            </div>
            {mode !== "reset" && mode !== "update" && (
              <>
                <button type="button" className="btn border border-border bg-background" onClick={signInWithGoogle} disabled={busy}>
                  <span aria-hidden="true" className="mr-2 font-bold">G</span>{t("Continuer avec Google")}
                </button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{t("ou avec votre e-mail")}</span><span className="h-px flex-1 bg-border" /></div>
              </>
            )}
            <form onSubmit={submit} className="grid gap-4">
              {mode === "signup" && <label className="grid gap-1 text-sm font-medium">{t("Nom / établissement")}<input className="field" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={120} /></label>}
              <label className="grid gap-1 text-sm font-medium">{t("E-mail")}<input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              {mode !== "reset" && <label className="grid gap-1 text-sm font-medium">{t(mode === "update" ? "Nouveau mot de passe" : "Mot de passe")}<input className="field" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>}
              <button className="btn btn-accent" disabled={busy}>{busy ? t("Patientez…") : mode === "signup" ? t("Créer mon compte restaurant") : mode === "reset" ? t("Envoyer le lien de réinitialisation") : mode === "update" ? t("Enregistrer le nouveau mot de passe") : t("Se connecter")}</button>
            </form>
            {mode === "update" && <p className="text-sm text-muted-foreground">{t("Choisissez un nouveau mot de passe de huit caractères minimum.")}</p>}
            {mode === "signup" && <p className="text-sm text-muted-foreground">{t("Vous êtes pêcheur ? Créez votre compte, puis demandez le rôle pêcheur après connexion.")} <Link className="underline" to="/verification">{t("Demander une vérification professionnelle")}</Link></p>}
            {needsEmailConfirmation && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{t("Ouvrez le lien reçu par e-mail pour activer votre compte.")}</p>}
            <p className="text-xs text-muted-foreground">{t("Ne partagez jamais votre mot de passe. Les données réelles ne seront accessibles que selon les permissions de votre compte.")}</p>
          </>
        )}
      </div>
    </div>
  );
}
