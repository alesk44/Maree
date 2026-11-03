# Audit d'intégration isolée — PR #3 et PR #5

Date : 2026-11-03
Branche cible : work/next-isolated-audit
Base de départ : 9bf3dd216e9f905f13be7a3f1cefcc88266ba772

## Décision

Aucune fusion globale des PR #3 ou #5. Les deux branches ont divergé de main : PR #3 est en avance de 233 commits et en retard de 6 ; PR #5 est en avance de 255 commits et en retard de 6. Leur merge-base commun est 805af6f498274d38045315f6e245ee7dca46a86f. Une intégration globale risquerait de réintroduire ou d'écraser des changements déjà livrés sur main.

## Éléments repérés

- PR #3 ajoute un workflow CI, un écran d'approbation par email, un PWA d'administration, des fonctions marines et de nombreux changements applicatifs, migrations et politiques.
- PR #5 reprend l'essentiel de ces changements et ajoute l'écran src/routes/tracabilite.tsx, un dossier SQL de brouillon et une migration exécutable de traçabilité.
- Les PR se recouvrent sur les routes d'administration, profils, restaurant, pêcheur, traductions, fonctions Supabase, migrations et tests. Elles ne sont pas des lots indépendants.
- La branche main possède déjà un workflow CI avec installation Bun en mode frozen lockfile, build, TypeScript, lint et tests. Elle possède également les migrations de jetons email et les deux RPC correspondantes. Le code des PR ne doit donc pas être recopié sans comparaison avec ces implémentations déjà fusionnées.

## Contrôles de la console propriétaire / approbation email

- La migration actuelle conserve les empreintes SHA-256 des jetons dans un schéma privé et révoque les accès API directs.
- La RPC de création vérifie la longueur des empreintes, leur différence, la date d'expiration et l'existence d'une demande pending.
- La RPC de décision verrouille le jeton et la demande, refuse les jetons expirés/consommés et applique la décision ainsi que le changement de rôle dans une transaction SQL.
- La fonction Edge de notification exige un utilisateur authentifié et vérifie que la demande appartient à cet utilisateur avant d'envoyer le mail.
- Points de durcissement encore requis avant reprise de la route UI : limiter CORS à l'origine attendue, valider strictement le corps JSON et les types, ne jamais exposer les erreurs internes RPC, éviter les URL de preview codées en dur, tester la consommation concurrente du même jeton et vérifier les logs sans token brut.
- La route d'approbation ne doit jamais exécuter la décision au chargement du lien ; la confirmation doit rester un clic explicite.

## Risques bloquants de traçabilité QR

1. Le scanner de PR #5 insère dans catch_traceability_codes puis catch_traceability_events. Si le second insert échoue, le premier reste enregistré : la sauvegarde n'est pas atomique.
2. Le scanner associe un code à un catch_id, mais ne renseigne pas order_id. Le parcours annoncé commande n'est donc pas réalisé.
3. Le scanner expose directement le message d'erreur Supabase à l'utilisateur ; prévoir une traduction contrôlée et une journalisation non sensible.
4. Le rôle est lu dans profiles côté client et la liste des lots est filtrée dans le navigateur. Cela ne constitue pas une autorisation : les politiques RLS doivent être la barrière réelle.
5. Le SQL autorise un restaurant ayant une commande sur le lot, mais il faut confirmer le schéma et les politiques existants, la cardinalité des commandes et l'appartenance réelle des lots.
6. Le journal d'événements est décrit comme append-only, mais les tables ont besoin de tests explicites qui prouvent qu'aucun rôle API ne peut UPDATE/DELETE et que les acteurs ne peuvent falsifier actor_id/scanned_by.
7. La migration versionnée 20261102060100_add_catch_traceability.sql est pratiquement identique au fichier supabase/drafts/traceability.sql. Le dossier draft explique pourtant que le SQL n'est pas une migration. Il faut choisir une source canonique et conserver le SQL en draft jusqu'à validation.
8. Les contraintes de payload, HTTPS, event_type et metadata sont utiles mais ne prouvent pas que les données externes sont authentiques. Tous les codes doivent rester non vérifiés jusqu'à revue explicite.
9. Le scanner accepte les codes GS1 et URL, mais la classification d'URL seule ne vérifie ni la destination ni la véracité du contenu. Aucune ouverture automatique ne doit être ajoutée.

## Intégration effectuée dans cette branche

- Le workflow CI a été étendu à work/** afin que cette branche isolée puisse recevoir des vérifications sur ses pushes.
- L'installation reste verrouillée avec bun install --frozen-lockfile.
- Les étapes build, TypeScript, lint et tests sont conservées.
- Aucun workflow de déploiement n'a été modifié ni déclenché.
- Aucun code métier des PR #3/#5 et aucune migration de traçabilité n'ont été copiés.

## Intégration recommandée

### Lot A — Console propriétaire
- Reprendre uniquement les composants UI qui manquent réellement sur main, après vérification des routes déjà présentes.
- Vérifier les autorisations serveur et les RPC ; ne pas se fier au masquage UI.
- Contrôler les liens email à usage unique, expiration, consommation atomique, anti-rejeu et absence de fuite de token dans les logs.
- Générer les routes depuis le code, ne pas copier aveuglément routeTree.gen.ts.

### Lot B — Traçabilité
- Garder le SQL dans supabase/drafts jusqu'à validation locale.
- Ajouter des tests RLS négatifs : autre pêcheur, restaurant sans commande, anon, actor falsifié, order_id d'une autre prise.
- Tester les tentatives UPDATE/DELETE, payloads trop longs, URL non HTTPS, event_type inconnu, metadata surdimensionnée.
- Rendre l'enregistrement code + événement atomique via RPC transactionnelle ou un seul point d'entrée serveur.
- Associer explicitement la commande lorsque c'est le cas et vérifier que la commande appartient au catch et à l'acteur.
- Prévoir une vue publique distincte, opaque et allow-listée ; ne jamais exposer raw_code, URL privée, coordonnées exactes, téléphone, licence ou document.

## État de validation

- Comparaisons GitHub et listes de fichiers des PR consultées.
- Patches consultés : scanner de traçabilité, README SQL draft, SQL draft, migration de traçabilité, workflow CI, écran d'approbation email, fonction Edge de notification et fonction Edge de décision.
- Les sources actuelles main confirment l'existence des tables et RPC email, ainsi que le workflow CI verrouillé.
- Aucun test local ou CI n'a été exécuté dans cette opération.
- Aucune migration n'a été appliquée à Supabase.
- Aucun déploiement Cloudflare n'a été lancé.

## Prochaine étape

Vérifier quelles routes et fonctions email sont déjà présentes dans main, puis intégrer uniquement les composants UI manquants. Pour la traçabilité, concevoir d'abord une RPC transactionnelle et ses tests RLS négatifs, sans appliquer de migration à un projet Supabase.
