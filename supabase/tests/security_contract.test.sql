begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

-- Isolated auth users; the auth trigger creates their initial restaurant profiles.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'maree-fisher-a@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'maree-fisher-b@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'maree-restaurant-a@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'maree-restaurant-b@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'maree-admin@test.local')
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
   'Test evidence for restaurant account B.')
on conflict (id) do nothing;

-- Table-level security posture and least-privilege grants.
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.catches'::regclass), 'catches has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'orders has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.verification_requests'::regclass), 'verification_requests has RLS enabled');
select ok(not has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT'), 'anonymous users cannot read profile phone numbers');
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
select is((select count(id) from public.profiles), 2::bigint, 'anonymous profile reads see fisher profiles only');
reset role;

-- Restaurant A sees only its own orders and verification request.
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select is((select count(*) from public.orders), 1::bigint, 'restaurant sees only its own order');
select is((select count(*) from public.verification_requests), 1::bigint, 'restaurant sees only its own verification request');
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
select is((
  with changed as (
    update public.catches set price_per_kg = 1
    where id = '10000000-0000-4000-8000-000000000001'::uuid
    returning id
  )
  select count(*) from changed
), 0::bigint, 'fisher cannot update another fisher catch');
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

select ok(to_regclass('public.verification_requests_user_id_idx') is not null, 'verification request owner index exists');
select ok(to_regclass('public.verification_requests_reviewed_by_idx') is not null, 'verification reviewer index exists');

select * from finish();
rollback;
