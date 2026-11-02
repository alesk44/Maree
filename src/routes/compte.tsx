import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/compte")({
  head: () => ({ meta: [{ title: "Mon compte — Marée Jersey" }, { name: "description", content: "Gérez votre profil Marée Jersey." }] }),
  component: AccountPage,
});

function AccountPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPostcode, setBusinessPostcode] = useState("");
  const [businessCity, setBusinessCity] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active) return;
      if (error || !data.user) { setLoading(false); return; }
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("display_name, avatar_url, role").eq("id", data.user.id).maybeSingle();
      const { data: privateProfile } = await supabase.rpc("get_my_business_profile").maybeSingle();
      if (!active) return;
      if (profileError) toast.error(t("Une erreur technique est survenue. Réessayez."));
      setName(profile?.["display_name"] ?? String(data.user.user_metadata?.["display_name"] ?? ""));
      setRole(profile?.role ?? "");
      const privateDetails = privateProfile as { phone?: string | null; business_address?: string | null; business_postcode?: string | null; business_city?: string | null; business_email?: string | null } | null;
      setPhone(privateDetails?.phone ?? "");
      setBusinessAddress(privateDetails?.business_address ?? "");
      setBusinessPostcode(privateDetails?.business_postcode ?? "");
      setBusinessCity(privateDetails?.business_city ?? "");
      setBusinessEmail(privateDetails?.business_email ?? "");
      setAvatarUrl(profile?.["avatar_url"] ?? null);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    if (name.trim().length < 2) { toast.error(t("Entrez un nom d'au moins 2 caractères.")); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim(), phone: phone.trim() || null, ...(role === "restaurant" ? { business_address: businessAddress.trim() || null, business_postcode: businessPostcode.trim() || null, business_city: businessCity.trim() || null, business_email: businessEmail.trim() || null } : {}) }).eq("id", userId);
    setSaving(false);
    if (error) toast.error(t("Une erreur technique est survenue. Réessayez.")); else toast.success(t("Profil enregistré."));
  };

  const uploadAvatar = async (file?: File) => {
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) { toast.error(t("Choisissez une image.")); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t("La photo doit faire 5 Mo maximum.")); return; }
    setUploading(true);
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = userId + "/avatar." + extension;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
    if (uploadError) { setUploading(false); toast.error(t("Une erreur technique est survenue. Réessayez.")); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl + "?v=" + Date.now();
    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
    setUploading(false);
    if (updateError) { toast.error(t("Une erreur technique est survenue. Réessayez.")); return; }
    setAvatarUrl(url);
    toast.success(t("Photo de profil mise à jour."));
  };

  const removeAvatar = async () => {
    if (!userId || !avatarUrl) return;
    setUploading(true);
    const { data: files } = await supabase.storage.from("avatars").list(userId);
    if (files?.length) await supabase.storage.from("avatars").remove(files.map((file) => userId + "/" + file.name));
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    setUploading(false);
    if (error) toast.error(t("Une erreur technique est survenue. Réessayez.")); else { setAvatarUrl(null); toast.success(t("Photo supprimée.")); }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(t("Une erreur technique est survenue. Réessayez."));
    else { toast.success(t("Vous êtes déconnecté.")); window.location.assign("/"); }
  };

  if (loading) return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">{t("Chargement du compte…")}</div>;
  if (!userId) return <main className="mx-auto max-w-xl px-4 py-12"><section className="card grid gap-4 p-6 text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-3xl text-accent">♙</div><h1 className="font-display text-3xl font-semibold">{t("Mon compte")}</h1><p className="text-sm text-muted-foreground">{t("Connectez-vous pour gérer votre profil et votre photo.")}</p><Link to="/connexion" className="btn btn-accent">{t("Connexion / Créer un compte")}</Link></section></main>;

  return <main className="mx-auto max-w-2xl px-4 py-10">
    <section className="card grid gap-6 p-5 sm:p-8">
      <header><p className="text-xs font-semibold uppercase tracking-widest text-accent">Marée Jersey</p><h1 className="mt-2 font-display text-3xl font-semibold">{t("Mon compte")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Gérez vos informations personnelles et votre photo de profil.")}</p></header>
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-secondary/50 p-6">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-secondary text-4xl text-accent shadow-lg">{avatarUrl ? <img src={avatarUrl} alt={t("Photo de profil")} className="h-full w-full object-cover" /> : "♙"}</div>
        <label className="btn btn-accent cursor-pointer">{uploading ? t("Envoi…") : t("Changer ma photo")}<input className="sr-only" type="file" accept="image/*" disabled={uploading} onChange={(event) => { void uploadAvatar(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
        {avatarUrl && <button type="button" className="text-sm text-destructive underline" disabled={uploading} onClick={() => void removeAvatar()}>{t("Supprimer la photo")}</button>}
        <p className="text-center text-xs text-muted-foreground">{t("Image JPG, PNG ou WebP · 5 Mo maximum.")}</p>
      </div>
      <form onSubmit={(event) => void save(event)} className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">{t("Nom affiché")}<input className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
        <label className="grid gap-1 text-sm font-medium">{t("Adresse e-mail")}<input className="field opacity-70" value={email} readOnly disabled /></label>
        <label className="grid gap-1 text-sm font-medium">{t("Téléphone")}<input className="field" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} /></label>
        {role === "restaurant" && <section className="grid gap-4 rounded-xl border border-border p-4"><div><h2 className="font-semibold">{t("Coordonnées du restaurant")}</h2><p className="text-xs text-muted-foreground">{t("Ces informations servent à vos échanges et commandes professionnelles.")}</p></div><label className="grid gap-1 text-sm font-medium">{t("Adresse")}<input className="field" autoComplete="street-address" value={businessAddress} onChange={(event) => setBusinessAddress(event.target.value)} maxLength={200} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">{t("Code postal")}<input className="field" autoComplete="postal-code" value={businessPostcode} onChange={(event) => setBusinessPostcode(event.target.value)} maxLength={20} /></label><label className="grid gap-1 text-sm font-medium">{t("Ville")}<input className="field" autoComplete="address-level2" value={businessCity} onChange={(event) => setBusinessCity(event.target.value)} maxLength={100} /></label></div><label className="grid gap-1 text-sm font-medium">{t("E-mail professionnel")}<input className="field" type="email" autoComplete="email" value={businessEmail} onChange={(event) => setBusinessEmail(event.target.value)} maxLength={254} /></label></section>}
        <button className="btn btn-accent" type="submit" disabled={saving}>{saving ? t("Enregistrement…") : t("Enregistrer mon profil")}</button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Link to="/connexion" className="text-sm text-accent underline">{t("Paramètres de connexion")}</Link>
        <button type="button" onClick={() => void signOut()} className="text-sm text-destructive underline">{t("Se déconnecter")}</button>
      </div>
    </section>
  </main>;
}
