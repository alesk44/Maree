-- Admin-only read access for platform-wide operational reporting.
-- Does not expose these datasets to anonymous or ordinary authenticated users.
create policy "Admins can read all orders"
on public.orders
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.app_role
  )
);

create policy "Admins can read all catch lots"
on public.catches
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.app_role
  )
);
