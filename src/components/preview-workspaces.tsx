import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useLanguage } from "@/lib/i18n";
import { DemoBadge } from "@/components/ui-bits";

export function PreviewWorkspace({ path }: { path: string }) {
  if (path === "/connexion") return <LoginPreview />;
  if (path === "/compte") return <AccountPreview />;
  if (path === "/verification") return <VerificationPreview />;
  if (path === "/espace-pecheur") return <FisherPreview />;
  if (path === "/admin" || path.startsWith("/admin/")) return <AdminPreview />;
  if (path === "/tracabilite" || path.startsWith("/tracabilite/")) return <TraceabilityPreview />;
  return <LoginPreview />;
}

function PreviewPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { t } = useLanguage();
  return <section className="mx-auto grid max-w-6xl gap-6 px-4 py-10">
    <header className="grid gap-3">
      <div><DemoBadge /></div>
      <h1 className="font-display text-3xl font-semibold md:text-4xl">{t(title)}</h1>
      <p className="max-w-3xl text-muted-foreground">{t(description)}</p>
    </header>
    {children}
    <div className="flex flex-wrap gap-3">
      <Link to="/" className="btn">{t("Retour à l'accueil")}</Link>
      <Link to="/catalogue" className="btn btn-accent">{t("Voir la pêche du jour")}</Link>
    </div>
  </section>;
}

function LoginPreview() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<"restaurant" | "fisher">("restaurant");
  return <PreviewPage title="Connexion / Créer un compte" description="Voici le parcours de connexion et d’inscription. Les champs sont désactivés dans cette maquette.">
    <section className="card mx-auto grid w-full max-w-2xl gap-5 p-5 sm:p-8">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={"btn " + (mode === "signin" ? "btn-accent" : "")} onClick={() => setMode("signin")}>{t("Connexion")}</button>
        <button type="button" className={"btn " + (mode === "signup" ? "btn-accent" : "")} onClick={() => setMode("signup")}>{t("Créer un compte")}</button>
      </div>
      {mode === "signup" && <div className="grid grid-cols-2 gap-2">
        <button type="button" className={"btn " + (role === "restaurant" ? "btn-accent" : "")} onClick={() => setRole("restaurant")}>{t("Restaurant")}</button>
        <button type="button" className={"btn " + (role === "fisher" ? "btn-accent" : "")} onClick={() => setRole("fisher")}>{t("Pêcheur")}</button>
      </div>}
      <div className="grid gap-4">
        {mode === "signup" && <label className="grid gap-1 text-sm font-medium">{t("Nom ou établissement")}<input className="field" disabled value={role === "restaurant" ? "Restaurant de démonstration" : "Pêcheur de démonstration"} readOnly /></label>}
        <label className="grid gap-1 text-sm font-medium">{t("E-mail")}
          <input className="field" type="email" disabled value={role === "restaurant" ? "restaurant@example.test" : "pecheur@example.test"} readOnly />
        </label>
        {mode === "signup" && <label className="grid gap-1 text-sm font-medium">{t("E-mail de facturation")}
          <input className="field" type="email" disabled value={role === "restaurant" ? "facturation-restaurant@example.test" : "facturation-pecheur@example.test"} readOnly />
        </label>}
        <label className="grid gap-1 text-sm font-medium">{t("Mot de passe")}<input className="field" type="password" disabled value="demo-password" readOnly /></label>
        <button type="button" className="btn btn-accent" disabled>{t(mode === "signin" ? "Connexion désactivée dans la maquette" : "Création désactivée dans la maquette")}</button>
      </div>
      <p className="rounded-xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">{t("À l’inscription réelle, l’adresse de compte et l’adresse professionnelle servent aux échanges de factures entre le restaurant et le pêcheur. Les adresses affichées ici sont fictives.")}</p>
      <Link to="/compte" className="text-sm font-semibold underline">{t("Voir le profil de démonstration")}</Link>
    </section>
  </PreviewPage>;
}

function AccountPreview() {
  const { t } = useLanguage();
  return <PreviewPage title="Compte de démonstration" description="Exemple des coordonnées de compte et de facturation enregistrées après l’inscription.">
    <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <Info label={t("Type de compte")} value={t("Restaurant de démonstration")} />
      <Info label={t("Adresse de connexion")} value="restaurant@example.test" />
      <Info label={t("Adresse de facturation")} value="facturation-restaurant@example.test" />
      <Info label={t("État du compte")} value={t("Exemple — aucune session réelle")}/>
      <p className="text-sm text-muted-foreground sm:col-span-2">{t("En service, les adresses de facturation ne sont communiquées qu’au partenaire d’une commande concernée pour échanger la facture produit.")}</p>
    </section>
  </PreviewPage>;
}

function VerificationPreview() {
  const { t } = useLanguage();
  return <PreviewPage title="Vérification du compte professionnel" description="Aperçu du dossier de vérification. Aucun document réel n’est chargé ou transmis.">
    <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <Info label={t("Demande")} value={t("Pêcheur professionnel — exemple")}/>
      <Info label={t("Statut")} value={t("En attente — exemple")}/>
      <Info label={t("Licence de pêche")} value={t("Document de démonstration")}/>
      <Info label={t("Enregistrement professionnel")} value={t("Document de démonstration")}/>
      <button type="button" className="btn" disabled>{t("Téléverser un justificatif — désactivé")}</button>
      <button type="button" className="btn btn-accent" disabled>{t("Envoyer le dossier — désactivé")}</button>
    </section>
  </PreviewPage>;
}

function FisherPreview() {
  const { t, gbp } = useLanguage();
  const mailHref = `mailto:restaurant@example.test?subject=${encodeURIComponent("Facture produit — exemple Marée Jersey")}&body=${encodeURIComponent("Facture de démonstration pour une commande de bar de ligne. Aucun paiement n'est demandé dans cette maquette.")}`;
  return <PreviewPage title="Espace pêcheur" description="Tableau de bord de démonstration : prises, commandes, factures produits et traçabilité.">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={t("Lots publiés")} value="3" detail={t("Données fictives")}/>
      <Metric label={t("Stock disponible")} value="24 kg" detail={t("Exemple de stock")}/>
      <Metric label={t("Demandes reçues")} value="2" detail={t("Exemples de commandes")}/>
      <Metric label={t("Factures à envoyer")} value={gbp(78)} detail={t("Facture produit au restaurant")}/>
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card grid gap-3 p-5">
        <h2 className="text-xl font-semibold">{t("Commande de démonstration")}</h2>
        <Info label={t("Produit")} value={t("Bar de ligne — 3 kg")}/>
        <Info label={t("Restaurant")} value={t("Restaurant de démonstration")}/>
        <Info label={t("E-mail partenaire")} value="restaurant@example.test"/>
        <p className="text-sm text-muted-foreground">{t("Les deux parties échangent la facture produit directement par e-mail. L’application ne collecte pas le prix des produits.")}</p>
        <a className="btn btn-accent w-fit" href={mailHref}>{t("Préparer l’e-mail de facture")}</a>
        <p className="text-xs text-muted-foreground">{t("Ce lien ouvre un brouillon avec une adresse fictive ; il n’envoie aucun e-mail.")}</p>
      </section>
      <section className="card grid content-start gap-3 p-5">
        <h2 className="text-xl font-semibold">{t("Mes factures et relevés")}</h2>
        <Info label={t("Facture produits au restaurant")} value={gbp(78)}/>
        <Info label={t("Frais Marée — exemple")} value={gbp(5.07)}/>
        <Info label={t("Abonnement restaurant — exemple")} value={gbp(19.99) + t(" / mois")}/>
        <p className="text-sm text-muted-foreground">{t("Les règlements sont suivis hors plateforme. Aucun prélèvement ni paiement en ligne n’est actif.")}</p>
        <Link to="/tracabilite/demo-bar-001" className="btn w-fit">{t("Voir le QR de traçabilité")}</Link>
      </section>
    </div>
  </PreviewPage>;
}

function AdminPreview() {
  const { t, gbp } = useLanguage();
  return <PreviewPage title="Administration" description="Vue d’ensemble fictive des vérifications et relevés Marée. Les actions d’administration sont désactivées.">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={t("Comptes professionnels")} value="8" detail={t("Données de démonstration")}/>
      <Metric label={t("Dossiers à vérifier")} value="2" detail={t("Aucun vrai document")}/>
      <Metric label={t("Lots publiés")} value="5" detail={t("Données fictives")}/>
      <Metric label={t("Relevés Marée ouverts")} value={gbp(40.66)} detail={t("Exemple de total")}/>
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card grid gap-3 p-5">
        <h2 className="text-xl font-semibold">{t("Demandes de vérification")}</h2>
        <Info label={t("Pêcheur professionnel — exemple")} value={t("À examiner")}/>
        <Info label={t("Restaurant — exemple")} value={t("À examiner")}/>
        <div className="flex flex-wrap gap-2"><button className="btn" disabled>{t("Approuver — désactivé")}</button><button className="btn" disabled>{t("Demander une pièce — désactivé")}</button></div>
      </section>
      <section className="card grid content-start gap-3 p-5">
        <h2 className="text-xl font-semibold">{t("Paramètres commerciaux")}</h2>
        <Info label={t("Commission Marée — exemple")} value="6,5 %"/>
        <Info label={t("Livraison — exemple")} value="20 %"/>
        <Info label={t("Abonnement — exemple")} value={gbp(19.99) + t(" / mois")}/>
        <button className="btn" disabled>{t("Enregistrer — désactivé")}</button>
      </section>
    </div>
  </PreviewPage>;
}

function TraceabilityPreview() {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/tracabilite/demo-bar-001`), []);
  return <PreviewPage title="QR de traçabilité" description="Scannez ce code pour retrouver la fiche de lot de démonstration. Les données sont fictives.">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <section className="card grid content-start gap-3 p-5">
        <h2 className="text-xl font-semibold">{t("Lot de démonstration — BAR-001")}</h2>
        <Info label={t("Espèce")} value={t("Bar de ligne")}/>
        <Info label={t("Pêcheur")} value={t("Marie Renouf — exemple")}/>
        <Info label={t("Zone")} value={t("Baie de St Aubin")}/>
        <Info label={t("Capture / débarquement")} value={t("25 novembre · 06:00 / 08:00")}/>
        <Info label={t("Quantité initiale")} value="12 kg"/>
        <Info label={t("Méthode")} value={t("Pêche à la ligne")}/>
        <p className="text-sm text-muted-foreground">{t("La traçabilité décrit les informations déclarées sur le lot ; elle ne vaut pas certification officielle.")}</p>
      </section>
      <section className="card grid justify-items-center gap-3 p-5 text-center">
        <h2 className="text-xl font-semibold">{t("Scanner le QR")}</h2>
        {url ? <QRCodeSVG value={url} size={220} level="M" marginSize={4} title={t("QR de traçabilité du lot de démonstration")}/> : <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-secondary" aria-label={t("Préparation du QR")}/>} 
        <p className="max-w-sm break-all text-xs text-muted-foreground">{url}</p>
        <Link to="/tracabilite/demo-bar-001" className="text-sm font-semibold underline">{t("Ouvrir la fiche de lot")}</Link>
      </section>
    </div>
  </PreviewPage>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 rounded-lg border border-border p-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><strong className="break-words">{value}</strong></div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="card grid gap-1 p-4"><span className="text-sm text-muted-foreground">{label}</span><strong className="font-display text-2xl">{value}</strong><span className="text-xs text-muted-foreground">{detail}</span></article>;
}
