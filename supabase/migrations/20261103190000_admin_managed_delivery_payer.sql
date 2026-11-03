-- Admin-managed Marée commission and delivery payer, snapshotted on each reservation.
-- Existing orders retain buyer-paid delivery (the historical rule).
alter table public.maree_commercial_settings add column if not exists delivery_fee_payer text not null default 'buyer' check (delivery_fee_payer in ('buyer','fisher'));
alter table public.orders add column if not exists delivery_fee_payer_snapshot text not null default 'buyer' check (delivery_fee_payer_snapshot in ('buyer','fisher'));
alter table public.fisher_monthly_invoices add column if not exists delivery_deduction_total numeric(10,2) not null default 0 check (delivery_deduction_total >= 0);
alter table public.fisher_monthly_invoice_items add column if not exists delivery_deduction numeric(10,2) not null default 0 check (delivery_deduction >= 0);
alter table public.maree_monthly_commission_invoice_items add column if not exists delivery_fee_payer_snapshot text not null default 'buyer' check (delivery_fee_payer_snapshot in ('buyer','fisher'));

create or replace function public.get_maree_commercial_settings()
returns table(maree_fee_rate numeric, delivery_fee_rate numeric, delivery_fee_payer text)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return query select coalesce(s.maree_fee_rate,0.065),coalesce(s.delivery_fee_rate,0.20),coalesce(s.delivery_fee_payer,'buyer') from public.maree_commercial_settings s where s.id=true;
end;
$function$;
revoke all on function public.get_maree_commercial_settings() from public, anon;
grant execute on function public.get_maree_commercial_settings() to authenticated;

create or replace function public.update_maree_commercial_settings(p_maree_fee_percent numeric,p_delivery_fee_percent numeric,p_delivery_fee_payer text)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if not private.is_current_user_admin() then raise exception 'Admin access required'; end if;
  if p_maree_fee_percent is null or p_maree_fee_percent < 0 or p_maree_fee_percent > 100 then raise exception 'Marée commission must be between 0 and 100 percent'; end if;
  if p_delivery_fee_percent is null or p_delivery_fee_percent < 0 or p_delivery_fee_percent > 100 then raise exception 'Delivery fee must be between 0 and 100 percent'; end if;
  if p_delivery_fee_payer not in ('buyer','fisher') then raise exception 'Delivery fee payer must be buyer or fisher'; end if;
  update public.maree_commercial_settings set maree_fee_rate=round(p_maree_fee_percent/100,5),delivery_fee_rate=round(p_delivery_fee_percent/100,5),delivery_fee_payer=p_delivery_fee_payer,updated_at=now() where id=true;
  if not found then raise exception 'Commercial settings row is missing'; end if;
end;
$function$;
revoke all on function public.update_maree_commercial_settings(numeric,numeric,text) from public, anon;
grant execute on function public.update_maree_commercial_settings(numeric,numeric,text) to authenticated;

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
  v_delivery_payer text := 'buyer';
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
  select coalesce(s.maree_fee_rate, 0.065), coalesce(s.delivery_fee_rate, 0.20), coalesce(s.delivery_fee_payer, 'buyer')
    into v_maree_rate, v_rate, v_delivery_payer from public.maree_commercial_settings s where s.id = true;
  v_subtotal := round(p_quantity_kg * v_catch.price_per_kg, 2);
  v_maree_fee := round(v_subtotal * v_maree_rate, 2);
  v_delivery := case when p_fulfilment = 'delivery' then round(v_subtotal * v_rate, 2) else 0 end;

  insert into public.orders (
    catch_id, restaurant_id, quantity_kg, requested_slot, fulfilment, note,
    fisher_id_snapshot, unit_price_snapshot, product_subtotal, maree_fee_rate, maree_fee,
    delivery_fee_rate, delivery_fee, delivery_fee_payer_snapshot, total_amount, billing_mode, tip_amount
  ) values (
    p_catch_id, v_user_id, p_quantity_kg, p_requested_slot, p_fulfilment, nullif(trim(p_note), ''),
    v_catch.fisher_id, v_catch.price_per_kg, v_subtotal, v_maree_rate, v_maree_fee,
    v_rate, v_delivery, v_delivery_payer,
    v_subtotal + v_maree_fee + case when v_delivery_payer = 'buyer' then v_delivery else 0 end + v_tip, v_mode, v_tip
  ) returning id into v_order_id;

  update public.catches set remaining_kg = remaining_kg - p_quantity_kg,
    status = case when remaining_kg - p_quantity_kg = 0 then 'sold_out'::public.catch_status else 'available'::public.catch_status end
  where id = p_catch_id;
  return v_order_id;
end;
$function$;

revoke all on function public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric) from public, anon;
grant execute on function public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric) to authenticated, service_role;


create or replace function public.generate_fisher_monthly_invoices(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start date;
  v_end date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_count integer := 0;
  v_group record;
  v_invoice record;
begin
  if p_month is null then raise exception 'Billing month is required'; end if;
  if auth.role() is distinct from 'service_role' and session_user <> 'postgres' then
    raise exception 'Service role or trusted database scheduler required';
  end if;

  v_start := date_trunc('month', p_month)::date;
  v_end := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_start_at := (v_start::timestamp at time zone 'Europe/Jersey');
  v_end_at := ((v_end + 1)::timestamp at time zone 'Europe/Jersey');

  -- Create any missing monthly invoice headers. Existing headers are never duplicated.
  for v_group in
    select o.restaurant_id, coalesce(o.fisher_id_snapshot,c.fisher_id) as fisher_id
    from public.orders o
    join public.catches c on c.id=o.catch_id
    where o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at >= v_start_at and o.delivered_at < v_end_at
    group by o.restaurant_id, coalesce(o.fisher_id_snapshot,c.fisher_id)
  loop
    insert into public.fisher_monthly_invoices
      (restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,tip_total,delivery_deduction_total)
    values (v_group.restaurant_id,v_group.fisher_id,v_start,v_end,v_end+7,0,0,0)
    on conflict (restaurant_id,fisher_id,period_start) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  -- Never silently omit a late order from an already paid/void statement.
  if exists (
    select 1
    from public.fisher_monthly_invoices i
    join public.orders o on o.restaurant_id=i.restaurant_id
    join public.catches c on c.id=o.catch_id
    where i.period_start=v_start and i.status <> 'open'
      and coalesce(o.fisher_id_snapshot,c.fisher_id)=i.fisher_id
      and o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at >= v_start_at and o.delivered_at < v_end_at
      and not exists (
        select 1 from public.fisher_monthly_invoice_items ii
        where ii.invoice_id=i.id and ii.order_id=o.id
      )
  ) then
    raise exception 'Late eligible order found for a finalized fisher invoice in period %. Manual adjustment required.', v_start;
  end if;

  -- A delivered monthly order must never be attached to two fisher statements.
  if exists (
    select 1
    from public.fisher_monthly_invoices i
    join public.orders o on o.restaurant_id=i.restaurant_id
    join public.catches c on c.id=o.catch_id
    join public.fisher_monthly_invoice_items other_item on other_item.order_id=o.id
    where i.period_start=v_start and i.status='open'
      and coalesce(o.fisher_id_snapshot,c.fisher_id)=i.fisher_id
      and o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at >= v_start_at and o.delivered_at < v_end_at
      and other_item.invoice_id <> i.id
  ) then
    raise exception 'Eligible fisher order is already linked to another invoice in period %.', v_start;
  end if;

  for v_invoice in
    select i.id,i.restaurant_id,i.fisher_id
    from public.fisher_monthly_invoices i
    where i.period_start=v_start and i.status='open'
    for update
  loop
    -- Remove stale lines only from open invoices.
    delete from public.fisher_monthly_invoice_items ii
    where ii.invoice_id=v_invoice.id
      and not exists (
        select 1 from public.orders o
        join public.catches c on c.id=o.catch_id
        where o.id=ii.order_id
          and o.restaurant_id=v_invoice.restaurant_id
          and coalesce(o.fisher_id_snapshot,c.fisher_id)=v_invoice.fisher_id
          and o.status='delivered' and o.billing_mode='monthly'
          and o.delivered_at >= v_start_at and o.delivered_at < v_end_at
      );

    insert into public.fisher_monthly_invoice_items
      (invoice_id,order_id,product_subtotal,quantity_kg,unit_price,tip_amount,delivery_deduction)
    select v_invoice.id,o.id,o.product_subtotal,o.quantity_kg,o.unit_price_snapshot,coalesce(o.tip_amount,0),
      case when o.delivery_fee_payer_snapshot='fisher' then coalesce(o.delivery_fee,0) else 0 end
    from public.orders o
    join public.catches c on c.id=o.catch_id
    where o.restaurant_id=v_invoice.restaurant_id
      and coalesce(o.fisher_id_snapshot,c.fisher_id)=v_invoice.fisher_id
      and o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at >= v_start_at and o.delivered_at < v_end_at
    on conflict (invoice_id,order_id) do update set
      product_subtotal=excluded.product_subtotal,
      quantity_kg=excluded.quantity_kg,
      unit_price=excluded.unit_price,
      tip_amount=excluded.tip_amount,
      delivery_deduction=excluded.delivery_deduction;

    update public.fisher_monthly_invoices i
    set subtotal=coalesce((select sum(ii.product_subtotal) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0),
        tip_total=coalesce((select sum(ii.tip_amount) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0),
        delivery_deduction_total=coalesce((select sum(ii.delivery_deduction) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0)
    where i.id=v_invoice.id;
  end loop;

  return v_count;
end;
$function$;
revoke all on function public.generate_fisher_monthly_invoices(date) from public, anon, authenticated;
grant execute on function public.generate_fisher_monthly_invoices(date) to service_role;

create or replace function public.generate_maree_monthly_commission_invoices(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start date;
  v_end date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_count integer := 0;
  v_restaurant uuid;
  v_invoice record;
begin
  if p_month is null then raise exception 'Billing month is required'; end if;
  if auth.role() is distinct from 'service_role' and session_user <> 'postgres' then
    raise exception 'Service role or trusted database scheduler required';
  end if;

  v_start := date_trunc('month', p_month)::date;
  v_end := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_start_at := (v_start::timestamp at time zone 'Europe/Jersey');
  v_end_at := ((v_end + 1)::timestamp at time zone 'Europe/Jersey');

  for v_restaurant in
    select o.restaurant_id
    from public.orders o
    where o.status='delivered' and o.delivered_at >= v_start_at
      and o.delivered_at < v_end_at
      and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
    group by o.restaurant_id
  loop
    insert into public.maree_monthly_commission_invoices
      (restaurant_id,period_start,period_end,due_date,commission_total,delivery_total)
    values (v_restaurant,v_start,v_end,v_end+7,0,0)
    on conflict (restaurant_id,period_start) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  -- Declared/paid statements cannot be rewritten. Fail the run if a late-delivered
  -- order would otherwise disappear from a finalized statement.
  if exists (
    select 1
    from public.maree_monthly_commission_invoices i
    join public.orders o on o.restaurant_id=i.restaurant_id
    where i.period_start=v_start and i.status <> 'open'
      and o.status='delivered' and o.delivered_at >= v_start_at
      and o.delivered_at < v_end_at
      and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
      and not exists (
        select 1 from public.maree_monthly_commission_invoice_items ii
        where ii.invoice_id=i.id and ii.order_id=o.id
      )
  ) then
    raise exception 'Late eligible order found for a finalized Marée commission invoice in period %. Manual adjustment required.', v_start;
  end if;

  for v_invoice in
    select i.id,i.restaurant_id
    from public.maree_monthly_commission_invoices i
    where i.period_start=v_start and i.status='open'
    for update
  loop
    delete from public.maree_monthly_commission_invoice_items ii
    where ii.invoice_id=v_invoice.id
      and not exists (
        select 1 from public.orders o
        where o.id=ii.order_id and o.restaurant_id=v_invoice.restaurant_id
          and o.status='delivered' and o.delivered_at >= v_start_at
          and o.delivered_at < v_end_at
          and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
      );

    insert into public.maree_monthly_commission_invoice_items
      (invoice_id,order_id,commission_amount,delivery_amount,delivery_fee_payer_snapshot,product_subtotal,fulfilment,delivered_at)
    select v_invoice.id,o.id,coalesce(o.maree_fee,0),
      case when o.delivery_fee_payer_snapshot='buyer' then coalesce(o.delivery_fee,0) else 0 end,
      o.delivery_fee_payer_snapshot,o.product_subtotal,o.fulfilment,o.delivered_at
    from public.orders o
    where o.restaurant_id=v_invoice.restaurant_id
      and o.status='delivered' and o.delivered_at >= v_start_at
      and o.delivered_at < v_end_at
      and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
    on conflict (invoice_id,order_id) do update set
      commission_amount=excluded.commission_amount,
      delivery_amount=excluded.delivery_amount,
      product_subtotal=excluded.product_subtotal,
      delivery_fee_payer_snapshot=excluded.delivery_fee_payer_snapshot,
      fulfilment=excluded.fulfilment,
      delivered_at=excluded.delivered_at;

    update public.maree_monthly_commission_invoices i
    set commission_total=coalesce((select sum(ii.commission_amount) from public.maree_monthly_commission_invoice_items ii where ii.invoice_id=i.id),0),
        delivery_total=coalesce((select sum(ii.delivery_amount) from public.maree_monthly_commission_invoice_items ii where ii.invoice_id=i.id),0)
    where i.id=v_invoice.id;
  end loop;

  return v_count;
end;
$function$;
revoke all on function public.generate_maree_monthly_commission_invoices(date) from public, anon, authenticated;
grant execute on function public.generate_maree_monthly_commission_invoices(date) to service_role;

-- Keep the orchestrator and its scheduler contract unchanged.
create or replace function public.generate_monthly_billing_statements(p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.generate_fisher_monthly_invoices(p_month);
  perform public.generate_maree_monthly_commission_invoices(p_month);
end;
$function$;
revoke all on function public.generate_monthly_billing_statements(date) from public, anon, authenticated;
grant execute on function public.generate_monthly_billing_statements(date) to service_role;

-- Keep the local migration chain aligned with the live scheduler: both monthly
-- statements must be generated from one scheduled entry point.
select cron.unschedule(jobid) from cron.job where jobname = 'maree-monthly-fisher-invoices';
select cron.schedule(
  'maree-monthly-fisher-invoices',
  '0 3 1 * *',
  $job$select public.generate_monthly_billing_statements((date_trunc('month', now()) - interval '1 month')::date);$job$
);


comment on column public.orders.delivery_fee_payer_snapshot is 'Immutable delivery payer selected from commercial settings at reservation time.';
comment on column public.fisher_monthly_invoices.delivery_deduction_total is 'Delivery fees deducted from the fisher monthly payout.';
comment on column public.fisher_monthly_invoice_items.delivery_deduction is 'Per-order delivery amount deducted from fisher proceeds when the fisher is the payer.';
