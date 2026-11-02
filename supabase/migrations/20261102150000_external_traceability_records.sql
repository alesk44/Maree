-- External seafood traceability references: persist QR scans and bind them to a Marée catch/order.
-- Records are append-only; a correction is a new record, preserving the audit trail.
create table public.traceability_records (
  id uuid primary key default gen_random_uuid(),
  catch_id uuid not null references public.catches(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  source_kind text not null check (source_kind in ('url','gs1','identifier')),
  external_code text not null check (length(btrim(external_code)) between 1 and 240),
  source_url text check (
    source_url is null
    or (length(source_url) <= 2048 and source_url ~* '^https://[^[:space:]]+$')
  ),
  supplier_name text not null check (length(btrim(supplier_name)) between 1 and 160),
  received_at timestamptz not null check (received_at <= now()),
  species text not null check (length(btrim(species)) between 1 and 100),
  quantity_kg numeric(8,2) not null check (quantity_kg > 0 and quantity_kg <= 10000),
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint traceability_url_kind_consistency check (source_kind <> 'url' or source_url is not null)
);

create index traceability_records_catch_created_idx
  on public.traceability_records(catch_id, created_at desc);
create index traceability_records_order_created_idx
  on public.traceability_records(order_id, created_at desc)
  where order_id is not null;

alter table public.traceability_records enable row level security;

create policy "Traceability parties can read associated records"
on public.traceability_records for select to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.catches c
    where c.id = traceability_records.catch_id
      and c.fisher_id = (select auth.uid())
  )
  or exists (
    select 1 from public.orders o
    where o.id = traceability_records.order_id
      and o.restaurant_id = (select auth.uid())
  )
  or private.is_current_user_admin()
);

revoke all on public.traceability_records from anon, authenticated;
grant select on public.traceability_records to authenticated;

create or replace function public.attach_external_traceability(
  p_catch_id uuid,
  p_order_id uuid,
  p_source_kind text,
  p_external_code text,
  p_source_url text,
  p_supplier_name text,
  p_received_at timestamptz,
  p_species text,
  p_quantity_kg numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_catch_id uuid := p_catch_id;
  v_record_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role not in ('fisher'::public.app_role, 'restaurant'::public.app_role) then
    raise exception 'Only fisher or restaurant accounts can attach traceability';
  end if;

  if p_source_kind not in ('url','gs1','identifier')
     or p_external_code is null or length(btrim(p_external_code)) not between 1 and 240
     or p_supplier_name is null or length(btrim(p_supplier_name)) not between 1 and 160
     or p_received_at is null or p_received_at > now()
     or p_species is null or length(btrim(p_species)) not between 1 and 100
     or p_quantity_kg is null or p_quantity_kg <= 0 or p_quantity_kg > 10000
     or (p_note is not null and length(p_note) > 1000)
     or (p_source_url is not null and (length(p_source_url) > 2048 or p_source_url !~* '^https://[^[:space:]]+$'))
     or (p_source_kind = 'url' and p_source_url is null) then
    raise exception 'Invalid traceability details';
  end if;

  if v_role = 'restaurant'::public.app_role then
    if p_order_id is null then raise exception 'Restaurant traceability must reference one of its orders'; end if;
    select o.catch_id into v_catch_id
    from public.orders o
    where o.id = p_order_id and o.restaurant_id = v_user_id;
    if not found then raise exception 'Order not found for this restaurant'; end if;
    if p_catch_id is not null and p_catch_id <> v_catch_id then
      raise exception 'Order and catch do not match';
    end if;
  else
    if v_catch_id is null then raise exception 'Fisher traceability must reference an owned catch'; end if;
    if not exists (
      select 1 from public.catches c
      where c.id = v_catch_id and c.fisher_id = v_user_id
    ) then raise exception 'Catch not found or not owned by this fisher'; end if;
    if p_order_id is not null and not exists (
      select 1 from public.orders o where o.id = p_order_id and o.catch_id = v_catch_id
    ) then raise exception 'Order does not belong to this catch'; end if;
  end if;

  insert into public.traceability_records (
    catch_id, order_id, created_by, source_kind, external_code, source_url,
    supplier_name, received_at, species, quantity_kg, note
  ) values (
    v_catch_id, p_order_id, v_user_id, p_source_kind, btrim(p_external_code), p_source_url,
    btrim(p_supplier_name), p_received_at, btrim(p_species), p_quantity_kg, nullif(btrim(p_note), '')
  ) returning id into v_record_id;

  return v_record_id;
end;
$function$;

revoke all on function public.attach_external_traceability(uuid,uuid,text,text,text,text,timestamptz,text,numeric,text) from public, anon;
grant execute on function public.attach_external_traceability(uuid,uuid,text,text,text,text,timestamptz,text,numeric,text) to authenticated;

create or replace function private.prevent_traceability_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $body$
begin
  raise exception 'Traceability records are append-only';
end;
$body$;

revoke all on function private.prevent_traceability_record_mutation() from public, anon, authenticated;
create trigger traceability_records_immutable
before update or delete on public.traceability_records
for each row execute function private.prevent_traceability_record_mutation();

comment on table public.traceability_records is
  'Append-only references to external seafood traceability codes. A QR scan is not a legal or freshness certification.';
