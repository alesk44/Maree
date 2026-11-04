-- Add covering indexes for the six foreign keys reported by the live Supabase performance advisor.
-- These tables are currently small; standard transactional index creation is appropriate.
create index if not exists fisher_monthly_invoices_fisher_id_idx
  on public.fisher_monthly_invoices (fisher_id);

create index if not exists fisher_monthly_invoices_paid_by_idx
  on public.fisher_monthly_invoices (paid_by);

create index if not exists maree_monthly_commission_invoices_declared_by_idx
  on public.maree_monthly_commission_invoices (declared_by);

create index if not exists maree_monthly_commission_invoices_verified_by_idx
  on public.maree_monthly_commission_invoices (verified_by);

create index if not exists orders_fisher_id_snapshot_idx
  on public.orders (fisher_id_snapshot);

create index if not exists restaurant_fisher_billing_settings_fisher_id_idx
  on public.restaurant_fisher_billing_settings (fisher_id);
