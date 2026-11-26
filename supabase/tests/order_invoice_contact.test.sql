begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000081', 'invoice-fisher@test.local'),
  ('00000000-0000-4000-8000-000000000082', 'invoice-restaurant-login@test.local'),
  ('00000000-0000-4000-8000-000000000083', 'invoice-unrelated@test.local'),
  ('00000000-0000-4000-8000-000000000084', 'invoice-admin@test.local')
on conflict (id) do nothing;

update public.profiles set role = 'fisher', display_name = 'Invoice Fisher', business_email = 'billing-fisher@test.local'
where id = '00000000-0000-4000-8000-000000000081';
update public.profiles set role = 'restaurant', display_name = 'Invoice Restaurant', business_email = 'billing-restaurant@test.local'
where id = '00000000-0000-4000-8000-000000000082';
update public.profiles set role = 'restaurant', display_name = 'Unrelated Restaurant'
where id = '00000000-0000-4000-8000-000000000083';
update public.profiles set role = 'admin', display_name = 'Invoice Admin'
where id = '00000000-0000-4000-8000-000000000084';

insert into public.catches (
  id, fisher_id, species, zone, caught_at, landed_at, quantity_kg,
  remaining_kg, price_per_kg, method, storage_instructions, status
) values (
  '10000000-0000-4000-8000-000000000081',
  '00000000-0000-4000-8000-000000000081',
  'Pollock', 'North coast', now() - interval '3 hours', now() - interval '2 hours',
  2, 1, 8.50, 'Line caught', 'Keep chilled', 'available'
);

insert into public.orders (
  id, catch_id, restaurant_id, quantity_kg, requested_slot, fulfilment, status,
  fisher_id_snapshot, unit_price_snapshot, product_subtotal, delivered_at
) values
  ('20000000-0000-4000-8000-000000000081',
   '10000000-0000-4000-8000-000000000081',
   '00000000-0000-4000-8000-000000000082',
   1, now() + interval '1 day', 'collection', 'delivered',
   '00000000-0000-4000-8000-000000000081', 8.50, 8.50, now() - interval '30 minutes'),
  ('20000000-0000-4000-8000-000000000082',
   '10000000-0000-4000-8000-000000000081',
   '00000000-0000-4000-8000-000000000082',
   0.5, now() + interval '1 day', 'collection', 'submitted',
   '00000000-0000-4000-8000-000000000081', 8.50, 4.25, null);

select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid = 'public.get_my_order_invoice_contact(uuid)'::regprocedure),
  'invoice contact RPC is SECURITY DEFINER with an empty search path');
select ok(has_function_privilege('authenticated', 'public.get_my_order_invoice_contact(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_my_order_invoice_contact(uuid)', 'EXECUTE'),
  'only authenticated clients can execute the invoice contact RPC');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'business_email', 'SELECT')
  and not has_column_privilege('anon', 'public.profiles', 'business_email', 'SELECT'),
  'business emails remain inaccessible through direct profile reads');

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000082';
select is((select recipient_email from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  'billing-fisher@test.local'::text, 'restaurant receives only its delivered fisher counterpart email');
select is((select recipient_name from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  'Invoice Fisher'::text, 'restaurant receives the counterpart display name');
select is((select product_subtotal from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  8.50::numeric, 'invoice draft gets the delivered product subtotal');
select is((select quantity_kg from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  1::numeric, 'invoice draft gets the delivered product quantity');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000081';
select is((select recipient_email from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  'billing-restaurant@test.local'::text, 'fisher receives only its delivered restaurant counterpart email');
reset role;

update public.profiles set business_email = null where id = '00000000-0000-4000-8000-000000000082';
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000081';
select is((select recipient_email from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  'invoice-restaurant-login@test.local'::text, 'invoice contact falls back to the counterpart account email');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000083';
select is((select count(*) from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  0::bigint, 'unrelated restaurant cannot retrieve invoice contact details');
select is((select count(*) from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000082')),
  0::bigint, 'invoice contact is not available before order delivery');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000084';
select is((select count(*) from public.get_my_order_invoice_contact('20000000-0000-4000-8000-000000000081')),
  0::bigint, 'admin cannot retrieve counterpart contact without being an order party');
reset role;

select * from finish();
rollback;
