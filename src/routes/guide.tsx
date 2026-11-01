import { useLanguage } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Guide & avant le lancement — Marée Jersey" },
      { name: "description", content: "Mise en route du prototype et étapes avant un lancement réel à Jersey." },
      { property: "og:title", content: "Guide — Marée Jersey" },
      { property: "og:description", content: "Mise en route et étapes avant le lancement." },
    ],
  }),
  component: () => {
    const { t: translateLabel } = useLanguage();
    const t = translateLabel;
    return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t("Guide de mise en route")} sub={t("Ce prototype fonctionne sans compte, sans clé API et sans service payant.")} />
      <ol className="card list-decimal space-y-3 p-6 pl-10">
        <li>{t("Ouvrez")} <strong>{t("Pêche du jour")}</strong>{t(": filtrez, recherchez, triez par fraîcheur.")}</li>
        <li>{t("Dans")} <strong>{t("Espace pêcheur")}</strong>{t(", choisissez un profil de démo et publiez une prise ; modifiez quantité, prix ou statut.")}</li>
        <li>{t("Dans")} <strong>{t("Espace restaurant")}</strong>{t(", envoyez une demande de réservation.")}</li>
        <li>{t("Revenez dans l'espace pêcheur pour faire avancer le statut : envoyée → confirmée → prête → livrée.")}</li>
        <li>{t("Les données sont stockées uniquement dans ce navigateur. L'admin permet de les réinitialiser.")}</li>
      </ol>
      <h2 className="mt-12 text-2xl font-semibold">{t("Avant le lancement")}</h2>
      <p className="mt-1 text-muted-foreground">{t("Rien n'est en production : voici ce qu'il faut pour rendre les données réelles.")}</p>
      <ul className="mt-4 grid gap-3">
        {[
          ["Comptes authentifiés", "Connexion séparée pêcheurs / restaurants / admin, rôles et permissions."],
          ["Base de données", "Remplacer le stockage local par une base partagée (un backend gratuit suffit pour démarrer)."],
          ["Validation des pêcheurs", "Vérifier licence de pêche, immatriculation du bateau et identité avant publication."],
          ["Coordonnées réelles", "Remplacer tous les contacts fictifs, avec accord RGPD / Data Protection (Jersey) Law 2018."],
          ["Règles de réservation", "Délais, quantités minimales, annulation, prix ferme ou indicatif, paiement éventuel."],
          ["Livraison", "Zones, créneaux, transport isotherme, responsabilité à la remise."],
          ["Hygiène & traçabilité", "Enregistrement des lots, températures, étiquetage espèce/zone/méthode, conservation des documents."],
          ["Conformité locale", "Se rapprocher du Government of Jersey (Marine Resources, Environmental Health) pour enregistrement et règles de vente directe."],
          ["Notifications", "Mettre en place des e-mails ou SMS réels — actuellement aucun message n'est envoyé."],
        ] as const).map(([t, d]) => (
          <li key={t} className="card flex gap-3 p-4"><span className="mt-0.5 text-accent" aria-hidden>☐</span><div><strong>{translateLabel(t)}</strong><p className="text-sm text-muted-foreground">{translateLabel(d)}</p></div></li>
        ))}
      </ul>
    </div>
  );
  },
});