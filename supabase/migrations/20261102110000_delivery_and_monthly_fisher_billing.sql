-- Marée Jersey commercial model: immutable order pricing, delivery revenue and monthly fisher statements.
-- Additive only. Apply to a preview database first; do not apply to production without approval.

alter table public.orders
  add column if not exists fisher_id_snapshot uuid references public.profiles(id) on delete restrict,
  add column if not exists unit_price_snapshot numeric(10,2),
  add column if not exists product_subtotal numeric(10,2),
  add column if not exists maree_fee_rate numeric(6,5) not null default 0.065 check (maree_fee_rate between 0 and 1),
  add column if not exists maree_fee numeric(10,2) not null default 0 check (maree_fee >= 0),
  add column if not exists delivery_fee_rate numeric(6,5) not null default 0,
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists total_amount numeric(10,2),
  add column if not exists billing_mode text not null default 'immediate'
    check (billing_mode in ('immediate','monthly')),
  add column if not exists delivered_at timestamptz;

-- Legacy orders are backfilled using their lot's current price only as a clearly marked
-- best-effort migration value. New orders always receive exact snapshots in reserve_catch.
update public.orders o
set fisher_id_snapshot = c.fisher_id,
    unit_price_snapshot = c.price_per_kg,
    product_subtotal = round(o.quantity_kg * c.price_per_kg, 2),
    maree_fee_rate = 0.065,
    maree_fee = round(o.quantity_kg * c.price_per_kg * 0.065, 2),
    total_amount = round(o.quantity_kg * c.price_per_kg * 1.065, 2)
from public.catches c
where c.id = o.catch_id and o.product_subtotal is null;

create table if not exists public.maree_commercial_settings (
  id boolean primary key default true check (id),
  maree_fee_rate numeric(6,5) not null default 0.065 check (maree_fee_rate between 0 and 1),
  delivery_fee_rate numeric(6,5) not null default 0.20 check (delivery_fee_rate between 0 and 1),
  updated_at timestamptz not null default now()
);
insert into public.maree_commercial_settings(id, maree_fee_rate, delivery_fee_rate)
values (true, 0.065, 0.20) on conflict (id) do nothing;
alter table public.maree_commercial_settings enable row level security;
revoke all on public.maree_commercial_settings from anon, authenticated;

create table if not exists public.restaurant_fisher_billing_settings (
  restaurant_id uuid not null references public.profiles(id) on delete cascade,
  fisher_id uuid not null references public.profiles(id) on delete cascade,
  billing_mode text not null default 'immediate' check (billing_mode in ('immediate','monthly')),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, fisher_id)
);
alter table public.restaurant_fisher_billing_settings enable row level security;
drop policy if exists "Restaurant and fisher can view their billing preference" on public.restaurant_fisher_billing_settings;
create policy "Restaurant and fisher can view their billing preference"
on public.restaurant_fisher_billing_settings for select to authenticated
using (restaurant_id = (select auth.uid()) or fisher_id = (select auth.uid()));
drop policy if exists "Restaurant manages own billing preference" on public.restaurant_fisher_billing_settings;
create policy "Restaurant manages own billing preference"
on public.restaurant_fisher_billing_settings for insert to authenticated
with check (
  restaurant_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'restaurant'::public.app_role)
  and exists (select 1 from public.profiles p where p.id = fisher_id and p.role = 'fisher'::public.app_role)
);
drop policy if exists "Restaurant updates own billing preference" on public.restaurant_fisher_billing_settings;
create policy "Restaurant updates own billing preference"
on public.restaurant_fisher_billing_settings for update to authenticated
using (restaurant_id = (select auth.uid()))
with check (restaurant_id = (select auth.uid()));
grant select, insert, update on public.restaurant_fisher_billing_settings to authenticated;

create table if not exists public.fisher_monthly_invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.profiles(id) on delete restrict,
  fisher_id uuid not null references public.profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  status text not null default 'open' check (status in ('open','paid','void')),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  payment_method text,
  payment_reference text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, fisher_id, period_start),
  check (period_end >= period_start),
  check ((status = 'paid' and paid_at is not null and paid_by is not null) or status <> 'paid')
);
alter table public.fisher_monthly_invoices enable row level security;
create table if not exists public.fisher_monthly_invoice_items (
  invoice_id uuid not null references public.fisher_monthly_invoices(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  product_subtotal numeric(10,2) not null check (product_subtotal >= 0),
  quantity_kg numeric(8,2) not null check (quantity_kg > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  primary key (invoice_id, order_id)
);
alter table public.fisher_monthly_invoice_items enable row level security;

drop policy if exists "Invoice parties can read monthly invoices" on public.fisher_monthly_invoices;
create policy "Invoice parties can read monthly invoices" on public.fisher_monthly_invoices
for select to authenticated using (restaurant_id = (select auth.uid()) or fisher_id = (select auth.uid()) or private.is_current_user_admin());
drop policy if exists "Invoice parties can read invoice items" on public.fisher_monthly_invoice_items;
create policy "Invoice parties can read invoice items" on public.fisher_monthly_invoice_items
for select to authenticated using (
  exists (select 1 from public.fisher_monthly_invoices i where i.id = invoice_id
    and (i.restaurant_id = (select auth.uid()) or i.fisher_id = (select auth.uid()) or private.is_current_user_admin()))
);
grant select on public.fisher_monthly_invoices, public.fisher_monthly_invoice_items to authenticated;
revoke insert, update, delete on public.fisher_monthly_invoices, public.fisher_monthly_invoice_items from anon, authenticated;

-- Replace reservation RPC: all money values are computed and snapshotted inside the transaction.
create or replace function public.reserve_catch(
  p_catch_id uuid,
  p_quantity_kg numeric,
  p_requested_slot timestamptz,
  p_fulfilment text,
  p_note text default null
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

  -- Three or more overdue, unpaid monthly invoices block orders from every fisher.
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
  -- Marée's 6.5% commission applies to every product purchase, including collection.
  v_maree_fee := round(v_subtotal * v_maree_rate, 2);
  -- Delivery is a separate 20% charge and is zero for collection.
  v_delivery := case when p_fulfilment = 'delivery' then round(v_subtotal * v_rate, 2) else 0 end;

  insert into public.orders (
    catch_id, restaurant_id, quantity_kg, requested_slot, fulfilment, note,
    fisher_id_snapshot, unit_price_snapshot, product_subtotal, maree_fee_rate, maree_fee,
    delivery_fee_rate, delivery_fee, total_amount, billing_mode
  ) values (
    p_catch_id, v_user_id, p_quantity_kg, p_requested_slot, p_fulfilment, nullif(trim(p_note), ''),
    v_catch.fisher_id, v_catch.price_per_kg, v_subtotal, v_maree_rate, v_maree_fee,
    v_rate, v_delivery, v_subtotal + v_maree_fee + v_delivery, v_mode
  ) returning id into v_order_id;

  update public.catches set remaining_kg = remaining_kg - p_quantity_kg,
    status = case when remaining_kg - p_quantity_kg = 0 then 'sold_out'::public.catch_status else 'available'::public.catch_status end
  where id = p_catch_id;
  return v_order_id;
end;
$function$;
revoke all on function public.reserve_catch(uuid, numeric, timestamptz, text, text) from public, anon;
grant execute on function public.reserve_catch(uuid, numeric, timestamptz, text, text) to authenticated;

-- Keep the exact delivery completion timestamp for month grouping.
create or replace function public.update_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_current public.order_status;
  v_fisher_id uuid;
  v_role public.app_role;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_status not in ('confirmed'::public.order_status, 'ready'::public.order_status, 'delivered'::public.order_status) then
    raise exception 'Invalid target status';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role is distinct from 'fisher'::public.app_role then raise exception 'Only fisher accounts can update orders'; end if;
  select o.status, coalesce(o.fisher_id_snapshot, c.fisher_id) into v_current, v_fisher_id
  from public.orders o join public.catches c on c.id = o.catch_id where o.id = p_order_id for update of o;
  if not found then raise exception 'Order not found'; end if;
  if v_fisher_id <> v_user_id then raise exception 'Only the lot owner can update this order'; end if;
  if not ((v_current = 'submitted'::public.order_status and p_status = 'confirmed'::public.order_status)
    or (v_current = 'confirmed'::public.order_status and p_status = 'ready'::public.order_status)
    or (v_current = 'ready'::public.order_status and p_status = 'delivered'::public.order_status)) then
    raise exception 'Invalid order status transition';
  end if;
  update public.orders set status = p_status,
    delivered_at = case when p_status = 'delivered'::public.order_status then now() else delivered_at end
  where id = p_order_id;
end;
$function$;
revoke all on function public.update_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.update_order_status(uuid, public.order_status) to authenticated;

-- Run monthly from a trusted server/scheduler using service_role. Idempotent per restaurant/fisher/month.
create or replace function public.generate_fisher_monthly_invoices(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_count integer := 0;
  v_group record;
  v_invoice uuid;
begin
  if auth.role() is distinct from 'service_role' and session_user <> 'postgres' then
    raise exception 'Service role or trusted database scheduler required';
  end if;
  for v_group in
    select o.restaurant_id, coalesce(o.fisher_id_snapshot, c.fisher_id) as fisher_id,
      sum(o.product_subtotal)::numeric(10,2) as subtotal
    from public.orders o join public.catches c on c.id = o.catch_id
    where o.status = 'delivered' and o.billing_mode = 'monthly'
      and o.delivered_at >= v_start::timestamptz
      and o.delivered_at < (v_end + 1)::timestamptz
    group by o.restaurant_id, coalesce(o.fisher_id_snapshot, c.fisher_id)
  loop
    insert into public.fisher_monthly_invoices(restaurant_id,fisher_id,period_start,period_end,due_date,subtotal)
    values (v_group.restaurant_id,v_group.fisher_id,v_start,v_end,v_end + 7,v_group.subtotal)
    on conflict (restaurant_id,fisher_id,period_start) do nothing
    returning id into v_invoice;
    if v_invoice is not null then
      insert into public.fisher_monthly_invoice_items(invoice_id,order_id,product_subtotal,quantity_kg,unit_price)
      select v_invoice,o.id,o.product_subtotal,o.quantity_kg,o.unit_price_snapshot
      from public.orders o join public.catches c on c.id=o.catch_id
      where o.restaurant_id=v_group.restaurant_id and coalesce(o.fisher_id_snapshot,c.fisher_id)=v_group.fisher_id
        and o.status='delivered' and o.billing_mode='monthly'
        and o.delivered_at >= v_start::timestamptz and o.delivered_at < (v_end+1)::timestamptz;
      v_count := v_count + 1;
    end if;
    v_invoice := null;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.generate_fisher_monthly_invoices(date) from public, anon, authenticated;
grant execute on function public.generate_fisher_monthly_invoices(date) to service_role;

-- Only the invoice's fisher or a trusted admin may confirm receipt of payment.
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
end;
$function$;
revoke all on function public.mark_fisher_invoice_paid(uuid,text,text) from public, anon;
grant execute on function public.mark_fisher_invoice_paid(uuid,text,text) to authenticated;

comment on column public.orders.maree_fee is '6.5% Marée Jersey commission on product subtotal, whether delivery or collection.';
comment on column public.orders.maree_fee_rate is 'Commission rate snapshotted on each order; default 6.5%.';
comment on column public.orders.delivery_fee is 'Separate delivery charge payable to Marée Jersey; not fisher proceeds.';
comment on column public.orders.product_subtotal is 'Immutable product amount payable to the fisher, snapshotted at reservation.';
comment on table public.fisher_monthly_invoices is 'Monthly product-only statements payable to the fisher; Marée commission and delivery fees are separate.';

-- Schedule generation for the previous calendar month at 03:00 UTC on day 1.
-- The job is created only when this protected migration is applied to the approved database.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.unschedule(jobid) from cron.job where jobname = 'maree-monthly-fisher-invoices';
select cron.schedule(
  'maree-monthly-fisher-invoices',
  '0 3 1 * *',
  $job$select public.generate_fisher_monthly_invoices((date_trunc('month', now()) - interval '1 month')::date);$job$
);

