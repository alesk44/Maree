# Marée Jersey — production migration and recovery runbook

Date: 2026-11-05
Scope: preparation only. This runbook is not an execution approval.

## Current release gates

- Production is on Supabase Free, PostgreSQL 17.11, region eu-west-2.
- Production migration ledger: 45; latest applied: `20261103220545_admin_managed_delivery_payer`.
- Eight migrations are absent from production. Seven belong to the security/accounting release in PR #13; the eighth, `20261105100000_seafood_recognition_quota`, belongs to the separate seafood-recognition PR #15. Keep that feature migration out of the PR #13 production release. Their exact order is in `docs/security/supabase-migration-reconciliation.md`.
- The live `review-verification-email-action` Edge Function is version 7 with `verify_jwt=false` and calls the legacy one-argument SQL RPC.
- The allowlisted application admin currently has zero verified TOTP factors. The security branch now stages initial enrollment, selection between verified factors, and enrollment of a second backup TOTP factor. This UI is not yet deployed to production, and no factor enrollment has been verified.
- The Free plan does not include Supabase's daily automated database backups. No verified manual backup or restore drill has yet been completed.
- Fresh read-only Auth/Security Advisor snapshot at 2026-11-05 15:19 UTC: 0 verified TOTP factors, 0 unverified TOTP factors and 2 active owner sessions; `review-verification-email-action` remains v7 with `verify_jwt=false`; leaked-password protection remains disabled. Do not enable AAL2 or change Auth settings until the staged MFA UI and two-factor owner enrollment have been validated.
- The same Security Advisor snapshot reports 16 authenticated-callable `SECURITY DEFINER` RPC warnings and 3 RLS-enabled tables with no policies (`private.admin_users`, `private.verification_email_action_tokens`, `public.maree_commercial_settings`). These are tracked review findings, not a reason to add broad policies or revoke intentional RPC access blindly; validate each function's internal role/ownership checks and the table grants before changing them.
- Do not execute production migrations, Auth changes, or Edge Function deployments until every gate below is checked.

## 1. Freeze and capture the release candidate

1. Record the exact GitHub SHAs for `main`, the security branch, and the Fishial branch.
2. Confirm the PR CI results are complete and successful for those exact SHAs.
3. Confirm the complete ordered migration list and the production ledger. Do not infer pending migrations only from the latest timestamp.
4. Confirm no unrelated dashboard/manual schema changes have appeared since the last read-only comparison.
5. Freeze production schema/auth/deployment changes for the maintenance window.

## 2. Manual database export (Free plan)

Use a trusted local workstation with Supabase CLI and Docker installed. Obtain the database connection string from the Supabase Dashboard's Connect panel. Do not paste it into ChatGPT, GitHub, source files, shell scripts, or logs.

Example shell sequence (run locally; do not commit backup artifacts):

```bash
umask 077
BACKUP_DIR="$HOME/maree-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
read -rsp "Supabase database connection string: " DB_URL
printf '\n'
export DB_URL
supabase db dump --db-url "$DB_URL" -f "$BACKUP_DIR/roles.sql" --role-only
supabase db dump --db-url "$DB_URL" -f "$BACKUP_DIR/schema.sql"
supabase db dump --db-url "$DB_URL" -f "$BACKUP_DIR/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "$DB_URL" -f "$BACKUP_DIR/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$DB_URL" -f "$BACKUP_DIR/history_data.sql" --use-copy --data-only --schema supabase_migrations
unset DB_URL
sha256sum "$BACKUP_DIR"/*.sql > "$BACKUP_DIR/SHA256SUMS"
```

Important coverage checks:
- Supabase's current CLI reference says the standard dump filters managed schemas, while the current platform restore guide describes `auth.users` as included. Treat Auth coverage as **unverified until inspected**: search the generated `data.sql` for a `COPY auth.users` block and compare restored Auth-user counts with the production baseline. The companion PowerShell script records this as `auth_users_copy_detected`; a false value is a hard recovery blocker, not a harmless warning. Never upload or commit these files: the data dump may contain email addresses and password hashes.
- Preserve the CLI migration ledger separately with `history_schema.sql` and `history_data.sql` using `--schema supabase_migrations`. These are separate from the seven pending Marée feature migrations.
- Inspect the generated schema/data exports locally and record exactly which application schemas and tables are present, especially `public` and `private`.
- Follow current Supabase documentation for any separately supported Auth/user export needed for the recovery target. Do not manually copy secrets or JWT signing keys into the backup directory.
- Database backups do not contain Storage object bytes. Export every required Storage bucket/object separately using the supported Storage CLI or S3-compatible export method. Preserve bucket names, object paths, metadata and checksums.
- Export/document Edge Function source and non-secret configuration separately. Record secret *names* and which deployment environment owns them, never their values.
- Capture Auth provider, password protection, redirect URL, MFA and session settings as a configuration checklist; do not change them during backup.

Store the backup outside the project and outside the Git repository. Restrict filesystem permissions. Keep a second encrypted off-site copy. Record UTC timestamp, CLI version, project ref, file sizes, checksums, schema/table coverage, bucket/object counts and any exclusions.

References:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/storage/management/download-objects

### Read-only pre-backup integrity baseline — 2026-11-05 14:54:56 UTC

Exact row counts were captured on production with read-only `count(*)` queries. Re-capture immediately before the actual export and compare again after restore; these counts are a checkpoint, not a frozen snapshot.

| Table | Rows |
|---|---:|
| `public.profiles` | 2 |
| `public.verification_requests` | 3 |
| `public.catches` | 1 |
| `public.orders` | 3 |
| `public.fisher_monthly_invoices` | 0 |
| `public.fisher_monthly_invoice_items` | 0 |
| `public.maree_monthly_commission_invoices` | 0 |
| `public.maree_monthly_commission_invoice_items` | 0 |
| `public.verification_documents` | 0 |
| `public.notifications` | 0 |
| `public.catch_traceability_codes` | 0 |
| `public.catch_traceability_events` | 0 |
| `public.restaurant_fisher_billing_settings` | 0 |
| `private.verification_email_action_tokens` | 4 |
| `private.admin_users` | 1 |
| `auth.users` | 2 |

Storage baseline:
- `avatars`: public bucket, 1 object, 1,320,422 bytes.
- `fisher-compliance`: private bucket, 0 objects.
- Total: 2 buckets, 1 object.

The database dump and Storage object export are separate deliverables. The Windows helper `maree-production-backup.ps1` writes under the current user's `%LOCALAPPDATA%\\Maree-Backups`, restricts the new backup directory ACL to that Windows account, exports roles/schema/data and the migration ledger, creates SHA-256 checksums, and flags whether an `auth.users` COPY block was detected. It requires Supabase CLI, Docker Desktop and a percent-encoded database connection string entered locally. The companion `maree-storage-backup.cjs` writes under `%LOCALAPPDATA%\\Maree-Backups` on Windows (or `~/.local/share/Maree-Backups` on Linux/macOS), uses restrictive file/directory modes where supported, downloads Storage objects with SHA-256 checksums, and refuses to read the secret key without an interactive TTY so it cannot fall back to echoing it. It requires Node.js and `@supabase/supabase-js`. After export, verify the manifest reports 2 buckets and 1 object, then encrypt the directory and keep an off-site copy. The Storage script passed `node --check`, a mocked two-bucket/one-object export and a real SHA-256 verification of the mocked artifact. It has NOT been run against production; live export and checksum verification remain outstanding.
A third local helper, `maree-verify-backup.ps1`, checks the database export file set, SHA-256 entries, project refs, the Auth-user detection flag, Storage bucket inventory, object byte counts and object SHA-256 hashes. Run it only after both exports exist; it is a file-integrity check, not a substitute for a PostgreSQL restore drill. It has not yet been run under Windows PowerShell in this environment.

## 3. Restore drill — must pass before production change

Use a disposable local PostgreSQL 17/Supabase environment on the workstation. Do not create a paid Supabase project or branch for this drill.

1. Start from a clean local environment matching PostgreSQL 17 and required extensions.
2. Restore roles, schema and data using the current Supabase restore guide. Review the SQL and privilege defaults before executing; do not blindly import production ACLs into a different target.
3. Verify the restore does not silently omit `private` schema objects, required Auth/user data, or application tables.
4. Restore Storage objects separately and compare object counts and checksums.
5. Run read-only row-count and integrity checks for key tables: profiles, verification_requests, catches, orders, fisher_monthly_invoices, fisher_monthly_invoice_items, maree_monthly_commission_invoices, verification_documents, and notification records.
6. Confirm foreign keys, triggers, RLS flags, policies, function definitions, grants, extensions and storage metadata.
7. Record restore duration, errors, missing objects, and checksum results.

A successful `supabase db reset` in GitHub Actions proves that repository migrations rebuild an empty database. It does not prove that a production-data backup can be restored. Both checks are required.

## 4. Isolated migration rehearsal

On the restored local snapshot (or a verified local clone of the production schema and data):

1. Confirm the migration ledger matches the 45-version production baseline.
2. For the PR #13 rehearsal, apply security/accounting migrations 1–7 individually in the exact chronological order documented in the reconciliation report. Separately rehearse migration 8 only against the PR #15 feature candidate; do not combine its production release with PR #13.
3. Stop on the first error. Do not skip a migration or manually mark it as applied.
4. After each migration, check the expected objects, constraints, indexes, policies, function signatures and grants.
5. Run all pgTAP tests, database contract tests, reservation concurrency tests, and monthly billing concurrency tests.
6. Re-run Security Advisor-equivalent SQL checks and the local Supabase security/performance checks.
7. Re-run the migration rehearsal from a clean restore at least twice to check idempotence and repeatability.

## 5. Coordinated email-approval release

The current production Edge Function is incompatible with the new two-argument email-token RPC.

- Migration `20261103170000_bind_email_action_to_token` replaces the legacy one-argument RPC.
- The deployed Edge Function v7 still calls the one-argument RPC using a service-role client.
- The reviewed branch Edge Function requires a verified Bearer JWT, checks the user with Auth `getUser`, requires AAL2 and allowlist membership, then calls the two-argument RPC with the user's JWT.

Release sequence after backup and rehearsal:
1. Deploy the reviewed application build containing the initial admin TOTP enrollment gate, without applying AAL2 enforcement yet. Confirm it is the intended app target and no automatic production deployment is triggered.
2. The allowlisted owner signs in, enrolls and verifies two TOTP factors on separate devices, and tests a challenge with each factor. Revoke existing application sessions and require a fresh AAL2 sign-in. Do not proceed with only one verified factor.
3. During the approved maintenance window, apply migrations 1 and 2 in order. The legacy email RPC is removed at step 2; the old Edge Function will fail closed during the transition rather than continue using the bearer-only path.
4. Immediately deploy the reviewed `review-verification-email-action` function with gateway JWT verification enabled. Read back the deployed version and `verify_jwt=true`; confirm the deployed source matches the reviewed commit.
   - Before deployment, configure the Edge Function environment variables `MAREE_APP_URL` and, if needed, `MAREE_ALLOWED_ORIGINS` with the exact HTTPS origin(s) of the deployed Marée frontend (origin only: scheme + hostname + optional port; no path). The function rejects browser origins not in this allowlist. If these variables are missing, browser calls with an Origin header will be rejected. Do not guess the production domain; read it from the actual frontend deployment and test both allowed and disallowed origins.
   - Set environment variables through the Supabase Dashboard or local CLI secret workflow; never commit their values. They are origin configuration, not authorization: JWT validation, verified AAL2 and database allowlist checks remain mandatory.
5. Test email approval/rejection with: missing JWT, invalid JWT, non-admin, AAL1, AAL2 allowlisted admin, wrong action, expired token, replayed token and concurrent token use. Confirm a mismatch does not consume the token.
6. Continue with security/accounting migrations 3 through 7 only after the email route is confirmed and all prior post-migration checks pass. Do not apply migration 8 (`20261105100000_seafood_recognition_quota`) as part of PR #13; it is reserved for the separate PR #15 seafood-recognition release.

Do not deploy the Fishial V2 function as part of this release. Seafood recognition, its quota migration, Fishial/OpenAI adapters and photo-identification UI are isolated in separate draft PR #15 (8 files, 8 commits), based on `main`. PR #15 has its own five green CI workflows on head `d2ebf267628301a2fc7e7bb9810463012d6116e8`; it is not part of PR #13 and requires its own review, provider-secret setup, migration rehearsal and explicit release approval.

## 6. Owner MFA and emergency recovery

Before AAL2 enforcement:
- Verify one allowlisted admin is the intended owner identity.
- Supabase Auth does not provide recovery codes. Supabase documents support for multiple factors (up to 10) and recommends a backup TOTP factor; losing all factors can make account recovery impossible.
- The security branch now stages an application UI to enroll a second TOTP factor and choose between verified factors during challenge. This reduces single-device lockout risk but cannot recover an account after all factors are lost.
- Verify two application TOTP factors on separate devices and test both challenge paths before enabling AAL2.
- Supabase Dashboard account MFA is separate from the project's application-user MFA. Enable Dashboard account MFA and register a backup factor there as well; enabling it logs out other Dashboard sessions, so sign in again with MFA.
- Confirm the owner can access the Supabase organization/project Dashboard independently of the application session. Keep a second trusted organization owner where possible.
- Do not enforce AAL2 until the updated application UI is deployed, two application factors are verified, fresh AAL2 login is tested, and Dashboard account MFA is configured.

Supabase MFA references:
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/reference/javascript/auth-mfa
- https://supabase.com/docs/guides/platform/multi-factor-authentication

## 7. Post-migration verification

Read-only checks after the release:
- **PR #13 release:** migration ledger contains the seven expected security/accounting versions and no unexpected versions.
- **PR #15 release only:** apply and verify `20261105100000_seafood_recognition_quota` in its own approved maintenance window.
- `public.fisher_cancellation_indemnities` exists.
- `public.fisher_monthly_invoices.cancellation_indemnity_total` exists.
- `private.require_admin_aal2()` exists and is not directly executable by anon/authenticated.
- The two-argument email-token RPC exists; the legacy one-argument RPC is absent.
- **Separate PR #15 release only:** `private.seafood_recognition_attempts` and `public.consume_seafood_recognition_quota()` exist with the intended grants.
- The six foreign-key indexes from migration 3 exist.
- AAL1 admin calls fail; allowlisted AAL2 admin calls succeed; ordinary AAL2 users remain denied.
- **Separate PR #15 release only:** Fishial quota denies pending/rejected/mismatched-role accounts and enforces 3 requests per 10 minutes and 10 per 24 hours.
- Cancellation indemnities, monthly invoices, inventory state preservation, order settlement and commission calculations pass their contract tests.
- Edge Function read-back shows the intended version and `verify_jwt=true`.
- Re-run Security Advisor. Retain intentional no-policy RLS findings for private/service-only tables; do not add broad policies to silence warnings.
- Confirm Auth leaked-password protection and password policy in the Dashboard after preserving the original configuration and verifying feature availability.

## 8. Rollback and incident response

These migrations are not treated as safely reversible. Do not run `supabase db reset` against production and do not delete data to make a migration pass.

- If a migration fails, stop immediately. Record the exact migration, error and current ledger. Do not mark it applied manually and do not continue to later migrations.
- Prefer a reviewed forward-fix migration for a partially applied/failed DDL operation. Rehearse the forward fix against the restored local snapshot first.
- If the application build fails but the database is sound, revert the application deployment to its prior known-good build; do not revert database schema blindly.
- If the new email Edge Function fails after the two-argument migration, keep the old bearer-only path disabled. Use the authenticated owner admin review route while repairing the function.
- If data corruption or an unrecoverable schema error occurs, restore only from the verified manual backup after explicit owner approval. A restore can overwrite newer production data and cause downtime; record the chosen recovery point and expected data-loss window.
- Restore Storage objects separately from the database. Reconcile bucket/object metadata after restoration.
- After any restore, rotate/reissue credentials as appropriate through the Dashboard, re-check Auth provider settings, Edge Functions, redirect URLs, webhooks and storage policies. Never restore secrets into Git or chat.

## CI validation — 2026-11-05

The current release candidate documentation commit is `be82e4b72799fe1ccc5f693b6eb1c3e5fc2183d2`. All five required GitHub Actions workflows completed successfully on this exact SHA:
- Build verification
- Marée CI
- Verify
- Supabase migration tests
- Database Contract

The executable source commit `f238078de4b2f0ea53e2d073f21483068687fecf` passed 391 pgTAP assertions across 13 test files, plus concurrent last-stock reservation and concurrent monthly-invoice generation checks. The later `be82e4b` commit only reconciles security documentation; its five workflows also passed. This CI evidence validates repository code on a clean local database, not a restore of production data.

## Current execution status

- Backup created: no.
- Storage export created: no.
- Restore drill passed: no.
- Migration rehearsal on restored production data: no.
- Production migration applied: no.
- Auth configuration changed: no.
- Edge Function deployed: no.

Production remains unchanged until all prerequisites and an explicit maintenance release decision are satisfied.
