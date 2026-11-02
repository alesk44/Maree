#!/usr/bin/env bash
set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
FISHER_ID="00000000-0000-4000-8000-000000000011"
RESTAURANT_A="00000000-0000-4000-8000-000000000012"
RESTAURANT_B="00000000-0000-4000-8000-000000000013"
CATCH_ID="10000000-0000-4000-8000-000000000011"
LOG_A="$(mktemp)"
LOG_B="$(mktemp)"
trap 'rm -f "$LOG_A" "$LOG_B"' EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id, email) values
  ('$FISHER_ID', 'concurrency-fisher@test.local'),
  ('$RESTAURANT_A', 'concurrency-restaurant-a@test.local'),
  ('$RESTAURANT_B', 'concurrency-restaurant-b@test.local')
on conflict (id) do nothing;

update public.profiles set role = 'fisher', display_name = 'Concurrency Fisher'
where id = '$FISHER_ID';
update public.profiles set role = 'restaurant', display_name = 'Concurrency Restaurant A'
where id = '$RESTAURANT_A';
update public.profiles set role = 'restaurant', display_name = 'Concurrency Restaurant B'
where id = '$RESTAURANT_B';

insert into public.catches (
  id, fisher_id, species, zone, caught_at, landed_at, quantity_kg,
  remaining_kg, price_per_kg, method, storage_instructions, status
) values (
  '$CATCH_ID', '$FISHER_ID', 'Pollock', 'North coast',
  now() - interval '3 hours', now() - interval '2 hours',
  0.5, 0.5, 8.50, 'Line caught', 'Keep chilled at 0–4°C', 'available'
);
SQL

# Session A reserves the only 0.5 kg, then deliberately holds the transaction
# open so session B must wait on the same catch row lock.
psql "$DB_URL" -v ON_ERROR_STOP=1 >"$LOG_A" 2>&1 <<SQL &
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '$RESTAURANT_A';
select public.reserve_catch(
  '$CATCH_ID'::uuid, 0.5, now() + interval '1 day', 'collection', null
);
select pg_sleep(2);
commit;
SQL
PID_A=$!

sleep 0.25
set +e
psql "$DB_URL" -v ON_ERROR_STOP=1 >"$LOG_B" 2>&1 <<SQL
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '$RESTAURANT_B';
select public.reserve_catch(
  '$CATCH_ID'::uuid, 0.5, now() + interval '1 day', 'collection', null
);
commit;
SQL
EXIT_B=$?
set -e

wait "$PID_A"

if [ "$EXIT_B" -eq 0 ]; then
  echo "FAIL: second restaurant unexpectedly reserved the same stock."
  cat "$LOG_B"
  exit 1
fi

if ! grep -Fq "Catch lot is not available" "$LOG_B"; then
  echo "FAIL: second reservation failed for an unexpected reason."
  cat "$LOG_B"
  exit 1
fi

RESULT="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "select remaining_kg::text || ':' || status::text || ':' || (select count(*) from public.orders where catch_id = '$CATCH_ID'::uuid)::text from public.catches where id = '$CATCH_ID'::uuid;")"
if [ "$RESULT" != "0.00:sold_out:1" ]; then
  echo "FAIL: unexpected stock/order state after concurrent reservations: $RESULT"
  exit 1
fi

echo "PASS: exactly one restaurant reserved the final 0.5 kg; the concurrent request was rejected."
