-- Consolidate overlapping permissive policies without changing intended read access.
-- Also narrow verification document operations to the actions used by the application.
drop policy if exists "Admins can read all catch lots" on public.catches;
drop policy if exists "Public can read available catch lots" on public.catches;
create policy "Anonymous users can read available catch lots"
on public.catches for select to anon
using (status = 'available');
create policy "Authenticated users can read permitted catch lots"
on public.catches for select to authenticated
using (
  status = 'available'
  or fisher_id = (select auth.uid())
  or private.is_current_user_admin()
);

drop policy if exists "Admins can read all orders" on public.orders;
drop policy if exists "Order parties can read orders" on public.orders;
create policy "Order parties and admins can read orders"
on public.orders for select to authenticated
using (
  restaurant_id = (select auth.uid())
  or exists (
    select 1 from public.catches c
    where c.id = orders.catch_id and c.fisher_id = (select auth.uid())
  )
  or private.is_current_user_admin()
);

drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Public can read verified fisher profiles" on public.profiles;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Anonymous users can read verified fisher profiles"
on public.profiles for select to anon
using (role = 'fisher'::public.app_role);
create policy "Authenticated users can read permitted profiles"
on public.profiles for select to authenticated
using (
  role = 'fisher'::public.app_role
  or id = (select auth.uid())
  or private.is_current_user_admin()
);

drop policy if exists "Admins can review verification documents" on public.verification_documents;
drop policy if exists "Owners can attach documents to own requests" on public.verification_documents;
drop policy if exists "Owners can view own verification documents" on public.verification_documents;
create policy "Owners and admins can read verification documents"
on public.verification_documents for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_current_user_admin()
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.app_role
  )
);
create policy "Owners can attach documents to own requests"
on public.verification_documents for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.verification_requests vr
    where vr.id = request_id and vr.user_id = (select auth.uid())
  )
);
create policy "Admins can update verification document reviews"
on public.verification_documents for update to authenticated
using (
  private.is_current_user_admin()
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.app_role
  )
)
with check (
  private.is_current_user_admin()
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.app_role
  )
);

revoke all on public.verification_documents from anon, authenticated;
grant select, insert, update on public.verification_documents to authenticated;

drop policy if exists "Admins can read verification requests" on public.verification_requests;
drop policy if exists "Users can read their own verification requests" on public.verification_requests;
create policy "Owners and admins can read verification requests"
on public.verification_requests for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_current_user_admin()
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.app_role
  )
);
