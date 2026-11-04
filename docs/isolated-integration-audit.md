# Audit d'intégration isolée — PR #3 et PR #5

Date : 2026-11-03
Branche : work/next-isolated-audit

## Décision d'intégration

Les PR #3 et #5 restent non fusionnées. Leurs branches ont divergé de main (PR #3 : +233/-6 ; PR #5 : +255/-6 depuis le merge-base 805af6f498274d38045315f6e245ee7dca46a86f). Pas de merge global : les deux branches se recouvrent sur les routes, migrations, fonctions Edge, profils, traductions et politiques.

La branche main possède déjà la route /admin/email-review, les RPC et migrations de jetons email, le scanner /tracabilite, et un workflow CI. Ces éléments ne doivent pas être dupliqués depuis les anciennes PR.

## Correctif CI / TypeScript

- Le run CI intermédiaire a révélé six TS4111 dans src/lib/maree-api.ts : les clés d'un Record étaient lues avec la notation pointée.
- Les six accès ont été convertis en accès indexés sans changement fonctionnel.
- Le premier ajout du contrôle TypeScript à Verify a révélé que le routeTree généré était incomplet lorsque tsc s'exécutait avant le build.
- Le workflow Verify est ordonné : install frozen, contrôle Deno des deux fonctions Edge de vérification, build (génère les routes), TypeScript, ESLint, tests.
- Dernier run complet sur le commit `39566cc791a29d88ffe7ef80080c4c20f43cc22a` : SUCCESS. Deno check des deux fonctions Edge, build, TypeScript, ESLint et tests Vitest sont tous verts.
- Détails du run : https://github.com/alesk44/Maree/actions/runs/41652386510

## État réel de la base Supabase (lecture seule, 2026-11-03)

Projet maree-jersey : ACTIVE_HEALTHY, PostgreSQL 17.11, région eu-west-2.

La liste des migrations live confirme que la traçabilité est déjà déployée :
- add_catch_traceability (version live 20261102055937)
- external_traceability_records
- index_traceability_and_compliance_foreign_keys
- consolidate_permissive_rls_policies
- harden_traceability_role_guard (version live 20261103112321)
- reconcile_monthly_invoice_generators (version live 20261103115826)

Schéma live vérifié :
- catch_traceability_codes possède catch_id, order_id, raw_code, code_type, source_url, verification_status, scanned_by, supplier_name, received_at, species, quantity_kg et note.
- catch_traceability_events possède catch_id, order_id, event_type, quantity_kg, note, metadata, actor_id et timestamps.
- Les rôles authenticated ont SELECT sur les deux tables, pas d'INSERT direct. Les insertions sont prévues via RPC.
- La route src/routes/tracabilite.tsx de main utilise effectivement attach_external_traceability.
- La RPC attach_external_traceability est SECURITY DEFINER, search_path vide, vérifie auth.uid(), le rôle fisher/restaurant, les champs, HTTPS, l'appartenance du catch au pêcheur ou de la commande au restaurant, et la cohérence catch/commande. Elle insère le code et l'événement dans la même transaction PL/pgSQL.
- Les politiques SELECT autorisent les propriétaires du catch, le restaurant lié à la commande et l'admin. Aucune politique d'UPDATE/DELETE n'a été observée pour les tables de traçabilité.
- La RPC a EXECUTE pour authenticated et service_role, pas pour anon ; le corps contient les contrôles d'identité et de propriété.
- La table orders ne donne pas INSERT à authenticated : la création passe par reserve_catch. La table catches autorise INSERT à authenticated, mais sa politique vérifie que le pêcheur a le rôle fisher et une demande de vérification approuvée.

## Revue des fonctions privilégiées

- Les 14 fonctions public SECURITY DEFINER signalées par l'Advisor ont été listées et inspectées.
- Les 14 ont search_path vide ; aucune n'est exécutable par anon.
- Les définitions examinées comportent des contrôles auth.uid(), de rôle ou de propriété de la ressource. L'alerte Advisor reste un signal de revue continue, pas une preuve de vulnérabilité.
- Point de durcissement initial : reserve_catch vérifiait le rôle restaurant et le lot disponible, mais ne revérifiait pas directement l'éligibilité du pêcheur à l'instant de la réservation. Le propriétaire pouvait être rétrogradé après publication et conserver un lot réservable.
- Correctif isolé préparé dans supabase/migrations/20261103160000_recheck_fisher_eligibility_on_reservation.sql : la RPC verrouille la demande approuvée puis le profil du pêcheur (même ordre de verrouillage que review_verification_request), et refuse si la demande fisher approuvée ou le rôle fisher manque.
- Contrat de régression ajouté dans supabase/tests/reserve_catch_fisher_eligibility_contract.test.sql : cas pêcheur rétrogradé, vérification encore pending, et pêcheur approuvé valide avec contrôle du stock. Le contrat vérifie aussi SECURITY DEFINER, search_path vide, EXECUTE pour authenticated/service_role et absence d'EXECUTE pour anon.
- Important : cette migration et ce test sont uniquement sur la branche isolée. Ils n'ont pas été appliqués à Supabase production. Le workflow `Database Contract` exécute désormais `supabase start`, `supabase db reset --local` et `supabase test db --local` ; les trois étapes ont réussi sur le commit `39566cc791a29d88ffe7ef80080c4c20f43cc22a`. Les tests pgTAP complets retournent `All tests successful`.
- L'état live audité avant le patch comptait 1 lot disponible, 0 lot lié à un profil non-fisher et 0 lot disponible sans demande approuvée. Aucun cas anormal n'était présent.
- La règle de blocage des commandes est à partir de 3 factures mensuelles ouvertes, échues et impayées ; le délai de 7 jours après la clôture mensuelle est appliqué dans la génération des factures. Le comportement observé correspond à la règle métier validée.

## Correctifs SQL supplémentaires en attente de test isolé

- `20261103160000_recheck_fisher_eligibility_on_reservation.sql` : contrôle rôle + demande fisher approuvée à la réservation.
- `20261103170000_bind_email_review_action_to_token.sql` : lie l'action confirmée à l'action stockée dans le jeton, avant consommation ; l'ancien RPC à un argument est retiré et le nouveau reste service_role uniquement.
- `20261103180000_add_missing_foreign_key_indexes.sql` : six index B-tree couvrant les clés étrangères signalées par l'Advisor.
- Tests pgTAP ajoutés : `reserve_catch_fisher_eligibility_contract.test.sql`, `verification_email_action_contract.test.sql`, `foreign_key_index_contract.test.sql`. Ils ont été exécutés avec l'ensemble de la suite SQL dans Supabase local via GitHub Actions ; résultat : SUCCESS.

## Résultats Advisors live

Sécurité :
- 14 fonctions SECURITY DEFINER exécutables par authenticated. Voir la revue ci-dessus.
- 3 tables RLS sans policy : private.admin_users, private.verification_email_action_tokens et public.maree_commercial_settings. Vérification complémentaire : maree_commercial_settings n'accorde aucun privilège à anon/authenticated, uniquement à postgres/service_role ; l'absence de policy API est donc intentionnelle à ce stade. Les deux autres tables sont dans le schéma privé.
- Protection contre les mots de passe compromis désactivée dans Supabase Auth.
- Liens de remédiation : https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable et https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance :
- L'Advisor avait signalé 6 clés étrangères sans index couvrant. Les tailles live au moment de l'audit étaient faibles (factures 24 kB chacune, commandes 72 kB / 3 lignes, paramètres de facturation 16 kB) : ajout isolé de 6 index B-tree simples, sans migration de production, pour fisher_monthly_invoices.fisher_id/paid_by, maree_monthly_commission_invoices.declared_by/verified_by, orders.fisher_id_snapshot et restaurant_fisher_billing_settings.fisher_id.
- Contrat pgTAP ajouté pour vérifier la présence des six index. Les index ne sont pas encore créés sur la base live ; l'Advisor ne sera recontrôlé qu'après application en environnement de test.
- 14 index signalés comme inutilisés ; ne pas les supprimer sans mesures de charge et revue.
- Lien : https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Console propriétaire / email

- Les empreintes SHA-256 des jetons sont stockées dans un schéma privé.
- Les RPC vérifient la demande pending et l'expiration ; la RPC de décision verrouille le jeton et la demande, consomme le jeton et change le rôle dans une transaction.
- La fonction Edge de notification vérifie l'utilisateur authentifié et l'appartenance de la demande.
- Durcissements isolés ajoutés aux deux fonctions Edge : CORS limité à MAREE_APP_URL et aux origines HTTPS explicitement listées dans MAREE_ALLOWED_ORIGINS (localhost HTTP accepté uniquement s'il est explicitement listé), validation stricte du JSON et de l'identifiant UUID/jeton, réponses d'erreur génériques sans détail du fournisseur ni de la RPC.
- La page de confirmation e-mail est également marquée noindex/nofollow et no-referrer pour limiter l'indexation et la transmission du jeton dans les en-têtes Referer.
- Un défaut de liaison action/jeton a aussi été identifié : auparavant, l'action URL pouvait être modifiée et la RPC consommait le jeton avant que l'Edge function ne compare le résultat. La migration 20261103170000 remplace la RPC par une version qui vérifie p_expected_action après verrouillage du jeton et avant toute consommation ou décision. Le test pgTAP confirme qu'une action discordante ne consomme pas le jeton et que le bon choix reste utilisable.
- Ces changements Edge et SQL sont isolés. Le CORS doit être configuré avec l'origine exacte de l'application dans MAREE_APP_URL et, si nécessaire, les origines additionnelles dans MAREE_ALLOWED_ORIGINS avant déploiement.

## Garde-fous

- Aucun changement de schéma ou de données Supabase production effectué : uniquement des SELECT et Advisors.
- Aucune branche Supabase payante créée.
- Aucun déploiement Cloudflare déclenché.
- Aucun merge vers main effectué.
- Les PR #3 et #5 restent ouvertes et intactes ; leurs branches historiques ne doivent pas être fusionnées en bloc.

## Validation finale de la branche isolée — 2026-11-03

- HEAD : `39566cc791a29d88ffe7ef80080c4c20f43cc22a`.
- `Verify` : SUCCESS — https://github.com/alesk44/Maree/actions/runs/41652386510.
- `Database Contract` : SUCCESS — https://github.com/alesk44/Maree/actions/runs/41652386933. Démarrage Supabase local, reset complet et pgTAP réussis (`All tests successful`).
- Le test historique `security_contract.test.sql` a été corrigé avec un fixture de pêcheur réellement approuvé ; le contrôle métier de réservation n'a pas été affaibli.
- Le setup Supabase CLI est épinglé à `3.0.0` afin d'éviter la résolution `latest` qui avait échoué sur une limite de taux GitHub.
- `main` est à `9bf3dd216e9f905f13be7a3f1cefcc88266ba772`, qui est l'ancêtre commun / base de la branche isolée dans l'historique récupéré ; la branche contient 22 commits propres au-dessus et aucun commit de `main` manquant.
- Décision : la branche isolée est techniquement prête pour une revue de fusion ciblée. Cela n'autorise pas une fusion automatique des PR #3/#5, ni l'application des migrations à Supabase production. Une PR dédiée depuis `work/next-isolated-audit` vers `main` est le chemin recommandé.


## Compléments de validation — facturation concurrente et cycle Marée — 2026-11-03

- Vérification read-only de `cron.job` sur la base de production : job actif `maree-monthly-fisher-invoices`, schedule `0 3 1 * *`, commande `generate_monthly_billing_statements(...)`. La production appelle donc bien l'orchestrateur des deux facturations.
- Un écart a été détecté dans la reconstruction locale : la chaîne de migrations locale laissait le cron sur l'ancien appel du seul générateur pêcheur. La migration isolée `20261103150000_reconcile_monthly_invoice_generators.sql` réconcilie désormais le job vers l'orchestrateur, et le contrat pgTAP vérifie le nom, la planification et l'appel de l'orchestrateur.
- Nouveau test pgTAP `maree_commission_payment_contract.test.sql` : contrôle des droits et du `search_path`, refus d'une déclaration par un autre restaurant, déclaration du restaurant propriétaire, séparation entre déclaration et paiement confirmé, refus de l'auto-validation et validation par un admin avec identité du vérificateur conservée.
- Nouveau test d'intégration `monthly_billing_concurrency.sh` : deux sessions PostgreSQL exécutent simultanément l'orchestrateur pour le même mois. Résultat vérifié : une seule facture pêcheur, une seule facture Marée, une ligne par registre et montants exacts (£50.00, £3.25 de commission, £10.00 de livraison).
- Le workflow Supabase migration a été épinglé à Supabase CLI `3.0.0` pour éviter les échecs de résolution `latest` dus aux limites de requêtes GitHub. Le test de génération concurrente est inclus dans ce workflow.
- Validation sur le commit `dfcfcbd8eb81874768ea529ee95fd9a96a563f94` : Database Contract SUCCESS. Le journal confirme `Files=10, Tests=305`, `All tests successful`, `Result: PASS`. Le nouveau test `monthly_billing_atomicity.test.sql` injecte un échec pendant la génération des lignes Marée, confirme le rollback des deux factures, puis confirme que la relance crée correctement les deux factures.
- Verify SUCCESS sur le commit précédent `7dc3af52660f76b347c42a51c932a3fb2df4c907`; le commit ultérieur ajoute uniquement le contrat SQL d'atomicité.
- Sur le commit parent `7c03cb1d0c52825dca6afb7bf65a24af98c0a475`, le même ensemble de 299 tests pgTAP et le test de génération concurrente ont tous deux réussi ; journal : https://github.com/alesk44/Maree/actions/runs/41695059458.
- La suite Marée CI et Build verification a également réussi sur `7c03cb1`; le dernier changement ensuite a uniquement retiré l'exécution en double du test concurrent dans le workflow Database Contract.
- Les Advisors live signalent toujours la protection contre les mots de passe compromis désactivée dans Supabase Auth. Cela nécessite une activation dans le Dashboard avant ouverture publique ; aucune modification Auth n'a été faite.
- Les six index FK restent dans la migration isolée, non appliquée à la production. Les 14 index signalés inutilisés ne sont pas supprimés.
- Aucun changement de schéma ou de données Supabase production, aucun déploiement Edge/Cloudflare et aucune fusion n'ont été effectués pendant ces contrôles.


## Blocage critique — dérive de l'historique de migrations — 2026-11-03

Comparaison en lecture seule entre `supabase/migrations` de la branche et `supabase_migrations.schema_migrations` de la production :

- Branche isolée : 45 fichiers SQL de migration.
- Production : 44 entrées dans l'historique Supabase.
- 42 entrées de production ont un nom fonctionnel correspondant à un fichier local, mais 28 de ces correspondances ont un timestamp/version différent.
- Deux entrées de production n'ont pas de fichier local de même nom : `20261102043901_enforce_verified_fisher_catch_permissions` et `20261102043926_add_fisher_compliance_intake_fields`.
- Deux fichiers locaux n'ont pas de nom fonctionnel correspondant dans l'historique distant : `20261101010000_public_fisher_directory_and_order_status` et `20261101210000_rpc_entrypoints`.
- L'historique distant contient également des entrées dont le nom embarque l'ancien timestamp de fichier (par ex. `20261102182759 / 20261102060000_profile_avatars`), ce qui crée des doublons apparents avec les entrées précédentes portant le même nom fonctionnel.
- Les trois migrations réellement nouvelles de la branche sont `20261103160000_recheck_fisher_eligibility_on_reservation`, `20261103170000_bind_email_review_action_to_token` et `20261103180000_add_missing_foreign_key_indexes`.

Le dossier `supabase/migrations` de `main` contient les mêmes 42 fichiers que la base de la branche isolée ; cette dérive est donc préexistante et n'a pas été créée par la PR #11. Supabase documente que `migration list` compare les timestamps, pas les noms de fichiers : ces écarts sont donc bloquants pour tout `db push` tant qu'ils ne sont pas réconciliés.

**Décision : aucun push de migration ni réparation de l'historique distant.** Ne pas lancer `supabase db push`, `migration repair` ou une migration manuelle. La suite doit d'abord établir un mapping vérifié fichier par fichier, retrouver/reconstituer les deux migrations distantes absentes, déterminer le statut des deux migrations locales sans correspondance, puis préparer un plan de réparation d'historique avec dry-run/revue. Toute modification de `supabase_migrations.schema_migrations` en production exigera une autorisation distincte et un plan de retour arrière.


## Rectification du rapprochement de migrations — vérification approfondie 2026-11-03

Le rapprochement précédent a été précisé par comparaison stricte des versions Supabase, des noms de migration et du dossier `main`.

- `main` : 42 fichiers SQL ; branche isolée : 45 fichiers SQL. Les 3 fichiers supplémentaires sont exactement les trois migrations PR #11 (révalidation de l'éligibilité pêcheur, liaison action/token email, six index FK). Les deux anciens fichiers locaux `20261101010000_public_fisher_directory_and_order_status` et `20261101210000_rpc_entrypoints` sont déjà présents sur `main`, donc ne sont pas des ajouts PR #11.
- Historique distant : 44 versions.
- Deux versions distantes n'ont pas de fichier local homonyme : `20261102043901_enforce_verified_fisher_catch_permissions` et `20261102043926_add_fisher_compliance_intake_fields`.
- Deux migrations locales historiques n'ont pas de version distante correspondante : `20261101010000_public_fisher_directory_and_order_status` et `20261101210000_rpc_entrypoints`.
- Plusieurs versions distantes ont un nom fonctionnel correspondant à un fichier local, mais un timestamp différent. Les 28 différences de timestamp recensées comprennent aussi des enregistrements distants dont le champ name contient un ancien timestamp dans son texte (par exemple `20261102182759 / 20261102060000_profile_avatars`). Le rapprochement par nom seul n'est pas une preuve d'identité du contenu SQL.
- Contrôle read-only des objets live : `reserve_catch(uuid,numeric,timestamptz,text,text,numeric)` existe en SECURITY DEFINER avec search_path vide ; `review_verification_request_by_email_token(text)` existe encore en une seule signature ; `update_order_status(uuid,order_status)` existe. Les politiques RLS actuelles de `profiles` portent les noms et prédicats de migrations plus récentes que le premier fichier historique local.
- Le fichier historique `20261101010000_public_fisher_directory_and_order_status` ne doit surtout pas être rejoué sans analyse : il crée une politique SELECT supplémentaire `Public fisher directory` et des grants de colonnes, alors que les politiques live actuelles ont déjà une configuration différente et plus récente.
- Le fichier historique `20261101210000_rpc_entrypoints` contient une ancienne version à 5 arguments de `reserve_catch`, alors que la production expose la version actuelle à 6 arguments. Il ne doit pas être rejoué.

**Conclusion opérationnelle inchangée :** aucune migration ne doit être lancée maintenant. Les tests locaux passent, mais ils ne réparent pas la dérive d'historique. Avant tout déploiement, il faut reconstituer les deux anciennes migrations distantes manquantes du dépôt, comprendre l'origine et le contenu exact des entrées distantes timestampées, comparer les migrations SQL historiques aux objets live, puis préparer un plan de réconciliation version par version. Aucune commande de réparation ou de push n'a été exécutée.
