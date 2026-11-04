begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000051','maree-payment-owner@test.local'),
  ('00000000-0000-4000-8000-000000000052','maree-payment-other@test.local'),
  ('00000000-0000-4000-8000-000000000053','maree-payment-admin@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant'
where id in ('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000052');
update public.profiles set role='admin'
where id='00000000-0000-4000-8000-000000000053';

insert into private.admin_users(user_id)
values ('00000000-0000-4000-8000-000000000053')
on conflict (user_id) do nothing;

insert into public.maree_monthly_commission_invoices (
  id,restaurant_id,period_start,period_end,due_date,commission_total,delivery_total,status
) values (
  '40000000-0000-4000-8000-000000000051',
  '00000000-0000-4000-8000-000000000051',
  '2026-09-01','2026-09-30','2026-10-07',6.50,20.00,'open'
);

select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.declare_maree_commission_invoice_paid(uuid,text,text)'::regprocedure),
  'restaurant declaration RPC is SECURITY DEFINER with an empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.verify_maree_commission_invoice_paid(uuid)'::regprocedure),
  'admin verification RPC is SECURITY DEFINER with an empty search_path');
select ok(
  has_function_privilege('authenticated','public.declare_maree_commission_invoice_paid(uuid,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.declare_maree_commission_invoice_paid(uuid,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.verify_maree_commission_invoice_paid(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.verify_maree_commission_invoice_paid(uuid)','EXECUTE'),
  'payment RPCs are available to authenticated users but not anonymous users'
);

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000052';
select throws_ok(
  $$select public.declare_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000051','bank_transfer','WRONG-OWNER')$$,
  'P0001','Open commission invoice not found',
  'a different restaurant cannot declare another restaurant payment'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000051';
select lives_ok(
  $$select public.declare_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000051','bank_transfer','MAREE-TEST-001')$$,
  'invoice-owning restaurant can declare payment'
);
reset role;

select is((select status from public.maree_monthly_commission_invoices
  where id='40000000-0000-4000-8000-000000000051'),
  'declared_paid','restaurant declaration does not itself mark invoice as received');
select is((select payment_reference from public.maree_monthly_commission_invoices
  where id='40000000-0000-4000-8000-000000000051'),
  'MAREE-TEST-001','payment reference is retained for reconciliation');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000051';
select throws_ok(
  $$select public.verify_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000051')$$,
  'P0001','Admin access required',
  'a restaurant cannot verify its own payment declaration'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000053';
select lives_ok(
  $$select public.verify_maree_commission_invoice_paid('40000000-0000-4000-8000-000000000051')$$,
  'Marée admin can verify the declared payment'
);
reset role;
select is((select status from public.maree_monthly_commission_invoices
  where id='40000000-0000-4000-8000-000000000051'),
  'paid','admin verification is the only step that marks the commission invoice paid');
select is((select verified_by from public.maree_monthly_commission_invoices
  where id='40000000-0000-4000-8000-000000000051'),
  '00000000-0000-4000-8000-000000000053'::uuid,'admin identity is recorded as verifier');

select * from finish();
rollback;
