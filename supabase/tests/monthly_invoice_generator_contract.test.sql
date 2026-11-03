begin;

select plan(14);

select has_function('public','generate_fisher_monthly_invoices',array['date'],
  'Fisher monthly generator exists.');
select has_function('public','generate_maree_monthly_commission_invoices',array['date'],
  'Marée commission generator exists.');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.generate_fisher_monthly_invoices(date)'::regprocedure),
  'Fisher generator is SECURITY DEFINER with an empty search_path.');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.generate_maree_monthly_commission_invoices(date)'::regprocedure),
  'Marée generator is SECURITY DEFINER with an empty search_path.');
select ok(not has_function_privilege('authenticated','public.generate_fisher_monthly_invoices(date)','EXECUTE')
  and has_function_privilege('service_role','public.generate_fisher_monthly_invoices(date)','EXECUTE'),
  'Fisher generator is service-role only.');
select ok(not has_function_privilege('authenticated','public.generate_maree_monthly_commission_invoices(date)','EXECUTE')
  and has_function_privilege('service_role','public.generate_maree_monthly_commission_invoices(date)','EXECUTE'),
  'Marée generator is service-role only.');
select ok(position('delete from public.fisher_monthly_invoice_items' in lower(pg_get_functiondef('public.generate_fisher_monthly_invoices(date)'::regprocedure))) > 0,
  'Fisher generator removes stale item rows from open invoices.');
select ok(position('delete from public.maree_monthly_commission_invoice_items' in lower(pg_get_functiondef('public.generate_maree_monthly_commission_invoices(date)'::regprocedure))) > 0,
  'Marée generator removes stale item rows from open invoices.');
select ok(position('set subtotal=coalesce((select sum(ii.product_subtotal)' in lower(pg_get_functiondef('public.generate_fisher_monthly_invoices(date)'::regprocedure))) > 0,
  'Fisher product totals are recomputed from persisted item rows.');
select ok(position('set commission_total=coalesce((select sum(ii.commission_amount)' in lower(pg_get_functiondef('public.generate_maree_monthly_commission_invoices(date)'::regprocedure))) > 0,
  'Marée commission totals are recomputed from persisted item rows.');
select ok(position('late eligible order found for a finalized fisher invoice' in lower(pg_get_functiondef('public.generate_fisher_monthly_invoices(date)'::regprocedure))) > 0,
  'A late order is not silently omitted from a finalized fisher invoice.');
select ok(position('late eligible order found for a finalized marée commission invoice' in lower(pg_get_functiondef('public.generate_maree_monthly_commission_invoices(date)'::regprocedure))) > 0,
  'A late order is not silently omitted from a finalized Marée invoice.');
select ok(position('i.status=''open''' in lower(pg_get_functiondef('public.generate_fisher_monthly_invoices(date)'::regprocedure))) > 0,
  'Fisher item reconciliation is restricted to open invoices.');
select ok(position('i.status=''open''' in lower(pg_get_functiondef('public.generate_maree_monthly_commission_invoices(date)'::regprocedure))) > 0,
  'Marée item reconciliation is restricted to open invoices.');

select * from finish();
rollback;
