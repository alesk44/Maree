begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000031','aal2-admin-contract@test.local'),
  ('00000000-0000-4000-8000-000000000032','aal2-nonadmin-contract@test.local'),
  ('00000000-0000-4000-8000-000000000033','profile-admin-not-allowlisted@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id in (
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032',
  '00000000-0000-4000-8000-000000000033'
);

update public.profiles
set role='admin'
where id='00000000-0000-4000-8000-000000000033';

insert into private.admin_users(user_id)
values ('00000000-0000-4000-8000-000000000031')
on conflict (user_id) do nothing;

insert into public.verification_requests
  (id,user_id,requested_role,business_name,contact_name,phone,evidence_note,status)
values
  ('30000000-0000-4000-8000-000000000031',
   '00000000-0000-4000-8000-000000000032','fisher',
   'AAL2 Contract Fisher','Test Contact','+441534000031',
   'Fixture for server-side AAL2 contract.','pending');

insert into public.catches
  (id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,price_per_kg,method,storage_instructions,status)
values
  ('10000000-0000-4000-8000-000000000031',
   '00000000-0000-4000-8000-000000000032',
   'Bass','South coast',now()-interval '3 hours',now()-interval '2 hours',
   1,0,10,'Line caught','Keep chilled at 0–4°C','sold_out');

insert into public.orders
  (id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,fisher_id_snapshot,billing_mode,fisher_payment_status)
values
  ('20000000-0000-4000-8000-000000000031',
   '10000000-0000-4000-8000-000000000031',
   '00000000-0000-4000-8000-000000000032',
   0.5,now()+interval '1 day','collection','delivered',
   '00000000-0000-4000-8000-000000000032','immediate','unpaid');

insert into public.fisher_monthly_invoices
  (id,restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,status)
values
  ('40000000-0000-4000-8000-000000000031',
   '00000000-0000-4000-8000-000000000032',
   '00000000-0000-4000-8000-000000000032',
   date '2026-10-01',date '2026-10-31',date '2026-11-07',10,'open');

select ok(
  not has_function_privilege('authenticated','private.require_admin_aal2()','EXECUTE'),
  'internal AAL2 guard is not directly executable by authenticated clients'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000031';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $stmt$select public.review_verification_request(
    '30000000-0000-4000-8000-000000000031'::uuid,
    'approved'::public.verification_status,
    'Should be blocked without MFA'
  )$stmt$,
  '42501',
  'Verified MFA session required (aal2)',
  'allowlisted administrator with aal1 cannot approve a role change'
);

select throws_ok(
  $stmt$select public.update_maree_commercial_settings(6.5,20,'buyer')$stmt$,
  '42501',
  'Verified MFA session required (aal2)',
  'allowlisted administrator with aal1 cannot change commercial settings'
);

select throws_ok(
  $stmt$select public.mark_order_paid(
    '20000000-0000-4000-8000-000000000031'::uuid,
    'Bank transfer',
    'AAL1-BLOCKED'
  )$stmt$,
  '42501',
  'Verified MFA session required (aal2)',
  'administrator override for fisher settlement is blocked at aal1'
);

select throws_ok(
  $stmt$select public.mark_fisher_invoice_paid(
    '40000000-0000-4000-8000-000000000031'::uuid,
    'Bank transfer',
    'AAL1-INVOICE-BLOCKED'
  )$stmt$,
  '42501',
  'Verified MFA session required (aal2)',
  'administrator override for monthly fisher invoice settlement is blocked at aal1'
);

set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $stmt$select public.update_maree_commercial_settings(6.5,20,'buyer')$stmt$,
  'allowlisted administrator with aal2 can update commercial settings'
);

select lives_ok(
  $stmt$select public.mark_order_paid(
    '20000000-0000-4000-8000-000000000031'::uuid,
    'Bank transfer',
    'AAL2-APPROVED'
  )$stmt$,
  'administrator override for fisher settlement succeeds at aal2'
);

select lives_ok(
  $stmt$select public.mark_fisher_invoice_paid(
    '40000000-0000-4000-8000-000000000031'::uuid,
    'Bank transfer',
    'AAL2-INVOICE-APPROVED'
  )$stmt$,
  'administrator override for monthly fisher invoice settlement succeeds at aal2'
);

select lives_ok(
  $stmt$select public.review_verification_request(
    '30000000-0000-4000-8000-000000000031'::uuid,
    'approved'::public.verification_status,
    'Approved with verified MFA'
  )$stmt$,
  'allowlisted administrator with aal2 can approve a role change'
);

select is(
  (select role::text from public.profiles where id='00000000-0000-4000-8000-000000000032'),
  'fisher',
  'successful aal2 approval assigns the requested fisher role'
);

select is(
  (select status::text from public.verification_requests where id='30000000-0000-4000-8000-000000000031'),
  'approved',
  'successful aal2 approval commits the verification decision'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000032';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000032","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $stmt$select public.update_maree_commercial_settings(6.5,20,'buyer')$stmt$,
  '42501',
  'Admin access required',
  'aal2 alone does not grant administrator privileges'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000033';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000033","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $stmt$select public.update_maree_commercial_settings(6.5,20,'buyer')$stmt$,
  '42501',
  'Admin access required',
  'profile admin role without an allowlist entry cannot perform privileged actions'
);

reset role;
select * from finish();
rollback;
