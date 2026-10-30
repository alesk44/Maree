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
  constraint catches_landing_not_future check (landed_at <= now()),
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
  requested_slot timestamptz not null check (requested_slot > created_at),
  fulfilment text not null check (fulfilment in ('delivery', 'collection')),
  note text check (note is null or length(note) <= 2000),
  status public.order_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
