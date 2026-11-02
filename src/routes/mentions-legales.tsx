import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/mentions-legales")({
  head: () => ({ meta: [
    { title: "Informations légales — Marée Jersey" },
    { name: "description", content: "Informations sur l'éditeur, les données personnelles et le fonctionnement de Marée Jersey." },
  ] }),
  component: LegalPage,
});

function LegalPage() {
  const { t } = useLanguage();
  return <main className="mx-auto grid max-w-4xl gap-8 px-4 py-10">
    <header className="grid gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marée Jersey</p>
      <h1 className="font-display text-4xl font-semibold">{t("Informations légales")}</h1>
      <p className="text-muted-foreground">{t("Version de travail — document à compléter et à faire vérifier avant l'ouverture commerciale du service.")}</p>
      <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">{t("Important : Marée Jersey est présenté ici comme un projet de plateforme. Cette page ne prétend pas remplacer un avis juridique, ni confirmer l'enregistrement d'une entreprise, d'une activité alimentaire ou d'un statut GST.")}</p>
    </header>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("1. Éditeur et responsable du projet")}</h2>
      <div className="rounded-2xl border border-border p-5">
        <p><strong>{t("Nom :")}</strong> Cosqueric</p>
        <p><strong>{t("Prénom :")}</strong> Alexandre</p>
        <p><strong>{t("Rôle :")}</strong> {t("propriétaire et créateur de l'application Marée Jersey")}</p>
        <p><strong>{t("Téléphone :")}</strong> <a className="underline" href="tel:07700343725">07700343725</a></p>
        <p><strong>{t("Adresse :")}</strong> 666 Phare Ouest, JE69C, St. Helier, Jersey, Channel Islands</p>
        <p><strong>{t("Nom du service :")}</strong> Marée Jersey</p>
        <p className="mt-3 text-sm text-muted-foreground">{t("Forme juridique, adresse électronique de contact et éventuel numéro d'immatriculation : à renseigner avant publication définitive.")}</p>
      </div>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("2. Rôle de la plateforme")}</h2>
      <p>{t("Marée Jersey a vocation à mettre en relation des pêcheurs et des établissements de restauration à Jersey autour de lots de produits de la mer déclarés par les vendeurs. Sauf stipulation contractuelle contraire, le pêcheur reste le vendeur des produits et demeure responsable de l'exactitude des informations relatives à ses prises, de leur conformité, de leur manipulation et de leur remise au restaurant.")}</p>
      <p>{t("La plateforme organise la mise en relation, les demandes de réservation et les informations de commande. Les modalités exactes de livraison, de paiement, de facturation et de responsabilité devront être fixées dans les contrats applicables avant toute exploitation commerciale.")}</p>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("3. Tarifs, livraison et facturation")}</h2>
      <p>{t("Le projet prévoit des frais de livraison de 20 % du sous-total des produits pour les commandes livrées. Ces frais sont destinés à Marée Jersey et ne constituent pas un montant dû au pêcheur. Le retrait par le restaurant est prévu sans frais de livraison.")}</p>
      <p>{t("Le projet prévoit également une option de relevé mensuel entre un restaurant et chaque pêcheur. Les produits vendus par le pêcheur et les frais de service de la plateforme doivent apparaître séparément. Les factures et relevés affichés dans l'application ne doivent pas être considérés comme des factures fiscales tant que le dispositif de facturation n'a pas été validé.")}</p>
      <p>{t("Aucun paiement en ligne ne doit être considéré comme activé tant qu'un prestataire de paiement et son intégration ne sont pas effectivement mis en service.")}</p>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("4. GST — Jersey")}</h2>
      <p>{t("La GST de Jersey est distincte de la TVA britannique. Le taux standard indiqué par Revenue Jersey est de 5 %. L'obligation d'immatriculation dépend notamment du montant et de la nature des fournitures taxables, avec un seuil général de £300,000 sur une période de 12 mois. Une entreprise non immatriculée ne doit pas facturer la GST.")}</p>
      <p>{t("Le traitement fiscal de Marée Jersey dépendra de son rôle contractuel réel (agent ou vendeur agissant en son propre nom), de l'identité du fournisseur et de son statut GST. Aucun montant de GST ne sera ajouté automatiquement avant validation par un conseiller fiscal ou Revenue Jersey.")}</p>
      <p className="text-sm text-muted-foreground">{t("Références :")} <a className="underline" href="https://www.gov.je/taxesmoney/gst/businesses/registration/pages/shouldibe.aspx" target="_blank" rel="noreferrer">{t("seuils d'immatriculation GST")}</a> · <a className="underline" href="https://www.gov.je/Industry/BusinessAdviceHub/BusinessTaxesSocialSecurity/Pages/GoodsServicesTaxBusinesses.aspx" target="_blank" rel="noreferrer">{t("GST pour les entreprises")}</a>.</p>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("5. Sécurité alimentaire et traçabilité")}</h2>
      <p>{t("Les opérateurs alimentaires restent responsables des obligations qui leur incombent au titre des lois de Jersey applicables. Les informations de lot, d'espèce, de zone, de date de capture et de débarquement affichées par la plateforme doivent être exactes et vérifiables. La présence d'un QR code ou d'une fiche de traçabilité ne vaut pas certification officielle ni validation sanitaire par Marée Jersey.")}</p>
      <p>{t("Les pêcheurs et autres opérateurs doivent vérifier les exigences applicables à leur activité, notamment l'enregistrement éventuel comme Food Business Operator, les règles d'hygiène, de transport, de conservation, d'étiquetage et les obligations propres à la pêche commerciale.")}</p>
      <p className="text-sm text-muted-foreground">{t("Références :")} <a className="underline" href="https://admin.jerseylaw.je/laws/current/l_4_2023" target="_blank" rel="noreferrer">Food (Jersey) Law 2023</a> · <a className="underline" href="https://www.gov.je/Industry/RetailHospitality/FoodDrink/pages/foodmatters.aspx" target="_blank" rel="noreferrer">{t("enregistrement des entreprises alimentaires et Eat Safe")}</a>.</p>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("6. Données personnelles et confidentialité")}</h2>
      <p>{t("Le service peut traiter des données de compte, coordonnées professionnelles, informations de commandes, échanges et journaux techniques afin de gérer les comptes, les réservations, la traçabilité, la sécurité et les obligations légales. Les données ne doivent être accessibles qu'aux personnes qui en ont besoin pour ces finalités.")}</p>
      <p>{t("La politique de confidentialité définitive devra préciser le responsable du traitement, les bases légales, les durées de conservation, les destinataires et sous-traitants, les transferts éventuels hors de Jersey, les droits des personnes et les modalités de réclamation auprès de l'autorité compétente.")}</p>
      <p className="text-sm text-muted-foreground">{t("Référence :")} <a className="underline" href="https://admin.jerseylaw.je/laws/current/l_3_2018" target="_blank" rel="noreferrer">Data Protection (Jersey) Law 2018</a> · <a className="underline" href="https://www.jerseyoic.org/" target="_blank" rel="noreferrer">Jersey Office of the Information Commissioner</a>.</p>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("7. Conditions contractuelles et réclamations")}</h2>
      <p>{t("Des conditions distinctes devront préciser les règles d'inscription et de vérification des pêcheurs et restaurants, la formation des commandes, les annulations, les défauts de qualité, les retards, les remboursements, les relevés mensuels, les échéances, les impayés, la suspension des commandes et le traitement des litiges.")}</p>
      <p>{t("Les textes définitifs devront être vérifiés au regard notamment des règles de Jersey relatives à la protection des consommateurs, à la vente à distance et à la fourniture de biens et services.")}</p>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("8. Cookies et technologies")}</h2>
      <p>{t("La version définitive devra inventorier les cookies et traceurs réellement utilisés, distinguer ceux qui sont strictement nécessaires des traceurs facultatifs et recueillir le consentement requis avant tout dépôt non essentiel. Cette section devra être mise à jour après audit technique du site.")}</p>
    </section>

    <section className="grid gap-3">
      <h2 className="text-2xl font-semibold">{t("9. Documents à finaliser avant ouverture")}</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>{t("Adresse professionnelle et forme juridique de l'éditeur ; coordonnées électroniques officielles.")}</li>
        <li>{t("Conditions d'utilisation et conditions de vente / service pour restaurants et pêcheurs.")}</li>
        <li>{t("Politique de confidentialité, registre des traitements, durées de conservation et sous-traitants.")}</li>
        <li>{t("Politique cookies fondée sur un inventaire réel des traceurs.")}</li>
        <li>{t("Processus de réclamation, annulation, remboursement et gestion des produits non conformes.")}</li>
        <li>{t("Validation du modèle d'agence, du traitement GST, de la facturation et des flux financiers.")}</li>
        <li>{t("Vérification des obligations d'enregistrement alimentaire et de pêche applicables à chaque opérateur.")}</li>
      </ul>
    </section>
    <div className="flex flex-wrap gap-3 border-t border-border pt-5">
      <Link to="/" className="btn">{t("Retour à l'accueil")}</Link>
      <a href="tel:07700343725" className="btn btn-accent">{t("Contacter le responsable")}</a>
    </div>
  </main>;
}
