# Supabase migration reconciliation — 2026-11-05 (corrected inventory)

## Scope and safety

This is a read-only production reconciliation plus GitHub/CI review. No production SQL writes, migrations, Auth changes, Edge Function deployments, or data changes were performed.

Project: `maree-jersey` (`lhdsvhxszjpzduyzlgpl`), eu-west-2, PostgreSQL 17.11. Organization plan: Free. Project status: ACTIVE_HEALTHY.

## Exact migration inventory

The production migration ledger contains 45 entries. Its latest applied migration is:

- `20261103220545_admin_managed_delivery_payer`

The repository contains:
- `main`: 51 SQL migration files.
- `security/owner-auth-hardening`: 53 SQL migration files.

A complete filename/version-set comparison (not merely a comparison of versions greater than the production head) found **eight** migrations in the security branch that are absent from the production ledger. The earlier report listed only five and omitted three earlier-version migrations. This corrected list supersedes that earlier count.

| Version | Migration | Present in main | Present in security | In production |
|---|---|---:|---:|---:|
| 20261103160000 | recheck_fisher_eligibility_on_reservation | yes | yes | no |
| 20261103170000 | bind_email_review_action_to_token | yes | yes | no |
| 20261103180000 | add_missing_foreign_key_indexes | yes | yes | no |
| 20261103230000 | fisher_cancellation_indemnity_receivables | yes | yes | no |
| 20261103235000 | preserve_catch_state_on_cancellation | yes | yes | no |
| 20261104001000 | preserve_catch_state_on_inventory_edit | yes | yes | no |
| 20261104100000 | enforce_admin_aal2 | no | yes | no |
| 20261105100000 | seafood_recognition_quota | no | yes | no |

There are no production-ledger migrations absent from the `main` migration directory in this comparison.

## Required migration order and dependencies

Preserve the exact chronological order below. Do not cherry-pick the last five and omit the earlier three.

1. `20261103160000_recheck_fisher_eligibility_on_reservation` — rechecks the fisher's approved `verification_requests` record and profile role while reserving a catch; locks the verification request before the profile to match the approval RPC lock order.
2. `20261103170000_bind_email_review_action_to_token` — installs/revokes the internal AAL2 guard and replaces the one-argument email-token RPC with an action-bound two-argument RPC. It rejects action mismatch before consuming a token. It requires the existing admin allowlist and verification-token schema.
3. `20261103180000_add_missing_foreign_key_indexes` — adds six covering FK indexes identified by the live performance review.
4. `20261103230000_fisher_cancellation_indemnity_receivables` — adds the cancellation-indemnity receivable ledger and invoice total, updates cancellation and monthly settlement logic. This is a dependency of the later AAL2 settlement override.
5. `20261103235000_preserve_catch_state_on_cancellation` — updates cancellation/refusal stock restoration so manually paused/reserved catch state is preserved.
6. `20261104001000_preserve_catch_state_on_inventory_edit` — updates inventory editing so non-sold-out catch states are preserved.
7. `20261104100000_enforce_admin_aal2` — reapplies the internal allowlist+AAL2 guard and protects admin RPCs and direct verification-table updates. It depends on the cancellation-indemnity table introduced at step 4 because the admin invoice-settlement function updates that table.
8. `20261105100000_seafood_recognition_quota` — creates the private recognition quota ledger and authenticated quota RPC. The Fishial V2 adapter depends on it.

The quota RPC in the Fishial branch additionally checks that `verification_requests.status = 'approved'` for the same `requested_role` as the profile. The production schema confirms:
- `verification_requests.requested_role` is `public.app_role`.
- `verification_requests.status` is `public.verification_status`.
- `verification_status` values are `pending`, `approved`, `rejected`.
- `app_role` values include `restaurant`, `fisher`, `admin`.

## Production schema evidence

Read-only SQL checks confirm the later cancellation, AAL2 and quota objects are absent:
- `public.fisher_cancellation_indemnities`: absent.
- `public.fisher_monthly_invoices.cancellation_indemnity_total`: absent.
- `private.require_admin_aal2()`: absent.
- `public.consume_seafood_recognition_quota()`: absent.
- `private.seafood_recognition_attempts`: absent.
- The legacy `public.review_verification_request_by_email_token(text)` exists.
- The new `public.review_verification_request_by_email_token(text,text)` does not exist.

Production still has the older cancellation and inventory function definitions. The first missing migration also rechecks fisher approval during reservation, and the second binds the email-confirmation action to the stored one-time token.

## Live email-approval path — release-critical

Current Supabase Edge Function read-back:
- `review-verification-email-action`: ACTIVE, version 7, `verify_jwt=false`.
- Deployed source uses wildcard CORS and a service-role client to call the legacy one-argument token RPC.
- The new repository source requires a Bearer access token, verifies it with Supabase Auth `getUser`, checks the verified subject and AAL2 claim, checks allowlist membership through a user-scoped client, and calls the action-bound two-argument RPC with the user-scoped client.
- The corresponding migration drops the old one-argument SQL function.

Do not apply migration 20261103170000 while leaving the old Edge Function live: the deployed function will continue calling the removed one-argument RPC and email approvals will fail. The SQL migration and reviewed Edge Function deployment must be treated as one coordinated release step, with a tested fallback to the authenticated admin review route. Production Edge Function deployment has not been performed.

## Security Advisor and function review

Latest live Security Advisor:
- 16 authenticated-executable public `SECURITY DEFINER` functions.
- 3 RLS-enabled tables with no policies.
- Leaked/compromised-password protection disabled.

Read-only ACL/function inspection found for the 16 flagged public functions:
- `search_path` is pinned to empty.
- `anon` cannot execute them.
- `authenticated` can execute them; this is intentional for mixed/user-facing RPCs and must not be blanket-revoked.
- Their bodies include role, ownership, state or allowlist checks. Admin-sensitive RPCs still need the staged AAL2 migration to remove the legacy profile-admin fallback and enforce AAL2 in the database.

RLS findings are currently consistent with private/service-only access:
- `private.admin_users`: RLS enabled, no policies, owner-only database ACL.
- `private.verification_email_action_tokens`: RLS enabled, no policies, owner-only database ACL.
- `public.maree_commercial_settings`: RLS enabled, no policies, grants limited to postgres and service_role.
Do not add public/authenticated policies simply to silence the advisor.

Do not blanket-revoke authenticated EXECUTE: the flagged functions support approved business flows. Continue function-by-function authorization review and verify the exact grants after the migration set is tested.

## Owner MFA and recovery readiness

Read-only production query at this inspection:
- Allowlisted admin count: 1.
- Verified TOTP factors for allowlisted admins: 0.
- Unverified TOTP factors for allowlisted admins: 0.
- Active sessions for allowlisted admins: 2.

The staged admin UI supports initial TOTP enrollment and challenge verification, but has no in-app lost-factor recovery path. Before enforcing AAL2 in production:
1. Confirm the allowlisted owner can access the Supabase Dashboard independently of the application session.
2. Enroll and verify TOTP for the allowlisted application account, then verify a fresh AAL2 session.
3. Document and test the emergency factor-reset procedure through the trusted Supabase project owner/admin path.
4. Keep a second trusted organization/project owner where possible; do not assume an application admin allowlist entry is equivalent to Supabase organization ownership.
5. Verify the email approval route and all admin RPCs after coordinated migration/deployment.

The connector cannot inspect or change the complete Auth dashboard configuration. Leaked-password protection remains disabled and must be checked/enabled through the dashboard after preserving the current settings and confirming the plan supports it. No Auth setting was changed.

## Backup and restore readiness — Free plan

The Supabase organization is on the Free plan. Supabase documentation states daily automated database backups are provided on Pro, Team and Enterprise; Free projects should regularly export data with the Supabase CLI and store off-site.

No backup inventory/download/restore API is exposed by the connected Supabase actions used in this inspection. Therefore:
- No verified production backup has been obtained in this run.
- No restore has been executed or tested.
- Do not apply production migrations until a manual logical database export is created, Storage objects are separately exported, the exports are stored securely off-site, and a restore has been tested in a disposable local PostgreSQL/Supabase environment.
- Keep connection strings and credentials out of chat and logs. Use locally managed environment variables/secrets.
- Record the backup timestamp, schema/data coverage, Storage bucket coverage, checksums, restore duration, and post-restore smoke-test results.

Supabase backup guidance: https://supabase.com/docs/guides/platform/backups
CLI dump reference: https://supabase.com/docs/reference/cli/supabase-db-dump

## CI / GitHub state at inspection

- PR #13 head `a734c560bf8352e6c9bb0de25d5670a8eb83bc41`: Build verification, Verify, Marée CI, Database Contract, Supabase migration tests all completed successfully. The database workflow rebuilt the branch schema and passed its pgTAP/concurrency suite. This is branch CI evidence, not production migration evidence.
- PR #14 head `444b23beb7a18c6cca65af3a6eae49852b92c589`: the two malformed pgTAP dollar-quote assertions were corrected and verified in the branch file. Verify, Build and Marée CI succeeded; the fresh Database Contract run was still in progress at the last read. The previous Database Contract run failed at the quota test because of those malformed delimiters.
- PR #14 is based on `security/owner-auth-hardening` and the branch was behind the current target by two commits at the last comparison. Reconcile/rebase the branch and rerun all required workflows before considering merge.
- PR #12 head `31c86859a6d116ab168aa1c692da43e40331badf`: Verify, Build verification, Marée CI and Database Contract all succeeded. It is a separate eight-file static public informational PWA under `public/assistant/`, with no backend privileges or private data. Keep it separate from the security/migration release.

## Current decision

This report is a corrected reconciliation and release-preparation record, not authorization to mutate production.

Production has not been migrated, Auth settings have not been changed, and Edge Functions have not been deployed. The eight-migration drift, live email approval mismatch, owner MFA enrollment/recovery readiness, and Free-plan backup/restore gap remain release gates. Do not apply migrations or deploy until the ordered set is validated, a recoverable backup/restore has been demonstrated, and the coordinated Edge Function change is ready.
