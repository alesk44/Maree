-- Reconcile monthly statements from the eligible delivered orders on every run.
-- Open invoices are mutable and are rebuilt from their item rows. Declared/paid
-- statements are immutable; a late order causes a loud error for manual adjustment.
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
      (restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,tip_total)
    values (v_group.restaurant_id,v_group.fisher_id,v_start,v_end,v_end+7,0,0)
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
      (invoice_id,order_id,product_subtotal,quantity_kg,unit_price,tip_amount)
    select v_invoice.id,o.id,o.product_subtotal,o.quantity_kg,o.unit_price_snapshot,coalesce(o.tip_amount,0)
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
      tip_amount=excluded.tip_amount;

    update public.fisher_monthly_invoices i
    set subtotal=coalesce((select sum(ii.product_subtotal) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0),
        tip_total=coalesce((select sum(ii.tip_amount) from public.fisher_monthly_invoice_items ii where ii.invoice_id=i.id),0)
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
      and (coalesce(o.maree_fee,0)>0 or coalesce(o.delivery_fee,0)>0)
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
      and (coalesce(o.maree_fee,0)>0 or coalesce(o.delivery_fee,0)>0)
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
          and (coalesce(o.maree_fee,0)>0 or coalesce(o.delivery_fee,0)>0)
      );

    insert into public.maree_monthly_commission_invoice_items
      (invoice_id,order_id,commission_amount,delivery_amount,product_subtotal,fulfilment,delivered_at)
    select v_invoice.id,o.id,coalesce(o.maree_fee,0),coalesce(o.delivery_fee,0),
      o.product_subtotal,o.fulfilment,o.delivered_at
    from public.orders o
    where o.restaurant_id=v_invoice.restaurant_id
      and o.status='delivered' and o.delivered_at >= v_start_at
      and o.delivered_at < v_end_at
      and (coalesce(o.maree_fee,0)>0 or coalesce(o.delivery_fee,0)>0)
    on conflict (invoice_id,order_id) do update set
      commission_amount=excluded.commission_amount,
      delivery_amount=excluded.delivery_amount,
      product_subtotal=excluded.product_subtotal,
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
