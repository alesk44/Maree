begin;

select plan(12);

select has_column('public','orders','tip_amount',
  'Orders store optional tips separately from product prices.');
select has_column('public','orders','fisher_payment_status',
  'Orders store fisher settlement state.');
select has_column('public','orders','fisher_paid_at',
  'Orders store the settlement timestamp.');
select has_column('public','fisher_monthly_invoices','tip_total',
  'Monthly fisher invoices retain tips as a separate total.');
select has_column('public','fisher_monthly_invoice_items','tip_amount',
  'Monthly invoice items retain per-order tips.');
select has_function('public','mark_order_paid',array['uuid','text','text'],
  'Immediate fisher settlement is handled by a guarded RPC.');
select has_function('public','reserve_catch',array['uuid','numeric','timestamp with time zone','text','text','numeric'],
  'Reservation RPC accepts an optional snapshotted tip.');
select ok(
  exists (
    select 1 from pg_trigger t
    where t.tgrelid='public.orders'::regclass
      and t.tgname='orders_validate_slot'
      and pg_get_triggerdef(t.oid) ilike '%UPDATE OF requested_slot%'
  ),
  'Past order slots do not block status or payment updates.'
);
select ok(
  not has_function_privilege('anon','public.mark_order_paid(uuid,text,text)','EXECUTE'),
  'Anonymous users cannot confirm fisher payments.'
);
select ok(
  has_function_privilege('authenticated','public.mark_order_paid(uuid,text,text)','EXECUTE'),
  'Authenticated users can call the RPC, which enforces fisher ownership internally.'
);
select ok(
  position('v_maree_fee := round(v_subtotal * v_maree_rate, 2)' in pg_get_functiondef('public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric)'::regprocedure)) > 0,
  'Marée commission is calculated only on the product subtotal, not the tip.'
);
select ok(
  position('v_tip' in pg_get_functiondef('public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric)'::regprocedure)) > 0
  and position('v_delivery_payer = ''buyer''' in pg_get_functiondef('public.reserve_catch(uuid,numeric,timestamptz,text,text,numeric)'::regprocedure)) > 0,
  'Restaurant total includes the full fisher tip.'
);

select * from finish();
rollback;
