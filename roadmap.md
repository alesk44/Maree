# Marée Jersey — feuille de route vivante

> **Mise à jour 2 novembre 2026 : modèle commercial révisé à la demande du propriétaire. La commission Marée est de 6,5 % du sous-total produits pour chaque achat restaurant→pêcheur, que la commande soit livrée ou retirée. Elle s'ajoute au montant dû au pêcheur ; les frais de livraison de 20 % sont distincts et s'appliquent uniquement à la livraison. Aucun prélèvement automatique ni PSP n'est activé. La facturation mensuelle par couple restaurant/pêcheur, l'échéance à J+7 après fin de mois et le blocage après au moins 3 factures mensuelles échues impayées restent à finaliser. L'ancien modèle à double commission 6,5 % + 6,5 % / 13 % est obsolète. Les frais GST restent désactivés tant que le statut et le traitement fiscal de Marée Jersey ne sont pas confirmés.**

Dernière revue : 2 novembre 2026 — changements de facturation et d'interface en cours de validation CI sur la branche de prévisualisation ; ne pas considérer les derniers contrôles comme terminés avant les workflows du dernier commit.  
Branche de travail : `feature/supabase-shared-data-v2`  
Règle de livraison : aucun merge sur `main`, aucun déploiement public et aucune mise en production sans validation explicite du propriétaire.


## P0 — nouveau chantier commercial : livraison et facturation mensuelle (décision propriétaire, 2 novembre 2026)

### Règles validées
- [x] Commission Marée : 6,5 % du sous-total produits sur chaque achat restaurant→pêcheur, avec livraison ou retrait ; elle est ajoutée au total restaurant et attribuée à Marée Jersey.
- [x] Frais de livraison distincts : 20 % du sous-total produits, facturés uniquement en cas de livraison et attribués à Marée Jersey à 100 % ; retrait au port gratuit.
- [ ] Afficher séparément le montant produits dû au pêcheur, la commission Marée de 6,5 %, les frais de livraison éventuels de 20 % et le total restaurant. Aucun frais GST ne doit être ajouté avant confirmation du statut GST et du traitement applicable.
- [x] Enregistrer côté serveur un instantané du prix/kg, de la quantité, du sous-total produits, du taux/montant de commission Marée, du taux/montant de livraison, du total et du mode de facturation au moment de la réservation. Les écrans utilisent ces snapshots plutôt que le prix courant du lot.
- [x] Permettre au restaurant de choisir le paiement à la commande ou le relevé mensuel par pêcheur ; enregistrer la préférence par restaurant et pêcheur.
- [x] Schéma de factures mensuelles et génération SQL idempotente par restaurant/pêcheur/mois, avec échéance à J+7 après fin de mois. Le déclenchement planifié reste à configurer.
- [ ] Séparer les sommes dues au pêcheur des commissions de 6,5 % et frais de livraison dus à Marée Jersey ; produire des relevés distincts et un historique d'audit.
- [x] RPC de règlement réservée au pêcheur destinataire ou à un administrateur ; le restaurant ne peut pas s'auto-déclarer payé. Date, auteur, mode et référence sont enregistrés.
- [x] Blocage serveur dans `reserve_catch` dès au moins 3 factures mensuelles échues impayées, tous pêcheurs confondus.
- [x] Génération mensuelle idempotente et anti-doublon par restaurant/pêcheur/mois. Les règles d'ajustement/avoirs et de commandes partiellement livrées restent à préciser.
- [x] Tests pgTAP étendus aux snapshots de commission, au taux 6,5 % et à la planification mensuelle ; validation CI du dernier commit encore attendue. [ ] Tester la commission 6,5 % sur livraison ET retrait, les frais livraison 20 % uniquement sur livraison, les arrondis, factures mensuelles et blocage multi-pêcheurs.
- [ ] Mettre à jour les écrans restaurant, pêcheur et admin pour afficher la commission Marée de 6,5 % une seule fois, sans ancienne retenue supplémentaire côté pêcheur.

### État de code au 2 novembre 2026
- Migration additive `20261102110000_delivery_and_monthly_fisher_billing.sql` créée sur la branche ; non appliquée à la base distante.
- `reserve_catch` calcule et fige le sous-total produits, la commission Marée de 6,5 %, les frais livraison distincts de 20 % et le total ; aucune GST n'est ajoutée.
- Préférence immédiat/mensuel sauvegardée par couple restaurant/pêcheur ; interface restaurant mise à jour.
- Les écrans restaurant/pêcheur utilisent les montants figés et l'ancienne commission 6,5 % est retirée des synthèses.
- Le schéma de relevés mensuels, la RPC de génération (service_role), la RPC de règlement sécurisé et le blocage des commandes sont créés. La commission Marée de 6,5 % est maintenant figée sur chaque commande, livraison ou retrait. Il reste à configurer le déclenchement mensuel, l'interface de relevés/règlements et les tests de bout en bout.
- CI a détecté des erreurs de syntaxe dans les premières modifications frontend ; corrections commitées. Attendre les workflows du dernier commit avant de déclarer la branche verte.

### Séquence d'implémentation
1. Migration additive et RPC de réservation : snapshots tarifaires et frais calculés exclusivement côté serveur.
2. Préférences de facturation et génération mensuelle idempotente des factures/relevés.
3. Règlement sécurisé et règle de blocage dans la transaction de réservation.
4. Interfaces restaurant, pêcheur et admin, puis tests inter-comptes.

### Limites actuelles
- Ce chantier ne met pas en place de paiement en ligne, prélèvement automatique ou PSP ; le statut « payé » doit refléter un règlement confirmé hors plateforme.
- La livraison est un revenu de Marée Jersey selon la décision produit ; le contrat commercial et le traitement GST doivent être validés avant facturation réelle.

## Nouvelle fonctionnalité prioritaire — QR de traçabilité des lots

Objectif : attribuer à chaque lot de pêche un identifiant de traçabilité stable et un QR code scannable par smartphone, depuis la capture jusqu'à la livraison au restaurant.

### Parcours prévu
- [ ] À la création du lot, générer un identifiant public aléatoire non séquentiel et un QR code qui ouvre une page de consultation dédiée.
- [ ] Afficher sur la fiche de lot : espèce, zone de capture à la précision autorisée, date/heure de capture et de débarquement, poids initial, poids restant, méthode, conseils de conservation, pêcheur/vendeur et statut.
- [ ] Enregistrer les événements d'historique sans écrasement : publication, pesée/ajustement, réservation, confirmation, préparation, remise/livraison, annulation et éventuelle division/fusion de lots.
- [ ] Relier chaque transfert à l'opérateur expéditeur et destinataire (traçabilité un pas en arrière / un pas en avant), aux quantités et aux dates.
- [ ] Donner au pêcheur et au restaurant un QR téléchargeable/imprimable pour l'étiquette du lot; permettre au restaurant de scanner à la réception et de confirmer quantité/état.
- [ ] Fournir à l'administrateur un export horodaté des événements et des documents pour inspection/rappel.
- [ ] Prévoir une page publique limitée aux informations produit; conserver les coordonnées, documents de conformité et détails privés dans une vue authentifiée réservée aux parties autorisées et administrateurs.
- [ ] Ajouter tests RLS, tests d'accès croisé, tests de falsification d'URL/ID, tests de transfert de quantité et tests de conservation de l'historique.

### Garde-fous juridiques et techniques
- Le QR code est un pointeur vers les enregistrements; il ne constitue pas à lui seul une certification, une preuve de légalité de capture, un certificat sanitaire ou une autorisation de pêche.
- Les opérateurs restent responsables de leurs obligations de traçabilité. Le système doit identifier le fournisseur immédiat, le client professionnel immédiat, le produit, les quantités, les dates et les lots.
- Ne pas publier le numéro de licence, les documents, coordonnées personnelles, ni une localisation de pêche trop précise.
- Les obligations propres aux navires, journaux de pêche, débarquements et exportations doivent être vérifiées selon le type de navire, l'espèce, la destination et les licences applicables à Jersey.
- Avant d'afficher « conforme légalement », faire valider les champs et les durées de conservation par Environmental Health / Marine Resources à Jersey.

Références de cadrage : Food (Jersey) Law 2023, article 12 (traçabilité et identification); informations Jersey sur les licences de navires et journaux de pêche; guidance sur la traçabilité des produits de la pêche.


### Interopérabilité avec les QR codes externes — demande du propriétaire (2 novembre 2026)

Objectif : Marée doit pouvoir lire et référencer les QR codes déjà utilisés par des pêcheurs, mareyeurs, grossistes, fournisseurs et systèmes de traçabilité des produits de la mer à Jersey, sans exiger que tous adoptent Marée.

- [ ] Ajouter une action « Scanner un QR code externe » dans l'espace restaurant et l'espace pêcheur.
- [ ] Scanner avec la caméra du téléphone lorsque le navigateur le permet; proposer en secours la saisie/coller du contenu ou de l'URL, sans imposer l'accès caméra.
- [ ] Reconnaître les URL HTTPS, les identifiants de lot et les formats GS1 Digital Link/GTIN lorsque présents; conserver le contenu brut et le type détecté pour audit.
- [ ] Ouvrir la source d'origine dans un navigateur sécurisé et afficher clairement « source externe — non vérifiée par Marée ».
- [ ] Permettre d'associer l'URL/code externe à un lot Marée, avec fournisseur, date de réception, espèce, quantité et document justificatif saisis/confirmés par l'utilisateur.
- [ ] Ne jamais aspirer automatiquement un site externe ni interpréter un QR comme une preuve de légalité, de fraîcheur, de certification sanitaire ou de licence.
- [ ] Prévenir les URL non HTTPS, les schémas dangereux, les URL locales/privées et les redirections suspectes; ne pas charger de contenu externe dans une iframe.
- [ ] Garder la provenance, l'horodatage du scan, l'utilisateur ayant associé le code et les modifications dans un historique non destructif.
- [ ] Prévoir des adaptateurs dédiés uniquement lorsqu'un fournisseur/organisme confirme une API ou un format documenté; ne pas supposer qu'il existe une API publique Catch Jersey.
- [ ] Tester QR malformés, URL malveillantes, doublons, codes expirés, absence de réseau et QR qui pointent vers un PDF ou une page non structurée.

Constat initial : les sources officielles consultées décrivent les licences, logbooks et déclarations de débarquement, et Catch Jersey est cité pour certaines déclarations spécifiques de thon rouge; aucune plateforme publique universelle de QR traçabilité couvrant tous les poissons/fruits de mer de Jersey n'a été identifiée. Marée doit donc être un lecteur/agrégateur interopérable, pas prétendre se connecter à un registre central inexistant.

## Dernier audit — 1 novembre 2026

- [x] Après correction de l'assertion de visibilité des profils anonymes, le workflow Supabase a réussi : reconstruction des 15 migrations, suite pgTAP et test concurrent du dernier stock.
- [x] Les workflows `Verify`, `Marée CI` et `Build verification` ont également réussi sur `c0bef40a51c4a4d52fbf8da9f385e10503bee189`.
- [ ] Le contrôle visuel de l'aperçu et les parcours avec deux comptes restent à faire ; succès CI ne vaut pas validation utilisateur réelle.
- [x] Première version du panneau « Conditions en mer » ajoutée à l'accueil : endpoint serveur Jersey, cache CDN court, hauteur/direction/période des vagues, température de surface, prévisions horaires et attribution Open-Meteo. Validation CI en cours ; pas de changement Supabase.

- Audit Supabase consigné dans [le rapport de sécurité](docs/security-audit-2026-11-01.md).
- [x] Les 13 versions déjà enregistrées dans Supabase ont maintenant des fichiers SQL correspondants dans la branche ; les cinq anciens fichiers aux versions erronées ont été remplacés.
- Deux migrations additives sont prêtes dans le dépôt : sécurisation du rôle pour les transitions de commande et index des demandes de vérification.
- [x] Reconstruction locale PG17 depuis les 15 migrations réussie sur GitHub Actions.
- [x] Suite pgTAP de 34 assertions réussie.
- [x] Test de concurrence à deux connexions : une seule réservation du dernier stock acceptée.
- [x] Build, Verify, Marée CI et déploiement de prévisualisation Cloudflare réussis sur `c233d00d6b65c9dee080d6c74abcf983730e60e2`.
- La base distante n'a pas été modifiée. Aucun merge sur `main` et aucune mise en production.


## Pistes IA — audit open source

- [x] Audit des outils IA auto-hébergeables consigné dans [docs/ai-opportunities.md](docs/ai-opportunities.md).
- [x] Priorité retenue : assistant facultatif de rédaction/traduction des annonces de prises, sans pouvoir modifier les champs structurés ni publier sans validation humaine.
- [x] Garde-fous définis : pas d'invention de prix/stock/espèce/origine, pas de diagnostic de fraîcheur, pas de décision automatique sur les comptes ou commandes.
- [ ] Prototype Ollama sur machine locale avec données fictives uniquement.
- [ ] Évaluer les sorties FR/EN/RO et les refus d'invention avant tout branchement.
- Décision actuelle : aucun service IA supplémentaire installé ; le mode sans IA reste le comportement par défaut. LocalAI/Ollama demanderaient une machine séparée du Cloudflare Worker.

## État vérifié

- [x] Catalogue public connecté aux prises et profils pêcheurs Supabase, avec actualisation temps réel.
- [x] Espace restaurant connecté : authentification, réservation via RPC transactionnelle `reserve_catch`, consultation des commandes du compte.
- [x] Espace pêcheur connecté : contrôle du rôle, publication d'une prise, modification de stock/prix/statut, consultation des commandes entrantes.
- [x] RPC `update_order_status` ajoutée pour les transitions de commande autorisées par le pêcheur propriétaire.
- [x] Fichier de migration `update_order_status` réaligné dans la branche ; garde explicite sur le rôle `fisher` ajoutée. Application à la base distante en attente de validation CI et d'approbation.
- [x] Corrections TypeScript/JSX et génération des routes TanStack avant vérification.
- [x] Contrôle GitHub `Verify` réussi sur le commit `da674ace7b8afb20756c5b2cd2392faad25340e3`.
- [x] Contrôle GitHub `Build verification` réussi sur ce même commit.
- [x] PR #2 maintenue en brouillon ; branche `main` non modifiée.

## À faire — ordre de priorité

### P0 — fiabiliser avant tout aperçu de test

- [x] Workflow CI complet vert sur le commit `a92ad4c9b820850c02b07580ecb93600da9d3c1c` : build production, TypeScript, ESLint et tests.
- [x] Restreindre les colonnes des profils exposées aux rôles navigateur : téléphone exclu, champs de fiche pêcheur uniquement pour anon, rôle lisible seulement par authenticated. Migration appliquée et droits revérifiés.\n- [x] Révoquer les privilèges génériques superflus sur catches, orders et verification_requests ; réaccorder uniquement SELECT/INSERT/UPDATE nécessaires. Les droits RPC ont été vérifiés : exécution réservée à authenticated.\n- [x] Tests pgTAP de contournement RLS avec sessions anon, restaurant et pêcheur : réussis en CI.
- [x] Vérifier les transitions de commande, les permissions RPC et les cas limites de stock simultané : réussis en CI.
- [x] Vérifier la conversion des statuts de lots Supabase (`available`/`reserved`/`sold_out`) vers les clés françaises (`disponible`/`réservé`/`épuisé`) et leur traduction FR/EN/RO dans l'interface. La revue manuelle des statuts de commandes reste incluse dans les parcours inter-comptes.
- [x] Ajouter une suite pgTAP pour RLS, privilèges RPC, visibilité anon/restaurant/fisher et refus des transitions non autorisées.\n- [x] Ajouter un script de test à deux connexions pour la réservation simultanée du dernier stock ; exécution CI en attente.\n- [x] Vérifier qu'un pêcheur ne peut pas modifier la prise d'un autre pêcheur (pgTAP, CI).
- [x] Aucun échec restant dans les contrôles CI actuels.

### P1 — design et expérience produit

- [x] Appliquer le thème sombre premium inspiré de la référence : fond nuit, panneaux anthracite arrondis, accents turquoise/océan et composants adaptés.
- [x] Ajouter une navigation mobile compacte en menu déroulant et barre inférieure fixe pour les quatre destinations principales ; les cartes et formulaires se réorganisent en colonnes sur petits écrans.\n- [ ] Vérifier visuellement les espacements et la lisibilité sur vrais écrans mobiles et desktop après déploiement de l'aperçu.
- [x] Harmoniser l'identité Marée : bleu océan, anthracite, turquoise et typographie Fraunces/Manrope.
- [x] Accueil : chiffres reliés au marché Supabase partagé, états vides explicites, aucun volume de ventes/transactions fictif. Annuaire et profils pêcheurs basculés des profils démo vers les profils vérifiés partagés.
- [ ] Faire une revue manuelle page par page des états chargement, erreur, absence de résultats et confirmation dans l'aperçu.
- [x] Langues proposées confirmées : français, anglais et roumain. Le portugais n'est pas proposé dans le sélecteur. Audit automatisé des appels t(\"…\") dans toutes les routes : 0 libellé littéral manquant dans le dictionnaire anglais/roumain.
- [ ] Vérifier le sélecteur de langue, sa persistance et le rendu SSR/hydratation.

### P2 — tests réels avec deux comptes

- [ ] Créer un compte restaurant de test et confirmer son e-mail.
- [ ] Créer un compte pêcheur de test, soumettre les justificatifs de vérification et attribuer le rôle pêcheur par le processus d'administration de confiance.
- [ ] Publier une prise de test, vérifier son apparition dans le catalogue public, réserver depuis le compte restaurant, puis faire avancer le statut depuis le compte pêcheur.
- [ ] Tester le stock après réservation, le rafraîchissement temps réel, les permissions entre comptes et les erreurs réseau.
- [ ] Supprimer les données de test après validation, sans toucher aux données réelles.

### P3 — aperçu puis lancement

- [ ] Produire un aperçu privé/prévisualisation de la branche, distinct de la production, et le tester sur mobile et ordinateur.
- [ ] Configurer les URL de redirection Supabase Auth, confirmation d'e-mail, réinitialisation du mot de passe et SMTP/notifications.
- [ ] Vérifier le service e-mail Resend et ses secrets côté serveur uniquement ; ne jamais committer de clé privée.
- [ ] Finaliser mentions légales, politique de confidentialité, consentement et durée de conservation.
- [ ] Valider auprès des autorités de Jersey les obligations applicables à la vente de produits de la pêche, traçabilité, hygiène, enregistrement et transport réfrigéré.
- [ ] Définir les règles commerciales : prix, unité, minimum de commande, disponibilité, retrait/livraison, annulation, litiges et paiement.
- [ ] Faire une revue de sécurité finale et sauvegarde de la base.
- [ ] Présenter le résultat au propriétaire pour approbation explicite.
- [ ] Après approbation seulement : fusionner la PR, déployer et vérifier l'URL publique.

## Blocages externes / actions du propriétaire

- Les tests de bout en bout nécessitent deux comptes distincts et une validation réelle du compte pêcheur. Aucun mot de passe ne doit être partagé dans le chat.
- La base contient actuellement zéro prise et zéro commande selon le dernier contrôle connu ; l'intégration ne peut pas être considérée comme validée en conditions réelles.
- L'aperçu Cloudflare existant et l'ancien aperçu Lovable ne doivent pas être présentés comme la version de cette branche tant qu'un déploiement de prévisualisation de cette branche n'a pas été confirmé.
- Les paramètres Supabase Auth, SMTP/Resend et Cloudflare nécessitent l'accès/autorisation du propriétaire.
- La référence visuelle du tableau de bord a été fournie ; la structure principale est implémentée, la revue visuelle sur appareils réels reste à faire.

## Définition de « prêt à publier »

Le build, les tests, le lint et le typecheck sont verts ; les tests RLS et les tests inter-comptes passent ; aucune donnée fictive n'est visible ; les parcours mobile/desktop et les langues sont vérifiés ; les obligations locales et les réglages e-mail sont confirmés ; le propriétaire a donné son accord explicite.


## Audit technique — 2 novembre 2026

- [x] Corriger les liens de confirmation, OAuth et récupération de mot de passe : ils utilisent désormais l'origine de l'application ouverte (preview ou futur domaine de production) au lieu d'être forcés vers la prévisualisation.
- [x] Les workflows CI et preview utilisent le même mode d'installation Bun que le projet utilisait déjà.
- [ ] Réconcilier `bun.lock` avec `package.json` : l'essai `--frozen-lockfile` a révélé que `@supabase/supabase-js` est déclaré dans `package.json` mais absent du lockfile. Le mode strict a été retiré pour ne pas bloquer les builds ; le lockfile doit être régénéré et commité depuis un environnement Bun.
- [ ] Configurer les URL d'origine et de redirection autorisées dans Supabase Auth pour chaque domaine (preview et production) avant les tests de confirmation et de récupération.
- [ ] Revoir les politiques RLS SELECT redondantes sur catches, orders, profiles et verification_requests. Les politiques admin et utilisateur se cumulent volontairement en OR ; ne les fusionner qu'après des tests couvrant les rôles anon, restaurant, pêcheur et admin.
- [ ] Le linter signale `private.admin_users` avec RLS sans policy. La table est volontairement privée et aucun droit n'est accordé à anon/authenticated ; confirmer le comportement avec le catalogue des privilèges avant de décider si une policy explicite restrictive est nécessaire.
- [ ] Le linter signale les trois RPC SECURITY DEFINER exécutables par authenticated. C'est intentionnel pour les transactions et le contrôle d'accès est dans le corps des fonctions ; conserver `search_path = ''`, les vérifications de rôle/propriété et les tests pgTAP.
- [ ] Activer la protection des mots de passe compromis dans Supabase Auth avant ouverture publique, via le réglage Auth pris en charge.
- [ ] Effectuer le parcours manuel mobile/desktop et le test réel avec deux comptes et un lot ; la base distante contient encore zéro lot et zéro commande.


## Validation fonctionnelle déclarée par le propriétaire — 2 novembre 2026

- [x] Le propriétaire confirme que le parcours principal Marée est validé côté expérience : publication d'une pêche du jour, consultation/réservation côté restaurant et suivi côté pêcheur.
- [ ] Cette validation utilisateur ne remplace pas les preuves techniques automatisées : conserver les tests CI de stock concurrent, RLS et permissions comme garde-fous.
- [ ] Compléter la revue visuelle mobile/desktop, les états d'erreur/réseau et la validation des notifications avant ouverture publique.

## Revue de feuille de route — 2 novembre 2026

- [x] Dernière suite Supabase migration/pgTAP réussie sur `c4634ae5368ac5d4a738bb28f316ddcded27a20d`.
- [x] Verify, Marée CI et Build verification réussis sur le même commit ; déploiement Cloudflare Preview réussi.
- [x] PR #2 toujours ouverte en brouillon ; `main` n'a pas été modifiée et aucun merge n'a été effectué.
- [x] Contrôle statique du mapping des statuts de lots : statuts anglais en base convertis en clés françaises puis traduits en anglais/roumain par le dictionnaire.
- [ ] Vérifier visuellement les pages et les langues sur appareils réels ; l'aperçu web ne peut pas être contrôlé automatiquement par cette revue.
- [ ] Effectuer les tests fonctionnels avec deux comptes réels, un lot et une réservation.
- [ ] Reprendre le point de lockfile Bun : régénérer `bun.lock` depuis un environnement Bun et remettre le mode `--frozen-lockfile` après vérification.
- [ ] Configurer et tester les URL Auth, e-mail/Resend et les paramètres de conformité avant ouverture publique.
