begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000081', 'traceability-owner@test.local'),
  ('00000000-0000-4000-8000-000000000082', 'traceability-outsider@test.local'),
  ('00000000-0000-4000-8000-000000000083', 'traceability-unapproved@test.local')
on conflict (id) do nothing;

update public.profiles set role='fisher', display_name='Approved Fisher'
where id='00000000-0000-4000-8000-000000000081';
update public.profiles set role='fisher', display_name='Unapproved Fisher'
where id='00000000-0000-4000-8000-000000000083';

insert into public.verification_requests (
  id, user_id, requested_role, business_name, contact_name, phone, evidence_note, status
) values (
  '30000000-0000-4000-8000-000000000081',
  '00000000-0000-4000-8000-000000000081',
  'fisher', 'Harbour Fishing', 'Test Contact', '+441534000081',
  'Approved test fisher for public traceability contract.', 'approved'
);

insert into public.catches (
  id, fisher_id, species, zone, caught_at, landed_at, quantity_kg, remaining_kg,
  price_per_kg, method, storage_instructions, status
) values (
  '10000000-0000-4000-8000-000000000081',
  '00000000-0000-4000-8000-000000000081',
  'Bass', 'North coast', now() - interval '5 hours', now() - interval '3 hours',
  4, 0, 12, 'Line caught', 'Keep chilled at 0–4°C', 'sold_out'
), (
  '10000000-0000-4000-8000-000000000083',
  '00000000-0000-4000-8000-000000000083',
  'Crab', 'East coast', now() - interval '5 hours', now() - interval '3 hours',
  2, 2, 10, 'Pot caught', 'Keep chilled at 0–4°C', 'available'
);

insert into private.catch_public_traceability_tokens (catch_id, token) values
  ('10000000-0000-4000-8000-000000000081', '90000000-0000-4000-8000-000000000081'),
  ('10000000-0000-4000-8000-000000000083', '90000000-0000-4000-8000-000000000083');

select ok(
  (select relrowsecurity from pg_class where oid='private.catch_public_traceability_tokens'::regclass),
  'public traceability tokens have RLS enabled'
);
select ok(not has_table_privilege('anon','private.catch_public_traceability_tokens','SELECT'), 'anonymous users cannot read QR tokens');
select ok(not has_table_privilege('authenticated','private.catch_public_traceability_tokens','SELECT'), 'authenticated users cannot read QR tokens directly');
select ok(not has_function_privilege('anon','public.get_my_catch_traceability_token(uuid)','EXECUTE'), 'anonymous users cannot mint a QR token');
select ok(has_function_privilege('authenticated','public.get_my_catch_traceability_token(uuid)','EXECUTE'), 'authenticated fishers can request an owned QR token');
select ok(not has_function_privilege('anon','public.revoke_my_catch_traceability_token(uuid)','EXECUTE'), 'anonymous users cannot revoke QR tokens');
select ok(has_function_privilege('authenticated','public.revoke_my_catch_traceability_token(uuid)','EXECUTE'), 'authenticated fishers can revoke an owned QR token');
select ok(has_function_privilege('anon','public.get_public_catch_traceability(uuid)','EXECUTE'), 'anonymous visitors can resolve a public QR token');
select ok((
  select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.get_public_catch_traceability(uuid)'::regprocedure
), 'public QR lookup is SECURITY DEFINER with an empty search_path');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000081';
select is(
  public.get_my_catch_traceability_token('10000000-0000-4000-8000-000000000081'),
  '90000000-0000-4000-8000-000000000081'::uuid,
  'the owning approved fisher receives the stable QR token'
);
select throws_ok(
  $$select public.get_my_catch_traceability_token('10000000-0000-4000-8000-000000000083')$$,
  'P0001', 'Catch not found or not owned by this fisher',
  'a fisher cannot obtain another fisher’s QR token'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000082';
select throws_ok(
  $$select public.revoke_my_catch_traceability_token('10000000-0000-4000-8000-000000000081')$$,
  'P0001', 'Catch not found or not owned by this fisher',
  'a different fisher cannot revoke the QR token'
);
reset role;

set local role anon;
select is(
  public.get_public_catch_traceability('90000000-0000-4000-8000-000000000081')->>'species',
  'Bass',
  'a public traceability page remains available after the catch sells out'
);
select ok(
  (public.get_public_catch_traceability('90000000-0000-4000-8000-000000000081') ?& array['species','zone','caughtAt','landedAt','quantityKg','method','grade','storageInstructions','fisher','timeline'])
  and not (public.get_public_catch_traceability('90000000-0000-4000-8000-000000000081') ?| array['token','raw_code','rawCode','note','metadata','order_id','restaurant_id','phone','email','price_per_kg','remaining_kg']),
  'the public payload contains only approved lot fields and omits raw or private data'
);
select ok(
  jsonb_array_length(public.get_public_catch_traceability('90000000-0000-4000-8000-000000000081')->'timeline') >= 2,
  'the public timeline records catch publication and landing events'
);
select is(
  public.get_public_catch_traceability('90000000-0000-4000-8000-000000000083'),
  null::jsonb,
  'a lot from an unapproved fisher is never public'
);
select is(
  public.get_public_catch_traceability('90000000-0000-4000-8000-000000000099'),
  null::jsonb,
  'unknown tokens disclose no lot data'
);
reset role;

select * from finish();
rollback;
