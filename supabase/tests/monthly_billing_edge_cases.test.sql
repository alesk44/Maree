begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- These fixtures exercise the Jersey-local calendar boundary in October 2026
-- (BST, UTC+1): 23:30 UTC on Sep 30 is Oct 1 locally; 23:30 UTC on Oct 31
-- is Nov 1 locally. No production data is touched.
insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000031','billing-edge-restaurant@test.local'),
  ('00000000-0000-4000-8000-000000000032','billing-edge-fisher@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id='00000000-0000-4000-8000-000000000031';
update public.profiles set role='fisher'
where id='00000000-0000-4000-8000-000000000032';

insert into public.catches (
  id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,
  price_per_kg,method,storage_instructions,status
) values (
  '10000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032',
  'Pollock','North coast',now()-interval '3 hours',now()-interval '2 hours',
  10,10,10.01,'Line caught','Keep chilled at 0–4°C','available'
);

insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,
  delivery_fee_rate,delivery_fee,total_amount,billing_mode,delivered_at,tip_amount
) values
  ('20000000-0000-4000-8000-000000000031',
   '10000000-0000-4000-8000-000000000031',
   '00000000-0000-4000-8000-000000000031',
   1,now()+interval '1 day','delivery','delivered',
   '00000000-0000-4000-8000-000000000032',
   10.01,10.01,0.065,0.65,0.20,2.00,12.66,'monthly',
   '2026-09-30 23:30:00+00',0),
  ('20000000-0000-4000-8000-000000000032',
   '10000000-0000-4000-8000-000000000031',
   '00000000-0000-4000-8000-000000000031',
   1,now()+interval '1 day','delivery','delivered',
   '00000000-0000-4000-8000-000000000032',
   10.01,10.01,0.065,0.65,0.20,2.00,12.66,'monthly',
   '2026-10-31 23:30:00+00',0);

select is(
  public.generate_fisher_monthly_invoices('2026-10-01'::date),
  1,
  'Jersey-local October start boundary creates one fisher invoice'
);
select is(
  public.generate_maree_monthly_commission_invoices('2026-10-01'::date),
  1,
  'Jersey-local October start boundary creates one Marée invoice'
);
select is(
  (select count(*) from public.fisher_monthly_invoice_items
   where order_id='20000000-0000-4000-8000-000000000031'),
  1::bigint,
  'order at October local start is included in fisher statement'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoice_items
   where order_id='20000000-0000-4000-8000-000000000031'),
  1::bigint,
  'order at October local start is included in Marée statement'
);
select is(
  (select subtotal from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000031'
     and fisher_id='00000000-0000-4000-8000-000000000032'
     and period_start='2026-10-01'),
  10.01::numeric,
  'fisher subtotal retains two-decimal order snapshot'
);
select is(
  (select commission_total from public.maree_monthly_commission_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000031'
     and period_start='2026-10-01'),
  0.65::numeric,
  'commission rounds per order to two decimal places'
);
select is(
  (select delivery_total from public.maree_monthly_commission_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000031'
     and period_start='2026-10-01'),
  2.00::numeric,
  'delivery fee rounds per order to two decimal places'
);
select is(
  (select due_date from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000031'
     and fisher_id='00000000-0000-4000-8000-000000000032'
     and period_start='2026-10-01'),
  '2026-11-07'::date,
  'fisher invoice due date is seven calendar days after period end'
);
select is(
  (select due_date from public.maree_monthly_commission_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000031'
     and period_start='2026-10-01'),
  '2026-11-07'::date,
  'Marée invoice due date is seven calendar days after period end'
);
select is(
  public.generate_fisher_monthly_invoices('2026-11-01'::date),
  1,
  'Jersey-local October end boundary belongs to November fisher invoice'
);
select is(
  public.generate_maree_monthly_commission_invoices('2026-11-01'::date),
  1,
  'Jersey-local October end boundary belongs to November Marée invoice'
);
select is(
  (select count(*) from public.fisher_monthly_invoice_items
   where order_id='20000000-0000-4000-8000-000000000032'),
  1::bigint,
  'order at November local start is excluded from October and included in November fisher statement'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoice_items
   where order_id='20000000-0000-4000-8000-000000000032'),
  1::bigint,
  'order at November local start is excluded from October and included in November Marée statement'
);

-- Once a statement is settled/declared, a subsequently delivered order for
-- that period must fail loudly rather than silently disappear from the ledger.
update public.fisher_monthly_invoices
set status='paid',paid_at=now(),paid_by='00000000-0000-4000-8000-000000000032'
where restaurant_id='00000000-0000-4000-8000-000000000031'
  and fisher_id='00000000-0000-4000-8000-000000000032'
  and period_start='2026-10-01';
update public.maree_monthly_commission_invoices
set status='declared_paid',declared_at=now(),declared_by='00000000-0000-4000-8000-000000000031'
where restaurant_id='00000000-0000-4000-8000-000000000031'
  and period_start='2026-10-01';

insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,
  delivery_fee_rate,delivery_fee,total_amount,billing_mode,delivered_at,tip_amount
) values (
  '20000000-0000-4000-8000-000000000033',
  '10000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000031',
  1,now()+interval '1 day','delivery','delivered',
  '00000000-0000-4000-8000-000000000032',
  10.01,10.01,0.065,0.65,0.20,2.00,12.66,'monthly',
  '2026-10-20 12:00:00+00',0);

select throws_ok(
  $$select public.generate_fisher_monthly_invoices('2026-10-01'::date)$$,
  'P0001',
  'Late eligible order found for a finalized fisher invoice in period 2026-10-01. Manual adjustment required.',
  'late order cannot silently rewrite a paid fisher invoice'
);
select throws_ok(
  $$select public.generate_maree_monthly_commission_invoices('2026-10-01'::date)$$,
  'P0001',
  'Late eligible order found for a finalized Marée commission invoice in period 2026-10-01. Manual adjustment required.',
  'late order cannot silently rewrite a declared Marée invoice'
);

select * from finish();
rollback;
