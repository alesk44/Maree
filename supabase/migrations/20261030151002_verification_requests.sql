-- Account verification workflow for fishers and restaurants.
create type public.verification_status as enum ('pending', 'approved', 'rejected');

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role public.app_role not null check (requested_role in ('fisher', 'restaurant')),
  business_name text not null check (length(trim(business_name)) between 2 and 160),
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  phone text not null check (length(trim(phone)) between 5 and 40),
  registration_number text,
  evidence_note text not null check (length(trim(evidence_note)) between 10 and 2000),
  status public.verification_status not null default 'pending',
  reviewer_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger verification_requests_set_updated_at
before update on public.verification_requests
for each row execute function private.set_updated_at();

alter table public.verification_requests enable row level security;

create policy "Users can read their own verification requests"
  on public.verification_requests for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can submit their own verification request"
  on public.verification_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Admins can read verification requests"
  on public.verification_requests for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));

create policy "Admins can review verification requests"
  on public.verification_requests for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  ));

grant select, insert, update on public.verification_requests to authenticated;
