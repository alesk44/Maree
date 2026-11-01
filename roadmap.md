# Marée Jersey — feuille de route vivante

Dernière revue : 1 novembre 2026  
Branche de travail : `feature/supabase-shared-data-v2`  
Règle de livraison : aucun merge sur `main`, aucun déploiement public et aucune mise en production sans validation explicite du propriétaire.

## État vérifié

- [x] Catalogue public connecté aux prises et profils pêcheurs Supabase, avec actualisation temps réel.
- [x] Espace restaurant connecté : authentification, réservation via RPC transactionnelle `reserve_catch`, consultation des commandes du compte.
- [x] Espace pêcheur connecté : contrôle du rôle, publication d'une prise, modification de stock/prix/statut, consultation des commandes entrantes.
- [x] RPC `update_order_status` ajoutée pour les transitions de commande autorisées par le pêcheur propriétaire.
- [x] Migration SQL additive de cette RPC appliquée au projet Supabase et permissions vérifiées : rôle `authenticated` autorisé, rôle `anon` refusé.
- [x] Corrections TypeScript/JSX et génération des routes TanStack avant vérification.
- [x] Contrôle GitHub `Verify` réussi sur le commit `da674ace7b8afb20756c5b2cd2392faad25340e3`.
- [x] Contrôle GitHub `Build verification` réussi sur ce même commit.
- [x] PR #2 maintenue en brouillon ; branche `main` non modifiée.

## À faire — ordre de priorité

### P0 — fiabiliser avant tout aperçu de test

- [ ] Confirmer que le workflow CI complet (`ci.yml`) passe aussi sur le dernier commit ; les workflows Verify et Build sont verts, mais cela ne prouve pas encore que typecheck, lint et tests du workflow complet sont tous verts.
- [x] Restreindre les colonnes des profils exposées aux rôles navigateur : téléphone exclu, champs de fiche pêcheur uniquement pour anon, rôle lisible seulement par authenticated. Migration appliquée et droits revérifiés.\n- [x] Révoquer les privilèges génériques superflus sur catches, orders et verification_requests ; réaccorder uniquement SELECT/INSERT/UPDATE nécessaires. Les droits RPC ont été vérifiés : exécution réservée à authenticated.\n- [ ] Terminer les tests de contournement RLS avec des sessions anon, restaurant, pêcheur et admin : lecture publique limitée aux colonnes nécessaires, écriture réservée au propriétaire, rôles vérifiés côté serveur/base, aucune élévation de privilège côté navigateur.
- [ ] Vérifier les transitions de commande, les annulations et les cas limites de stock simultané (deux restaurants réservent le dernier stock).
- [ ] Vérifier la cohérence entre les statuts anglais en base et les libellés français dans l'interface.
- [ ] Ajouter des tests ciblés pour réservation concurrente, refus d'accès sans session, mauvais rôle, stock insuffisant, mise à jour d'une prise étrangère et transition de commande interdite.
- [ ] Corriger les erreurs détectées par ces contrôles avant d'ouvrir un test utilisateur.

### P1 — design et expérience produit

- [x] Appliquer la première passe du thème sombre premium inspiré de la référence : fond nuit, panneaux anthracite arrondis, accents turquoise/océan, navigation et composants adaptés au thème. Les tableaux de bord pêcheur/restaurant héritent du thème ; les améliorations de densité visuelle, graphiques et navigation latérale restent à peaufiner.
- [ ] Adapter le design mobile : navigation compacte, cartes empilées, tableaux transformés en listes lisibles.
- [ ] Harmoniser l'identité Marée (bleu océan, turquoise, ivoire) avec le thème sombre de la référence.
- [x] Accueil : chiffres reliés au marché Supabase partagé, états vides explicites, aucun volume de ventes/transactions fictif. Annuaire et profils pêcheurs basculés des profils démo vers les profils vérifiés partagés.
- [ ] Vérifier les états de chargement, erreur, absence de résultats et confirmation sur toutes les pages.
- [x] Langues proposées confirmées : français, anglais et roumain. Le portugais n'est pas proposé dans le sélecteur. Traductions ajoutées pour les nouveaux libellés du marché et des profils ; une revue exhaustive des libellés de toutes les pages reste à faire.
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
- La référence visuelle du tableau de bord a été fournie ; le redesign correspondant reste à réaliser.

## Définition de « prêt à publier »

Le build, les tests, le lint et le typecheck sont verts ; les tests RLS et les tests inter-comptes passent ; aucune donnée fictive n'est visible ; les parcours mobile/desktop et les langues sont vérifiés ; les obligations locales et les réglages e-mail sont confirmés ; le propriétaire a donné son accord explicite.
