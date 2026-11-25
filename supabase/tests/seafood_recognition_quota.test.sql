begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000081', 'seafood-quota-fisher@test.local'),
  ('00000000-0000-4000-8000-000000000082', 'seafood-quota-admin@test.local'),
  ('00000000-0000-4000-8000-000000000083', 'seafood-quota-pending@test.local'),
  ('00000000-0000-4000-8000-000000000084', 'seafood-quota-rejected@test.local')
on conflict (id) do nothing;

update public.profiles set role='fisher'
where id='00000000-0000-4000-8000-000000000081';
update public.profiles set role='admin'
where id='00000000-0000-4000-8000-000000000082';
update public.profiles set role='fisher'
where id in ('00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000084');

insert into public.verification_requests
  (user_id,requested_role,business_name,contact_name,phone,evidence_note,status)
values
  ('00000000-0000-4000-8000-000000000081','fisher','Approved Test Fishery','Test Contact','+441534000081','Approved verification fixture for quota contract.','approved'),
  ('00000000-0000-4000-8000-000000000083','fisher','Pending Test Fishery','Test Contact','+441534000083','Pending verification fixture for quota contract.','pending'),
  ('00000000-0000-4000-8000-000000000084','fisher','Rejected Test Fishery','Test Contact','+441534000084','Rejected verification fixture for quota contract.','rejected');

select ok(to_regclass('private.seafood_recognition_attempts') is not null,
  'recognition quota events are stored in a private table');
select ok(not has_table_privilege('authenticated','private.seafood_recognition_attempts','SELECT'),
  'authenticated clients cannot read recognition quota events');
select ok(has_function_privilege('authenticated','public.consume_seafood_recognition_quota()','EXECUTE'),
  'authenticated users can request quota consumption');
select ok(not has_function_privilege('anon','public.consume_seafood_recognition_quota()','EXECUTE'),
  'anonymous users cannot consume recognition quota');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000081';
select is((public.consume_seafood_recognition_quota()->>'allowed')::boolean,true,
  'first recognition request is allowed');
select is((public.consume_seafood_recognition_quota()->>'allowed')::boolean,true,
  'second recognition request is allowed');
select is((public.consume_seafood_recognition_quota()->>'allowed')::boolean,true,
  'third recognition request is allowed');
select is((public.consume_seafood_recognition_quota()->>'allowed')::boolean,false,
  'fourth request in ten minutes is blocked');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000082';
select throws_ok(
  $$select public.consume_seafood_recognition_quota()$$,
  '42501',
  'Approved fisher or restaurant account required',
  'admin account cannot consume seafood recognition quota'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000083';
select throws_ok(
  $$select public.consume_seafood_recognition_quota()$$,
  '42501',
  'Approved fisher or restaurant account required',
  'pending fisher cannot consume recognition quota'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000084';
select throws_ok(
  $$select public.consume_seafood_recognition_quota()$$,
  '42501',
  'Approved fisher or restaurant account required',
  'rejected fisher cannot consume recognition quota'
);
reset role;

select * from finish();
rollback;
