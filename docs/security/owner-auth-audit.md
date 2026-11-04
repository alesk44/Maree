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
