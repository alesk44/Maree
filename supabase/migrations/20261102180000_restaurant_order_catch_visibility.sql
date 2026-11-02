-- Let a restaurant read the catch details for its own order after the lot
-- leaves the public available catalogue, without opening other reserved lots.
create or replace function private.restaurant_has_order_for_catch(p_catch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.orders o
    where o.catch_id = p_catch_id
      and o.restaurant_id = (select auth.uid())
  );
$function$;

revoke all on function private.restaurant_has_order_for_catch(uuid) from public, anon;
grant execute on function private.restaurant_has_order_for_catch(uuid) to authenticated;

drop policy if exists "Authenticated users can read permitted catch lots" on public.catches;
create policy "Authenticated users can read permitted catch lots"
on public.catches for select to authenticated
using (
  status = 'available'
  or fisher_id = (select auth.uid())
  or private.is_current_user_admin()
  or private.restaurant_has_order_for_catch(id)
);
