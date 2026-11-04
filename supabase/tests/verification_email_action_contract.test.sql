begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000021','email-action-applicant@test.local'),
  ('00000000-0000-4000-8000-000000000022','email-action-admin@test.local'),
  ('00000000-0000-4000-8000-000000000023','email-action-nonadmin@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id in (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000022',
  '00000000-0000-4000-8000-000000000023'
);

insert into private.admin_users(user_id)
values ('00000000-0000-4000-8000-000000000022')
on conflict (user_id) do nothing;

insert into public.verification_requests
  (id,user_id,requested_role,business_name,contact_name,phone,evidence_note,status)
values
  ('30000000-0000-4000-8000-000000000021',
   '00000000-0000-4000-8000-000000000021','fisher',
   'Email Action Contract Ltd','Test Contact','+441534000021',
   'Contract fixture for email action binding.','pending'),
  ('30000000-0000-4000-8000-000000000022',
   '00000000-0000-4000-8000-000000000023','fisher',
   'Expired Email Action Contract Ltd','Test Contact','+441534000022',
   'Fixture for expired token rejection.','pending');

insert into private.verification_email_action_tokens
  (id,request_id,action,token_hash,expires_at)
values
  ('50000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000021','approved',
   repeat('a',64),now()+interval '1 day'),
  ('50000000-0000-4000-8000-000000000022',
   '30000000-0000-4000-8000-000000000022','approved',
   repeat('b',64),now()-interval '1 second');

select ok(has_function_privilege('service_role','public.review_verification_request_by_email_token(text,text,uuid)','EXECUTE'),
  'service role can execute the action-bound email review RPC');
select ok(not has_function_privilege('authenticated','public.review_verification_request_by_email_token(text,text,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.review_verification_request_by_email_token(text,text,uuid)','EXECUTE'),
  'email review RPC is not executable by client roles');

set local role service_role;
select throws_ok(
  $select public.review_verification_request_by_email_token(repeat('a',64),'approved','00000000-0000-4000-8000-000000000023')$,
  'P0001','Admin access required',
  'a non-allowlisted user cannot be recorded as the email reviewer'
);
select throws_ok(
  $select public.review_verification_request_by_email_token(repeat('a',64),'rejected','00000000-0000-4000-8000-000000000022')$,
  'P0001','Action does not match this confirmation link',
  'mismatched action is rejected before token consumption'
);
select lives_ok(
  $select public.review_verification_request_by_email_token(repeat('a',64),'approved','00000000-0000-4000-8000-000000000022')$,
  'the same token remains usable with its stored approved action'
);
reset role;

select is((select status::text from public.verification_requests
  where id='30000000-0000-4000-8000-000000000021'),
  'approved'::text,'matching token action approves the request');
select ok((select consumed_at is not null from private.verification_email_action_tokens
  where id='50000000-0000-4000-8000-000000000021'),
  'matching action consumes the one-time token');
select is((select reviewed_by::text from public.verification_requests
  where id='30000000-0000-4000-8000-000000000021'),
  '00000000-0000-4000-8000-000000000022',
  'the verified allowlisted administrator is recorded as reviewer');
select throws_ok(
  $select public.review_verification_request_by_email_token(repeat('a',64),'approved','00000000-0000-4000-8000-000000000022')$,
  'P0001','This approval link is invalid, expired, or already used',
  'a consumed token cannot be replayed'
);
select throws_ok(
  $select public.review_verification_request_by_email_token(repeat('b',64),'approved','00000000-0000-4000-8000-000000000022')$,
  'P0001','This approval link is invalid, expired, or already used',
  'an expired token is rejected'
);
select ok((select consumed_at is null from private.verification_email_action_tokens
  where id='50000000-0000-4000-8000-000000000022'),
  'an expired token is not consumed');

select * from finish();
rollback;
