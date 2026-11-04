begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

select ok(to_regclass('public.fisher_monthly_invoices_fisher_id_idx') is not null,
  'fisher monthly invoice owner foreign key is indexed');
select ok(to_regclass('public.fisher_monthly_invoices_paid_by_idx') is not null,
  'fisher monthly invoice paid_by foreign key is indexed');
select ok(to_regclass('public.maree_monthly_commission_invoices_declared_by_idx') is not null,
  'Marée invoice declared_by foreign key is indexed');
select ok(to_regclass('public.maree_monthly_commission_invoices_verified_by_idx') is not null,
  'Marée invoice verified_by foreign key is indexed');
select ok(to_regclass('public.orders_fisher_id_snapshot_idx') is not null,
  'order fisher snapshot foreign key is indexed');
select ok(to_regclass('public.restaurant_fisher_billing_settings_fisher_id_idx') is not null,
  'restaurant-fisher billing setting fisher foreign key is indexed');

select * from finish();
rollback;
