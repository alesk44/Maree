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
- Run final sur le commit 1dde9f8be6030383f74ffb74c9798df73391eb8f : SUCCESS. Build, TypeScript, ESLint et tests Vitest sont tous verts.
- Détails du run : https://github.com/alesk44/Maree/actions/runs/41637825827

## État réel de la base Supabase (lecture seule, 2026-11-03)

Projet maree-jersey : ACTIVE_HEALTHY, PostgreSQL 17.11, région eu-west-2.

La liste des migrations live confirme que la traçabilité est déjà déployée, contrairement à ce que laissait penser le draft PR #5 :
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
- La RPC a EXECUTE pour authenticated et service_role, pas pour anon/PUBLIC ; le corps contient les contrôles d'identité et de propriété.

## Résultats Advisors live

Sécurité :
- 14 fonctions SECURITY DEFINER sont exécutables par authenticated. Ce n'est pas automatiquement une vulnérabilité : chaque RPC doit être revue pour son contrôle auth.uid()/rôle/ressource. attach_external_traceability a été inspectée et comporte des gardes explicites.
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
