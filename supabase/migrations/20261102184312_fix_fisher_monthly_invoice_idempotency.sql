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
