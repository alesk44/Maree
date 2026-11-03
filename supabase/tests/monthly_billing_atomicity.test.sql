begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000061','billing-atomic-restaurant@test.local'),
  ('00000000-0000-4000-8000-000000000062','billing-atomic-fisher@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id='00000000-0000-4000-8000-000000000061';
update public.profiles set role='fisher'
where id='00000000-0000-4000-8000-000000000062';

insert into public.catches (
  id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,
  price_per_kg,method,storage_instructions,status
) values (
  '10000000-0000-4000-8000-000000000061',
  '00000000-0000-4000-8000-000000000062',
  'Pollock','North coast',now()-interval '3 hours',now()-interval '2 hours',
  10,10,10,'Line caught','Keep chilled at 0–4°C','available'
);

insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,
  delivery_fee_rate,delivery_fee,total_amount,billing_mode,delivered_at,tip_amount
) values (
  '20000000-0000-4000-8000-000000000061',
  '10000000-0000-4000-8000-000000000061',
  '00000000-0000-4000-8000-000000000061',
  2,now()+interval '1 day','delivery','delivered',
  '00000000-0000-4000-8000-000000000062',
  10,20,0.065,1.30,0.20,4,25.30,'monthly',
  '2026-07-15 12:00:00+00',0
);

create function public.test_fail_maree_invoice_line()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Injected Marée line failure';
end;
$$;

create trigger test_fail_maree_invoice_line
before insert on public.maree_monthly_commission_invoice_items
for each row execute function public.test_fail_maree_invoice_line();

select throws_ok(
  $$select public.generate_monthly_billing_statements('2026-07-01'::date)$$,
  'P0001','Injected Marée line failure',
  'a failure in the Marée generator aborts the complete monthly orchestration'
);

select is((select count(*) from public.fisher_monthly_invoices
  where restaurant_id='00000000-0000-4000-8000-000000000061'
    and fisher_id='00000000-0000-4000-8000-000000000062'
    and period_start='2026-07-01'),0::bigint,
  'fisher invoice header is rolled back when the Marée generator fails');
select is((select count(*) from public.maree_monthly_commission_invoices
  where restaurant_id='00000000-0000-4000-8000-000000000061'
    and period_start='2026-07-01'),0::bigint,
  'Marée invoice header is rolled back when its line insertion fails');

drop trigger test_fail_maree_invoice_line on public.maree_monthly_commission_invoice_items;
drop function public.test_fail_maree_invoice_line();

select lives_ok(
  $$select public.generate_monthly_billing_statements('2026-07-01'::date)$$,
  'retry succeeds after the injected failure is removed'
);
select is((select count(*) from public.fisher_monthly_invoices
  where restaurant_id='00000000-0000-4000-8000-000000000061'
    and fisher_id='00000000-0000-4000-8000-000000000062'
    and period_start='2026-07-01'),1::bigint,
  'retry produces one fisher invoice after rollback');

select * from finish();
rollback;
