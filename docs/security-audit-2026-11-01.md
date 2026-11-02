# Supabase security and migration audit — 2026-11-01

Scope: read-only inspection of the connected `maree-jersey` Supabase project and repository work on `feature/supabase-shared-data-v2`. The remote database was not modified, no migrations were applied remotely, no production deployment was made, and no PR was merged.

## Verified remote controls

- RLS is enabled on `profiles`, `catches`, `orders`, and `verification_requests`.
- Public catch reads are limited to available lots; fisher writes are scoped to the signed-in fisher and checked against the profile role.
- Orders are readable by the placing restaurant and the fisher who owns the catch. Browser roles cannot directly insert or update orders.
- Profile grants are column-scoped; the private `phone` field is not readable by browser roles.
- The public fisher directory view uses `security_invoker=true` and `security_barrier=true`.
- Verification requests are readable by their owner/admin; insertion is scoped to the current user; review is admin-only.
- `reserve_catch` validates the restaurant role, locks the catch row with `FOR UPDATE`, checks stock and inserts/decrements within one transaction.
- `review_verification_request` checks admin role and only reviews pending requests.
- `update_order_status` originally checked catch ownership and sequential status transitions. The branch migration now also checks the current profile role is `fisher`, closing a role-change edge case; this correction is pending remote application.
- SECURITY DEFINER RPCs use an empty `search_path`; browser EXECUTE is denied to anon and granted to authenticated where intended.

## Migration history reconciliation — branch work and local CI validation completed

The connected Supabase project reports 13 applied migration versions. The branch previously had five migration files with different timestamps, which made the repository history misleading and unsafe to use for a clean rebuild.

The branch has now been reorganised so the first 13 migration filenames/versions match the 13 versions recorded by Supabase. Two additional additive migrations follow those 13:

1. `20261030144648_initial_schema`
2. `20261030145326_fisher_profile_fields`
3. `20261030145331_fix_since_year_constraint`
4. `20261030145346_allow_public_fisher_profiles_read`
5. `20261030151002_verification_requests`
6. `20261030151036_admin_review_verification_rpc`
7. `20261101185105_lock_down_public_profile_columns`
8. `20261101185242_harden_public_table_grants`
9. `20261101203410_public_fisher_directory_view`
10. `20261101203432_restrict_public_fisher_directory_grants`
11. `20261101204702_secure_public_fisher_directory_invoker`
12. `20261101204730_grant_public_fisher_directory_columns`
13. `20261101204742_grant_fisher_directory_filter_column`

Two additive migrations follow the recorded history:
- `20261101210000_rpc_entrypoints`: reproducible definitions for `reserve_catch` and `update_order_status`, including the fisher-role guard.
- `20261101211000_verification_request_indexes`: indexes for `verification_requests.user_id` and non-null `reviewed_by`, addressing the performance advisor findings.

The original mismatched five files were removed from the branch. A local Supabase configuration targeting PostgreSQL 17 (matching the connected project), a 30-assertion pgTAP security-contract suite, a two-session last-stock concurrency script, and a GitHub Actions workflow were added. On commit `c233d00d6b65c9dee080d6c74abcf983730e60e2`, GitHub Actions successfully rebuilt the local database from all 15 repository migrations, ran `supabase test db` with all 30 assertions passing, and completed the concurrent-last-stock test successfully. Build verification, Verify, Marée CI and the private Cloudflare preview deployment also succeeded. The first 13 files are reconstructed from the recorded migration names, branch history and current schema inspection; they are not being replayed against the already-migrated remote database.

**Do not run `db reset` or apply migrations to the connected remote project.** A future `db push` should apply only the two additive migrations after the local rebuild and tests pass and after an explicit review.

## Outstanding security and product tests

- [x] pgTAP tests passed for anon, restaurant and fisher visibility, role restrictions, RPC privileges, non-owner order updates, admin-only review, and attempted updates to another fisher's catch.
- [x] Two-connection last-stock concurrency test passed in GitHub Actions.
- [ ] Admin-specific session coverage can be expanded in a follow-up test suite; current pgTAP explicitly verifies that a fisher cannot review verification requests.
- Performance advisor findings for `verification_requests.user_id` and `reviewed_by` are addressed in the pending index migration, not yet applied to the remote database.
- The performance advisor also reported multiple permissive SELECT policies on `profiles` and `verification_requests`; they are not evidence of a bypass, but can be consolidated later.

## Observed remote data state

The four application tables contained zero rows at the time of the read-only audit. The two-account restaurant/fisher workflow has therefore not yet been demonstrated against real authenticated accounts.

## Safe next sequence

1. [x] Local migration rebuild, 30 pgTAP assertions and concurrency test passed in GitHub Actions.
2. [ ] Re-run security/performance advisors after review of the pending additive migrations.
3. [ ] Test a restaurant and a fisher account end-to-end in private preview.
4. [ ] Only after explicit approval, apply the additive migrations to the remote preview environment; never merge to `main` or deploy production without approval.
