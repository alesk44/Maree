begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000021','email-action-contract@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id='00000000-0000-4000-8000-000000000021';

insert into public.verification_requests
  (id,user_id,requested_role,business_name,contact_name,phone,evidence_note,status)
values
  ('30000000-0000-4000-8000-000000000021',
   '00000000-0000-4000-8000-000000000021','fisher',
   'Email Action Contract Ltd','Test Contact','+441534000021',
   'Contract fixture for email action binding.','pending');

insert into private.verification_email_action_tokens
  (id,request_id,action,token_hash,expires_at)
values
  ('50000000-0000-4000-8000-000000000021',
   '30000000-0000-4000-8000-000000000021','approved',
   repeat('a',64),now()+interval '1 day');

select ok(has_function_privilege('service_role','public.review_verification_request_by_email_token(text,text)','EXECUTE'),
  'service role can execute the action-bound email review RPC');
select ok(not has_function_privilege('authenticated','public.review_verification_request_by_email_token(text,text)','EXECUTE')
  and not has_function_privilege('anon','public.review_verification_request_by_email_token(text,text)','EXECUTE'),
  'email review RPC is not executable by client roles');

set local role service_role;
select throws_ok(
  $$select public.review_verification_request_by_email_token(repeat('a',64),'rejected')$$,
  'P0001','Action does not match this confirmation link',
  'mismatched action is rejected before token consumption'
);
select lives_ok(
  $$select public.review_verification_request_by_email_token(repeat('a',64),'approved')$$,
  'the same token remains usable with its stored approved action'
);
reset role;

select is((select status::text from public.verification_requests
  where id='30000000-0000-4000-8000-000000000021'),
  'approved'::text,'matching token action approves the request');
select ok((select consumed_at is not null from private.verification_email_action_tokens
  where id='50000000-0000-4000-8000-000000000021'),
  'matching action consumes the one-time token');

select * from finish();
rollback;
