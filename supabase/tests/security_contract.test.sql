Warning: truncated output (original token count: 16729)
Total output lines: 1129

begin;

create extension if not exists pgtap with schema extensions;
select plan(235);

-- Isolated auth users; the auth trigger creates their initial restaurant profiles.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'maree-fisher-a@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'maree-fisher-b@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'maree-restaurant-a@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'maree-restaurant-b@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'maree-admin@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'maree-fisher-upgrade@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'maree-admin-restaurant@test.local'),
  ('00000000-0000-4000-8000-000000000008', 'maree-email-token-test@test.local')
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
   'Approved fixture for reservation and commercial contract tests.'),
  ('30000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000008',
   'fisher', 'Token Action Test', 'Test Contact F', '+441534000008',
   'Pending fixture for email token action binding.')
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
select ok((select relrowsecurity from pg_class where oid = 'public.verification_requests'…13729 tokens truncated…001';
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
select is((select count(*) from public.notifications where event_type='verification_request_received'),6::bigint,'trusted admin receives each verification request notification, including the email-token fixture');
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

