begin;

create extension if not exists pgtap with schema extensions;
select plan(83);

-- Isolated auth users; the auth trigger creates their initial restaurant profiles.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'maree-fisher-a@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'maree-fisher-b@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'maree-restaurant-a@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'maree-restaurant-b@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'maree-admin@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'maree-fisher-upgrade@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'maree-admin-restaurant@test.local')
on conflict (id) do nothing;

update public.profiles set role = 'fisher', display_name = 'Fisher A'
where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set role = 'fisher', display_name = 'Fisher B'
where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set role = 'restaurant', display_name = 'Restaurant A'
where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set role = 'restaurant', display_name = 'Restaurant B'
where id = '00000000-0000-4000-8000-000000000004';
update public.profiles set role = 'admin', display_name = 'Marée Admin'
where id = '00000000-0000-4000-8000-000000000005';
update public.profiles set role = 'fisher', display_name = 'Fisher Upgrade'
where id = '00000000-0000-4000-8000-000000000006';
update public.profiles set role = 'restaurant', display_name = 'Restaurant Admin'
where id = '00000000-0000-4000-8000-000000000007';
insert into private.admin_users (user_id)
values ('00000000-0000-4000-8000-000000000007')
on conflict (user_id) do nothing;

insert into public.catches (
  id, fisher_id, species, zone, caught_at, landed_at, quantity_kg,
  remaining_kg, price_per_kg, method, storage_instructions, status
) values
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001',
   'Pollock', 'North coast', now() - interval '3 hours', now() - interval '2 hours',
   2, 2, 8.50, 'Line caught', 'Keep chilled at 0–4°C', 'available'),
  ('10000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   'Crab', 'East coast', now() - interval '3 hours', now() - interval '2 hours',
   1, 0, 12.00, 'Pot caught', 'Keep chilled at 0–4°C', 'sold_out')
on conflict (id) do nothing;

insert into public.orders (
  id, catch_id, restaurant_id, quantity_kg, requested_slot, fulfilment, status
) values
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000003',
   0.5, now() + interval '1 day', 'collection', 'submitted'),
  ('20000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004',
   0.5, now() + interval '1 day', 'delivery', 'submitted')
on conflict (id) do nothing;

insert into public.verification_requests (
  id, user_id, requested_role, business_name, contact_name, phone, evidence_note
) values
  ('30000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000003',
   'restaurant', 'Harbour Kitchen', 'Test Contact A', '+441534000001',
   'Test evidence for restaurant account A.'),
  ('30000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004',
   'restaurant', 'East Pier Kitchen', 'Test Contact B', '+441534000002',
   'Test evidence for restaurant account B.'),
  ('30000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000006',
   'fisher', 'Harbour Fishing', 'Test Contact C', '+441534000003',
   'Test evidence for a fisher role upgrade.'),
  ('30000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000004',
   'restaurant', 'West Pier Kitchen', 'Test Contact D', '+441534000004',
   'Test evidence for a second restaurant account.')
on conflict (id) do nothing;

-- Table-level security posture and least-privilege grants.
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.catches'::regclass), 'catches has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'orders has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.verification_requests'::regclass), 'verification_requests has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.verification_email_action_tokens'::regclass), 'email action tokens have RLS enabled');
select ok(not has_table_privilege('authenticated', 'private.verification_email_action_tokens', 'SELECT'), 'authenticated users cannot read email action tokens');
select ok(not has_function_privilege('anon', 'public.create_verification_email_action_tokens(uuid,text,text,timestamptz)', 'EXECUTE'), 'anonymous users cannot create email decision tokens');
select ok(not has_function_privilege('authenticated', 'public.review_verification_request_by_email_token(text)', 'EXECUTE'), 'authenticated users cannot execute email decision RPC');

select ok(not has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT'), 'anonymous users cannot read profile phone numbers');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT'), 'authenticated users cannot directly read private profile phone numbers');
select ok(not has_function_privilege('anon', 'public.get_my_business_profile()', 'EXECUTE'), 'anonymous users cannot call the private profile RPC');
select ok(has_function_privilege('authenticated', 'public.get_my_business_profile()', 'EXECUTE'), 'authenticated users can call the owner-scoped private profile RPC');
select ok(not has_table_privilege('anon', 'public.orders', 'SELECT'), 'anonymous users cannot read orders');
select ok(not has_table_privilege('authenticated', 'public.orders', 'INSERT'), 'authenticated clients cannot insert orders directly');
select ok(not has_table_privilege('authenticated', 'public.orders', 'UPDATE'), 'authenticated clients cannot update orders directly');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'), 'authenticated clients cannot change profile roles');
select ok(not has_function_privilege('anon', 'public.reserve_catch(uuid,numeric,timestamptz,text,text)', 'EXECUTE'), 'anonymous users cannot call reserve_catch');
select ok(has_function_privilege('authenticated', 'public.reserve_catch(uuid,numeric,timestamptz,text,text)', 'EXECUTE'), 'restaurants can call the authenticated reservation RPC');
select ok(not has_function_privilege('anon', 'public.update_order_status(uuid,public.order_status)', 'EXECUTE'), 'anonymous users cannot update order status');
select ok(has_function_privilege('authenticated', 'public.update_order_status(uuid,public.order_status)', 'EXECUTE'), 'authenticated users can call the order status RPC');
select ok(has_table_privilege('anon', 'public.public_fisher_directory', 'SELECT'), 'anonymous users can read the public fisher directory');

-- Anonymous catalogue visibility: available lots and fisher cards only.
set local role anon;
set local "request.jwt.claim.sub" = '';
select is((select count(*) from public.catches), 1::bigint, 'anonymous catalogue sees available catch lots only');
select is((select count(id) from public.profiles), 3::bigint, 'anonymous profile reads see fisher profiles only');
reset role;

-- Restaurant A sees only its own orders and verification request.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is((select count(*) from public.orders), 1::bigint, 'restaurant sees only its own order');
select is((select count(*) from public.verification_requests), 1::bigint, 'restaurant sees only its own verification request');
select is((select display_name from public.get_my_business_profile()), 'Restaurant A'::text, 'private profile RPC returns only the authenticated owner profile');
select throws_ok(
  $$insert into public.catches (
    fisher_id, species, zone, caught_at, landed_at, quantity_kg, remaining_kg,
    price_per_kg, method, storage_instructions
  ) values (
    '00000000-0000-4000-8000-000000000003'::uuid, 'Bass', 'South coast',
    now() - interval '2 hours', now() - interval '1 hour',
    1, 1, 9, 'Line caught', 'Keep chilled'
  )$$,
  '42501', null,
  'restaurant cannot publish a catch'
);
select throws_ok(
  $$insert into public.verification_requests (
    user_id, requested_role, business_name, contact_name, phone, evidence_note
  ) values (
    '00000000-0000-4000-8000-000000000004'::uuid, 'restaurant',
    'Other Restaurant', 'Other Contact', '+441534000099', 'Evidence note for another account.'
  )$$,
  '42501', null,
  'user cannot submit a verification request for another account'
);
select throws_ok(
  $$select public.update_order_status('20000000-0000-4000-8000-000000000001'::uuid, 'confirmed'::public.order_status)$$,
  'P0001', 'Only fisher accounts can update orders',
  'restaurant account cannot advance order status'
);
reset role;

-- Fisher B can see all available lots plus their own sold-out lot, but cannot
-- update another fisher's order or use restaurant/admin RPCs.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
select is((select count(*) from public.catches), 2::bigint, 'fisher sees available lots and their own sold-out lot');
select is((select count(*) from public.orders), 1::bigint, 'fisher sees only orders for their own catch');
select ok(
  not has_table_privilege('authenticated', 'public.catches', 'UPDATE'),
  'fisher clients cannot bypass the inventory ownership RPC with direct updates'
);
select throws_ok(
  $$select public.update_order_status('20000000-0000-4000-8000-000000000002'::uuid, 'delivered'::public.order_status)$$,
  'P0001', 'Invalid order status transition',
  'fisher cannot skip required order status transitions'
);
select throws_ok(
  $$select public.update_order_status('20000000-0000-4000-8000-000000000001'::uuid, 'confirmed'::public.order_status)$$,
  'P0001', 'Only the lot owner can update this order',
  'fisher cannot update another fisher order'
);
select throws_ok(
  $$select public.reserve_catch('10000000-0000-4000-8000-000000000001'::uuid, 0.5, now() + interval '1 day', 'collection', null)$$,
  'P0001', 'Only restaurant accounts can place orders',
  'fisher cannot reserve a catch'
);
select throws_ok(
  $$select public.review_verification_request('30000000-0000-4000-8000-000000000001'::uuid, 'approved'::public.verification_status, null)$$,
  'P0001', 'Admin access required',
  'fisher cannot review verification requests'
);
reset role;

-- Admin approval must update the request and grant the requested role atomically.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000005';
select lives_ok(
  $$select public.review_verification_request('30000000-0000-4000-8000-000000000003'::uuid, 'approved'::public.verification_status, 'Approved by test admin')$$,
  'admin can approve a pending verification request'
);
reset role;

-- A restaurant-role account with a separate admin grant can access admin functions.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000007';
select is(public.is_current_user_admin(), true, 'separate admin grant is recognized without changing restaurant role');
select is((select role::text from public.profiles where id = '00000000-0000-4000-8000-000000000007'), 'restaurant', 'separate admin grant preserves the restaurant business role');
select is((select count(*) from public.verification_requests), 4::bigint, 'separate admin can read all verification requests');
select lives_ok(
  $$select public.review_verification_request('30000000-0000-4000-8000-000000000004'::uuid, 'approved'::public.verification_status, 'Approved by separate admin')$$,
  'separate admin can approve a pending verification request'
);
reset role;

select is((select role::text from public.profiles where id = '00000000-0000-4000-8000-000000000006'), 'fisher', 'approval grants the requested professional role');
select is((select status::text from public.verification_requests where id = '30000000-0000-4000-8000-000000000003'), 'approved', 'approval marks the verification request approved');
select is((select reviewed_by from public.verification_requests where id = '30000000-0000-4000-8000-000000000003'), '00000000-0000-4000-8000-000000000005'::uuid, 'approval records the admin reviewer');

select ok(to_regclass('public.verification_requests_user_id_idx') is not null, 'verification request owner index exists');
select ok(to_regclass('public.verification_requests_reviewed_by_idx') is not null, 'verification reviewer index exists');


-- Commercial model: immutable pricing columns, delivery ownership and billing preferences.
select ok(to_regclass('public.fisher_monthly_invoices') is not null, 'monthly fisher invoice table exists');
select ok(to_regclass('public.fisher_monthly_invoice_items') is not null, 'monthly fisher invoice item table exists');
select ok(has_column_privilege('authenticated', 'public.orders', 'product_subtotal', 'SELECT'), 'restaurant/fisher can read snapshotted product subtotal through order RLS');
select ok(has_column_privilege('authenticated', 'public.orders', 'maree_fee', 'SELECT'), 'restaurant/fisher can read the snapshotted Marée commission through order RLS');
select ok(has_column_privilege('authenticated', 'public.orders', 'maree_fee_rate', 'SELECT'), 'restaurant/fisher can read the commission rate applied to each order');
select is((select maree_fee_rate from public.maree_commercial_settings where id = true), 0.065::numeric, 'default Marée commission is 6.5 percent');
select ok(not has_table_privilege('authenticated', 'public.fisher_monthly_invoices', 'INSERT'), 'clients cannot create or alter monthly invoices directly');
select ok(has_function_privilege('service_role', 'public.generate_fisher_monthly_invoices(date)', 'EXECUTE'), 'trusted scheduler can generate monthly invoices');
select ok(to_regclass('cron.job') is not null, 'pg_cron scheduler is installed');
select ok(exists (select 1 from cron.job where jobname = 'maree-monthly-fisher-invoices'), 'monthly invoice generation is scheduled');

-- Verify server-side Marée fee calculation for collection and delivery.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $select public.reserve_catch('10000000-0000-4000-8000-000000000001'::uuid, 0.5, now() + interval '2 days', 'collection', 'commission test')$,
  'restaurant can reserve collection with commission'
);
select lives_ok(
  $select public.reserve_catch('10000000-0000-4000-8000-000000000001'::uuid, 0.5, now() + interval '3 days', 'delivery', 'commission test')$,
  'restaurant can reserve delivery with commission'
);
select is(
  (select maree_fee from public.orders where restaurant_id = '00000000-0000-4000-8000-000000000003' and fulfilment = 'collection' and note = 'commission test' order by created_at desc limit 1),
  0.28::numeric,
  '6.5 percent Marée fee is charged on collection'
);
select is(
  (select delivery_fee from public.orders where restaurant_id = '00000000-0000-4000-8000-000000000003' and fulfilment = 'collection' and note = 'commission test' order by created_at desc limit 1),
  0::numeric,
  'collection has no delivery fee'
);
select is(
  (select maree_fee from public.orders where restaurant_id = '00000000-0000-4000-8000-000000000003' and fulfilment = 'delivery' and note = 'commission test' order by created_at desc limit 1),
  0.28::numeric,
  '6.5 percent Marée fee is charged on delivery'
);
select is(
  (select delivery_fee from public.orders where restaurant_id = '00000000-0000-4000-8000-000000000003' and fulfilment = 'delivery' and note = 'commission test' order by created_at desc limit 1),
  0.85::numeric,
  '20 percent delivery fee is charged only on delivery'
);
select is(
  (select total_amount from public.orders where restaurant_id = '00000000-0000-4000-8000-000000000003' and fulfilment = 'delivery' and note = 'commission test' order by created_at desc limit 1),
  5.38::numeric,
  'restaurant total includes products, 6.5 percent Marée fee and delivery'
);
reset role;
select ok(has_function_privilege('authenticated', 'public.mark_fisher_invoice_paid(uuid,text,text)', 'EXECUTE'), 'authenticated fisher payment confirmation RPC is available');
select ok(not has_function_privilege('anon', 'public.mark_fisher_invoice_paid(uuid,text,text)', 'EXECUTE'), 'anonymous users cannot confirm invoice payments');

-- Marée commission invoices are restaurant liabilities, separate from fisher invoices.
select ok(to_regclass('public.maree_monthly_commission_invoices') is not null, 'monthly Marée commission invoice table exists');
select ok(to_regclass('public.maree_monthly_commission_invoice_items') is not null, 'monthly Marée commission invoice items table exists');
select ok(has_function_privilege('service_role', 'public.generate_maree_monthly_commission_invoices(date)', 'EXECUTE'), 'trusted scheduler can generate Marée commission invoices');
select ok(not has_function_privilege('authenticated', 'public.generate_maree_monthly_commission_invoices(date)', 'EXECUTE'), 'clients cannot generate Marée commission invoices');
select ok(has_function_privilege('authenticated', 'public.declare_maree_commission_invoice_paid(uuid,text,text)', 'EXECUTE'), 'restaurant declaration RPC is available to authenticated users');
select ok(has_function_privilege('authenticated', 'public.verify_maree_commission_invoice_paid(uuid)', 'EXECUTE'), 'admin verification RPC is available to authenticated users');

-- Exercise the actual monthly generator with a delivered order and its snapshotted commission.
update public.orders
set status='delivered', delivered_at=now()
where id='20000000-0000-4000-8000-000000000002';
select lives_ok(
  $select public.generate_maree_monthly_commission_invoices(current_date)$,
  'trusted scheduler can generate monthly Marée commission statements'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000004'),
  1::bigint,
  'monthly generator creates one commission statement for a restaurant'
);
select is(
  (select commission_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000004'),
  0.39::numeric,
  'monthly commission statement uses the snapshotted 6.5 percent fee'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoice_items i
   join public.maree_monthly_commission_invoices m on m.id=i.invoice_id
   where m.restaurant_id='00000000-0000-4000-8000-000000000004'),
  1::bigint,
  'monthly commission statement includes its order detail line'
);

insert into public.maree_monthly_commission_invoices
  (id,restaurant_id,period_start,period_end,due_date,commission_total)
values
  ('40000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000003',
   date_trunc('month',current_date)::date,
   (date_trunc('month',current_date)+interval '1 month - 1 day')::date,
   current_date+7,0.28);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is((select count(*) from public.maree_monthly_commission_invoices),1::bigint,'restaurant can read its own Marée commission statement');
select lives_ok(
  $select public.declare_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000001'::uuid,'Bank transfer','TEST-REF')$,
  'restaurant can declare an off-platform commission payment'
);
select is((select status from public.maree_monthly_commission_invoices where id='40000000-0000-4000-8000-000000000001'),'declared_paid'::text,'restaurant declaration is not treated as verified payment');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select is((select count(*) from public.maree_monthly_commission_invoices),0::bigint,'fisher cannot read restaurant Marée commission statements');
select throws_ok(
  $select public.verify_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000001'::uuid)$,
  'P0001','Admin access required','fisher cannot verify a Marée commission payment'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000005';
select lives_ok(
  $select public.verify_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000001'::uuid)$,
  'admin can verify a restaurant payment declaration'
);
select is((select status from public.maree_monthly_commission_invoices where id='40000000-0000-4000-8000-000000000001'),'paid'::text,'admin verification marks the commission invoice paid');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000004';
select is((select count(*) from public.maree_monthly_commission_invoices where id='40000000-0000-4000-8000-000000000001'),0::bigint,'other restaurant cannot read another restaurant commission statement');
reset role;

select * from finish();
rollback;
