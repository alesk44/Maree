-- Restaurant subscription agreements and combined monthly Marée billing.
-- Subscription fees are Marée's own service revenue; product invoices remain
-- separate between restaurants and fishers.

alter table public.maree_commercial_settings
  add column if not exists monthly_subscription_fee numeric(10,2) not null default 19.99
  check (monthly_subscription_fee >= 0 and monthly_subscription_fee <= 10000);
update public.maree_commercial_settings set monthly_subscription_fee=19.99 where id=true and monthly_subscription_fee is null;

alter table public.maree_monthly_commission_invoices
  add column if not exists subscription_total numeric(10,2) not null default 0
  check (subscription_total >= 0);

create table if not exists public.maree_restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.profiles(id) on delete restrict,
  monthly_fee numeric(10,2) not null check (monthly_fee >= 0 and monthly_fee <= 10000),
  started_at timestamptz not null,
  ends_at timestamptz,
  accepted_at timestamptz not null,
  terms_version text not null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > started_at)
);
create index if not exists maree_restaurant_subscriptions_owner_period_idx
  on public.maree_restaurant_subscriptions (restaurant_id, started_at, ends_at);
alter table public.maree_restaurant_subscriptions enable row level security;
drop policy if exists "Restaurant and admin can read Marée subscriptions" on public.maree_restaurant_subscriptions;
create policy "Restaurant and admin can read Marée subscriptions"
on public.maree_restaurant_subscriptions for select to authenticated
using (restaurant_id = (select auth.uid()) or private.is_current_user_admin());
grant select on public.maree_restaurant_subscriptions to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.maree_restaurant_subscriptions from public, anon, authenticated;

-- Keep the existing 3-argument admin RPC for compatible internal tooling, and
-- add a 4-argument version for explicit subscription pricing management.
create or replace function public.update_maree_commercial_settings(
  p_maree_fee_percent numeric,
  p_delivery_fee_percent numeric,
  p_delivery_fee_payer text,
  p_monthly_subscription_fee numeric
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if not private.is_current_user_admin() then raise exception 'Admin access required'; end if;
  if p_maree_fee_percent is null or p_maree_fee_percent < 0 or p_maree_fee_percent > 100 then raise exception 'Marée commission must be between 0 and 100 percent'; end if;
  if p_delivery_fee_percent is null or p_delivery_fee_percent < 0 or p_delivery_fee_percent > 100 then raise exception 'Delivery fee must be between 0 and 100 percent'; end if;
  if p_delivery_fee_payer not in ('buyer','fisher') then raise exception 'Delivery fee payer must be buyer or fisher'; end if;
  if p_monthly_subscription_fee is null or p_monthly_subscription_fee < 0 or p_monthly_subscription_fee > 10000 then raise exception 'Monthly subscription fee must be between £0 and £10,000'; end if;
  update public.maree_commercial_settings
  set maree_fee_rate=round(p_maree_fee_percent/100,5),
      delivery_fee_rate=round(p_delivery_fee_percent/100,5),
      delivery_fee_payer=p_delivery_fee_payer,
      monthly_subscription_fee=round(p_monthly_subscription_fee,2),
      updated_at=now()
  where id=true;
  if not found then raise exception 'Commercial settings row is missing'; end if;
end;
$function$;
revoke all on function public.update_maree_commercial_settings(numeric,numeric,text,numeric) from public, anon;
grant execute on function public.update_maree_commercial_settings(numeric,numeric,text,numeric) to authenticated;

drop function public.get_maree_commercial_settings();
create function public.get_maree_commercial_settings()
returns table(maree_fee_rate numeric, delivery_fee_rate numeric, delivery_fee_payer text, monthly_subscription_fee numeric)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return query
  select coalesce(s.maree_fee_rate,0.065),coalesce(s.delivery_fee_rate,0.20),
         coalesce(s.delivery_fee_payer,'buyer'),coalesce(s.monthly_subscription_fee,19.99)
  from public.maree_commercial_settings s where s.id=true;
end;
$function$;
revoke all on function public.get_maree_commercial_settings() from public, anon;
grant execute on function public.get_maree_commercial_settings() to authenticated;

create or replace function public.start_maree_restaurant_subscription(p_accept_terms boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_fee numeric(10,2);
  v_now timestamptz := now();
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_accept_terms is distinct from true then raise exception 'Explicit subscription consent is required'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user_id and p.role='restaurant'::public.app_role) then
    raise exception 'Only restaurant accounts can subscribe';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(741203,pg_catalog.hashtext(v_user_id::text));
  if exists (
    select 1 from public.maree_restaurant_subscriptions s
    where s.restaurant_id=v_user_id and s.started_at<=v_now and (s.ends_at is null or s.ends_at>v_now)
  ) then raise exception 'An active Marée subscription already exists'; end if;
  select round(s.monthly_subscription_fee,2) into v_fee
  from public.maree_commercial_settings s where s.id=true;
  if v_fee is null then raise exception 'Subscription pricing is not configured'; end if;
  insert into public.maree_restaurant_subscriptions
    (restaurant_id,monthly_fee,started_at,accepted_at,terms_version)
  values (v_user_id,v_fee,v_now,v_now,'2026-11-v1') returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.start_maree_restaurant_subscription(boolean) from public, anon;
grant execute on function public.start_maree_restaurant_subscription(boolean) to authenticated;

create or replace function public.cancel_maree_restaurant_subscription()
returns timestamptz
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_end timestamptz;
  v_subscription_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user_id and p.role='restaurant'::public.app_role) then
    raise exception 'Only restaurant accounts can cancel a subscription';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(741203,pg_catalog.hashtext(v_user_id::text));
  v_end := ((date_trunc('month',timezone('Europe/Jersey',now())) + interval '1 month') at time zone 'Europe/Jersey');
  select s.id into v_subscription_id from public.maree_restaurant_subscriptions s
  where s.restaurant_id=v_user_id and s.started_at<=now() and (s.ends_at is null or s.ends_at>now())
  order by s.started_at desc limit 1 for update;
  if not found then raise exception 'Active Marée subscription not found'; end if;
  update public.maree_restaurant_subscriptions set ends_at=v_end
  where id=v_subscription_id and (ends_at is null or ends_at>v_end);
  return v_end;
end;
$function$;
revoke all on function public.cancel_maree_restaurant_subscription() from public, anon;
grant execute on function public.cancel_maree_restaurant_subscription() to authenticated;

create or replace function public.generate_maree_monthly_commission_invoices(p_month date)
returns integer
language plpgsql security definer set search_path = ''
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
  v_start := date_trunc('month',p_month)::date;
  v_end := (date_trunc('month',p_month) + interval '1 month - 1 day')::date;
  v_start_at := (v_start::timestamp at time zone 'Europe/Jersey');
  v_end_at := ((v_end + 1)::timestamp at time zone 'Europe/Jersey');

  for v_restaurant in
    select eligible.restaurant_id from (
      select o.restaurant_id from public.orders o
      where o.status='delivered' and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
        and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
      union
      select s.restaurant_id from public.maree_restaurant_subscriptions s
      where s.started_at<v_end_at and (s.ends_at is null or s.ends_at>v_start_at)
    ) eligible
  loop
    insert into public.maree_monthly_commission_invoices
      (restaurant_id,period_start,period_end,due_date,commission_total,delivery_total,subscription_total)
    values (
      v_restaurant,v_start,v_end,v_end+7,
      coalesce((select sum(coalesce(o.maree_fee,0)) from public.orders o
        where o.restaurant_id=v_restaurant and o.status='delivered' and o.delivered_at>=v_start_at and o.delivered_at<v_end_at),0),
      coalesce((select sum(coalesce(o.delivery_fee,0)) from public.orders o
        where o.restaurant_id=v_restaurant and o.status='delivered' and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
          and o.delivery_fee_payer_snapshot='buyer'),0),
      coalesce((select sum(s.monthly_fee) from public.maree_restaurant_subscriptions s
        where s.restaurant_id=v_restaurant and s.started_at<v_end_at and (s.ends_at is null or s.ends_at>v_start_at)),0)
    )
    on conflict (restaurant_id,period_start) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;

  if exists (
    select 1 from public.maree_monthly_commission_invoices i
    join public.orders o on o.restaurant_id=i.restaurant_id
    where i.period_start=v_start and i.status<>'open'
      and o.status='delivered' and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
      and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
      and not exists (select 1 from public.maree_monthly_commission_invoice_items ii where ii.invoice_id=i.id and ii.order_id=o.id)
  ) then
    raise exception 'Late eligible order found for a finalized Marée commission invoice in period %. Manual adjustment required.',v_start;
  end if;

  if exists (
    select 1 from public.maree_monthly_commission_invoices i
    where i.period_start=v_start and i.status<>'open'
      and i.subscription_total <> coalesce((
        select sum(s.monthly_fee) from public.maree_restaurant_subscriptions s
        where s.restaurant_id=i.restaurant_id and s.started_at<v_end_at and (s.ends_at is null or s.ends_at>v_start_at)
      ),0)
  ) then
    raise exception 'Subscription change found for a finalized Marée invoice in period %. Manual adjustment required.',v_start;
  end if;

  for v_invoice in
    select i.id,i.restaurant_id from public.maree_monthly_commission_invoices i
    where i.period_start=v_start and i.status='open' for update
  loop
    delete from public.maree_monthly_commission_invoice_items ii
    where ii.invoice_id=v_invoice.id and not exists (
      select 1 from public.orders o where o.id=ii.order_id and o.restaurant_id=v_invoice.restaurant_id
        and o.status='delivered' and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
        and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
    );
    insert into public.maree_monthly_commission_invoice_items
      (invoice_id,order_id,commission_amount,delivery_amount,delivery_fee_payer_snapshot,product_subtotal,fulfilment,delivered_at)
    select v_invoice.id,o.id,coalesce(o.maree_fee,0),
      case when o.delivery_fee_payer_snapshot='buyer' then coalesce(o.delivery_fee,0) else 0 end,
      o.delivery_fee_payer_snapshot,o.product_subtotal,o.fulfilment,o.delivered_at
    from public.orders o
    where o.restaurant_id=v_invoice.restaurant_id and o.status='delivered'
      and o.delivered_at>=v_start_at and o.delivered_at<v_end_at
      and (coalesce(o.maree_fee,0)>0 or (o.delivery_fee_payer_snapshot='buyer' and coalesce(o.delivery_fee,0)>0))
    on conflict (invoice_id,order_id) do update set
      commission_amount=excluded.commission_amount,delivery_amount=excluded.delivery_amount,
      product_subtotal=excluded.product_subtotal,delivery_fee_payer_snapshot=excluded.delivery_fee_payer_snapshot,
      fulfilment=excluded.fulfilment,delivered_at=excluded.delivered_at;
    update public.maree_monthly_commission_invoices i
    set commission_total=coalesce((select sum(ii.commission_amount) from public.maree_monthly_commission_invoice_items ii where ii.invoice_id=i.id),0),
        delivery_total=coalesce((select sum(ii.delivery_amount) from public.maree_monthly_commission_invoice_items ii where ii.invoice_id=i.id),0),
        subscription_total=coalesce((
          select sum(s.monthly_fee) from public.maree_restaurant_subscriptions s
          where s.restaurant_id=i.restaurant_id and s.started_at<v_end_at and (s.ends_at is null or s.ends_at>v_start_at)
        ),0)
    where i.id=v_invoice.id;
  end loop;
  return v_count;
end;
$function$;
revoke all on function public.generate_maree_monthly_commission_invoices(date) from public, anon, authenticated;
grant execute on function public.generate_maree_monthly_commission_invoices(date) to service_role;

create or replace function private.create_maree_invoice_notifications()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_admin_id uuid;
begin
  if tg_op='INSERT' then
    insert into public.notifications (user_id,event_type,title,body,href,metadata,dedupe_key)
    values (new.restaurant_id,'maree_invoice_created','Votre relevé Marée est disponible',
      'Votre relevé mensuel Marée (abonnement, frais de commande et livraison) est disponible.',
      '/restaurant',jsonb_build_object('invoice_id',new.id,'period_start',new.period_start,'period_end',new.period_end,
        'subscription_total',new.subscription_total,'commission_total',new.commission_total,'delivery_total',new.delivery_total),
      'maree-invoice:'||new.id::text||':created:'||new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  elsif old.status is distinct from new.status and new.status='declared_paid' then
    for v_admin_id in
      select p.id from public.profiles p where p.role='admin'::public.app_role
      union select au.user_id from private.admin_users au
    loop
      insert into public.notifications (user_id,event_type,title,body,href,metadata,dedupe_key)
      values (v_admin_id,'maree_invoice_payment_declared','Paiement Marée à vérifier',
        'Un restaurant a déclaré le règlement de son relevé mensuel.','/admin',
        jsonb_build_object('invoice_id',new.id,'restaurant_id',new.restaurant_id,
          'payment_method',new.payment_method,'payment_reference',new.payment_reference),
        'maree-invoice:'||new.id::text||':declared:'||v_admin_id::text)
      on conflict (dedupe_key) do nothing;
    end loop;
  elsif old.status is distinct from new.status and new.status='paid' then
    insert into public.notifications (user_id,event_type,title,body,href,metadata,dedupe_key)
    values (new.restaurant_id,'maree_invoice_payment_verified','Paiement Marée confirmé',
      'L’administration a vérifié le règlement de votre relevé mensuel.','/restaurant',
      jsonb_build_object('invoice_id',new.id,'verified_at',new.verified_at),
      'maree-invoice:'||new.id::text||':verified:'||new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  elsif old.status is distinct from new.status and new.status='void' then
    insert into public.notifications (user_id,event_type,title,body,href,metadata,dedupe_key)
    values (new.restaurant_id,'maree_invoice_voided','Relevé Marée annulé',
      'Votre relevé mensuel Marée a été annulé. Consultez votre espace restaurant.','/restaurant',
      jsonb_build_object('invoice_id',new.id),
      'maree-invoice:'||new.id::text||':void:'||new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$function$;

comment on column public.maree_monthly_commission_invoices.subscription_total is 'Restaurant subscription fee for the billing month, separate from per-order Marée fees.';
comment on table public.maree_restaurant_subscriptions is 'Explicitly accepted restaurant subscriptions; the recorded monthly fee is a historical price snapshot.';
