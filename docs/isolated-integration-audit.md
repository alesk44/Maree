# Audit d'intégration isolée — PR #3 et PR #5

Date : 2026-11-03
Branche : work/next-isolated-audit

## Décision d'intégration

Les PR #3 et #5 restent non fusionnées. Leurs branches ont divergé de main (PR #3 : +233/-6 ; PR #5 : +255/-6 depuis le merge-base 805af6f498274d38045315f6e245ee7dca46a86f). Pas de merge global : les deux branches se recouvrent sur les routes, migrations, fonctions Edge, profils, traductions et politiques.

La branche main possède déjà la route /admin/email-review, les RPC et migrations de jetons email, ainsi qu'un workflow CI. La route UI et les migrations email des PR ne doivent pas être recopiées.

## Correctif effectué

- TypeScript signalait six accès à des propriétés d'un objet Record via la notation pointée dans src/lib/maree-api.ts (TS4111).
- Ces six accès ont été remplacés par la notation indexée, sans changer les valeurs ni la logique métier.
- Le workflow Verify a été renforcé pour exécuter TypeScript et ESLint, en plus des tests et du build.
- Le workflow de déploiement Cloudflare n'a pas été modifié.

## Résultats des contrôles observés

Sur le commit intermédiaire d75b5a91be704306b7dbd7d77a41d93825c0a191 :
- Le workflow Verify a réussi : installation frozen, tests et build.
- Le workflow Marée CI a échoué à l'étape TypeScript avec six erreurs TS4111 dans src/lib/maree-api.ts.
- Le workflow Marée CI a été déclenché par une modification temporaire du workflow ci.yml ; cette modification a ensuite été annulée afin de ne pas créer un deuxième pipeline redondant.
- Le correctif TS4111 est maintenant appliqué sur cette branche, mais son résultat doit être confirmé par le prochain run.

## Risques de la traçabilité QR

1. Le scanner de PR #5 écrit le code puis l'événement dans deux requêtes distinctes : le code peut être enregistré sans son événement.
2. Le scanner n'associe pas l'order_id ; l'association à une commande n'est donc pas implémentée.
3. Le scanner affiche des messages d'erreur Supabase bruts.
4. Le rôle et la liste des lots filtrés dans le client ne constituent pas une autorisation ; la RLS doit rester l'autorité.
5. Le SQL doit être validé contre le schéma réel des commandes et des prises.
6. Ajouter des tests RLS négatifs pour autre pêcheur, restaurant sans commande, anon, acteur falsifié, commande étrangère, ainsi que des tests d'interdiction UPDATE/DELETE.
7. Le SQL existe à la fois dans drafts et dans une migration versionnée ; garder le brouillon comme seule source tant que la revue n'est pas terminée.
8. Les codes externes doivent rester non vérifiés jusqu'à une validation humaine. Pas d'ouverture automatique d'URL scannée.

## Console propriétaire / email

- Les empreintes SHA-256 des jetons sont stockées dans un schéma privé.
- Les RPC vérifient la demande pending et l'expiration ; la RPC de décision verrouille le jeton et la demande, consomme le jeton et change le rôle dans une transaction.
- La fonction Edge de notification vérifie l'utilisateur authentifié et l'appartenance de la demande.
- Durcissements à prévoir : CORS restreint, validation stricte du JSON, réponses génériques sans erreur RPC interne, configuration HTTPS obligatoire, tests de rejeu/concurrence, absence de jetons bruts dans les logs.

## Garde-fous

- Aucun code de migration QR appliqué à Supabase.
- Aucune branche Supabase payante créée.
- Aucun déploiement Cloudflare déclenché.
- Aucun merge vers main effectué.
