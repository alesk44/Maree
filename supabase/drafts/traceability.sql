-- Marée: private QR scan intake and catch/order traceability draft.
-- Deliberately stored under supabase/drafts (NOT migrations) until validated locally.
-- Raw QR payloads may contain personal or opaque identifiers: never expose these tables publicly.

create table if not exists public.catch_traceability_codes (
  id uuid primary key default gen_random_uuid(),
  catch_id uuid not null references public.catches(id) on delete cascade,
  raw_code text not null check (length(raw_code) between 1 and 2048),
  code_type text not null check (code_type in ('https_url', 'gs1', 'identifier')),
  source_url text,
  source_label text check (source_label is null or length(source_label) <= 160),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'reviewed', 'rejected')),
  scanned_by uuid not null default auth.uid() references auth.users(id),
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint catch_traceability_codes_https_only
    check (source_url is null or source_url ~* '^https://[^[:space:]]+$')
);

create index if not exists catch_traceability_codes_catch_scanned_idx
  on public.catch_traceability_codes (catch_id, scanned_at desc);

alter table public.catch_traceability_codes enable row level security;

revoke all on public.catch_traceability_codes from anon, authenticated;
grant select, insert on public.catch_traceability_codes to authenticated;

create policy "Catch participants can read traceability codes"
  on public.catch_traceability_codes
  for select to authenticated
  using (
    exists (
      select 1
      from public.catches c
      where c.id = catch_traceability_codes.catch_id
        and (
          c.fisher_id = (select auth.uid())
          or exists (
            select 1
            from public.orders o
            where o.catch_id = c.id
              and o.restaurant_id = (select auth.uid())
          )
        )
    )
  );

create policy "Catch participants can add traceability codes"
  on public.catch_traceability_codes
  for insert to authenticated
  with check (
    scanned_by = (select auth.uid())
    and exists (
      select 1
      from public.catches c
      where c.id = catch_traceability_codes.catch_id
        and (
          c.fisher_id = (select auth.uid())
          or exists (
            select 1
            from public.orders o
            where o.catch_id = c.id
              and o.restaurant_id = (select auth.uid())
          )
        )
    )
  );

create table if not exists public.catch_traceability_events (
  id uuid primary key default gen_random_uuid(),
  catch_id uuid not null references public.catches(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null check (event_type in (
    'catch_published', 'landed', 'weighed', 'quantity_adjusted',
    'reserved', 'confirmed', 'prepared', 'collected', 'delivered',
    'cancelled', 'external_code_scanned', 'traceability_reviewed'
  )),
  quantity_kg numeric check (quantity_kg is null or quantity_kg >= 0),
  note text check (note is null or length(note) <= 1000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 8192),
  actor_id uuid not null default auth.uid() references auth.users(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint catch_traceability_event_order_matches_catch
    check (order_id is null or catch_id is not null)
);

create index if not exists catch_traceability_events_catch_occurred_idx
  on public.catch_traceability_events (catch_id, occurred_at desc);
create index if not exists catch_traceability_events_order_idx
  on public.catch_traceability_events (order_id)
  where order_id is not null;

alter table public.catch_traceability_events enable row level security;

revoke all on public.catch_traceability_events from anon, authenticated;
grant select, insert on public.catch_traceability_events to authenticated;

create policy "Catch participants can read traceability events"
  on public.catch_traceability_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.catches c
      where c.id = catch_traceability_events.catch_id
        and (
          c.fisher_id = (select auth.uid())
          or exists (
            select 1
            from public.orders o
            where o.catch_id = c.id
              and o.restaurant_id = (select auth.uid())
          )
        )
    )
  );

create policy "Catch participants can add traceability events"
  on public.catch_traceability_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and exists (
      select 1
      from public.catches c
      where c.id = catch_traceability_events.catch_id
        and (
          c.fisher_id = (select auth.uid())
          or exists (
            select 1
            from public.orders o
            where o.catch_id = c.id
              and o.restaurant_id = (select auth.uid())
          )
        )
    )
    and (
      order_id is null
      or exists (
        select 1
        from public.orders o
        where o.id = catch_traceability_events.order_id
          and o.catch_id = catch_traceability_events.catch_id
          and (
            o.restaurant_id = (select auth.uid())
            or exists (
              select 1
              from public.catches c
              where c.id = o.catch_id
                and c.fisher_id = (select auth.uid())
            )
          )
      )
    )
  );

comment on table public.catch_traceability_codes is
  'Private QR/code scan records. External payloads remain unverified until reviewed; never publish raw_code.';
comment on table public.catch_traceability_events is
  'Append-only catch/order traceability timeline. No UPDATE or DELETE is granted to API roles.';
