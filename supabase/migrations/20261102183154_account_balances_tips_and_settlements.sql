-- Reliable account balances, optional fisher tips, and order settlement.
-- Tips belong 100% to the fisher and are excluded from Marée's commission and delivery bases.

alter table public.orders
  add column if not exists tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0),
  add column if not exists fisher_payment_status text not null default 'unpaid'
    check (fisher_payment_status in ('unpaid','paid','waived')),
  add column if not exists fisher_paid_at timestamptz,
  add column if not exists fisher_payment_method text,
  add column if not exists fisher_payment_reference text;

alter table public.fisher_monthly_invoices
  add column if not exists tip_total numeric(10,2) not null default 0 check (tip_total >= 0);

alter table public.fisher_monthly_invoice_items
  add column if not exists tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0);

-- Repair the historical backfill: delivery was previously omitted and old delivered
-- orders did not receive a delivered_at timestamp. Preserve the original product snapshots.
alter table public.orders disable trigger orders_validate_slot;
update public.orders
set delivery_fee_rate = 0.20,
    delivery_fee = case when fulfilment = 'delivery' then round(coalesce(product_subtotal,0) * 0.20, 2) else 0 end,
    total_amount = coalesce(product_subtotal,0) + coalesce(maree_fee,0)
      + case when fulfilment = 'delivery' then round(coalesce(product_subtotal,0) * 0.20, 2) else 0 end
      + coalesce(tip_amount,0),
    delivered_at = case when status = 'delivered' then coalesce(delivered_at, updated_at, created_at) else delivered_at end
where product_subtotal is not null;
alter table public.orders enable trigger orders_validate_slot;

-- The slot must be validated on insertion or when the slot itself changes,
-- not on status/payment updates to an old order.
drop trigger if exists orders_validate_slot on public.orders;
create trigger orders_validate_slot
before insert or update of requested_slot on public.orders
for each row execute function private.validate_order_slot();

-- Replace the reservation RPC with an atomic tip snapshot. The tip is never commission-bearing.
drop function if exists public.reserve_catch(uuid, numeric, timestamptz, text, text);
create function public.reserve_catch(
  p_catch_id uuid,
  p_quantity_kg numeric,
  p_requested_slot timestamptz,
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
revoke all on function public.reserve_catch(uuid, numeric, timestamptz, text, text, numeric) from public, anon;
grant execute on function public.reserve_catch(uuid, numeric, timestamptz, text, text, numeric) to authenticated;

-- Fisher confirms an immediate payment only for an order belonging to them.
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
  select coalesce(o.fisher_id_snapshot,c.fisher_id),o.status,o.billing_mode,o.fisher_payment_status
    into v_fisher_id,v_status,v_billing_mode,v_payment_status
  from public.orders o join public.catches c on c.id=o.catch_id
  where o.id=p_order_id for update of o;
  if not found then raise exception 'Order not found'; end if;
  if v_fisher_id <> v_user_id and not private.is_current_user_admin() then
    raise exception 'Only the owning fisher or an admin can confirm this payment';
  end if;
  if v_status <> 'delivered'::public.order_status then raise exception 'Only delivered orders can be settled'; end if;
  if v_billing_mode <> 'immediate' then raise exception 'Monthly orders are settled through their monthly statement'; end if;
  if v_payment_status <> 'unpaid' then raise exception 'This order is already settled or waived'; end if;
  update public.orders set fisher_payment_status='paid',fisher_paid_at=now(),
    fisher_payment_method=nullif(left(trim(coalesce(p_payment_method,'')),80),''),
    fisher_payment_reference=nullif(left(trim(coalesce(p_payment_reference,'')),160),'')
  where id=p_order_id;
end;
$function$;
revoke all on function public.mark_order_paid(uuid,text,text) from public, anon;
grant execute on function public.mark_order_paid(uuid,text,text) to authenticated;

-- Paying a monthly fisher statement settles every linked order in the same transaction.
create or replace function public.mark_fisher_invoice_paid(
  p_invoice_id uuid, p_payment_method text default null, p_payment_reference text default null
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
  select i.fisher_id into v_fisher_id from public.fisher_monthly_invoices i
  where i.id=p_invoice_id and i.status='open' for update;
  if not found then raise exception 'Open invoice not found'; end if;
  if v_fisher_id <> v_user_id and not private.is_current_user_admin() then
    raise exception 'Only the invoice fisher or an admin can confirm payment';
  end if;
  update public.fisher_monthly_invoices set status='paid',paid_at=now(),paid_by=v_user_id,
    payment_method=nullif(left(trim(coalesce(p_payment_method,'')),80),''),
    payment_reference=nullif(left(trim(coalesce(p_payment_reference,'')),160),'')
  where id=p_invoice_id;
  update public.orders o set fisher_payment_status='paid',fisher_paid_at=now(),
    fisher_payment_method=nullif(left(trim(coalesce(p_payment_method,'')),80),''),
    fisher_payment_reference=nullif(left(trim(coalesce(p_payment_reference,'')),160),'')
  from public.fisher_monthly_invoice_items i
  where i.invoice_id=p_invoice_id and o.id=i.order_id;
end;
$function$;
revoke all on function public.mark_fisher_invoice_paid(uuid,text,text) from public, anon;
grant execute on function public.mark_fisher_invoice_paid(uuid,text,text) to authenticated;

-- Monthly statement generator keeps tips separate from product subtotal but includes them in the amount due.
create or replace function public.generate_fisher_monthly_invoices(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_start_at timestamptz := (v_start::timestamp at time zone 'Europe/Jersey');
  v_end_at timestamptz := ((v_end + 1)::timestamp at time zone 'Europe/Jersey');
  v_count integer := 0;
  v_group record;
  v_invoice uuid;
begin
  if auth.role() is distinct from 'service_role' and session_user <> 'postgres' then
    raise exception 'Service role or trusted database scheduler required';
  end if;
  for v_group in
    select o.restaurant_id,coalesce(o.fisher_id_snapshot,c.fisher_id) as fisher_id,
      sum(o.product_subtotal)::numeric(10,2) as subtotal,
      sum(o.tip_amount)::numeric(10,2) as tip_total
    from public.orders o join public.catches c on c.id=o.catch_id
    where o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
    group by o.restaurant_id,coalesce(o.fisher_id_snapshot,c.fisher_id)
  loop
    v_invoice:=null;
    select i.id into v_invoice from public.fisher_monthly_invoices i
    where i.restaurant_id=v_group.restaurant_id and i.fisher_id=v_group.fisher_id
      and i.period_start=v_start and i.status='open'
    for update;
    if found then
      update public.fisher_monthly_invoices
      set subtotal=v_group.subtotal,tip_total=v_group.tip_total
      where id=v_invoice;
    else
      insert into public.fisher_monthly_invoices(restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,tip_total)
      values(v_group.restaurant_id,v_group.fisher_id,v_start,v_end,v_end+7,v_group.subtotal,v_group.tip_total)
      on conflict(restaurant_id,fisher_id,period_start) do nothing
      returning id into v_invoice;
      if v_invoice is not null then
        v_count:=v_count+1;
      else
        select i.id into v_invoice from public.fisher_monthly_invoices i
        where i.restaurant_id=v_group.restaurant_id and i.fisher_id=v_group.fisher_id
          and i.period_start=v_start and i.status='open'
        for update;
        if found then
          update public.fisher_monthly_invoices
          set subtotal=v_group.subtotal,tip_total=v_group.tip_total
          where id=v_invoice;
        else
          v_invoice:=null;
        end if;
      end if;
    end if;

    if v_invoice is not null then
      insert into public.fisher_monthly_invoice_items(invoice_id,order_id,product_subtotal,quantity_kg,unit_price,tip_amount)
      select v_invoice,o.id,o.product_subtotal,o.quantity_kg,o.unit_price_snapshot,o.tip_amount
      from public.orders o join public.catches c on c.id=o.catch_id
      where o.restaurant_id=v_group.restaurant_id and coalesce(o.fisher_id_snapshot,c.fisher_id)=v_group.fisher_id
        and o.status='delivered' and o.billing_mode='monthly'
        and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
      on conflict(invoice_id,order_id) do update set
        product_subtotal=excluded.product_subtotal,quantity_kg=excluded.quantity_kg,
        unit_price=excluded.unit_price,tip_amount=excluded.tip_amount;
    end if;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.generate_fisher_monthly_invoices(date) from public, anon, authenticated;
grant execute on function public.generate_fisher_monthly_invoices(date) to service_role;

comment on column public.orders.tip_amount is 'Optional restaurant tip payable in full to the fisher; excluded from Marée commission and delivery calculations.';
comment on column public.orders.fisher_payment_status is 'Settlement status for the fisher product subtotal plus tip.';
