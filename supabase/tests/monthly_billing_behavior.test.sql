begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

-- Isolated accounting fixtures. All timestamps are pinned to October 2026 so
-- the tests remain deterministic regardless of the date on which CI runs.
insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000021','billing-restaurant@test.local'),
  ('00000000-0000-4000-8000-000000000022','billing-fisher@test.local'),
  ('00000000-0000-4000-8000-000000000023','billing-fisher-two@test.local'),
  ('00000000-0000-4000-8000-000000000024','billing-fisher-three@test.local'),
  ('00000000-0000-4000-8000-000000000025','billing-fisher-four@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id='00000000-0000-4000-8000-000000000021';
update public.profiles set role='fisher'
where id in (
  '00000000-0000-4000-8000-000000000022',
  '00000000-0000-4000-8000-000000000023',
  '00000000-0000-4000-8000-000000000024',
  '00000000-0000-4000-8000-000000000025'
);

insert into public.verification_requests
  (id,user_id,requested_role,business_name,contact_name,phone,evidence_note,status,reviewed_at)
values
  ('30000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022',
   'fisher','Billing Test Fisher','Test Contact','+441534000021','Approved billing fixture.',
   'approved',now());

insert into public.catches (
  id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,
  price_per_kg,method,storage_instructions,status
) values (
  '10000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000022',
  'Pollock','North coast',now()-interval '3 hours',now()-interval '2 hours',
  10,10,10,'Line caught','Keep chilled at 0–4°C','available'
);

insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,
  delivery_fee_rate,delivery_fee,total_amount,billing_mode,delivered_at,tip_amount
) values (
  '20000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000021',
  5,now()+interval '1 day','delivery','delivered',
  '00000000-0000-4000-8000-000000000022',
  10,50,0.065,3.25,0.20,10,65.75,'monthly',
  '2026-10-15 12:00:00+00',2.50
);

select is(
  public.generate_fisher_monthly_invoices('2026-10-01'::date),
  1,
  'first monthly generation creates exactly one fisher invoice'
);
select is(
  public.generate_maree_monthly_commission_invoices('2026-10-01'::date),
  1,
  'first monthly generation creates exactly one Marée invoice'
);
select is(
  (select subtotal from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and fisher_id='00000000-0000-4000-8000-000000000022'
     and period_start='2026-10-01'),
  50.00::numeric,
  'fisher statement uses the immutable product subtotal'
);
select is(
  (select tip_total from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and fisher_id='00000000-0000-4000-8000-000000000022'
     and period_start='2026-10-01'),
  2.50::numeric,
  'fisher statement includes the full tip separately'
);
select is(
  (select count(*) from public.fisher_monthly_invoice_items
   where order_id='20000000-0000-4000-8000-000000000021'),
  1::bigint,
  'delivered monthly order is attached to exactly one fisher statement'
);
select is(
  (select commission_total from public.maree_monthly_commission_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and period_start='2026-10-01'),
  3.25::numeric,
  'Marée statement records the snapshotted 6.5 percent commission'
);
select is(
  (select delivery_total from public.maree_monthly_commission_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and period_start='2026-10-01'),
  10.00::numeric,
  'Marée statement records the snapshotted 20 percent delivery fee'
);
select is(
  public.generate_fisher_monthly_invoices('2026-10-01'::date),
  0,
  're-running fisher generation creates no duplicate invoice'
);
select is(
  public.generate_maree_monthly_commission_invoices('2026-10-01'::date),
  0,
  're-running Marée generation creates no duplicate invoice'
);
select is(
  (select count(*) from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and fisher_id='00000000-0000-4000-8000-000000000022'
     and period_start='2026-10-01'),
  1::bigint,
  'fisher invoice uniqueness holds after repeated generation'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and period_start='2026-10-01'),
  1::bigint,
  'Marée invoice uniqueness holds after repeated generation'
);

-- The business rule is based on unpaid open notes, not only overdue notes:
-- two open invoices still allow ordering; the third open invoice blocks it
-- even when its due date is in the future.
update public.fisher_monthly_invoices
set due_date=current_date-1
where restaurant_id='00000000-0000-4000-8000-000000000021'
  and fisher_id='00000000-0000-4000-8000-000000000022'
  and period_start='2026-10-01';

insert into public.fisher_monthly_invoices
  (restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,status)
values
  ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000023',
   '2026-08-01','2026-08-31',current_date,10,'open');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000021';
select lives_ok(
  $$select public.reserve_catch(
    '10000000-0000-4000-8000-000000000021'::uuid,0.5,
    now()+interval '2 days','collection'
  )$$,
  'two open invoices, one overdue and one due today, still allow ordering'
);
reset role;

insert into public.fisher_monthly_invoices
  (restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,status)
values
  ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000024',
   '2026-07-01','2026-07-31',current_date+7,10,'open');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000021';
select throws_ok(
  $$select public.reserve_catch(
    '10000000-0000-4000-8000-000000000021'::uuid,0.5,
    now()+interval '3 days','collection'
  )$$,
  'P0001',
  'Ordering is blocked: at least three monthly invoices are open and unpaid',
  'third open unpaid invoice blocks new orders even before its due date'
);
reset role;

-- The fisher confirms receipt. This must settle the invoice and every linked
-- order atomically; the restaurant then has only two open invoices and can
-- place a new order again.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000022';
select lives_ok(
  $$select public.mark_fisher_invoice_paid(
    (select id from public.fisher_monthly_invoices
     where restaurant_id='00000000-0000-4000-8000-000000000021'
       and fisher_id='00000000-0000-4000-8000-000000000022'
       and period_start='2026-10-01'),
    'bank_transfer','TEST-SETTLEMENT-001'
  )$$,
  'fisher can confirm receipt of their open monthly invoice'
);
reset role;

select is(
  (select status from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and fisher_id='00000000-0000-4000-8000-000000000022'
     and period_start='2026-10-01'),
  'paid',
  'payment confirmation settles the fisher invoice'
);
select is(
  (select fisher_payment_status from public.orders
   where id='20000000-0000-4000-8000-000000000021'),
  'paid',
  'payment confirmation marks all linked orders as paid'
);

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000021';
select lives_ok(
  $$select public.reserve_catch(
    '10000000-0000-4000-8000-000000000021'::uuid,0.5,
    now()+interval '4 days','collection'
  )$$,
  'settling one invoice reduces the open unpaid count to two and restores ordering'
);
reset role;


-- An immediate-billing order accepted for late cancellation creates a separate
-- fisher receivable. It is never rewritten as a delivered order.
insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,
  delivery_fee_rate,delivery_fee,total_amount,billing_mode,
  cancellation_request_status,cancellation_penalty
) values (
  '20000000-0000-4000-8000-000000000022',
  '10000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000021',
  1,now()+interval '1 day','delivery','confirmed',
  '00000000-0000-4000-8000-000000000022',
  10,10,0.065,0.65,0.20,2,12.65,'immediate','offered',12.50
);

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000021';
select lives_ok(
  $select public.respond_order_cancellation(
    '20000000-0000-4000-8000-000000000022'::uuid,true
  )$,
  'restaurant acceptance creates a cancellation indemnity receivable'
);
reset role;

select is(
  (select count(*) from public.fisher_cancellation_indemnities
   where order_id='20000000-0000-4000-8000-000000000022'),
  1::bigint,
  'accepted cancellation creates exactly one indemnity'
);
select is(
  (select cancellation_indemnity_total from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000021'
     and fisher_id='00000000-0000-4000-8000-000000000022'
     and period_start=date_trunc('month',now() at time zone 'Europe/Jersey')::date),
  12.50::numeric,
  'cancellation indemnity is added to the fisher statement'
);
select is(
  (select status from public.orders where id='20000000-0000-4000-8000-000000000022'),
  'cancelled',
  'accepted cancellation remains cancelled and is not recorded as delivered'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoice_items
   where order_id='20000000-0000-4000-8000-000000000022'),
  0::bigint,
  'cancellation indemnity is excluded from Marée commission'
);

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000021';
select throws_ok(
  $select public.reserve_catch(
    '10000000-0000-4000-8000-000000000021'::uuid,0.5,
    now()+interval '5 days','collection'
  )$,
  'P0001',
  'Ordering is blocked: at least three monthly invoices are open and unpaid',
  'accepted cancellation indemnity counts as a third open amount and blocks ordering'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000022';
select lives_ok(
  $select public.mark_fisher_invoice_paid(
    (select invoice_id from public.fisher_cancellation_indemnities
     where order_id='20000000-0000-4000-8000-000000000022'),
    'bank_transfer','CANCEL-SETTLEMENT-001'
  )$,
  'fisher can settle a statement containing a cancellation indemnity'
);
reset role;
select is(
  (select status from public.fisher_cancellation_indemnities
   where order_id='20000000-0000-4000-8000-000000000022'),
  'paid',
  'invoice payment settles the cancellation receivable'
);

select * from finish();
rollback;
