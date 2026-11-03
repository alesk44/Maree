# Audit d'intégration isolée — PR #3 et PR #5

Date : 2026-11-03
Branche cible : work/next-isolated-audit
Base vérifiée : 9bf3dd216e9f905f13be7a3f1cefcc88266ba772

## Décision

Aucune fusion globale des PR #3 ou #5. Les deux branches ont divergé de main : PR #3 est en avance de 233 commits et en retard de 6 ; PR #5 est en avance de 255 commits et en retard de 6. Leur merge-base commun est 805af6f498274d38045315f6e245ee7dca46a86f. Une intégration globale risquerait de réintroduire ou d'écraser des changements déjà livrés sur main.

## Éléments repérés

- PR #3 ajoute un workflow CI, un écran d'approbation par email, un PWA d'administration, des fonctions marines et de nombreux changements applicatifs, migrations et politiques.
- PR #5 reprend l'essentiel de ces changements et ajoute l'écran src/routes/tracabilite.tsx, un dossier SQL de brouillon et une migration exécutable de traçabilité.
- Les PR se recouvrent sur les routes d'administration, profils, restaurant, pêcheur, traductions, fonctions Supabase, migrations et tests. Elles ne sont pas des lots indépendants.

## Risques bloquants identifiés

1. Le scanner de PR #5 insère dans catch_traceability_codes puis catch_traceability_events. Si le second insert échoue, le premier reste enregistré : la sauvegarde n'est pas atomique.
2. Le scanner associe un code à un catch_id, mais ne renseigne pas order_id. Le parcours annoncé « commande » n'est donc pas réalisé.
3. Le scanner expose directement le message d'erreur Supabase à l'utilisateur ; prévoir une traduction contrôlée et une journalisation non sensible.
4. Le rôle est lu dans profiles côté client et la liste des lots est filtrée dans le navigateur. Cela ne constitue pas une autorisation : les politiques RLS doivent être la barrière réelle.
5. Le SQL autorise un restaurant ayant une commande sur le lot, mais il faut confirmer le schéma et les politiques existants, la cardinalité des commandes et l'appartenance réelle des lots.
6. Le journal d'événements est décrit comme append-only, mais les tables ont besoin de tests explicites qui prouvent qu'aucun rôle API ne peut UPDATE/DELETE et que les acteurs ne peuvent falsifier actor_id/scanned_by.
7. La migration versionnée 20261102060100_add_catch_traceability.sql est pratiquement identique au fichier supabase/drafts/traceability.sql. Le dossier draft explique pourtant que le SQL n'est pas une migration. Il faut choisir une source canonique et conserver le SQL en draft jusqu'à validation.
8. Les contraintes de payload, HTTPS, event_type et metadata sont utiles mais ne prouvent pas que les données externes sont authentiques. Tous les codes doivent rester non vérifiés jusqu'à revue explicite.
9. Le scanner accepte les codes GS1 et URL, mais la classification d'URL seule ne vérifie ni la destination ni la véracité du contenu. Aucune ouverture automatique ne doit être ajoutée.

## Intégration recommandée

### Lot A — CI et documentation
- Examiner le workflow CI sur la configuration réelle Bun/Vite/Vitest/TypeScript.
- Ajouter uniquement les tests et documentation qui ne réécrivent pas la feuille de route ou les configurations déjà fusionnées.
- Ne pas activer un déploiement automatique vers Cloudflare ou une application automatique de migrations sans revue séparée.

### Lot B — Console propriétaire
- Rebaser les changements de routes et fonctions sur main, fichier par fichier.
- Vérifier les autorisations serveur et les RPC ; ne pas se fier au masquage UI.
- Contrôler les liens email à usage unique, expiration, consommation atomique, anti-rejeu et absence de fuite de token dans les logs.
- Générer les routes depuis le code, ne pas copier aveuglément routeTree.gen.ts.

### Lot C — Traçabilité
- Garder le SQL dans supabase/drafts jusqu'à validation locale.
- Ajouter des tests RLS négatifs : autre pêcheur, restaurant sans commande, anon, actor falsifié, order_id d'une autre prise.
- Tester les tentatives UPDATE/DELETE, payloads trop longs, URL non HTTPS, event_type inconnu, metadata surdimensionnée.
- Rendre l'enregistrement code + événement atomique via RPC transactionnelle ou un seul point d'entrée serveur.
- Associer explicitement la commande lorsque c'est le cas et vérifier que la commande appartient au catch et à l'acteur.
- Prévoir une vue publique distincte, opaque et allow-listée ; ne jamais exposer raw_code, URL privée, coordonnées exactes, téléphone, licence ou document.

## État de validation

- Comparaisons GitHub et listes de fichiers des PR consultées.
- Patches consultés : scanner de traçabilité, README SQL draft, SQL draft, migration de traçabilité, workflow CI, écran d'approbation email, normalisation et test des conditions marines.
- Les sources actuelles main consultées confirment l'existence des tables catches et profiles et les champs fisher_id/role, mais l'ensemble du schéma de commandes et des politiques RLS n'a pas été validé.
- Aucun test local ou CI n'a été exécuté dans cette opération.
- Aucune migration n'a été appliquée à Supabase.
- Aucun déploiement Cloudflare n'a été lancé.
- Aucun code applicatif des PR #3/#5 n'a été intégré dans ce commit.

## Prochaine étape

Reprendre les patches par petits lots et construire un diff minimal sur cette branche. Toute migration Supabase demeure exclue tant que les tests RLS et le schéma réel n'ont pas été vérifiés.
