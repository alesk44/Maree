import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n";

type Props = { onVerified: () => void };

export function AdminMfaGate({ onVerified }: Props) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"checking" | "enroll" | "challenge">("checking");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ]);
        if (assuranceError) throw assuranceError;
        if (factorsError) throw factorsError;
        if (!active) return;
        if (assurance.currentLevel === "aal2") {
          onVerified();
          return;
        }
        const verified = factors.totp.find((factor) => factor.status === "verified");
        if (verified) {
          setFactorId(verified.id);
          setMode("challenge");
          return;
        }
        const pending = factors.totp.find((factor) => factor.status === "unverified");
        if (pending) {
          setFactorId(pending.id);
          setMode("challenge");
          setError("Un facteur TOTP non vérifié existe déjà. Saisissez le code de l’application qui avait servi à son enrôlement.");
          return;
        }
        setMode("enroll");
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Impossible de vérifier l’état MFA.");
          setMode("enroll");
        }
      }
    })();
    return () => { active = false; };
  }, [onVerified]);

  const startEnrollment = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Marée Jersey admin",
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setMode("enroll");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Impossible de démarrer l’enrôlement MFA."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!factorId || !/^\\d{6,8}$/.test(code.trim())) {
      setError(t("Saisissez le code temporaire à 6 à 8 chiffres de votre authenticator."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== "aal2") {
        throw new Error(t("Le facteur a été vérifié, mais la session n’est pas encore en AAL2. Reconnectez-vous puis réessayez."));
      }
      setCode("");
      onVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("La vérification MFA a échoué."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mx-auto grid max-w-xl gap-4 border border-accent/40 p-5 sm:p-6" aria-live="polite">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Marée Jersey · Sécurité administrateur</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{t("Authentification à deux facteurs obligatoire")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("L’espace d’administration reste verrouillé tant qu’une session MFA vérifiée (AAL2) n’est pas active.")}</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {mode === "checking" ? (
        <p role="status" className="text-sm text-muted-foreground">{t("Vérification de votre facteur MFA…")}</p>
      ) : (
        <>
          {mode === "enroll" && !qrCode && (
            <div className="grid gap-3">
              <p className="text-sm">{t("Aucun facteur TOTP vérifié n’a été détecté. Démarrez l’enrôlement puis scannez le QR code avec Google Authenticator, Microsoft Authenticator ou une application TOTP compatible.")}</p>
              <button type="button" className="btn btn-accent w-fit" onClick={() => void startEnrollment()} disabled={busy}>{busy ? t("Préparation…") : t("Configurer mon authenticator")}</button>
            </div>
          )}
          {qrCode && (
            <div className="grid gap-3 rounded-xl border border-border p-4">
              <p className="text-sm font-semibold">{t("1. Scannez ce QR code avec votre application authenticator")}</p>
              <img className="mx-auto h-52 w-52 rounded-lg bg-white p-2" src={`data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`} alt={t("QR code secret pour configurer le MFA")} />
              <p className="text-xs text-muted-foreground">{t("Si le scan ne fonctionne pas, saisissez manuellement cette clé dans votre application. Ne la partagez avec personne.")}</p>
              <code className="select-all break-all rounded-lg bg-secondary p-3 text-sm">{secret}</code>
            </div>
          )}
          {(mode === "challenge" || Boolean(qrCode)) && (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                {t("2. Code temporaire de votre application")}
                <input className="field" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\\D/g, "").slice(0, 8))} placeholder="123456" />
              </label>
              <button type="button" className="btn btn-accent w-fit" onClick={() => void verify()} disabled={busy || code.trim().length < 6}>{busy ? t("Vérification…") : t("Vérifier et activer l’accès admin")}</button>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">{t("Ne transmettez jamais votre QR code, votre clé secrète ou vos codes temporaires. Marée Jersey ne vous les demandera pas.")}</p>
    </section>
  );
}
