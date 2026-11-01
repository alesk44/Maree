-- Keep the check immutable so PostgreSQL can validate it consistently.
alter table public.profiles
  drop constraint if exists profiles_since_year_valid;
alter table public.profiles
  add constraint profiles_since_year_valid
  check (since_year is null or since_year between 1900 and 2100);
