-- Protect the paid seafood-vision endpoint from accidental or abusive usage.
create schema if not exists private;

create table if not exists private.seafood_recognition_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists seafood_recognition_attempts_user_created_idx
  on private.seafood_recognition_attempts (user_id, created_at desc);

alter table private.seafood_recognition_attempts enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on private.seafood_recognition_attempts from public, anon, authenticated;

create or replace function public.consume_seafood_recognition_quota()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_recent_count integer;
  v_daily_count integer;
  v_retry_recent integer := 0;
  v_retry_daily integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role not in ('fisher', 'restaurant') then
    raise exception 'Approved fisher or restaurant account required' using errcode = '42501';
  end if;

  -- Serialize requests per account so simultaneous calls cannot bypass the limits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  delete from private.seafood_recognition_attempts
  where user_id = v_user_id
    and created_at < v_now - interval '1 day';

  select
    count(*) filter (where created_at > v_now - interval '10 minutes'),
    count(*)
  into v_recent_count, v_daily_count
  from private.seafood_recognition_attempts
  where user_id = v_user_id
    and created_at > v_now - interval '1 day';

  if v_recent_count >= 3 then
    select greatest(1, ceil(extract(epoch from (
      min(a.created_at) + interval '10 minutes' - v_now
    )))::integer)
    into v_retry_recent
    from private.seafood_recognition_attempts a
    where a.user_id = v_user_id
      and a.created_at > v_now - interval '10 minutes';
  end if;

  if v_daily_count >= 10 then
    select greatest(1, ceil(extract(epoch from (
      min(a.created_at) + interval '1 day' - v_now
    )))::integer)
    into v_retry_daily
    from private.seafood_recognition_attempts a
    where a.user_id = v_user_id
      and a.created_at > v_now - interval '1 day';
  end if;

  if v_recent_count >= 3 or v_daily_count >= 10 then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'remaining_today', greatest(0, 10 - v_daily_count),
      'retry_after_seconds', greatest(v_retry_recent, v_retry_daily)
    );
  end if;

  insert into private.seafood_recognition_attempts (user_id, created_at)
  values (v_user_id, v_now);

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'remaining_today', greatest(0, 9 - v_daily_count),
    'retry_after_seconds', 0
  );
end;
$function$;

revoke all on function public.consume_seafood_recognition_quota() from public, anon;
grant execute on function public.consume_seafood_recognition_quota() to authenticated;
