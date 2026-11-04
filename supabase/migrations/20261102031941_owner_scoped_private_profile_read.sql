-- Read private contact details only for the currently authenticated profile owner.
-- Do not grant SELECT on profiles.phone: fisher directory policies can expose
-- verified fisher rows to other users, so column grants would leak phone numbers.
create or replace function public.get_my_business_profile()
returns table (
  display_name text,
  phone text,
  business_address text,
  business_postcode text,
  business_city text,
  business_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.phone, p.business_address, p.business_postcode, p.business_city, p.business_email
  from public.profiles as p
  where p.id = (select auth.uid()) and (select auth.uid()) is not null;
$$;

revoke all on function public.get_my_business_profile() from public, anon;
grant execute on function public.get_my_business_profile() to authenticated;