-- Public fisher card fields used by the public catalogue.
alter table public.profiles
  add column if not exists boat_name text,
  add column if not exists home_port text,
  add column if not exists fishing_method text,
  add column if not exists bio text,
  add column if not exists since_year integer;
