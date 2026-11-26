-- Public QR pages use opaque tokens stored outside exposed schemas. The public
-- RPC returns a narrow, sanitised summary and never the raw QR payload or notes.
create table if not exists private.catch_public_traceability_tokens (
  catch_id uuid primary key references public.catches(id) on delete restrict,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table private.catch_public_traceability_tokens enable row level security;
revoke all on table private.catch_public_traceability_tokens from public, anon, authenticated;

create or replace function private.log_catch_publication_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.catch_traceability_events (
    catch_id, event_type, quantity_kg, metadata, actor_id, occurred_at
  ) values
    (new.id, 'catch_published', new.quantity_kg, '{}'::jsonb, new.fisher_id, new.created_at),
    (new.id, 'landed', new.quantity_kg, '{}'::jsonb, new.fisher_id, new.landed_at);
  return new;
end;
$function$;

revoke all on function private.log_catch_publication_events() from public, anon, authenticated;
drop trigger if exists catches_log_publication_events on public.catches;
create trigger catches_log_publication_events
  after insert on public.catches
  for each row execute function private.log_catch_publication_events();

-- Backfill the first public timeline entries for lots that predate this migration.
insert into public.catch_traceability_events (
  catch_id, event_type, quantity_kg, metadata, actor_id, occurred_at
)
select c.id, 'catch_published', c.quantity_kg, '{}'::jsonb, c.fisher_id, c.created_at
from public.catches c
where not exists (
  select 1 from public.catch_traceability_events e
  where e.catch_id = c.id and e.event_type = 'catch_published' and e.order_id is null
);

insert into public.catch_traceability_events (
  catch_id, event_type, quantity_kg, metadata, actor_id, occurred_at
)
select c.id, 'landed', c.quantity_kg, '{}'::jsonb, c.fisher_id, c.landed_at
from public.catches c
where not exists (
  select 1 from public.catch_traceability_events e
  where e.catch_id = c.id and e.event_type = 'landed' and e.order_id is null
);

create or replace function public.get_my_catch_traceability_token(p_catch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_token uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.catches c
    where c.id = p_catch_id and c.fisher_id = v_user_id
  ) then raise exception 'Catch not found or not owned by this fisher'; end if;
  if not exists (
    select 1 from public.profiles p
    join public.verification_requests vr on vr.user_id = p.id
    where p.id = v_user_id and p.role = 'fisher'::public.app_role
      and vr.requested_role = 'fisher'::public.app_role
      and vr.status = 'approved'::public.verification_status
  ) then raise exception 'Approved fisher account required'; end if;

  insert into private.catch_public_traceability_tokens (catch_id)
  values (p_catch_id)
  on conflict (catch_id) do nothing;

  select t.token into v_token
  from private.catch_public_traceability_tokens t
  where t.catch_id = p_catch_id;
  return v_token;
end;
$function$;

create or replace function public.revoke_my_catch_traceability_token(p_catch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.catches c
    where c.id = p_catch_id and c.fisher_id = v_user_id
  ) then raise exception 'Catch not found or not owned by this fisher'; end if;

  delete from private.catch_public_traceability_tokens t
  where t.catch_id = p_catch_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$function$;

create or replace function public.get_public_catch_traceability(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'species', c.species,
    'zone', c.zone,
    'caughtAt', c.caught_at,
    'landedAt', c.landed_at,
    'quantityKg', c.quantity_kg,
    'method', c.method,
    'grade', c.grade,
    'storageInstructions', c.storage_instructions,
    'fisher', jsonb_build_object(
      'name', directory.display_name,
      'boat', directory.boat_name,
      'homePort', directory.home_port
    ),
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event', e.event_type,
          'occurredAt', e.occurred_at,
          'quantityKg', e.quantity_kg
        ) order by e.occurred_at asc, e.id asc
      )
      from public.catch_traceability_events e
      where e.catch_id = c.id
        and e.order_id is null
        and e.event_type in ('catch_published', 'landed', 'weighed', 'external_code_scanned')
    ), '[]'::jsonb)
  )
  from private.catch_public_traceability_tokens t
  join public.catches c on c.id = t.catch_id
  join public.profiles p on p.id = c.fisher_id
  left join public.public_fisher_directory directory on directory.id = c.fisher_id
  where t.token = p_token
    and p.role = 'fisher'::public.app_role
    and exists (
      select 1 from public.verification_requests vr
      where vr.user_id = p.id
        and vr.requested_role = 'fisher'::public.app_role
        and vr.status = 'approved'::public.verification_status
    );
$function$;

revoke all on function public.get_my_catch_traceability_token(uuid) from public, anon;
revoke all on function public.revoke_my_catch_traceability_token(uuid) from public, anon;
revoke all on function public.get_public_catch_traceability(uuid) from public;
grant execute on function public.get_my_catch_traceability_token(uuid) to authenticated;
grant execute on function public.revoke_my_catch_traceability_token(uuid) to authenticated;
grant execute on function public.get_public_catch_traceability(uuid) to anon, authenticated;

comment on table private.catch_public_traceability_tokens is
  'Opaque bearer tokens for public catch pages. Tokens are never selectable through the Data API.';
comment on function public.get_public_catch_traceability(uuid) is
  'Returns only seller-approved public lot fields and safe timeline events; omits raw QR codes, notes, orders, contacts, price and stock.';
