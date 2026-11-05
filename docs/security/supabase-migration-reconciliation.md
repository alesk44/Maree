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

### Function-by-function inventory

All 16 advisor-flagged public functions were read in full. All pin `search_path TO ''`; none is executable by `anon`; all are executable by `authenticated` and `service_role` as required by the current RPC design. No blanket revoke is appropriate.

| Function | Authorization / exposure review |
|---|---|
| `attach_external_traceability` | Authenticated fisher/restaurant role; fisher catch ownership or restaurant order ownership is checked before insert. |
| `decide_order_cancellation` | Authenticated fisher role; order ownership is checked and the order is locked. |
| `declare_maree_commission_invoice_paid` | Authenticated restaurant role; open invoice must belong to the caller. |
| `get_maree_commercial_settings` | Authenticated read-only return of global commission/delivery pricing only. |
| `get_my_business_profile` | Filters strictly to `auth.uid()`. |
| `get_my_fisher_private_details` | Filters strictly to `auth.uid()`. |
| `mark_fisher_invoice_paid` | Fisher self-service or allowlisted admin; admin branch is protected by the staged AAL2 migration. |
| `mark_order_paid` | Owning fisher or allowlisted admin; admin branch is protected by the staged AAL2 migration. |
| `request_order_cancellation` | Restaurant role and ownership of the order are checked; order is locked. |
| `reserve_catch` | Restaurant role; catch stock is locked; approved fisher verification record and matching fisher profile are required. |
| `respond_order_cancellation` | Restaurant role and ownership of the order are checked; order and catch are locked. |
| `review_verification_request` | Currently has allowlist plus legacy `profiles.role='admin'` fallback; staged AAL2 migration removes the fallback and requires AAL2. |
| `update_catch_inventory` | Fisher role and catch ownership are checked; stock cannot be increased on an existing lot. |
| `update_maree_commercial_settings` | Allowlisted admin only; staged AAL2 migration adds assurance-level enforcement. |
| `update_order_status` | Fisher role, order ownership and allowed state transitions are checked; inventory is locked before stock restoration. |
| `verify_maree_commission_invoice_paid` | Allowlisted admin only; staged AAL2 migration adds assurance-level enforcement. |

The three RLS-enabled/no-policy findings remain intentional private/service-only access, not a reason to add broad policies. The Performance Advisor reports six unindexed foreign keys, exactly covered by migration `20261103180000`; it also reports 14 currently unused indexes at INFO level. No unused indexes were dropped.

## Owner MFA and recovery readiness

Read-only production query at this inspection:
- Allowlisted admin count: 1.
- Verified TOTP factors for allowlisted admins: 0.
- Unverified TOTP factors for allowlisted admins: 0.
- Active sessions for allowlisted admins: 2.

The security branch now stages an MFA gate plus a backup-factor management panel:
- Initial TOTP enrollment and verification.
- Selection between multiple verified factors during admin challenge.
- Enrollment of a second TOTP factor on a separate device.
- A visible count of verified factors before AAL2 enforcement.

This UI has not been deployed to production and no application TOTP factor has been enrolled or tested. Supabase Auth does not provide recovery codes; its documentation recommends registering a backup factor. The owner should verify two separate application factors and test both challenge paths before AAL2 enforcement. Supabase Dashboard account MFA is separate from application-user MFA and should also have a backup factor.

Before enforcing AAL2:
1. Confirm the allowlisted owner can access the Supabase Dashboard independently of the application session.
2. Deploy the reviewed app build only after the backup/restore preflight; enroll and verify two application TOTP factors on separate devices.
3. Test login/challenge with each factor. Revoke old application sessions and confirm a fresh session reports AAL2.
4. Enable Dashboard account MFA separately and enroll its backup factor. Supabase documents that enabling account MFA signs out other Dashboard sessions.
5. Keep a second trusted organization/project owner where possible. Do not assume an application admin allowlist entry is equivalent to Supabase organization ownership.

The connector cannot inspect or change the complete Auth dashboard configuration. Leaked-password protection remains disabled and must be checked/enabled through the dashboard after preserving the current settings and confirming feature availability. No Auth setting was changed.

Supabase MFA references:
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/reference/javascript/auth-mfa
- https://supabase.com/docs/guides/platform/multi-factor-authentication

## CI / GitHub state at inspection

- PR #14 was merged into `security/owner-auth-hardening` (not `main`) after the rebased head passed Verify, Marée CI and Database Contract. Merge commit/current security branch head: `d7cc52cac4aec083f6b030d2d0bb5f3a1a0ac528`. The Fishial adapter, approved-role quota check, pending/rejected pgTAP cases, config and function code are now integrated into the security branch. Fishial has not been deployed.
- PR #13 remains open and in draft, targeting `main`. Its head is the security branch at `d7cc52cac4aec083f6b030d2d0bb5f3a1a0ac528`. The post-integration CI rerun was in progress at the last read; do not merge until Verify, Build verification, Marée CI, Database Contract and Supabase migration tests all succeed on this exact head.
- PR #12 head `31c86859a6d116ab168aa1c692da43e40331badf`: Verify, Build verification, Marée CI and Database Contract all succeeded. It is a separate eight-file static public informational PWA under `public/assistant/`, with no backend privileges or private data. It remains separate from the security/migration release and has not been merged.
- The security branch contains the corrected eight-migration inventory and the production migration/recovery runbook. The CI rebuilds the branch schema locally; this is not production migration evidence.

## Current decision

This report is a corrected reconciliation and release-preparation record, not authorization to mutate production.

Production has not been migrated, Auth settings have not been changed, and Edge Functions have not been deployed. The eight-migration drift, live email approval mismatch, owner MFA enrollment/recovery readiness, and Free-plan backup/restore gap remain release gates. Do not apply migrations or deploy until the ordered set is validated, a recoverable backup/restore has been demonstrated, and the coordinated Edge Function change is ready.
