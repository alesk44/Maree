begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000011', 'reserve-demoted-fisher@test.local'),
  ('00000000-0000-4000-8000-000000000012', 'reserve-unapproved-fisher@test.local'),
  ('00000000-0000-4000-8000-000000000013', 'reserve-approved-fisher@test.local'),
  ('00000000-0000-4000-8000-000000000014', 'reserve-restaurant@test.local')
on conflict (id) do nothing;

update public.profiles set role='fisher'
where id in (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013'
);
update public.profiles set role='restaurant'
where id='00000000-0000-4000-8000-000000000014';

insert into public.verification_requests
  (id,user_id,requested_role,business_name,contact_name,phone,evidence_note,status,reviewed_at)
values
  ('30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011',
   'fisher','Demoted Fisher Ltd','Test Contact','+441534000011','Approved before role demotion.',
   'approved',now()),
  ('30000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000012',
   'fisher','Unapproved Fisher Ltd','Test Contact','+441534000012','Still pending verification.',
   'pending',null),
  ('30000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000013',
   'fisher','Approved Fisher Ltd','Test Contact','+441534000013','Approved fisher reservation fixture.',
   'approved',now());

insert into public.catches (
  id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,
  price_per_kg,method,storage_instructions,status
) values
  ('10000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011',
   'Pollock','North coast',now()-interval '3 hours',now()-interval '2 hours',
   1,1,8.50,'Line caught','Keep chilled at 0–4°C','available'),
  ('10000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000012',
   'Crab','East coast',now()-interval '3 hours',now()-interval '2 hours',
   1,1,12.00,'Pot caught','Keep chilled at 0–4°C','available'),
  ('10000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000013',
   'Mackerel','South coast',now()-interval '3 hours',now()-interval '2 hours',
   1,1,10.00,'Line caught','Keep chilled at 0–4°C','available');

-- A previously approved fisher who has since been demoted must not sell existing stock.
update public.profiles set role='restaurant'
where id='00000000-0000-4000-8000-000000000011';

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000014';
select throws_ok(
  $$select public.reserve_catch('10000000-0000-4000-8000-000000000011'::uuid,0.5,now()+interval '1 day','collection')$$,
  'P0001','Catch owner is not an approved fisher',
  'restaurant cannot reserve a catch owned by a demoted fisher'
);
select throws_ok(
  $$select public.reserve_catch('10000000-0000-4000-8000-000000000012'::uuid,0.5,now()+interval '1 day','collection')$$,
  'P0001','Catch owner is not an approved fisher',
  'restaurant cannot reserve a catch whose fisher verification is still pending'
);
select lives_ok(
  $$select public.reserve_catch('10000000-0000-4000-8000-000000000013'::uuid,0.5,now()+interval '1 day','collection')$$,
  'restaurant can reserve stock from a currently approved fisher'
);
reset role;

select is(
  (select remaining_kg from public.catches where id='10000000-0000-4000-8000-000000000013'),
  0.5::numeric,
  'successful reservation still deducts the requested stock'
);

select * from finish();
rollback;
