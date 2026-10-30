-- Public fisher card fields used by the public catalogue.
alter table public.profiles
  add column if not exists boat_name text,
  add column if not exists home_port text,
  add column if not exists fishing_method text,
  add column if not exists bio text,
  add column if not exists since_year integer;

alter table public.profiles
  add constraint profiles_since_year_valid
  check (since_year is null or since_year between 1900 and 2100);

create policy "Public can read verified fisher profiles"
  on public.profiles for select to anon, authenticated
  using (role = 'fisher');

grant select on public.profiles to anon;
