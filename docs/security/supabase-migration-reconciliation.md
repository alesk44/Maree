# Supabase migration reconciliation — 2026-11-05

## Scope and safety

This report compares the production Supabase migration ledger with the repository migration directories and verifies selected schema objects using read-only SQL. It does not apply migrations, alter production data, deploy Edge Functions, or change Auth settings.

Project: `maree-jersey` (`lhdsvhxszjpzduyzlgpl`, eu-west-2, PostgreSQL 17.11).

## Verified migration ledger

Production reports 45 applied migrations. The latest applied migration is:

- `20261103220545_admin_managed_delivery_payer`

The repository `main` branch contains 51 migration files; the `security/owner-auth-hardening` branch contains 53.

The following five repository migrations are newer than the production ledger and are not recorded as applied:

| Version | Migration | Present on |
|---|---|---|
| 20261103230000 | fisher_cancellation_indemnity_receivables | main + security |
| 20261103235000 | preserve_catch_state_on_cancellation | main + security |
| 20261104001000 | preserve_catch_state_on_inventory_edit | main + security |
| 20261104100000 | enforce_admin_aal2 | security only |
| 20261105100000 | seafood_recognition_quota | security only |

## Read-only production schema checks

The following checks were run against the production database:

- `public.fisher_cancellation_indemnities`: absent.
- `public.fisher_monthly_invoices.cancellation_indemnity_total`: absent.
- `private.require_admin_aal2()`: absent.
- `public.consume_seafood_recognition_quota()`: absent.
- `private.seafood_recognition_attempts`: absent.
- `public.respond_order_cancellation(uuid, boolean)`: present (older implementation).
- `public.update_catch_inventory(uuid, numeric, numeric)`: present (older implementation).

This confirms that the first three migrations contain changes not yet reflected in the production schema, while the AAL2 and quota additions are also absent.

## Dependency and rollout order

The migration order in the security branch is chronological and must be preserved:

1. `20261103230000_fisher_cancellation_indemnity_receivables` creates the indemnity table/column and updates cancellation and monthly settlement routines.
2. `20261103235000_preserve_catch_state_on_cancellation` replaces cancellation and order-status routines.
3. `20261104001000_preserve_catch_state_on_inventory_edit` replaces inventory editing behavior.
4. `20261104100000_enforce_admin_aal2` installs the private AAL2 guard and replaces privileged admin routines. It depends on the cancellation-indemnity table introduced in step 1.
5. `20261105100000_seafood_recognition_quota` creates the private recognition quota ledger and authenticated quota RPC. The Fishial adapter depends on this RPC.

Do not cherry-pick or apply the later migrations ahead of their dependencies.

## CI and validation evidence

- The security branch's database rebuild and pgTAP migration suite passed on the earlier executable commit `b5a7d76f639322e8de868afb18ff0875439c5831`.
- The latest security-branch code correction `ddfb8acad54fd39bb3c523056801dee2ead2c637` passed Verify, Build verification, and Marée CI; its Supabase migration tests and Database Contract runs were still in progress at the time of this report.
- Fishial branch Verify passed on `b54dc5d6afb28807562ade1d4de2d97b30cf1829`. Its earlier Database Contract run exposed malformed pgTAP dollar quoting; the quoting was corrected in this commit and requires the fresh Database Contract run to finish before release.
- No PR has been merged as part of this reconciliation.

## Release blockers / required controls

1. Run a fresh full local database reset and pgTAP suite on the final combined branch, including all five migrations.
2. Review migration SQL and confirm current data compatibility, especially the new indemnity accounting and paid-invoice behavior.
3. Confirm an owner MFA enrollment path before enforcing AAL2 for all privileged admin actions.
4. Supabase Security Advisor reported leaked-password protection disabled. Enable and verify this Auth setting before treating the security hardening as release-ready.
5. Review the Security Advisor's 16 authenticated SECURITY DEFINER findings individually. These RPCs may be intentional; each must have explicit authorization checks and least-privilege grants.
6. Take/verify a recoverable database backup and prepare a tested rollback/recovery plan before any production migration.
7. Apply the five migrations to production only in the listed order during an explicitly approved change window, then verify the migration ledger, schema objects, RPC grants, RLS, and application smoke tests.

## Current conclusion

Migration drift is identified and bounded to five unapplied repository migrations. Production schema checks confirm the expected missing objects and older function implementations. This is a prepared reconciliation plan, not a production migration. Production remains unchanged.
