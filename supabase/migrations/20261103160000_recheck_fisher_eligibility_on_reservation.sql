-- Re-check fisher eligibility at reservation time, not only when a catch is published.
-- Lock verification request then profile, matching review_verification_request's lock order.
create or replace function public.reserve_catch(
  p_catch_id uuid,
  p_quantity_kg numeric,
  p_requested_slot timestamp with time zone,
  p_fulfilment text,
  p_note text default null,
  p_tip_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_catch public.catches%rowtype;
  v_order_id uuid;
  v_verification_request_id uuid;
  v_rate numeric(6,5) := 0.20;
  v_maree_rate numeric(6,5) := 0.065;
  v_mode text := 'immediate';
  v_subtotal numeric(10,2);
  v_maree_fee numeric(10,2);
  v_delivery numeric(10,2);
  v_tip numeric(10,2);
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role is distinct from 'restaurant'::public.app_role then
    raise exception 'Only restaurant accounts can place orders';
  end if;
  if p_quantity_kg is null or p_quantity_kg < 0.5 or mod(p_quantity_kg, 0.5) <> 0 then
    raise exception 'Quantity must be at least 0.5 kg in 0.5 kg increments';
  end if;
  if p_requested_slot is null or p_requested_slot <= now() then raise exception 'Requested slot must be in the future'; end if;
  if p_fulfilment is null or p_fulfilment not in ('delivery', 'collection') then raise exception 'Invalid fulfilment method'; end if;
  if p_note is not null and length(p_note) > 2000 then raise exception 'Note is too long'; end if;
  if p_tip_amount is null or p_tip_amount < 0 or p_tip_amount > 10000 then
    raise exception 'Tip must be between £0 and £10,000';
  end if;
  v_tip := round(p_tip_amount, 2);

  if (select count(*) from public.fisher_monthly_invoices i
      where i.restaurant_id = v_user_id and i.status = 'open' and i.due_date < current_date) >= 3 then
    raise exception 'Ordering is blocked: at least three monthly invoices are overdue and unpaid';
  end if;

  select c.* into v_catch from public.catches c where c.id = p_catch_id for update;
  if not found or v_catch.status <> 'available' then raise exception 'Catch lot is not available'; end if;
  if p_quantity_kg > v_catch.remaining_kg then raise exception 'Requested quantity exceeds available stock'; end if;

  -- Match the approval RPC lock order: verification request first, then profile.
  select vr.id into v_verification_request_id
  from public.verification_requests vr
  where vr.user_id = v_catch.fisher_id
    and vr.requested_role = 'fisher'::public.app_role
    and vr.status = 'approved'::public.verification_status
  order by vr.reviewed_at desc nulls last, vr.created_at desc
  limit 1
  for share;

  if v_verification_request_id is null then
    raise exception 'Catch owner is not an approved fisher';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_catch.fisher_id
    and p.role = 'fisher'::public.app_role
  for share;

  if not found then
    raise exception 'Catch owner is not an approved fisher';
  end if;

  select s.billing_mode into v_mode from public.restaurant_fisher_billing_settings s
  where s.restaurant_id = v_user_id and s.fisher_id = v_catch.fisher_id;
  v_mode := coalesce(v_mode, 'immediate');
  select coalesce(s.maree_fee_rate, 0.065), coalesce(s.delivery_fee_rate, 0.20)
    into v_maree_rate, v_rate from public.maree_commercial_settings s where s.id = true;
  v_subtotal := round(p_quantity_kg * v_catch.price_per_kg, 2);
  v_maree_fee := round(v_subtotal * v_maree_rate, 2);
  v_delivery := case when p_fulfilment = 'delivery' then round(v_subtotal * v_rate, 2) else 0 end;

  insert into public.orders (
    catch_id, restaurant_id, quantity_kg, requested_slot, fulfilment, note,
    fisher_id_snapshot, unit_price_snapshot, product_subtotal, maree_fee_rate, maree_fee,
    delivery_fee_rate, delivery_fee, total_amount, billing_mode, tip_amount
  ) values (
    p_catch_id, v_user_id, p_quantity_kg, p_requested_slot, p_fulfilment, nullif(trim(p_note), ''),
    v_catch.fisher_id, v_catch.price_per_kg, v_subtotal, v_maree_rate, v_maree_fee,
    v_rate, v_delivery, v_subtotal + v_maree_fee + v_delivery + v_tip, v_mode, v_tip
  ) returning id into v_order_id;

  update public.catches set remaining_kg = remaining_kg - p_quantity_kg,
    status = case when remaining_kg - p_quantity_kg = 0 then 'sold_out'::public.catch_status else 'available'::public.catch_status end
  where id = p_catch_id;
  return v_order_id;
end;
$function$;

revoke all on function public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric) from public, anon;
grant execute on function public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric) to authenticated, service_role;
