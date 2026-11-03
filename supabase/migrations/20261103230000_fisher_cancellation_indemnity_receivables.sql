-- Cancellation indemnities are fisher receivables, never delivered orders or Marée commission.
alter table public.fisher_monthly_invoices
  add column if not exists cancellation_indemnity_total numeric(10,2) not null default 0
  check (cancellation_indemnity_total >= 0);

create table if not exists public.fisher_cancellation_indemnities (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  restaurant_id uuid not null references public.profiles(id) on delete restrict,
  fisher_id uuid not null references public.profiles(id) on delete restrict,
  invoice_id uuid references public.fisher_monthly_invoices(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  accepted_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  payment_method text,
  payment_reference text,
  created_at timestamptz not null default now(),
  check ((status='paid' and paid_at is not null and paid_by is not null) or status='unpaid')
);
create index if not exists fisher_cancellation_indemnities_invoice_idx
  on public.fisher_cancellation_indemnities(invoice_id);
create index if not exists fisher_cancellation_indemnities_parties_idx
  on public.fisher_cancellation_indemnities(restaurant_id,fisher_id,status);
alter table public.fisher_cancellation_indemnities enable row level security;
drop policy if exists "Cancellation indemnity parties can read" on public.fisher_cancellation_indemnities;
create policy "Cancellation indemnity parties can read"
on public.fisher_cancellation_indemnities for select to authenticated
using (restaurant_id=(select auth.uid()) or fisher_id=(select auth.uid()) or private.is_current_user_admin());
grant select on public.fisher_cancellation_indemnities to authenticated;
revoke insert,update,delete on public.fisher_cancellation_indemnities from public,anon,authenticated;

-- Extend the existing restaurant response transaction: acceptance creates one receivable
-- and an open statement immediately, including when the original order was immediate-billing.
create or replace function public.respond_order_cancellation(
  p_order_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_order public.orders%rowtype;
  v_fisher_id uuid;
  v_period_start date;
  v_period_end date;
  v_invoice_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select p.role into v_role from public.profiles p where p.id=v_user_id;
  if v_role is distinct from 'restaurant'::public.app_role then
    raise exception 'Only restaurant accounts can respond to a cancellation offer';
  end if;

  select * into v_order from public.orders
  where id=p_order_id and restaurant_id=v_user_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.cancellation_request_status <> 'offered'
     or v_order.status not in ('submitted'::public.order_status,'confirmed'::public.order_status) then
    raise exception 'No cancellation offer is awaiting your response';
  end if;

  if p_accept then
    perform 1 from public.catches c where c.id=v_order.catch_id for update;
    if not found then raise exception 'Catch lot not found'; end if;
    update public.catches
      set remaining_kg=remaining_kg+v_order.quantity_kg,
          status=case when remaining_kg+v_order.quantity_kg>0
            then 'available'::public.catch_status else 'sold_out'::public.catch_status end
      where id=v_order.catch_id;

    update public.orders
      set status='cancelled'::public.order_status,
          cancellation_request_status='approved',
          cancellation_decided_at=now()
      where id=p_order_id;

    if coalesce(v_order.cancellation_penalty,0)>0 then
      v_fisher_id:=coalesce(v_order.fisher_id_snapshot,
        (select c.fisher_id from public.catches c where c.id=v_order.catch_id));
      if v_fisher_id is null then raise exception 'Cannot resolve cancellation fisher'; end if;
      v_period_start:=date_trunc('month',now() at time zone 'Europe/Jersey')::date;
      v_period_end:=(date_trunc('month',v_period_start)+interval '1 month - 1 day')::date;

      insert into public.fisher_monthly_invoices
        (restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,tip_total,delivery_deduction_total,cancellation_indemnity_total)
      values(v_user_id,v_fisher_id,v_period_start,v_period_end,v_period_end+7,0,0,0,0)
      on conflict(restaurant_id,fisher_id,period_start) do nothing;

      select i.id into v_invoice_id from public.fisher_monthly_invoices i
      where i.restaurant_id=v_user_id and i.fisher_id=v_fisher_id
        and i.period_start=v_period_start and i.status='open'
      for update;
      if v_invoice_id is null then
        raise exception 'Current fisher statement is finalized; manual adjustment required';
      end if;

      insert into public.fisher_cancellation_indemnities
        (order_id,restaurant_id,fisher_id,invoice_id,amount,accepted_at)
      values(p_order_id,v_user_id,v_fisher_id,v_invoice_id,v_order.cancellation_penalty,now())
      on conflict(order_id) do nothing;

      update public.fisher_monthly_invoices i
      set cancellation_indemnity_total=coalesce((
        select sum(ci.amount) from public.fisher_cancellation_indemnities ci
        where ci.invoice_id=i.id and ci.status='unpaid'
      ),0)
      where i.id=v_invoice_id;
    end if;
  else
    update public.orders
      set cancellation_request_status='rejected',
          cancellation_decided_at=now(),
          cancellation_penalty=0
      where id=p_order_id;
  end if;
end;
$function$;
revoke all on function public.respond_order_cancellation(uuid,boolean) from public,anon;
grant execute on function public.respond_order_cancellation(uuid,boolean) to authenticated;

-- Monthly reconciliation now includes accepted indemnities even when the original
-- order used immediate billing. It never creates Marée commission on an indemnity.
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
  v_start:=date_trunc('month',p_month)::date;
  v_end:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
  v_start_at:=v_start::timestamp at time zone 'Europe/Jersey';
  v_end_at:=(v_end+1)::timestamp at time zone 'Europe/Jersey';

  for v_group in
    select x.restaurant_id,x.fisher_id
    from (
      select o.restaurant_id,coalesce(o.fisher_id_snapshot,c.fisher_id) fisher_id
      from public.orders o join public.catches c on c.id=o.catch_id
      where o.status='delivered' and o.billing_mode='monthly'
        and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
      union
      select ci.restaurant_id,ci.fisher_id
      from public.fisher_cancellation_indemnities ci
      where ci.accepted_at>=v_start_at and ci.accepted_at<v_end_at
    ) x
    group by x.restaurant_id,x.fisher_id
  loop
    insert into public.fisher_monthly_invoices
      (restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,tip_total,delivery_deduction_total,cancellation_indemnity_total)
    values(v_group.restaurant_id,v_group.fisher_id,v_start,v_end,v_end+7,0,0,0,0)
    on conflict(restaurant_id,fisher_id,period_start) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;

  if exists (
    select 1 from public.fisher_monthly_invoices i
    join public.orders o on o.restaurant_id=i.restaurant_id
    join public.catches c on c.id=o.catch_id
    where i.period_start=v_start and i.status<>'open'
      and coalesce(o.fisher_id_snapshot,c.fisher_id)=i.fisher_id
      and o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
      and not exists(select 1 from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id and ii.order_id=o.id)
  ) then raise exception 'Late eligible order found for a finalized fisher invoice in period %. Manual adjustment required.',v_start; end if;

  if exists (
    select 1 from public.fisher_monthly_invoices i
    join public.fisher_cancellation_indemnities ci
      on ci.restaurant_id=i.restaurant_id and ci.fisher_id=i.fisher_id
    where i.period_start=v_start and i.status<>'open'
      and ci.accepted_at>=v_start_at and ci.accepted_at<v_end_at
      and ci.invoice_id is distinct from i.id
  ) then raise exception 'Late cancellation indemnity found for a finalized fisher invoice in period %. Manual adjustment required.',v_start; end if;

  if exists (
    select 1 from public.fisher_monthly_invoices i
    join public.orders o on o.restaurant_id=i.restaurant_id
    join public.catches c on c.id=o.catch_id
    join public.fisher_monthly_invoice_items other_item on other_item.order_id=o.id
    where i.period_start=v_start and i.status='open'
      and coalesce(o.fisher_id_snapshot,c.fisher_id)=i.fisher_id
      and o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
      and other_item.invoice_id<>i.id
  ) then raise exception 'Eligible fisher order is already linked to another invoice in period %.',v_start; end if;

  for v_invoice in
    select i.id,i.restaurant_id,i.fisher_id
    from public.fisher_monthly_invoices i
    where i.period_start=v_start and i.status='open'
    for update
  loop
    delete from public.fisher_monthly_invoice_items ii
    where ii.invoice_id=v_invoice.id
      and not exists (
        select 1 from public.orders o join public.catches c on c.id=o.catch_id
        where o.id=ii.order_id and o.restaurant_id=v_invoice.restaurant_id
          and coalesce(o.fisher_id_snapshot,c.fisher_id)=v_invoice.fisher_id
          and o.status='delivered' and o.billing_mode='monthly'
          and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
      );

    insert into public.fisher_monthly_invoice_items
      (invoice_id,order_id,product_subtotal,quantity_kg,unit_price,tip_amount,delivery_deduction)
    select v_invoice.id,o.id,o.product_subtotal,o.quantity_kg,o.unit_price_snapshot,
      coalesce(o.tip_amount,0),
      case when o.delivery_fee_payer_snapshot='fisher' then coalesce(o.delivery_fee,0) else 0 end
    from public.orders o join public.catches c on c.id=o.catch_id
    where o.restaurant_id=v_invoice.restaurant_id
      and coalesce(o.fisher_id_snapshot,c.fisher_id)=v_invoice.fisher_id
      and o.status='delivered' and o.billing_mode='monthly'
      and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
    on conflict(invoice_id,order_id) do update set
      product_subtotal=excluded.product_subtotal,quantity_kg=excluded.quantity_kg,
      unit_price=excluded.unit_price,tip_amount=excluded.tip_amount,
      delivery_deduction=excluded.delivery_deduction;

    update public.fisher_cancellation_indemnities ci
    set invoice_id=v_invoice.id
    where ci.restaurant_id=v_invoice.restaurant_id and ci.fisher_id=v_invoice.fisher_id
      and ci.accepted_at>=v_start_at and ci.accepted_at<v_end_at
      and (ci.invoice_id is null or ci.invoice_id=v_invoice.id);

    update public.fisher_monthly_invoices i
    set subtotal=coalesce((select sum(ii.product_subtotal) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0),
        tip_total=coalesce((select sum(ii.tip_amount) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0),
        delivery_deduction_total=coalesce((select sum(ii.delivery_deduction) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0),
        cancellation_indemnity_total=coalesce((select sum(ci.amount) from public.fisher_cancellation_indemnities ci where ci.invoice_id=i.id and ci.status='unpaid'),0)
    where i.id=v_invoice.id;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.generate_fisher_monthly_invoices(date) from public,anon,authenticated;
grant execute on function public.generate_fisher_monthly_invoices(date) to service_role;

-- Settlement of a statement atomically settles its attached cancellation receivables too.
create or replace function public.mark_fisher_invoice_paid(
  p_invoice_id uuid,p_payment_method text default null,p_payment_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid:=(select auth.uid());
  v_fisher_id uuid;
  v_method text:=nullif(left(trim(coalesce(p_payment_method,'')),80),'');
  v_reference text:=nullif(left(trim(coalesce(p_payment_reference,'')),160),'');
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select i.fisher_id into v_fisher_id from public.fisher_monthly_invoices i
  where i.id=p_invoice_id and i.status='open' for update;
  if not found then raise exception 'Open invoice not found'; end if;
  if v_fisher_id<>v_user_id and not private.is_current_user_admin() then
    raise exception 'Only the invoice fisher or an admin can confirm payment';
  end if;
  update public.fisher_monthly_invoices
  set status='paid',paid_at=now(),paid_by=v_user_id,payment_method=v_method,payment_reference=v_reference
  where id=p_invoice_id;
  update public.orders o set fisher_payment_status='paid',fisher_paid_at=now(),
    fisher_payment_method=v_method,fisher_payment_reference=v_reference
  from public.fisher_monthly_invoice_items ii
  where ii.invoice_id=p_invoice_id and o.id=ii.order_id;
  update public.fisher_cancellation_indemnities
  set status='paid',paid_at=now(),paid_by=v_user_id,payment_method=v_method,payment_reference=v_reference
  where invoice_id=p_invoice_id and status='unpaid';
end;
$function$;
revoke all on function public.mark_fisher_invoice_paid(uuid,text,text) from public,anon;
grant execute on function public.mark_fisher_invoice_paid(uuid,text,text) to authenticated;

comment on column public.fisher_monthly_invoices.cancellation_indemnity_total
  is 'Accepted restaurant cancellation indemnities payable to the fisher; excluded from Marée commission.';
comment on table public.fisher_cancellation_indemnities
  is 'One receivable per accepted late-cancellation penalty; never treated as a delivered order.';
