begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000091','delivery-buyer-restaurant@test.local'),
 ('00000000-0000-4000-8000-000000000092','delivery-buyer-fisher@test.local'),
 ('00000000-0000-4000-8000-000000000093','delivery-fisher-payer@test.local'),
 ('00000000-0000-4000-8000-000000000094','delivery-admin@test.local')
on conflict(id) do nothing;
update public.profiles set role='restaurant' where id='00000000-0000-4000-8000-000000000091';
update public.profiles set role='fisher' where id in ('00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000093');
update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000094';
insert into private.admin_users(user_id) values ('00000000-0000-4000-8000-000000000094') on conflict(user_id) do nothing;
insert into public.verification_requests(id,user_id,requested_role,business_name,contact_name,phone,evidence_note,status,reviewed_at) values
 ('30000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000092','fisher','Buyer-paid test','Test','+441534000091','Approved fisher business registration for isolated delivery-payer test.','approved',now()),
 ('30000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000093','fisher','Fisher-paid test','Test','+441534000092','Approved fisher business registration for isolated delivery-payer test.','approved',now());
insert into public.catches(id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,price_per_kg,method,storage_instructions,status) values
 ('10000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000092','Pollock','North',now()-interval '2 hours',now()-interval '1 hour',10,10,10,'Line','Chilled','available'),
 ('10000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000093','Pollock','North',now()-interval '2 hours',now()-interval '1 hour',10,10,10,'Line','Chilled','available');
update public.maree_commercial_settings set maree_fee_rate=0.065,delivery_fee_rate=0.20,delivery_fee_payer='buyer' where id=true;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000091';
select lives_ok($$select public.reserve_catch('10000000-0000-4000-8000-000000000091',5,now()+interval '2 days','delivery',null,2.50)$$,'buyer-payer reservation succeeds');
reset role;
select is((select delivery_fee_payer_snapshot from public.orders where catch_id='10000000-0000-4000-8000-000000000091'),'buyer','buyer is snapshotted');
select is((select total_amount from public.orders where catch_id='10000000-0000-4000-8000-000000000091'),65.75::numeric,'buyer pays delivery in restaurant total');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000094';
select lives_ok($select public.update_maree_commercial_settings(6.5,20,'fisher')$,'administrator can update commercial settings');
reset role;
select is((select delivery_fee_payer from public.maree_commercial_settings where id=true),'fisher','administrator change is persisted');
select is((select delivery_fee_payer_snapshot from public.orders where catch_id='10000000-0000-4000-8000-000000000091'),'buyer','commercial changes do not rewrite existing order snapshots');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000091';
select throws_ok($select public.update_maree_commercial_settings(6.5,20,'fisher')$,'P0001','Admin access required','restaurant cannot change global commercial settings');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000091';
select lives_ok($$select public.reserve_catch('10000000-0000-4000-8000-000000000092',5,now()+interval '2 days','delivery',null,2.50)$$,'fisher-payer reservation succeeds');
reset role;
select is((select delivery_fee_payer_snapshot from public.orders where catch_id='10000000-0000-4000-8000-000000000092'),'fisher','fisher payer is snapshotted');
select is((select total_amount from public.orders where catch_id='10000000-0000-4000-8000-000000000092'),55.75::numeric,'fisher-paid delivery excluded from restaurant total');
update public.orders set status='delivered',billing_mode='monthly',delivered_at='2026-10-15 12:00:00+00' where catch_id in ('10000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000092');
select public.generate_fisher_monthly_invoices('2026-10-01'::date);
select public.generate_maree_monthly_commission_invoices('2026-10-01'::date);
select is((select delivery_deduction_total from public.fisher_monthly_invoices where fisher_id='00000000-0000-4000-8000-000000000093' and period_start='2026-10-01'),10.00::numeric,'fisher delivery deducted from fisher statement');
select is((select delivery_deduction_total from public.fisher_monthly_invoices where fisher_id='00000000-0000-4000-8000-000000000092' and period_start='2026-10-01'),0.00::numeric,'buyer-paid delivery not deducted from fisher statement');
select is((select delivery_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000091' and period_start='2026-10-01'),10.00::numeric,'only buyer-paid delivery invoiced to restaurant');
select is((select count(*) from public.maree_monthly_commission_invoice_items where delivery_fee_payer_snapshot='fisher' and delivery_amount=0),1::bigint,'fisher-paid delivery traceable without duplicate charge');
select is((select subtotal+tip_total-delivery_deduction_total from public.fisher_monthly_invoices where fisher_id='00000000-0000-4000-8000-000000000093' and period_start='2026-10-01'),42.50::numeric,'fisher payout products plus tip less deduction');
select is((select commission_total from public.maree_monthly_commission_invoices where restaurant_id='00000000-0000-4000-8000-000000000091' and period_start='2026-10-01'),6.50::numeric,'commission remains restaurant payable');
select * from finish();
rollback;
