-- Keep private contact and licence details out of broad fisher-profile reads.
revoke select (phone, business_address, business_postcode, business_city, business_email, fishing_licence_number)
on table public.profiles from anon, authenticated;

create or replace function public.get_my_fisher_private_details()
returns table (fishing_licence_number text)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.fishing_licence_number
  from public.profiles p
  where p.id = (select auth.uid())
    and (select auth.uid()) is not null;
$function$;

revoke all on function public.get_my_fisher_private_details() from public, anon;
grant execute on function public.get_my_fisher_private_details() to authenticated;

revoke execute on function public.get_my_business_profile() from public, anon;
grant execute on function public.get_my_business_profile() to authenticated;

-- Profile roles and system timestamps are never self-editable.
revoke update (role, id, created_at, updated_at)
on table public.profiles from anon, authenticated;
