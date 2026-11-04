begin;

create extension if not exists pgtap with schema extensions;
select plan(214);

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
values
  ('00000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000007')
on conflict (user_id) do nothing;

insert into public.catches (
  id, fisher_id, species, zone, caught_at, landed_at, quantity_kg,
  remaining_kg, price_per_kg, method, storage_instructions, status
) values
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001',
   'Pollock', 'North coast', now() - interval '3 hours', now() - interval '2 hours',
   2, 1.5, 8.50, 'Line caught', 'Keep chilled at 0–4°C', 'available'),
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
   'Test evidence for a second restaurant account.'),
  ('30000000-0000-4000-8000-000000000005',
   '00000000-0000-4000-8000-000000000001',
   'fisher', 'North Coast Fishing', 'Test Contact E', '+441534000005',
   'Approved fixture for reservation and commercial contract tests.')
on conflict (id) do nothing;

update public.verification_requests
set status='approved',
    reviewed_by='00000000-0000-4000-8000-000000000005',
    reviewed_at=now()
where id='30000000-0000-4000-8000-000000000005';

insert into public.verification_documents (
  id, request_id, user_id, document_type, file_path, original_filename, mime_type, size_bytes
) values
  ('40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000003',
   'other', '00000000-0000-4000-8000-000000000003/fixture-a.pdf',
   'fixture-a.pdf', 'application/pdf', 100),
  ('40000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004',
   'other', '00000000-0000-4000-8000-000000000004/fixture-b.pdf',
   'fixture-b.pdf', 'application/pdf', 100)
on conflict (id) do nothing;

-- Table-level security posture and least-privilege grants.
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.catches'::regclass), 'catches has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'orders has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.verification_requests'::regclass), 'verification_requests has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.verification_email_action_tokens'::regclass), 'email action tokens have RLS enabled');
select ok(not has_table_privilege('authenticated', 'private.verification_email_action_tokens', 'SELECT'), 'authenticated users cannot read email action tokens');
select ok(not has_function_privilege('anon', 'public.create_verification_email_action_tokens(uuid,text,text,timestamptz)', 'EXECUTE'), 'anonymous users cannot create email decision tokens');
select ok(has_function_privilege('authenticated', 'public.review_verification_request_by_email_token(text,text)', 'EXECUTE'), 'authenticated users can invoke the email decision RPC, which enforces AAL2 internally');
select ok(not has_function_privilege('anon', 'public.review_verification_request_by_email_token(text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.review_verification_request_by_email_token(text,text)', 'EXECUTE'),
  'email decision RPC is unavailable to anon and service_role');

select ok(not has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT'), 'anonymous users cannot read profile phone numbers');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT'), 'authenticated users cannot directly read private profile phone numbers');
select ok(not has_function_privilege('anon', 'public.get_my_business_profile()', 'EXECUTE'), 'anonymous users cannot call the private profile RPC');
select ok(has_function_privilege('authenticated', 'public.get_my_business_profile()', 'EXECUTE'), 'authenticated users can call the owner-scoped private profile RPC');
select ok(not has_table_privilege('anon', 'public.orders', 'SELECT'), 'anonymous users cannot read orders');
select ok(not has_table_privilege('authenticated', 'public.orders', 'INSERT'), 'authenticated clients cannot insert orders directly');
select ok(not has_table_privilege('authenticated', 'public.orders', 'UPDATE'), 'authenticated clients cannot update orders directly');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'), 'authenticated clients cannot change profile roles');
select ok(not has_function_privilege('anon', 'public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric)', 'EXECUTE'), 'anonymous users cannot call reserve_catch');
select ok(has_function_privilege('authenticated', 'public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric)', 'EXECUTE'), 'restaurants can call the authenticated reservation RPC');
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
select is((select count(*) from public.verification_documents), 1::bigint, 'restaurant sees only its own verification document');
select lives_ok(
  $$insert into public.verification_documents (
    id,request_id,user_id,document_type,file_path,original_filename,mime_type,size_bytes
  ) values (
    '40000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'other','00000000-0000-4000-8000-000000000003/fixture-c.pdf',
    'fixture-c.pdf','application/pdf',100
  )$$,
  'owner can attach document metadata to their own verification request'
);
select is((select count(*) from public.verification_documents), 2::bigint, 'owner can read their newly attached verification document');
select lives_ok(
  $$update public.verification_documents set review_status='approved' where id='40000000-0000-4000-8000-000000000001'$$,
  'non-admin document review update is filtered by row security'
);
select is((select review_status from public.verification_documents where id='40000000-0000-4000-8000-000000000001'),'pending'::text,'document owner cannot approve their own evidence');
select ok(not has_table_privilege('authenticated','public.verification_documents','DELETE'),'authenticated users cannot delete verification documents directly');
select ok(not has_table_privilege('anon','public.verification_documents','SELECT'),'anonymous users cannot read verification documents');
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
  '42501', 'Admin access required',
  'fisher cannot review verification requests'
);
reset role;

-- A restaurant retains access to the lot details for its own order after the
-- catch is no longer publicly available, but cannot inspect another restaurant's lot.
update public.catches set status='reserved'
where id='10000000-0000-4000-8000-000000000001';

-- Editing price on a manually reserved listing must not silently republish it.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.update_catch_inventory('10000000-0000-4000-8000-000000000001'::uuid, null, 8.75)$$,
  'fisher can update price on their reserved listing'
);
select is(
  (select status from public.catches where id='10000000-0000-4000-8000-000000000001'),
  'reserved'::public.catch_status,
  'manual inventory edits preserve the reserved listing state'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is(
  (select count(*) from public.catches where id='10000000-0000-4000-8000-000000000001'),
  1::bigint,
  'restaurant can read catch details for its own reserved order'
);
select is(
  (select count(*) from public.catches where id='10000000-0000-4000-8000-000000000002'),
  0::bigint,
  'restaurant cannot read another restaurant reserved catch'
);
reset role;

-- Fisher refusal must atomically cancel the submitted order and restore its reserved stock.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.update_order_status('20000000-0000-4000-8000-000000000001'::uuid, 'cancelled'::public.order_status)$$,
  'owning fisher can refuse a submitted order'
);
select is(
  (select status from public.orders where id='20000000-0000-4000-8000-000000000001'),
  'cancelled'::public.order_status,
  'refused order is marked cancelled'
);
select is(
  (select remaining_kg from public.catches where id='10000000-0000-4000-8000-000000000001'),
  2.00::numeric,
  'refusing an order restores the reserved catch quantity'
);
select is(
  (select status from public.catches where id='10000000-0000-4000-8000-000000000001'),
  'reserved'::public.catch_status,
  'fisher refusal preserves the reserved listing state'
);
reset role;
update public.catches set status='available'
where id='10000000-0000-4000-8000-000000000001';

-- Admin approval must update the request and grant the requested role atomically.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000005';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';
select lives_ok(
  $$select public.review_verification_request('30000000-0000-4000-8000-000000000003'::uuid, 'approved'::public.verification_status, 'Approved by test admin')$$,
  'admin can approve a pending verification request'
);
select is((select count(*) from public.verification_documents), 3::bigint, 'admin can read all verification documents');
select lives_ok(
  $$update public.verification_documents
    set review_status='approved', reviewed_by=auth.uid(), reviewed_at=now()
    where id='40000000-0000-4000-8000-000000000001'$$,
  'admin can update verification document review status'
);
select is((select review_status from public.verification_documents where id='40000000-0000-4000-8000-000000000001'),'approved'::text,'admin document review is persisted');
select is((select reviewed_by from public.verification_documents where id='40000000-0000-4000-8000-000000000001'),'00000000-0000-4000-8000-000000000005'::uuid,'admin reviewer identity is recorded');
reset role;

-- A restaurant-role account with a separate admin grant can access admin functions.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000007';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal2"}';
select is(public.is_current_user_admin(), true, 'separate admin grant is recognized without changing restaurant role');
select is((select role::text from public.profiles where id = '00000000-0000-4000-8000-000000000007'), 'restaurant', 'separate admin grant preserves the restaurant business role');
select is((select count(*) from public.verification_requests), 5::bigint, 'separate admin can read all verification requests');
select is((select count(*) from public.catches), 2::bigint, 'separate admin grant can read all catch lots');
select is((select count(*) from public.orders), 2::bigint, 'separate admin grant can read all orders');
select is((select count(*) from public.profiles), 7::bigint, 'separate admin grant can read all profiles');
select is((select count(*) from public.verification_documents), 3::bigint, 'separate admin grant can read all verification documents');
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

-- Billing preference RLS: restaurants may configure only real fisher accounts.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $sql$insert into public.restaurant_fisher_billing_settings(restaurant_id,fisher_id,billing_mode)
    values ('00000000-0000-4000-8000-000000000003'::uuid,'00000000-0000-4000-8000-000000000001'::uuid,'monthly')$sql$,
  'restaurant can choose monthly billing for a fisher'
);
select throws_ok(
  $sql$update public.restaurant_fisher_billing_settings
    set fisher_id='00000000-0000-4000-8000-000000000003'::uuid
    where restaurant_id='00000000-0000-4000-8000-000000000003'::uuid
      and fisher_id='00000000-0000-4000-8000-000000000001'::uuid$sql$,
  '42501',
  'new row violates row-level security policy for table "restaurant_fisher_billing_settings"',
  'restaurant cannot change a billing preference to target a non-fisher account'
);
select is(
  (select billing_mode from public.restaurant_fisher_billing_settings
   where restaurant_id='00000000-0000-4000-8000-000000000003'::uuid
     and fisher_id='00000000-0000-4000-8000-000000000001'::uuid),
  'monthly'::text,
  'rejected billing preference update leaves the valid fisher setting unchanged'
);
reset role;

-- The earlier inventory-edit contract deliberately changes this lot's price to £8.75.
-- Restore the commercial fixture price so these fee assertions test the £8.50 baseline.
update public.catches set price_per_kg=8.50
where id='10000000-0000-4000-8000-000000000001';

-- Verify server-side Marée fee calculation for collection and delivery.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $$select public.reserve_catch('10000000-0000-4000-8000-000000000001'::uuid, 0.5, now() + interval '2 days', 'collection', 'commission test')$$,
  'restaurant can reserve collection with commission'
);
select lives_ok(
  $$select public.reserve_catch('10000000-0000-4000-8000-000000000001'::uuid, 0.5, now() + interval '3 days', 'delivery', 'commission test')$$,
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

-- Verify the monthly fisher invoice path independently from Marée commission billing.
update public.orders
set status='delivered', delivered_at=date_trunc('month',now()) - interval '15 days', billing_mode='monthly',
    fisher_id_snapshot='00000000-0000-4000-8000-000000000001',
    unit_price_snapshot=8.50, product_subtotal=4.25,
    maree_fee_rate=0.065, maree_fee=0.28,
    delivery_fee_rate=0.20, delivery_fee=0, total_amount=4.53
where id='20000000-0000-4000-8000-000000000001';
select lives_ok(
  $maree_test$select public.generate_fisher_monthly_invoices((current_date - interval '1 month')::date)$maree_test$,
  'trusted scheduler can generate monthly fisher product invoices'
);
select is(
  (select count(*) from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000003'
     and fisher_id='00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'monthly generator creates one fisher invoice per restaurant/fisher pair'
);
select is(
  (select subtotal from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000003'
     and fisher_id='00000000-0000-4000-8000-000000000001'),
  4.25::numeric,
  'fisher invoice contains the product-only subtotal'
);
select is(
  (select count(*) from public.fisher_monthly_invoice_items i
   join public.fisher_monthly_invoices f on f.id=i.invoice_id
   where f.restaurant_id='00000000-0000-4000-8000-000000000003'
     and f.fisher_id='00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'fisher invoice includes its delivered order detail line'
);
select is(
  public.generate_fisher_monthly_invoices((current_date - interval '1 month')::date),
  0,
  'rerunning fisher monthly generation creates no duplicate invoice'
);
select is(
  (select count(*) from public.fisher_monthly_invoice_items i
   join public.fisher_monthly_invoices f on f.id=i.invoice_id
   where f.restaurant_id='00000000-0000-4000-8000-000000000003'
     and f.fisher_id='00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'rerunning fisher monthly generation does not duplicate invoice items'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select is((select count(*) from public.fisher_monthly_invoices),1::bigint,'fisher can read their own monthly product invoice');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is((select count(*) from public.fisher_monthly_invoices),1::bigint,'restaurant can read its own fisher invoice');
select throws_ok(
  $$select public.mark_fisher_invoice_paid(
    (select id from public.fisher_monthly_invoices
     where restaurant_id='00000000-0000-4000-8000-000000000003'
       and fisher_id='00000000-0000-4000-8000-000000000001'),
    'Bank transfer','UNAUTHORISED-REF'
  )$$,
  '42501','Admin access required',
  'restaurant cannot falsely confirm the fisher payment receipt'
);
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.mark_fisher_invoice_paid(
    (select id from public.fisher_monthly_invoices
     where restaurant_id='00000000-0000-4000-8000-000000000003'
       and fisher_id='00000000-0000-4000-8000-000000000001'),
    'Bank transfer','FISHER-TEST-REF'
  )$$,
  'fisher can confirm receipt of payment for their own invoice'
);
reset role;
select is(
  (select status from public.fisher_monthly_invoices
   where restaurant_id='00000000-0000-4000-8000-000000000003'
     and fisher_id='00000000-0000-4000-8000-000000000001'),
  'paid'::text,
  'fisher payment confirmation marks only the matching invoice as paid'
);
-- Three overdue, unpaid monthly fisher invoices trigger the ordering safeguard.
insert into public.fisher_monthly_invoices
  (restaurant_id,fisher_id,period_start,period_end,due_date,subtotal)
values
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',
   (current_date - interval '3 months')::date,(current_date - interval '3 months' + interval '1 month - 1 day')::date,current_date-1,10),
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000006',
   (current_date - interval '2 months')::date,(current_date - interval '2 months' + interval '1 month - 1 day')::date,current_date-1,10),
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000007',
   (current_date - interval '1 month')::date,(current_date - interval '1 month' + interval '1 month - 1 day')::date,current_date-1,10);
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select throws_ok(
  $maree_test$select public.reserve_catch(
    '10000000-0000-4000-8000-000000000001'::uuid,0.5,now()+interval '5 days','collection',null
  )$maree_test$,
  'P0001','Ordering is blocked: at least three monthly invoices are open and unpaid',
  'restaurant with three open unpaid fisher invoices cannot place another order'
);
reset role;

-- Marée commission invoices are restaurant liabilities, separate from fisher invoices.
select ok(to_regclass('public.maree_monthly_commission_invoices') is not null, 'monthly Marée commission invoice table exists');
select ok(to_regclass('public.maree_monthly_commission_invoice_items') is not null, 'monthly Marée commission invoice items table exists');
select ok(has_function_privilege('service_role', 'public.generate_maree_monthly_commission_invoices(date)', 'EXECUTE'), 'trusted scheduler can generate Marée commission invoices');
select ok(not has_function_privilege('authenticated', 'public.generate_maree_monthly_commission_invoices(date)', 'EXECUTE'), 'clients cannot generate Marée commission invoices');
select ok(has_function_privilege('authenticated', 'public.declare_maree_commission_invoice_paid(uuid,text,text)', 'EXECUTE'), 'restaurant declaration RPC is available to authenticated users');
select ok(has_function_privilege('authenticated', 'public.verify_maree_commission_invoice_paid(uuid)', 'EXECUTE'), 'admin verification RPC is available to authenticated users');

-- Exercise the actual monthly generator with a delivered order and its snapshotted commission.
update public.orders
set status='delivered', delivered_at=now(), product_subtotal=6.00,
    unit_price_snapshot=12.00, fisher_id_snapshot='00000000-0000-4000-8000-000000000002',
    maree_fee_rate=0.065, maree_fee=0.39,
    delivery_fee_rate=0.20, delivery_fee=1.20, total_amount=7.59
where id='20000000-0000-4000-8000-000000000002';
select lives_ok(
  $$select public.generate_maree_monthly_commission_invoices(current_date)$$,
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
  (select delivery_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000004'),
  1.20::numeric,
  'monthly Marée statement includes the separate delivery charge'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoice_items i
   join public.maree_monthly_commission_invoices m on m.id=i.invoice_id
   where m.restaurant_id='00000000-0000-4000-8000-000000000004'),
  1::bigint,
  'monthly commission statement includes its order detail line'
);
select is(
  (select delivery_amount from public.maree_monthly_commission_invoice_items i
   join public.maree_monthly_commission_invoices m on m.id=i.invoice_id
   where m.restaurant_id='00000000-0000-4000-8000-000000000004'),
  1.20::numeric,
  'monthly Marée invoice item preserves the separate delivery amount'
);
select is(
  public.generate_maree_monthly_commission_invoices(current_date),
  0,
  'rerunning Marée commission generation creates no duplicate invoice'
);
select is(
  (select count(*) from public.maree_monthly_commission_invoice_items i
   join public.maree_monthly_commission_invoices m on m.id=i.invoice_id
   where m.restaurant_id='00000000-0000-4000-8000-000000000004'),
  1::bigint,
  'rerunning Marée commission generation does not duplicate invoice items'
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
  $$select public.declare_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000001'::uuid,'Bank transfer','TEST-REF')$$,
  'restaurant can declare an off-platform commission payment'
);
select is((select status from public.maree_monthly_commission_invoices where id='40000000-0000-4000-8000-000000000001'),'declared_paid'::text,'restaurant declaration is not treated as verified payment');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select is((select count(*) from public.maree_monthly_commission_invoices),0::bigint,'fisher cannot read restaurant Marée commission statements');
select throws_ok(
  $$select public.verify_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501','Admin access required','fisher cannot verify a Marée commission payment'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000005';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';
select lives_ok(
  $$select public.verify_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000001'::uuid)$$,
  'admin can verify a restaurant payment declaration'
);
select is((select status from public.maree_monthly_commission_invoices where id='40000000-0000-4000-8000-000000000001'),'paid'::text,'admin verification marks the commission invoice paid');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000004';
select is((select count(*) from public.maree_monthly_commission_invoices where id='40000000-0000-4000-8000-000000000001'),0::bigint,'other restaurant cannot read another restaurant commission statement');
reset role;


-- Buyer cancellations: free at least 24 hours before the slot; late offers require buyer consent.
select ok(has_function_privilege('authenticated','public.request_order_cancellation(uuid)','EXECUTE'),'authenticated buyers can request order cancellation');
select ok(has_function_privilege('authenticated','public.decide_order_cancellation(uuid,boolean,numeric)','EXECUTE'),'authenticated fishers can decide late cancellation requests');
select ok(has_function_privilege('authenticated','public.respond_order_cancellation(uuid,boolean)','EXECUTE'),'authenticated buyers can respond to late cancellation offers');

insert into public.catches (
  id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,
  price_per_kg,method,storage_instructions,status
) values (
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'Mackerel','South coast',now()-interval '3 hours',now()-interval '2 hours',
  1,0.5,10,'Line caught','Keep chilled at 0–4°C','available'
);
insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,product_subtotal,maree_fee,delivery_fee,total_amount
) values (
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000003',
  0.5,now()+interval '30 hours','collection','submitted',
  '00000000-0000-4000-8000-000000000001',5,0.33,0,5.33
);

-- A reserved listing state is intentional and must survive stock restoration.
update public.catches set status='reserved'
where id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is(
  public.request_order_cancellation('20000000-0000-4000-8000-000000000003'::uuid),
  'cancelled'::text,
  'buyer cancellation more than 24 hours before the slot is immediate and free'
);
reset role;
select is((select status from public.orders where id='20000000-0000-4000-8000-000000000003'),'cancelled'::public.order_status,'free cancellation marks the order cancelled');
select is((select cancellation_penalty from public.orders where id='20000000-0000-4000-8000-000000000003'),0::numeric,'free cancellation has no penalty');
select is((select remaining_kg from public.catches where id='10000000-0000-4000-8000-000000000003'),1::numeric,'free cancellation restores reserved stock');
select is((select status from public.catches where id='10000000-0000-4000-8000-000000000003'),'reserved'::public.catch_status,'free cancellation preserves a fisher-reserved listing state');
update public.catches set status='available'
where id='10000000-0000-4000-8000-000000000003';

update public.catches set remaining_kg=0.5,status='available'
where id='10000000-0000-4000-8000-000000000003';
insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,product_subtotal,maree_fee,delivery_fee,total_amount
) values (
  '20000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000003',
  0.5,now()+interval '12 hours','collection','confirmed',
  '00000000-0000-4000-8000-000000000001',5,0.33,0,5.33
);
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is(
  public.request_order_cancellation('20000000-0000-4000-8000-000000000004'::uuid),
  'requested'::text,
  'late cancellation is submitted to the fisher instead of being automatic'
);
reset role;
select is((select cancellation_request_status from public.orders where id='20000000-0000-4000-8000-000000000004'),'pending'::text,'late cancellation remains pending for fisher decision');
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.decide_order_cancellation('20000000-0000-4000-8000-000000000004'::uuid,true,7.50)$$,
  'owning fisher can offer late cancellation with a chosen penalty'
);
reset role;
select is((select cancellation_request_status from public.orders where id='20000000-0000-4000-8000-000000000004'),'offered'::text,'fisher decision creates an offer awaiting buyer consent');
select is((select cancellation_penalty from public.orders where id='20000000-0000-4000-8000-000000000004'),7.50::numeric,'fisher-selected penalty is snapshotted in GBP');
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $$select public.respond_order_cancellation('20000000-0000-4000-8000-000000000004'::uuid,true)$$,
  'buyer can explicitly accept the fisher cancellation offer'
);
reset role;
select is((select status from public.orders where id='20000000-0000-4000-8000-000000000004'),'cancelled'::public.order_status,'late cancellation completes only after buyer acceptance');
select is((select cancellation_penalty from public.orders where id='20000000-0000-4000-8000-000000000004'),7.50::numeric,'accepted cancellation retains the agreed penalty');
select is((select remaining_kg from public.catches where id='10000000-0000-4000-8000-000000000003'),1::numeric,'accepted late cancellation restores reserved stock');

-- Declining a late cancellation offer must leave the order active and stock reserved.
update public.catches set remaining_kg=0.5,status='available'
where id='10000000-0000-4000-8000-000000000003';
insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,product_subtotal,maree_fee,delivery_fee,total_amount
) values (
  '20000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000003',
  0.5,now()+interval '12 hours','collection','confirmed',
  '00000000-0000-4000-8000-000000000001',5,0.33,0,5.33
);
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is(
  public.request_order_cancellation('20000000-0000-4000-8000-000000000005'::uuid),
  'requested'::text,
  'second late cancellation request is sent to the fisher'
);
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select lives_ok(
  $sql$select public.decide_order_cancellation('20000000-0000-4000-8000-000000000005'::uuid,true,4.00)$sql$,
  'fisher can offer a penalty on the second late cancellation'
);
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $sql$select public.respond_order_cancellation('20000000-0000-4000-8000-000000000005'::uuid,false)$sql$,
  'buyer can decline a proposed late cancellation penalty'
);
reset role;
select is(
  (select status from public.orders where id='20000000-0000-4000-8000-000000000005'),
  'confirmed'::public.order_status,
  'declining the offer leaves the original order active'
);
select is(
  (select remaining_kg from public.catches where id='10000000-0000-4000-8000-000000000003'),
  0.5::numeric,
  'declining the offer does not restore reserved stock'
);

-- Exact 24-hour boundary: now() is transaction-stable, so the slot and policy comparison are equal.
update public.catches set remaining_kg=0,status='sold_out'
where id='10000000-0000-4000-8000-000000000003';
insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,product_subtotal,maree_fee,delivery_fee,total_amount
) values (
  '20000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000003',
  0.5,now()+interval '24 hours','collection','confirmed',
  '00000000-0000-4000-8000-000000000001',5,0.33,0,5.33
);
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is(
  public.request_order_cancellation('20000000-0000-4000-8000-000000000006'::uuid),
  'cancelled'::text,
  'cancellation exactly 24 hours before the slot is immediate and free'
);
reset role;
select is((select status from public.orders where id='20000000-0000-4000-8000-000000000006'),'cancelled'::public.order_status,'exactly-24-hour cancellation marks the order cancelled');
select is((select cancellation_penalty from public.orders where id='20000000-0000-4000-8000-000000000006'),0::numeric,'exactly-24-hour cancellation has no penalty');
select is((select remaining_kg from public.catches where id='10000000-0000-4000-8000-000000000003'),0.5::numeric,'exactly-24-hour cancellation restores reserved stock');

-- External QR references are stored in the existing catch traceability tables.
select ok((select relrowsecurity from pg_class where oid = 'public.catch_traceability_codes'::regclass), 'traceability QR codes have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.catch_traceability_events'::regclass), 'traceability timeline has RLS enabled');
select ok(not has_table_privilege('anon', 'public.catch_traceability_codes', 'SELECT'), 'anonymous users cannot read QR payloads');
select ok(not has_table_privilege('authenticated', 'public.catch_traceability_codes', 'INSERT'), 'clients cannot bypass the guarded QR RPC');
select ok(not has_table_privilege('authenticated', 'public.catch_traceability_events', 'INSERT'), 'clients cannot forge timeline events directly');
select ok(not has_function_privilege('anon', 'public.attach_external_traceability(uuid,uuid,text,text,text,text,timestamptz,text,numeric,text)', 'EXECUTE'), 'anonymous users cannot attach external traceability');
select ok(has_function_privilege('authenticated', 'public.attach_external_traceability(uuid,uuid,text,text,text,text,timestamptz,text,numeric,text)', 'EXECUTE'), 'authenticated users can attach external traceability through the guarded RPC');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.attach_external_traceability(
    '10000000-0000-4000-8000-000000000001'::uuid, null, 'identifier',
    'SUPPLIER-BATCH-001', null, 'North Coast Supplier',
    now() - interval '1 hour', 'Pollock', 0.5, 'Fisher-side source reference'
  )$$,
  'owning fisher can attach an external identifier to their catch'
);
select is((select count(*) from public.catch_traceability_codes), 1::bigint, 'owning fisher can read their QR reference');
select is((select count(*) from public.catch_traceability_events), 1::bigint, 'fisher QR attachment creates an audit timeline event');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $$select public.attach_external_traceability(
    null, '20000000-0000-4000-8000-000000000001'::uuid, 'url',
    'https://supplier.example/lot/ABC-123', 'https://supplier.example/lot/ABC-123',
    'North Coast Supplier', now() - interval '30 minutes', 'Pollock', 0.5, 'Restaurant receiving reference'
  )$$,
  'restaurant can attach an HTTPS supplier QR reference to its own order'
);
select is((select count(*) from public.catch_traceability_codes), 1::bigint, 'restaurant sees only QR references linked to its own order');
select is((select count(*) from public.catch_traceability_events), 1::bigint, 'restaurant sees only timeline events linked to its own order');
select throws_ok(
  $$select public.attach_external_traceability(
    '10000000-0000-4000-8000-000000000001'::uuid, null, 'identifier',
    'OTHER-BATCH', null, 'Unknown Supplier', now(), 'Pollock', 0.5, null
  )$$,
  'P0001', 'Restaurant traceability must reference one of its orders',
  'restaurant cannot create a catch-only traceability record'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.attach_external_traceability(
    '10000000-0000-4000-8000-000000000001'::uuid, null, 'identifier',
    'OTHER-BATCH', null, 'Unknown Supplier', now(), 'Pollock', 0.5, null
  )$$,
  'P0001', 'Catch not found or not owned by this fisher',
  'fisher cannot attach a QR reference to another fisher catch'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select public.attach_external_traceability(
    null, '20000000-0000-4000-8000-000000000001'::uuid, 'url',
    'https://supplier.example/lot/ABC-123', 'https://supplier.example/lot/ABC-123',
    'North Coast Supplier', now(), 'Pollock', 0.5, null
  )$$,
  'P0001', 'Order not found for this restaurant',
  'restaurant cannot attach a QR reference to another restaurant order'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select throws_ok(
  $$update public.catch_traceability_codes set source_label='Tampered'$$,
  '42501', null,
  'clients cannot update immutable QR references'
);
select throws_ok(
  $$delete from public.catch_traceability_codes$$,
  '42501', null,
  'clients cannot delete QR references'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select is((select count(*) from public.catch_traceability_codes), 2::bigint, 'owning fisher can inspect all QR references linked to their catch');
select is((select count(*) from public.catch_traceability_events), 2::bigint, 'owning fisher can inspect the complete QR audit timeline');
select is((select count(*) from public.catch_traceability_codes where code_type='https_url'), 1::bigint, 'HTTPS QR payload is classified as an external URL');
reset role;

-- Indexes cover the foreign-key joins highlighted by the live Supabase advisor.
select ok(to_regclass('private.verification_email_action_tokens_request_idx') is not null, 'verification email token request foreign key is indexed');
select ok(to_regclass('public.verification_documents_request_idx') is not null, 'verification document request foreign key is indexed');
select ok(to_regclass('public.verification_documents_user_idx') is not null, 'verification document owner foreign key is indexed');
select ok(to_regclass('public.verification_documents_reviewed_by_idx') is not null, 'verification document reviewer foreign key is indexed');
select ok(to_regclass('public.catch_traceability_codes_scanned_by_idx') is not null, 'traceability code actor foreign key is indexed');
select ok(to_regclass('public.catch_traceability_events_actor_idx') is not null, 'traceability event actor foreign key is indexed');

-- Consolidated permissive read policies remain one per role/action.
select is((select count(*) from pg_policies where schemaname='public' and tablename='catches' and cmd='SELECT' and roles='{authenticated}'),1::bigint,'catches has one authenticated SELECT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='orders' and cmd='SELECT' and roles='{authenticated}'),1::bigint,'orders has one authenticated SELECT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT' and roles='{authenticated}'),1::bigint,'profiles has one authenticated SELECT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='verification_documents' and cmd='SELECT' and roles='{authenticated}'),1::bigint,'verification documents have one authenticated SELECT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='verification_documents' and cmd='INSERT' and roles='{authenticated}'),1::bigint,'verification documents have one authenticated INSERT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='verification_requests' and cmd='SELECT' and roles='{authenticated}'),1::bigint,'verification requests have one authenticated SELECT policy');


-- Persistent notifications are server-created and scoped to the recipient.
select ok((select relrowsecurity from pg_class where oid='public.notifications'::regclass), 'notifications have RLS enabled');
select ok(not has_table_privilege('anon','public.notifications','SELECT'), 'anonymous users cannot read notifications');
select ok(not has_table_privilege('authenticated','public.notifications','INSERT'), 'clients cannot create notifications directly');
select ok(has_column_privilege('authenticated','public.notifications','read_at','UPDATE'), 'users can update their own read timestamp');
select ok(not has_column_privilege('authenticated','public.notifications','title','UPDATE'), 'users cannot rewrite notification content');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select is((select count(*) from public.notifications where event_type='order_received'),7::bigint,'fisher receives a notification for each new order on their catch');
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000002'),0::bigint,'fisher cannot read another fisher notifications');
select lives_ok(
  $stmt$update public.notifications set read_at=now() where event_type='order_received'$stmt$,
  'fisher can mark their own notification as read'
);
select is((select count(*) from public.notifications where event_type='order_received' and read_at is null),0::bigint,'read state is reflected in the unread count for that event');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000005';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';
select is((select count(*) from public.notifications where event_type='verification_request_received'),5::bigint,'trusted admin receives each verification request notification');
reset role;

-- Notification follow-up contract: verification outcomes and invoice lifecycle.
select ok(to_regprocedure('private.create_verification_result_notification()') is not null, 'verification result notification trigger function exists');
select ok(to_regprocedure('private.create_fisher_invoice_notifications()') is not null, 'fisher invoice notification trigger function exists');
select ok(to_regprocedure('private.create_maree_invoice_notifications()') is not null, 'Marée invoice notification trigger function exists');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000005';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';
select lives_ok(
  $review$select public.review_verification_request('30000000-0000-4000-8000-000000000002'::uuid, 'rejected'::public.verification_status, 'Missing supporting evidence')$review$,
  'admin rejection produces a final verification decision'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000006';
select is((select count(*) from public.notifications where event_type='verification_approved'),1::bigint,'approved applicant receives one private approval notification');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000004';
select is((select count(*) from public.notifications where event_type='verification_approved'),1::bigint,'second approved applicant receives their own approval notification');
select is((select count(*) from public.notifications where event_type='verification_rejected'),1::bigint,'rejected applicant receives their own rejection notification');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select ok(exists(select 1 from public.notifications where event_type='fisher_invoice_created'), 'fisher receives a notification when a monthly product invoice is generated');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select ok(exists(select 1 from public.notifications where event_type='restaurant_fisher_invoice_created'), 'restaurant receives its monthly fisher invoice notification');
select ok(exists(select 1 from public.notifications where event_type='fisher_invoice_paid'), 'restaurant is notified when the fisher confirms payment receipt');
select ok(exists(select 1 from public.notifications where event_type='maree_invoice_created'), 'restaurant receives its monthly Marée statement notification');
select ok(exists(select 1 from public.notifications where event_type='maree_invoice_payment_verified'), 'restaurant is notified after admin verifies its Marée payment');
select is((select count(*) from public.notifications where event_type='maree_invoice_payment_declared'),0::bigint,'restaurant cannot read admin-only payment verification alerts');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000005';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';
select ok(exists(select 1 from public.notifications where event_type='maree_invoice_payment_declared'), 'admin receives a private alert when a restaurant declares payment');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000004';
select ok(exists(select 1 from public.notifications where event_type='maree_invoice_created'), 'second restaurant receives only its own generated Marée statement alert');
reset role;

-- Cross-role and cross-account notification isolation: admin status does not grant inbox-wide access.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000001'),0::bigint,'restaurant cannot read fisher notifications');
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000004'),0::bigint,'restaurant cannot read another restaurant notifications');
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000005'),0::bigint,'restaurant cannot read admin notifications');
with attempted as (
  update public.notifications set read_at=now()
  where user_id='00000000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from attempted),
  0::bigint,
  'restaurant cannot mark another user notification as read'
);
reset role;

select * from finish();
rollback;
