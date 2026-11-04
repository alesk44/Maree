begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000031','aal2-admin-contract@test.local'),
  ('00000000-0000-4000-8000-000000000032','aal2-nonadmin-contract@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id in (
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032'
);

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

select ok(
  not has_function_privilege('authenticated','private.require_admin_aal2()','EXECUTE'),
  'internal AAL2 guard is not directly executable by authenticated clients'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000031';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $$select public.review_verification_request(
    '30000000-0000-4000-8000-000000000031'::uuid,
    'approved'::public.verification_status,
    'Should be blocked without MFA'
  )$$,
  '42501',
  'Verified MFA session required (aal2)',
  'allowlisted administrator with aal1 cannot approve a role change'
);

select throws_ok(
  $$select public.update_maree_commercial_settings(6.5,20,'buyer')$$,
  '42501',
  'Verified MFA session required (aal2)',
  'allowlisted administrator with aal1 cannot change commercial settings'
);

set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000031","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.review_verification_request(
    '30000000-0000-4000-8000-000000000031'::uuid,
    'approved'::public.verification_status,
    'Approved with verified MFA'
  )$$,
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
  $$select public.update_maree_commercial_settings(6.5,20,'buyer')$$,
  '42501',
  'Admin access required',
  'aal2 alone does not grant administrator privileges'
);

reset role;
select * from finish();
rollback;
