-- Marée Jersey: shared database foundation.
-- Apply only to a Supabase project after reviewing the Jersey operational/legal requirements.
create extension if not exists pgcrypto;

create type public.app_role as enum ('restaurant', 'fisher', 'admin');
create type public.catch_status as enum ('available', 'reserved', 'sold_out');
create type public.order_status as enum ('submitted', 'confirmed', 'ready', 'delivered', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'restaurant',
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catches (
  id uuid primary key default gen_random_uuid(),
  fisher_id uuid not null references public.profiles(id) on delete restrict,
  species text not null check (length(trim(species)) between 1 and 100),
  zone text not null check (length(trim(zone)) between 1 and 160),
  caught_at timestamptz not null,
  landed_at timestamptz not null,
  quantity_kg numeric(8,2) not null check (quantity_kg > 0),
  remaining_kg numeric(8,2) not null check (remaining_kg >= 0 and remaining_kg <= quantity_kg),
  price_per_kg numeric(8,2) not null check (price_per_kg >= 0),
  grade text,
  method text not null check (length(trim(method)) between 1 and 100),
  storage_instructions text not null check (length(trim(storage_instructions)) between 1 and 1000),
  status public.catch_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catches_capture_before_landing check (caught_at <= landed_at),
  constraint catches_status_stock_consistency check (
    (remaining_kg = 0 and status = 'sold_out') or
    (remaining_kg > 0 and status <> 'sold_out')
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  catch_id uuid not null references public.catches(id) on delete restrict,
  restaurant_id uuid not null references public.profiles(id) on delete restrict,
  quantity_kg numeric(8,2) not null check (quantity_kg >= 0.5 and mod(quantity_kg, 0.5) = 0),
  requested_slot timestamptz not null,
  fulfilment text not null check (fulfilment in ('delivery', 'collection')),
  note text check (note is null or length(note) <= 2000),
  status public.order_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create schema if not exists private;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $body$
begin
  new.updated_at = now();
  return new;
end;
$body$;

create function private.validate_catch_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $body$
begin
  if new.landed_at > now() then
    raise exception 'Landing time cannot be in the future';
  end if;
  if new.caught_at > new.landed_at then
    raise exception 'Catch time cannot be after landing time';
  end if;
  return new;
end;
$body$;

create function private.validate_order_slot()
returns trigger
language plpgsql
set search_path = ''
as $body$
begin
  if new.requested_slot <= now() then
    raise exception 'Requested slot must be in the future';
  end if;
  return new;
end;
$body$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $body$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'restaurant',
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'New user')
  );
  return new;
end;
$body$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.validate_catch_timestamps() from public, anon, authenticated;
revoke all on function private.validate_order_slot() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger catches_set_updated_at before update on public.catches
for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function private.set_updated_at();
create trigger catches_validate_timestamps before insert or update on public.catches
for each row execute function private.validate_catch_timestamps();
create trigger orders_validate_slot before insert or update on public.orders
for each row execute function private.validate_order_slot();
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create index catches_available_idx on public.catches(status, landed_at desc) where status = 'available';
create index catches_fisher_idx on public.catches(fisher_id, created_at desc);
create index orders_restaurant_idx on public.orders(restaurant_id, created_at desc);
create index orders_catch_idx on public.orders(catch_id, status);

alter table public.profiles enable row level security;
alter table public.catches enable row level security;
alter table public.orders enable row level security;

-- Public catalogue is readable; only the owning fisher may manage their lots.
create policy "Public can read available catch lots"
  on public.catches for select to anon, authenticated
  using (status = 'available' or fisher_id = (select auth.uid()));

create policy "Fishers can publish their own lots"
  on public.catches for insert to authenticated
  with check (
    fisher_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'fisher')
  );

create policy "Fishers can update their own lots"
  on public.catches for update to authenticated
  using (
    fisher_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'fisher')
  )
  with check (
    fisher_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'fisher')
  );

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users can update contact fields on their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Orders are visible only to the restaurant that placed them or the fisher who owns the lot.
create policy "Order parties can read orders"
  on public.orders for select to authenticated
  using (
    restaurant_id = (select auth.uid())
    or exists (
      select 1 from public.catches c
      where c.id = orders.catch_id and c.fisher_id = (select auth.uid())
    )
  );

-- Reservation creation and stock decrement should be performed by a transactional RPC
-- (row-lock the catch, validate remaining_kg, then insert order and decrement stock).
-- Direct client inserts/updates/deletes are intentionally not granted here.
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
grant select on public.catches to anon, authenticated;
grant insert, update on public.catches to authenticated;
grant select on public.orders to authenticated;


-- Atomic reservation endpoint: locks the lot before checking/decrementing stock.
create function public.reserve_catch(
  p_catch_id uuid,
  p_quantity_kg numeric,
  p_requested_slot timestamptz,
  p_fulfilment text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role;
  v_catch public.catches%rowtype;
  v_order_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role is distinct from 'restaurant'::public.app_role then
    raise exception 'Only restaurant accounts can place orders';
  end if;

  if p_quantity_kg is null or p_quantity_kg < 0.5 or mod(p_quantity_kg, 0.5) <> 0 then
    raise exception 'Quantity must be at least 0.5 kg in 0.5 kg increments';
  end if;
  if p_requested_slot is null or p_requested_slot <= now() then
    raise exception 'Requested slot must be in the future';
  end if;
  if p_fulfilment is null or p_fulfilment not in ('delivery', 'collection') then
    raise exception 'Invalid fulfilment method';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Note is too long';
  end if;

  select c.* into v_catch
  from public.catches c
  where c.id = p_catch_id
  for update;

  if not found or v_catch.status <> 'available' then
    raise exception 'Catch lot is not available';
  end if;
  if p_quantity_kg > v_catch.remaining_kg then
    raise exception 'Requested quantity exceeds available stock';
  end if;

  insert into public.orders (
    catch_id, restaurant_id, quantity_kg, requested_slot, fulfilment, note
  ) values (
    p_catch_id, v_user_id, p_quantity_kg, p_requested_slot, p_fulfilment, nullif(trim(p_note), '')
  ) returning id into v_order_id;

  update public.catches
  set remaining_kg = remaining_kg - p_quantity_kg,
      status = case when remaining_kg - p_quantity_kg = 0 then 'sold_out'::public.catch_status else 'available'::public.catch_status end
  where id = p_catch_id;

  return v_order_id;
end;
$body$;

revoke all on function public.reserve_catch(uuid, numeric, timestamptz, text, text) from public, anon;
grant execute on function public.reserve_catch(uuid, numeric, timestamptz, text, text) to authenticated;
