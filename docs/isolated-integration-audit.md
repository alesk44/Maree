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
- Le workflow Verify est ordonné : install frozen, build (génère les routes), TypeScript, ESLint, tests.
- Run final sur le commit 10b130fc4ea3d206645b4a839415f42bd2c71854 : SUCCESS. Build, TypeScript, ESLint et tests Vitest sont tous verts.
- Détails du run : https://github.com/alesk44/Maree/actions/runs/41638176112

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
- Contrat de régression ajouté dans supabase/tests/reserve_catch_fisher_eligibility_contract.test.sql : cas pêcheur rétrogradé, vérification encore pending, et pêcheur approuvé valide avec contrôle du stock.
- Important : cette migration et ce test sont uniquement sur la branche isolée. Ils n'ont pas été appliqués à Supabase production. Le workflow GitHub Verify ne lance pas actuellement les scripts pgTAP ; leur exécution SQL reste à faire dans une base locale/test isolée avant toute proposition de fusion.
- L'état live audité avant le patch comptait 1 lot disponible, 0 lot lié à un profil non-fisher et 0 lot disponible sans demande approuvée. Aucun cas anormal n'était présent.
- La règle de blocage des commandes est à partir de 3 factures mensuelles ouvertes, échues et impayées ; le délai de 7 jours après la clôture mensuelle est appliqué dans la génération des factures. Le comportement observé correspond à la règle métier validée.

## Résultats Advisors live

Sécurité :
- 14 fonctions SECURITY DEFINER exécutables par authenticated. Voir la revue ci-dessus.
- 3 tables RLS sans policy : private.admin_users, private.verification_email_action_tokens et public.maree_commercial_settings. Vérification complémentaire : maree_commercial_settings n'accorde aucun privilège à anon/authenticated, uniquement à postgres/service_role ; l'absence de policy API est donc intentionnelle à ce stade. Les deux autres tables sont dans le schéma privé.
- Protection contre les mots de passe compromis désactivée dans Supabase Auth.
- Liens de remédiation : https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable et https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance :
- 6 clés étrangères sans index couvrant, dont fisher_monthly_invoices.fisher_id, orders.fisher_id_snapshot et restaurant_fisher_billing_settings.fisher_id.
- 14 index signalés comme inutilisés ; ne pas les supprimer sans mesures de charge et revue.
- Lien : https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Console propriétaire / email

- Les empreintes SHA-256 des jetons sont stockées dans un schéma privé.
- Les RPC vérifient la demande pending et l'expiration ; la RPC de décision verrouille le jeton et la demande, consomme le jeton et change le rôle dans une transaction.
- La fonction Edge de notification vérifie l'utilisateur authentifié et l'appartenance de la demande.
- Durcissements à prévoir : CORS restreint, validation stricte du JSON, réponses génériques sans erreur RPC interne, configuration HTTPS obligatoire, tests de rejeu/concurrence, absence de jetons bruts dans les logs.

## Garde-fous

- Aucun changement de schéma ou de données Supabase effectué : uniquement des SELECT et Advisors.
- Aucune branche Supabase payante créée.
- Aucun déploiement Cloudflare déclenché.
- Aucun merge vers main effectué.
- Les PR #3 et #5 restent ouvertes et intactes.
