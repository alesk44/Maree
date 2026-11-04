# Marée Jersey — Owner/Auth security audit

Date: 2026-11-04
Environment inspected: Supabase project `maree-jersey` (`lhdsvhxszjpzduyzlgpl`), PostgreSQL 17.11.
Repository: `alesk44/Maree`.
Working branch: `security/owner-auth-hardening` (created from `main`).
Production safety: inspection only. No production SQL, Auth setting, deployment, migration, or merge was performed.

## Confirmed findings

### Role assignment inventory
- `private.admin_users` contains one allowlist entry; the table has RLS enabled, no policies, and no grants to API roles (only owner-level database privileges).
- `private.is_current_user_admin()` checks non-null `auth.uid()` and membership in `private.admin_users`.
- The `auth.users` insert trigger calls `private.handle_new_user()`; this creates `public.profiles` with role hard-coded to `restaurant`. User metadata is used only for display name.
- `authenticated` has no UPDATE privilege on `public.profiles.role`; the role column's update privilege is limited to `postgres` and `service_role`.
- `public.review_verification_request` is the observed application promotion path: it requires an authenticated admin allowlist/profile-admin check, locks a pending request, and only then updates the requested user's profile role.
- No other role/admin-named functions were found in the inspected public/private schemas. Continue source/migration history search before considering this inventory exhaustive.

### Privileged RPC inventory
- Supabase Security Advisor reports 16 public SECURITY DEFINER RPCs executable by `authenticated`; none of those 16 are executable by `anon`.
- Inspected definitions consistently pin `search_path` to empty.
- Business RPCs inspected include ownership and role checks (fisher/restaurant, row ownership, order/invoice state); admin-sensitive RPCs call `private.is_current_user_admin()` or the profile-admin check.
- Do not blanket-revoke EXECUTE from authenticated: this would break legitimate user flows. Harden admin-only operations separately and add explicit AAL2 requirements to owner/admin operations.
- Re-check every function body and grants in the isolated test database before changing any ACL.

### Auth and owner readiness
- Supabase Security Advisor reports leaked/compromised-password protection disabled.
- The allowlisted application owner has zero verified MFA factors in `auth.mfa_factors` at inspection time.
- The same allowlisted user has zero active sessions in `auth.sessions` at inspection time.
- These are application-user MFA/session observations; they do not prove the separate Supabase Dashboard account's MFA state.
- The available connector cannot read or change the project's full Auth dashboard configuration. Confirm password strength, leaked-password protection, session timeouts, and MFA enrollment/verification settings in the Auth dashboard before production changes.

### RLS advisor triage
- `private.admin_users` and `private.verification_email_action_tokens`: RLS enabled, no policies, no API-role grants; retain private-by-default unless a tested internal access pattern requires otherwise.
- `public.maree_commercial_settings`: RLS enabled, no policies, grants limited to postgres/service_role; do not add a public/authenticated policy just to silence the advisor.
- Re-run advisors after isolated changes and document these intentional private/service-only tables.

### Owner command PWA / PR #12
- PR #12 remains OPEN and DRAFT, based on `main`, 9 commits ahead and 0 behind at inspection.
- Its eight files are a static public informational PWA shell. It explicitly states that it is unauthenticated and has no privileged actions or connected AI engine.
- Keep PR #12 separate from backend security changes; do not convert it into an authenticated owner console by adding only client-side checks.

## Required isolated remediation plan

1. Complete a repository-wide search of SQL migrations, triggers, Edge Functions, and app code for role writes, admin allowlist writes, metadata-based authorization, and service-role usage.
2. Build a dedicated owner-auth flow: single explicit allowlisted identity, verified TOTP MFA, server-side AAL2 enforcement on every privileged endpoint/RPC, no authorization from user-editable metadata.
3. Add append-only owner/admin audit events (actor, action, target, timestamp, outcome, request/correlation ID; never secrets or raw tokens).
4. Define session policy: short access-token lifetime appropriate to Supabase constraints, strict refresh handling, explicit global sign-out/revocation procedure, and session checks for high-risk actions where required.
5. Enable leaked-password protection and verify password policy in a non-production environment first; confirm plan/availability in the dashboard.
6. Add regression tests for unauthorized role promotion, forged user metadata, non-owner RPC calls, AAL1 owner calls, expired/revoked sessions, and audit-log tampering.
7. Run local database reset/tests, build/typecheck, and security advisors against the isolated environment. No production migration or deployment without explicit owner approval.


## Production-vs-repository reconciliation — 2026-11-04

Read-only production checks were run after the initial audit. No production writes were performed.

### Migration history drift
- Production `supabase_migrations.schema_migrations` and the Supabase migration listing end at `20261103220545_admin_managed_delivery_payer`.
- Repository migrations newer than that live head include:
  - `20261103160000_recheck_fisher_eligibility_on_reservation.sql`
  - `20261103170000_bind_email_review_action_to_token.sql`
  - `20261103180000_add_missing_foreign_key_indexes.sql`
  - `20261103230000_fisher_cancellation_indemnity_receivables.sql`
  - `20261103235000_preserve_catch_state_on_cancellation.sql`
  - `20261104001000_preserve_catch_state_on_inventory_edit.sql`
- These are pending relative to the production migration history. Do not apply them as a batch without reviewing dependencies and running isolated regression tests first.

### Confirmed live email-review mismatch
- Production Edge Function `review-verification-email-action` is ACTIVE version 5 with `verify_jwt=false`. This is a bearer-token endpoint and must be treated as a privileged approval surface.
- Its deployed code calls `review_verification_request_by_email_token(p_token_hash)` without passing the expected action. It compares the returned action to the request body only after the RPC returns.
- Production still has the one-argument database function `review_verification_request_by_email_token(text)`. The repository migration `20261103170000_bind_email_review_action_to_token.sql` drops that function and replaces it with a two-argument version that validates `p_expected_action` before consuming the token. That migration is not recorded as applied in production.
- Consequence: a mismatched action can cause the stored token action to be executed and consumed before the Edge Function notices the mismatch and returns an error. The user-facing page may therefore report failure even though the decision was committed. This is an integrity/UX vulnerability when a valid token is presented with a mismatched action.
- The deployed Edge Function also uses wildcard CORS and does not perform the stricter origin, body-size, exact-key, and token-format checks present in the repository version. CORS is not authentication, but the deployed implementation should be reconciled with the reviewed source.
- The email-link path uses service-role database access and does not enforce an owner AAL2 session. It is therefore an alternative bearer-token authorization path that bypasses the planned owner MFA requirement. Decide whether to retire email-based approval in favour of signed-in AAL2 confirmation, or explicitly accept and separately harden this exception.

### Effective grants and MFA enforcement
- Read-only ACL inspection confirms `anon` cannot execute the inspected privileged RPCs.
- `authenticated` can execute `review_verification_request`, `update_maree_commercial_settings`, `verify_maree_commission_invoice_paid`, `get_maree_commercial_settings`, and `mark_fisher_invoice_paid`. Their bodies must continue to enforce owner/role/row ownership; do not revoke all authenticated EXECUTE grants indiscriminately.
- None of those inspected functions currently checks JWT AAL2. The admin RPCs that change verification status, commercial settings, or verify commission payment need server-side AAL2 enforcement before they can be considered owner-MFA protected.
- `create_verification_email_action_tokens` is service_role-only. The one-argument email review RPC is also service_role-only; this limits direct API execution but does not remove the bearer-token path.

### Edge Function deployment reconciliation
- Production `notify-verification-request` is ACTIVE version 8 with JWT verification enabled.
- Production `review-verification-email-action` is ACTIVE version 5 with JWT verification disabled.
- The repository source has stricter request validation and action binding than the deployed review function. Treat this as source/deployment drift; do not deploy automatically.

### Updated remediation order
1. Reconcile migration history and inspect all six pending migrations individually; do not apply them wholesale.
2. In a local isolated database, test the existing two-argument action-binding migration against approval, rejection, mismatched-action, expired-token, replay, and concurrent-use cases.
3. Decide the policy for email approval. Recommended secure default: require the allowlisted owner to sign in and satisfy AAL2 before any approval; the email should notify/link to the authenticated review page, not itself authorize the role change.
4. Add AAL2 checks inside each owner/admin database function (not just the UI), including review, commercial settings, commission verification, and the admin branch of any mixed fisher/admin operation.
5. Add an append-only audit record for actor, action, target, result, timestamp, and request ID. Email-based actions must record a verified owner identity; do not record raw bearer tokens.
6. Reconcile deployed Edge Function source only after local tests and explicit production approval.
7. Keep PR #12 draft and do not merge, migrate, or deploy production without explicit approval.


### Completed live role-write inventory
- The only live functions found in `public` / `private` that write `public.profiles.role` are:
  - `public.review_verification_request(...)` — authenticated admin RPC, allowlist/profile-admin check.
  - `public.review_verification_request_by_email_token(text)` — service-role-only bearer-token path.
- `private.handle_new_user()` creates profiles with role hard-coded to `restaurant`; user metadata contributes only the display name.
- No function was found that inserts, updates, or deletes rows in `private.admin_users`. The allowlist remains a manually controlled database-side authority boundary.
- The live `verification_requests.requested_role` CHECK constraint permits only `fisher` and `restaurant`; it cannot promote a user to `admin`. The `app_role` enum also contains `admin`, but that value is excluded from verification requests.
- The live trigger inventory shows `auth.users` INSERT -> `private.handle_new_user()`, plus profile timestamp and verification-request notification/result triggers. No additional auth/profile role-changing trigger was found in that inventory.


## AAL2 enforcement staged on the isolated GitHub branch — 2026-11-04

A new migration has been added but is NOT applied anywhere:
- `supabase/migrations/20261104100000_enforce_admin_aal2.sql`
- Adds an internal `private.require_admin_aal2()` guard. It requires the caller to be an existing allowlisted admin or an admin-profile user AND requires the verified JWT assurance claim `aal2`.
- Applies the guard inside the database functions that perform privileged admin actions:
  - `review_verification_request` (professional role promotion/rejection)
  - `update_maree_commercial_settings` (commission and delivery settings)
  - `verify_maree_commission_invoice_paid` (Marée invoice payment verification)
  - `mark_fisher_invoice_paid` (only the admin override; fisher self-service remains available)
  - `mark_order_paid` (only the admin override; owning fisher self-service remains available)
- The helper is revoked from direct `public`, `anon`, and `authenticated` execution. Existing public RPC grants are preserved for authenticated clients; authorization is enforced inside the SECURITY DEFINER functions.
- The migration preserves each operation's existing ownership, status, and validation checks. It does not grant admin status to an AAL2 user by itself.

Regression contract added:
- `supabase/tests/admin_aal2_contract.test.sql` covers direct helper denial, AAL1 denial for role promotion, commercial-setting changes and settlement override, AAL2 success for those operations, and denial of an ordinary AAL2 user.
- Existing `supabase/tests/security_contract.test.sql` admin fixtures now provide explicit `aal2` claims for expected successful admin actions.

### Important unresolved boundary
- The production email-link RPC `review_verification_request_by_email_token(text)` is a separate service-role bearer-token authorization path. This migration does NOT secure or disable that path. Until it is replaced with an authenticated AAL2 owner flow (or explicitly redesigned and separately hardened), the platform cannot be described as enforcing MFA on every admin approval route.
- Initial validation was subsequently completed by GitHub Actions on commit `2b10eb6b0c2ce02254979b4af14a0510def97aa9`. The hosted runner rebuilt the database from repository migrations and passed the pgTAP security contract tests, concurrent last-stock reservation tests, and concurrent monthly-invoice generation tests.
- The same commit passed Build verification, Marée CI, Verify, Supabase migration tests, and Database Contract workflows. This validates the staged branch in CI; it does not apply the migration to production or prove the live Edge Function has been deployed.
- Keep production unchanged until explicit owner approval, dashboard MFA/password-policy checks, and a separately verified deployment/migration plan.


### Email approval path — AAL2 hardening now staged in source
The isolated branch now also stages the email confirmation path:
- `supabase/functions/review-verification-email-action/index.ts` requires a Bearer access token, verifies it with Supabase Auth `getUser(accessToken)`, then trusts the `aal2` claim only after that cryptographic verification.
- It checks the verified subject matches the user returned by Auth, then calls the authenticated `public.is_current_user_admin()` RPC before using the service-role client to consume the action-bound one-time token.
- `supabase/config.toml` sets `verify_jwt = true` for this Edge Function.
- `src/routes/admin.email-review.tsx` gives an early UX check for a signed-in session, current AAL2, and admin allowlist membership. These client checks are supplementary; the Edge Function enforces the same conditions server-side.
- The one-time token remains an additional authorization secret and is still hash-checked and action-bound in the database. It is no longer intended to be sufficient on its own.

Production remains unchanged: the live Edge Function was previously observed at active version 5 with `verify_jwt=false`. Do not claim email approval is MFA-protected in production until the reviewed source and config are deployed with explicit approval and a live read-back confirms the deployed version.

### Validation status — updated 2026-11-04
- GitHub Actions passed all five workflows on the current security branch head `2b10eb6b0c2ce02254979b4af14a0510def97aa9`: Build verification, Marée CI, Verify, Supabase migration tests, and Database Contract.
- The database workflow rebuilt the schema from repository migrations and passed pgTAP security contracts plus concurrent inventory-reservation and monthly-invoice-generation tests.
- The migration and Edge Function remain staged on the branch only. No production migration, function deployment, or merge was performed.
- Remaining production gates: decide/retire the email approval bearer-token exception in live deployment, confirm owner MFA enrollment and Auth password protections in the dashboard, review the final diff, and obtain explicit owner approval before any production change.


**Least-privilege refinement:** the staged `private.require_admin_aal2()` guard now requires explicit membership in `private.admin_users` plus JWT `aal2`. A profile role of `admin` alone is deliberately insufficient for these privileged operations. This avoids broadening the existing allowlist-only authority used by commercial settings and payment-verification RPCs.
