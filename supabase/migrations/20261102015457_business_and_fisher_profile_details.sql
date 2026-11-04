-- Extend private business profiles for restaurant contact details and fisher vessel credentials.
alter table public.profiles
  add column if not exists business_address text,
  add column if not exists business_postcode text,
  add column if not exists business_city text,
  add column if not exists business_email text,
  add column if not exists vessel_type text,
  add column if not exists crew_size integer,
  add column if not exists fishing_licence_number text;

alter table public.profiles
  add constraint profiles_crew_size_check
  check (crew_size is null or crew_size between 1 and 100);

-- These fields are private: they are never added to the anonymous fisher directory.
grant select (business_address, business_postcode, business_city, business_email, vessel_type, crew_size, fishing_licence_number)
  on table public.profiles to authenticated;
grant update (business_address, business_postcode, business_city, business_email, vessel_type, crew_size, fishing_licence_number, phone, boat_name, home_port, fishing_method, bio, since_year)
  on table public.profiles to authenticated;
