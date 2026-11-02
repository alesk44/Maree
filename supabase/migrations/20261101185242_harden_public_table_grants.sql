-- Remove broad default table privileges and re-grant only what the app needs.
-- RLS remains the row-level boundary; these grants remove TRUNCATE, REFERENCES,
-- TRIGGER and unintended DELETE/UPDATE/INSERT privileges from browser roles.

revoke all privileges on table public.catches from anon, authenticated;
grant select on table public.catches to anon, authenticated;
grant insert, update on table public.catches to authenticated;

revoke all privileges on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;
-- Order creation and status transitions are performed only by SECURITY DEFINER RPCs.

revoke all privileges on table public.verification_requests from anon, authenticated;
grant select on table public.verification_requests to authenticated;
grant insert (
  user_id, requested_role, business_name, contact_name, phone,
  registration_number, evidence_note
) on table public.verification_requests to authenticated;
grant update (status, reviewer_note, reviewed_by, reviewed_at)
  on table public.verification_requests to authenticated;

-- Keep profiles on the separate column-level grant model from the preceding migration.
