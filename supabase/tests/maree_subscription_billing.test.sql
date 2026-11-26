begin;

create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000071','subscription-restaurant@test.local'),
  ('00000000-0000-4000-8000-000000000072','subscription-other@test.local'),
  ('00000000-0000-4000-8000-000000000073','subscription-fisher@test.local'),
  ('00000000-0000-4000-8000-000000000074','subscription-only@test.local'),
  ('00000000-0000-4000-8000-000000000075','subscription-admin@test.local'),
  ('00000000-0000-4000-8000-000000000076','subscription-finalized@test.local')
on conflict (id) do nothing;
update public.profiles set role='restaurant'
where id in ('00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000072','00000000-0000-4000-8000-000000000074');
update public.profiles set role='fisher' where id='00000000-0000-4000-8000-000000000073';
update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000075';
update public.profiles set role='restaurant' where id='00000000-0000-4000-8000-000000000076';
insert into private.admin_users(user_id) values ('00000000-0000-4000-8000-000000000075') on conflict (user_id) do nothing;
insert into public.maree_monthly_commission_invoices
  (id,restaurant_id,period_start,period_end,due_date,status,declared_at,declared_by,verified_at,verified_by,payment_method)
values ('40000000-0000-4000-8000-000000000076','00000000-0000-4000-8000-000000000076',
  date_trunc('month',timezone('Europe/Jersey',now()))::date,
  (date_trunc('month',timezone('Europe/Jersey',now()))+interval '1 month - 1 day')::date,
  (date_trunc('month',timezone('Europe/Jersey',now()))+interval '1 month - 1 day')::date+7,
  'paid',now(),'00000000-0000-4000-8000-000000000075',now(),'00000000-0000-4000-8000-000000000075','Bank transfer');
update public.maree_commercial_settings set monthly_subscription_fee=19.99 where id=true;

select has_column('public','maree_commercial_settings','monthly_subscription_fee','commercial settings store the monthly subscription price');
select is((select monthly_subscription_fee from public.maree_commercial_settings where id=true),19.99::numeric,'default subscription price is £19.99 per month');
select has_column('public','maree_monthly_commission_invoices','subscription_total','monthly Marée invoices have a separate subscription line');
select has_table('public','maree_restaurant_subscriptions','restaurant subscription agreements are stored');
select ok(exists(select 1 from pg_trigger where tgrelid='public.maree_monthly_commission_invoices'::regclass and tgname='maree_monthly_commission_invoice_notifications' and not tgisinternal),'monthly Marée statement insert and status changes create notifications');
select ok((select prosrc like '%auth.jwt()%' and prosrc not like '%auth.role()%' from pg_proc where oid='public.generate_maree_monthly_commission_invoices(date)'::regprocedure),'invoice generation checks the verified JWT role claim');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.start_maree_restaurant_subscription(boolean)'::regprocedure),'subscription opt-in RPC is SECURITY DEFINER with empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.cancel_maree_restaurant_subscription()'::regprocedure),'subscription cancellation RPC is SECURITY DEFINER with empty search_path');
select ok(has_function_privilege('authenticated','public.start_maree_restaurant_subscription(boolean)','EXECUTE')
  and has_function_privilege('authenticated','public.cancel_maree_restaurant_subscription()','EXECUTE')
  and not has_function_privilege('anon','public.start_maree_restaurant_subscription(boolean)','EXECUTE')
  and not has_function_privilege('anon','public.cancel_maree_restaurant_subscription()','EXECUTE'),
  'subscription RPCs are authenticated only');
select ok(not has_table_privilege('authenticated','public.maree_restaurant_subscriptions','INSERT')
  and not has_table_privilege('authenticated','public.maree_restaurant_subscriptions','UPDATE'),
  'clients cannot directly create or change subscription agreements');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000071';
select throws_ok($$select public.start_maree_restaurant_subscription(false)$$,'P0001','Explicit subscription consent is required','subscription cannot start without affirmative consent');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000076';
select throws_ok($$select public.start_maree_restaurant_subscription(true)$$,'P0001','The current Marée statement is finalized; subscription can start next month','subscription cannot alter a finalized current-month statement');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000073';
select throws_ok($$select public.start_maree_restaurant_subscription(true)$$,'P0001','Only restaurant accounts can subscribe','fisher accounts cannot subscribe');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000071';
select lives_ok($$select public.start_maree_restaurant_subscription(true)$$,'restaurant can explicitly accept the subscription');
select is((select monthly_fee from public.maree_restaurant_subscriptions where restaurant_id='00000000-0000-4000-8000-000000000071'),19.99::numeric,'agreement snapshots the accepted monthly price');
select ok((select accepted_at is not null and terms_version='2026-11-v1' from public.maree_restaurant_subscriptions where restaurant_id='00000000-0000-4000-8000-000000000071'),'agreement records consent time and terms version');
select throws_ok($$select public.start_maree_restaurant_subscription(true)$$,'P0001','An active Marée subscription already exists','duplicate active subscription is rejected');
select is((select count(*) from public.maree_restaurant_subscriptions),1::bigint,'restaurant can read only its own subscription under RLS');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000072';
select is((select count(*) from public.maree_restaurant_subscriptions),0::bigint,'another restaurant cannot read the agreement');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000073';
select is((select count(*) from public.maree_restaurant_subscriptions),0::bigint,'fishers cannot read restaurant subscription agreements');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000074';
select lives_ok($$select public.start_maree_restaurant_subscription(true)$$,'restaurant can subscribe without placing any orders');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000071';
select throws_ok($$select public.update_maree_commercial_settings(6.5,20,'buyer',24.99)$$,'P0001','Admin access required','restaurant cannot change the subscription price');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000075';
select lives_ok($$select public.update_maree_commercial_settings(6.5,20,'buyer',24.99)$$,'admin can change the monthly fee for future subscriptions');
reset role;
select is((select monthly_subscription_fee from public.maree_commercial_settings where id=true),24.99::numeric,'admin subscription price update is stored');
select is((select monthly_fee from public.maree_restaurant_subscriptions where restaurant_id='00000000-0000-4000-8000-000000000071'),19.99::numeric,'changing the list price does not alter an accepted subscription');

insert into public.verification_requests
  (id,user_id,requested_role,business_name,contact_name,phone,evidence_note,status,reviewed_at)
values ('30000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000073',
  'fisher','Subscription Test Fisher','Test Contact','+441534000071','Approved test fisher.','approved',now());
insert into public.catches
  (id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,price_per_kg,method,storage_instructions,status)
values ('10000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000073',
  'Pollock','North coast',now()-interval '2 hours',now()-interval '1 hour',10,10,10,'Line','Keep chilled','available');
insert into public.orders
  (id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,fisher_id_snapshot,
   unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,delivery_fee_rate,delivery_fee,
   delivery_fee_payer_snapshot,total_amount,billing_mode,delivered_at)
values ('20000000-0000-4000-8000-000000000071','10000000-0000-4000-8000-000000000071',
  '00000000-0000-4000-8000-000000000071',10,now()+interval '10 days','delivery','delivered',
  '00000000-0000-4000-8000-000000000073',10,100,0.065,6.50,0.20,20,'buyer',126.50,'immediate',
  ((date_trunc('month',timezone('Europe/Jersey',now()))+interval '10 days') at time zone 'Europe/Jersey'));

select is(public.generate_maree_monthly_commission_invoices(date_trunc('month',timezone('Europe/Jersey',now()))::date),2,
  'monthly generator creates invoices for active subscriptions and order fees');
select is((select subscription_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000071'),19.99::numeric,'invoice contains the accepted monthly subscription');
select is((select commission_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000071'),6.50::numeric,'invoice preserves the 6.5 percent per-order Marée fee');
select is((select delivery_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000071'),20.00::numeric,'invoice separately includes restaurant-paid delivery');
select is((select subscription_total+commission_total+delivery_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000071'),46.49::numeric,'combined Marée invoice total is the sum of its three own-service charges');
select is((select count(*) from public.maree_monthly_commission_invoice_items ii join public.maree_monthly_commission_invoices i on i.id=ii.invoice_id where i.restaurant_id='00000000-0000-4000-8000-000000000071'),1::bigint,'combined invoice retains the delivered order detail');
select is((select metadata->>'subscription_total' from public.notifications where user_id='00000000-0000-4000-8000-000000000071' and event_type='maree_invoice_created'), '19.99', 'monthly invoice notification includes the subscription amount');
select is((select subscription_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000074'),19.99::numeric,'subscription-only invoice is generated without an order');
select is((select commission_total+delivery_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000074'),0.00::numeric,'subscription-only invoice has no product order fees');
select is((select count(*) from public.maree_monthly_commission_invoice_items ii join public.maree_monthly_commission_invoices i on i.id=ii.invoice_id where i.restaurant_id='00000000-0000-4000-8000-000000000074'),0::bigint,'subscription-only invoice contains no fabricated order lines');
select is(public.generate_maree_monthly_commission_invoices(date_trunc('month',timezone('Europe/Jersey',now()))::date),0,
  'rerunning generation does not duplicate the monthly invoice');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000071';
select lives_ok($$select public.cancel_maree_restaurant_subscription()$$,'restaurant can schedule cancellation');
reset role;
select is((select ends_at from public.maree_restaurant_subscriptions where restaurant_id='00000000-0000-4000-8000-000000000071'),
  ((date_trunc('month',timezone('Europe/Jersey',now()))+interval '1 month') at time zone 'Europe/Jersey'),
  'cancellation takes effect at the next Jersey month boundary');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000074';
select lives_ok($$select public.cancel_maree_restaurant_subscription()$$,'subscription-only customer can schedule cancellation');
reset role;
select is(public.generate_maree_monthly_commission_invoices((date_trunc('month',timezone('Europe/Jersey',now()))+interval '1 month')::date),0,
  'canceled subscription does not create an invoice for the following month');
select is((select count(*) from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000072'),0::bigint,
  'restaurant that never opted in receives no subscription invoice');

select * from finish();
rollback;
