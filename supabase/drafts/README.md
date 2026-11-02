# Traceability SQL draft

This is intentionally **not** in `supabase/migrations/`. It is a review draft only; it has not been applied to any Supabase project.

## Intended access model

- No `anon` access.
- Authenticated fishers can read/write scans and events for their own catches.
- Authenticated restaurants can read/write records only for catches they have an order for.
- Raw QR payloads remain private and untrusted until reviewed.
- No API-role UPDATE or DELETE grants: the event log is append-only.
- Do not publish raw QR payloads, external URLs, exact coordinates, phone numbers, licence data, or private documents on public trace pages.

## Required local validation before migration

1. Install the Supabase CLI and Docker; check `supabase --version`.
2. Create a migration using `supabase migration new catch_traceability`, then move the reviewed SQL into the generated file.
3. Run `supabase start` and `supabase db reset`.
4. Add pgTAP coverage for:
   - fisher A can read/insert on own catch;
   - fisher A cannot read/insert on fisher B catch;
   - restaurant with an order can read/insert for that catch;
   - restaurant without an order cannot read/insert;
   - anon cannot read/insert;
   - actor/scanned_by must equal `auth.uid()`;
   - order_id must belong to the same catch and actor must be a participant;
   - invalid event types, oversized payloads, non-HTTPS source URLs are rejected;
   - authenticated cannot update/delete either table.
5. Run `supabase test db`, then review Security and Performance Advisors.
6. Only after successful local tests, open a separate migration PR. Never apply this draft directly to production.

## Known follow-up

The scanner currently does not associate scans with catch lots or orders. The application must explicitly choose a catch/order before writing records. Public QR pages must use a separate opaque public identifier and a minimal, allow-listed response; a QR token is never authentication.
