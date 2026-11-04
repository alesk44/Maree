-- Enforce verified MFA (JWT aal2) inside privileged owner/admin RPCs.
-- This migration is intentionally staged on security/owner-auth-hardening only.
-- Do not apply to production until isolated regression tests and owner sign-off.

create or replace function private.require_admin_aal2()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_current_user_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if coalesce((select auth.jwt() ->> 'aal'), 'aal1') <> 'aal2' then
    raise exception 'Verified MFA session required (aal2)' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function private.require_admin_aal2() from public, anon, authenticated;

-- Verification approval/rejection changes a user's effective application role.
create or replace function public.review_verification_request(
  p_request_id uuid,
  p_status public.verification_status,
  p_reviewer_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_req public.verification_requests%rowtype;
begin
  perform private.require_admin_aal2();

  if p_status not in ('approved'::public.verification_status, 'rejected'::public.verification_status) then
    raise exception 'Invalid review status';
  end if;
  if p_reviewer_note is not null and length(p_reviewer_note) > 2000 then
    raise exception 'Reviewer note is too long';
  end if;

  select * into v_req
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'Verification request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'Request has already been reviewed'; end if;

  update public.verification_requests
  set status = p_status,
      reviewer_note = nullif(trim(p_reviewer_note), ''),
      reviewed_by = v_admin,
      reviewed_at = now()
  where id = p_request_id;

  if p_status = 'approved' then
    update public.profiles
    set role = v_req.requested_role
    where id = v_req.user_id;
  end if;
end;
$function$;

revoke all on function public.review_verification_request(uuid, public.verification_status, text) from public, anon;
grant execute on function public.review_verification_request(uuid, public.verification_status, text) to authenticated;

-- Financial/platform settings must require an allowlisted, MFA-verified administrator.
create or replace function public.update_maree_commercial_settings(
  p_maree_fee_percent numeric,
  p_delivery_fee_percent numeric,
  p_delivery_fee_payer text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_admin_aal2();

  if p_maree_fee_percent is null or p_maree_fee_percent < 0 or p_maree_fee_percent > 100 then
    raise exception 'Marée commission must be between 0 and 100 percent';
  end if;
  if p_delivery_fee_percent is null or p_delivery_fee_percent < 0 or p_delivery_fee_percent > 100 then
    raise exception 'Delivery fee must be between 0 and 100 percent';
  end if;
  if p_delivery_fee_payer not in ('buyer','fisher') then
    raise exception 'Delivery fee payer must be buyer or fisher';
  end if;

  update public.maree_commercial_settings
  set maree_fee_rate = round(p_maree_fee_percent / 100, 5),
      delivery_fee_rate = round(p_delivery_fee_percent / 100, 5),
      delivery_fee_payer = p_delivery_fee_payer,
      updated_at = now()
  where id = true;

  if not found then raise exception 'Commercial settings row is missing'; end if;
end;
$function$;

revoke all on function public.update_maree_commercial_settings(numeric, numeric, text) from public, anon;
grant execute on function public.update_maree_commercial_settings(numeric, numeric, text) to authenticated;

create or replace function public.verify_maree_commission_invoice_paid(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.require_admin_aal2();

  update public.maree_monthly_commission_invoices
  set status = 'paid',
      verified_at = now(),
      verified_by = (select auth.uid())
  where id = p_invoice_id
    and status = 'declared_paid';

  if not found then raise exception 'Declared commission invoice not found'; end if;
end;
$function$;

revoke all on function public.verify_maree_commission_invoice_paid(uuid) from public, anon;
grant execute on function public.verify_maree_commission_invoice_paid(uuid) to authenticated;

-- Fisher self-service remains available without admin MFA; the admin override does not.
create or replace function public.mark_fisher_invoice_paid(
  p_invoice_id uuid,
  p_payment_method text default null,
  p_payment_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_fisher_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select i.fisher_id into v_fisher_id
  from public.fisher_monthly_invoices i
  where i.id = p_invoice_id
    and i.status = 'open'
  for update;

  if not found then raise exception 'Open invoice not found'; end if;

  if v_fisher_id <> v_user_id then
    perform private.require_admin_aal2();
  end if;

  update public.fisher_monthly_invoices
  set status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      payment_method = nullif(left(trim(coalesce(p_payment_method, '')), 80), ''),
      payment_reference = nullif(left(trim(coalesce(p_payment_reference, '')), 160), '')
  where id = p_invoice_id;

  update public.orders o
  set fisher_payment_status = 'paid',
      fisher_paid_at = now(),
      fisher_payment_method = nullif(left(trim(coalesce(p_payment_method, '')), 80), ''),
      fisher_payment_reference = nullif(left(trim(coalesce(p_payment_reference, '')), 160), '')
  from public.fisher_monthly_invoice_items i
  where i.invoice_id = p_invoice_id
    and o.id = i.order_id;

  -- Accepted cancellation indemnities are receivables on the same fisher statement.
  update public.fisher_cancellation_indemnities
  set status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      payment_method = nullif(left(trim(coalesce(p_payment_method, '')), 80), ''),
      payment_reference = nullif(left(trim(coalesce(p_payment_reference, '')), 160), '')
  where invoice_id = p_invoice_id
    and status = 'unpaid';

  update public.fisher_monthly_invoices
  set cancellation_indemnity_total = 0
  where id = p_invoice_id;
end;
$function$;

revoke all on function public.mark_fisher_invoice_paid(uuid, text, text) from public, anon;
grant execute on function public.mark_fisher_invoice_paid(uuid, text, text) to authenticated;

-- The fisher/admin override for immediate-order settlement also requires AAL2.
create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_payment_method text default null,
  p_payment_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_fisher_id uuid;
  v_status public.order_status;
  v_billing_mode text;
  v_payment_status text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select coalesce(o.fisher_id_snapshot,c.fisher_id),
         o.status,
         o.billing_mode,
         o.fisher_payment_status
  into v_fisher_id,v_status,v_billing_mode,v_payment_status
  from public.orders o
  join public.catches c on c.id=o.catch_id
  where o.id=p_order_id
  for update of o;

  if not found then raise exception 'Order not found'; end if;

  if v_fisher_id <> v_user_id then
    perform private.require_admin_aal2();
  end if;

  if v_status <> 'delivered'::public.order_status then
    raise exception 'Only delivered orders can be settled';
  end if;
  if v_billing_mode <> 'immediate' then
    raise exception 'Monthly orders are settled through their monthly statement';
  end if;
  if v_payment_status <> 'unpaid' then
    raise exception 'This order is already settled or waived';
  end if;

  update public.orders
  set fisher_payment_status='paid',
      fisher_paid_at=now(),
      fisher_payment_method=nullif(left(trim(coalesce(p_payment_method,'')),80),''),
      fisher_payment_reference=nullif(left(trim(coalesce(p_payment_reference,'')),160),'')
  where id=p_order_id;
end;
$function$;

revoke all on function public.mark_order_paid(uuid, text, text) from public, anon;
grant execute on function public.mark_order_paid(uuid, text, text) to authenticated;

comment on function private.require_admin_aal2() is
  'Internal guard for allowlisted administrators; requires JWT assurance level aal2.';
