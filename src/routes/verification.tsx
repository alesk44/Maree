import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/verification")({
  head: () => ({ meta: [{ title: "Vérification des comptes — Marée Jersey" }, { name: "description", content: "Demande de vérification des pêcheurs et restaurants partenaires." }] }),
  component: VerificationPage,
});

type RequestRow = { id: string; requested_role: "fisher" | "restaurant"; business_name: string; status: "pending" | "approved" | "rejected"; created_at: string; reviewer_note: string | null };

function VerificationPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ requested_role: "fisher" as "fisher" | "restaurant", business_name: "", contact_name: "", phone: "", registration_number: "", evidence_note: "" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase.from("verification_requests").select("id,requested_role,business_name,status,created_at,reviewer_note").order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) toast.error(error.message); else setRows((data ?? []) as RequestRow[]); });
  }, [userId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return toast.error(t("Connectez-vous avant de demander une vérification."));
    setBusy(true);
    const { error } = await supabase.from("verification_requests").insert({
      user_id: userId, ...form,
      business_name: form.business_name.trim(),
      contact_name: form.contact_name.trim(),
      phone: form.phone.trim(),
      registration_number: form.registration_number.trim() || null,
      evidence_note: form.evidence_note.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("Demande envoyée. Elle sera examinée manuellement."));
    setForm({ requested_role: "fisher", business_name: "", contact_name: "", phone: "", registration_number: "", evidence_note: "" });
    const { data } = await supabase.from("verification_requests").select("id,requested_role,business_name,status,created_at,reviewer_note").order("created_at", { ascending: false });
    setRows((data ?? []) as RequestRow[]);
  };

  return <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
    <section className="card grid gap-3 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Marée Jersey · Trust & Safety</p>
      <h1 className="font-display text-3xl font-semibold">{t("Vérification des pêcheurs et restaurants")}</h1>
      <p className="text-sm text-muted-foreground">{t("Les comptes sont vérifiés manuellement avant d’obtenir les droits professionnels. Ne téléversez pas de pièces d’identité ou de documents sensibles ici.")}</p>
      {email ? <p className="rounded-lg bg-secondary p-3 text-sm">{t("Connecté en tant que")} <strong>{email}</strong></p> : <p className="rounded-lg bg-secondary p-3 text-sm">{t("Connectez-vous pour envoyer une demande.")} <Link className="underline" to="/connexion">{t("Connexion")}</Link></p>}
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">{t("Type de compte")}
          <select className="field" value={form.requested_role} onChange={e => setForm(f => ({...f, requested_role: e.target.value as "fisher" | "restaurant"}))}>
            <option value="fisher">{t("Pêcheur / pêcheuse")}</option><option value="restaurant">{t("Restaurant / acheteur professionnel")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">{t("Nom commercial / bateau / restaurant")}<input className="field" required minLength={2} maxLength={160} value={form.business_name} onChange={e => setForm(f => ({...f,business_name:e.target.value}))}/></label>
        <label className="grid gap-1 text-sm font-medium">{t("Nom du responsable")}<input className="field" required minLength={2} maxLength={120} value={form.contact_name} onChange={e => setForm(f => ({...f,contact_name:e.target.value}))}/></label>
        <label className="grid gap-1 text-sm font-medium">{t("Téléphone professionnel")}<input className="field" type="tel" required minLength={5} maxLength={40} value={form.phone} onChange={e => setForm(f => ({...f,phone:e.target.value}))}/></label>
        <label className="grid gap-1 text-sm font-medium">{t("Numéro d’enregistrement professionnel (si applicable)")}<input className="field" maxLength={120} value={form.registration_number} onChange={e => setForm(f => ({...f,registration_number:e.target.value}))}/></label>
        <label className="grid gap-1 text-sm font-medium">{t("Informations de vérification")}<textarea className="field" required minLength={10} maxLength={2000} rows={4} value={form.evidence_note} onChange={e => setForm(f => ({...f,evidence_note:e.target.value}))} placeholder={t("Décrivez votre activité, port ou adresse professionnelle et les éléments que vous pourrez confirmer.")}/></label>
        <button className="btn btn-accent" disabled={busy || !email}>{busy ? t("Envoi…") : t("Envoyer la demande de vérification")}</button>
      </form>
      <p className="text-xs text-muted-foreground">{t("Contact de vérification")} : <a className="underline" href="mailto:alexozo44760@gmail.com?subject=Mar%C3%A9e%20Jersey%20-%20V%C3%A9rification%20professionnelle">alexozo44760@gmail.com</a>. {t("L’envoi de ce formulaire n’envoie pas automatiquement d’e-mail ; il enregistre la demande dans la base partagée.")}</p>
    </section>
    {email && <section className="card grid gap-3 p-6"><h2 className="text-xl font-semibold">{t("Mes demandes")}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("Aucune demande envoyée pour le moment.")}</p> : rows.map(row => <article key={row.id} className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{row.business_name}</strong><span className="rounded-full bg-secondary px-3 py-1 text-xs">{t(row.status === "pending" ? "En attente" : row.status === "approved" ? "Approuvée" : "Refusée")}</span></div>
        <p className="text-sm text-muted-foreground">{row.requested_role === "fisher" ? t("Pêcheur / pêcheuse") : t("Restaurant")} · {new Date(row.created_at).toLocaleDateString()}</p>
        {row.reviewer_note && <p className="mt-2 text-sm">{row.reviewer_note}</p>}
      </article>)}
    </section>}
  </main>;
}
