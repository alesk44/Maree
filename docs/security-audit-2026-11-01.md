# Supabase security and migration audit — 2026-11-01

Scope: read-only inspection of the connected `maree-jersey` Supabase project and the `feature/supabase-shared-data-v2` GitHub branch. No database writes, migrations, production deployments, or merges were performed.

## Verified controls

- Row Level Security is enabled on `profiles`, `catches`, `orders`, and `verification_requests`.
- Public catch reads are limited by policy to available lots; authenticated fishers can insert/update only their own lots when their profile role is `fisher`.
- Orders have a read policy for the placing restaurant and the fisher who owns the associated catch. Browser roles have SELECT only on `orders`; order creation and status changes go through RPCs.
- Profile browser grants are column-scoped. Public access excludes the private `phone` column. The public fisher directory view is configured with `security_invoker=true` and `security_barrier=true`.
- Verification requests are readable by their owner and admins; inserts require the authenticated user's own `user_id`; review updates are restricted by an admin RLS policy.
- `reserve_catch` checks authentication and restaurant role, validates quantity/slot/fulfilment/note, locks the catch row with `FOR UPDATE`, checks remaining stock, inserts the order and decrements stock in one transaction.
- `update_order_status` checks authentication, catch ownership and the sequential submitted → confirmed → ready → delivered transitions.
- `review_verification_request` checks the admin profile role and only reviews pending requests.
- The inspected SECURITY DEFINER functions use an empty search_path and have EXECUTE granted to authenticated (and service_role), not anon/PUBLIC.

## Items to resolve before real-user launch

### 1. Migration history drift — blocker

The connected database reports 13 applied migration versions, while the branch currently contains only five SQL migration files. Their version numbers/names do not line up. The live database also contains `verification_requests`, `review_verification_request`, and the `public_fisher_directory` view, but the branch's migration directory does not contain the corresponding complete migration history.

Do not run `db push`, apply migrations, reset, or attempt to baseline the project until the migration history is reconciled against the actual schema. First recover/export the missing migration definitions and establish a reproducible clean-database setup.

### 2. Automated adversarial tests — outstanding

No `supabase/tests` directory currently exists in the branch. Add pgTAP coverage after migration history is made reproducible. Required cases:
- anon cannot read private profile phone numbers or orders;
- a restaurant cannot publish catches or update another user's catch;
- a fisher cannot reserve a catch or read another restaurant's order;
- a restaurant cannot update order status directly or call fisher-only transitions;
- a non-admin cannot approve/reject verification requests;
- a user cannot submit a verification request for another user;
- invalid order transitions are rejected;
- two concurrent reservations cannot oversell a catch (one transaction must fail when stock is exhausted).

### 3. Advisor findings

- Security advisor reports three authenticated-callable SECURITY DEFINER functions: `reserve_catch`, `review_verification_request`, and `update_order_status`. These are intentional RPC entry points, but their internal role/ownership checks must remain covered by negative tests.
- Performance advisor reports missing indexes on `verification_requests.user_id` and `verification_requests.reviewed_by`. Assess/add appropriate indexes as part of a reviewed migration.
- Performance advisor also reports multiple permissive SELECT policies on `profiles` and `verification_requests`; these are not evidence of a bypass, but can be consolidated if useful.

## Current observed data state

The four inspected application tables reported zero rows at audit time. This means a real two-account workflow has not yet been demonstrated against populated application data.

## Next safe sequence

1. Reconcile the database migration history and branch SQL files without changing the live schema.
2. Rebuild a clean local/preview database from the repository migrations.
3. Add and run pgTAP negative tests plus reservation-concurrency tests.
4. Run a two-account restaurant/fisher end-to-end test in an isolated preview.
5. Re-run Supabase security/performance advisors and inspect mobile/desktop UI.
