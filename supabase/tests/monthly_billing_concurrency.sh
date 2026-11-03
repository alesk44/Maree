#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  DB_URL="$SUPABASE_DB_URL"
else
  DB_URL="$(supabase status -o env | sed -n 's/^DB_URL=//p' | tr -d '"')"
  if [[ -z "$DB_URL" ]]; then
    echo "FAIL: could not resolve the local Supabase database URL."
    exit 1
  fi
fi

RESTAURANT_ID="00000000-0000-4000-8000-000000000041"
FISHER_ID="00000000-0000-4000-8000-000000000042"
CATCH_ID="10000000-0000-4000-8000-000000000041"
ORDER_ID="20000000-0000-4000-8000-000000000041"
LOG_A="$(mktemp)"
LOG_B="$(mktemp)"
trap 'rm -f "$LOG_A" "$LOG_B"' EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id,email) values
  ('$RESTAURANT_ID','billing-race-restaurant@test.local'),
  ('$FISHER_ID','billing-race-fisher@test.local')
on conflict (id) do nothing;

update public.profiles set role='restaurant' where id='$RESTAURANT_ID';
update public.profiles set role='fisher' where id='$FISHER_ID';

insert into public.catches (
  id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,
  price_per_kg,method,storage_instructions,status
) values (
  '$CATCH_ID','$FISHER_ID','Pollock','North coast',
  '2026-08-14 10:00:00+00','2026-08-14 11:00:00+00',
  10,10,10,'Line caught','Keep chilled at 0–4°C','available'
);

insert into public.orders (
  id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,status,
  fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,
  delivery_fee_rate,delivery_fee,total_amount,billing_mode,delivered_at,tip_amount
) values (
  '$ORDER_ID','$CATCH_ID','$RESTAURANT_ID',5,
  '2026-08-15 12:00:00+00','delivery','delivered',
  '$FISHER_ID',10,50,0.065,3.25,0.20,10,63.25,'monthly',
  '2026-08-15 12:30:00+00',0
);
SQL

# Two independent database sessions execute the same month concurrently.
psql "$DB_URL" -v ON_ERROR_STOP=1 >"$LOG_A" 2>&1 \
  -c "select public.generate_monthly_billing_statements('2026-08-01'::date);" &
PID_A=$!
psql "$DB_URL" -v ON_ERROR_STOP=1 >"$LOG_B" 2>&1 \
  -c "select public.generate_monthly_billing_statements('2026-08-01'::date);" &
PID_B=$!

wait "$PID_A"
wait "$PID_B"

RESULT="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "
select
  (select count(*) from public.fisher_monthly_invoices
   where restaurant_id='$RESTAURANT_ID' and fisher_id='$FISHER_ID' and period_start='2026-08-01')::text || ':' ||
  (select count(*) from public.fisher_monthly_invoice_items
   where order_id='$ORDER_ID')::text || ':' ||
  (select subtotal::text from public.fisher_monthly_invoices
   where restaurant_id='$RESTAURANT_ID' and fisher_id='$FISHER_ID' and period_start='2026-08-01') || ':' ||
  (select count(*) from public.maree_monthly_commission_invoices
   where restaurant_id='$RESTAURANT_ID' and period_start='2026-08-01')::text || ':' ||
  (select count(*) from public.maree_monthly_commission_invoice_items
   where order_id='$ORDER_ID')::text || ':' ||
  (select commission_total::text || '/' || delivery_total::text
   from public.maree_monthly_commission_invoices
   where restaurant_id='$RESTAURANT_ID' and period_start='2026-08-01');
")"

if [[ "$RESULT" != "1:1:50.00:1:1:3.25/10.00" ]]; then
  echo "FAIL: concurrent monthly generation produced an unexpected ledger: $RESULT"
  echo "--- session A ---"; cat "$LOG_A"
  echo "--- session B ---"; cat "$LOG_B"
  exit 1
fi

echo "PASS: concurrent generation produced one fisher invoice, one Marée invoice, one line per ledger, and exact totals."
