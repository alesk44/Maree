-- Admin access is separate from the user's business role.
-- This lets one account retain its restaurant/fisher role and also administer the platform.
create schema if not exists private;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.admin_users enable row level security;
revoke all on private.admin_users from public, anon, authenticated;

-- Keep SECURITY DEFINER code outside the API-exposed public schema.
-- The explicit auth.uid() check ensures unauthenticated calls always return false.
create or replace function private.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.admin_users a
      where a.user_id = (select auth.uid())
    );
$function$;

revoke all on function private.is_current_user_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_current_user_admin() to authenticated;

-- Public RPC wrapper is SECURITY INVOKER; privileged lookup stays in private schema.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.is_current_user_admin();
$function$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists "Admins can read all orders" on public.orders;
create policy "Admins can read all orders"
on public.orders for select to authenticated
using ((select public.is_current_user_admin()));

drop policy if exists "Admins can read all catch lots" on public.catches;
create policy "Admins can read all catch lots"
on public.catches for select to authenticated
using ((select public.is_current_user_admin()));

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles for select to authenticated
using ((select public.is_current_user_admin()));

-- Grant admin access to the confirmed account while preserving its restaurant role.
insert into private.admin_users (user_id)
select id
from auth.users
where id = '780bc2e2-b40f-45f9-87b1-4ccec3391454'::uuid
on conflict (user_id) do nothing;

-- In local CI databases this real production account is absent, so the SELECT
-- inserts zero rows. The production migration grants admin only if the account exists.

-- The separate admin grant must authorize the existing verification workflow too.
-- Keep legacy profile.role='admin' accounts working during the transition.
drop policy if exists "Admins can read verification requests" on public.verification_requests;
create policy "Admins can read verification requests"
on public.verification_requests for select to authenticated
using (
  (select private.is_current_user_admin())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.app_role
  )
);

drop policy if exists "Admins can review verification requests" on public.verification_requests;
create policy "Admins can review verification requests"
on public.verification_requests for update to authenticated
using (
  (select private.is_current_user_admin())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.app_role
  )
)
with check (
  (select private.is_current_user_admin())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'::public.app_role
  )
);

-- Use the same separate admin grant in the transactional review RPC.
create or replace function public.review_verification_request(
  p_request_id uuid,
  p_status public.verification_status,
  p_reviewer_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_req public.verification_requests%rowtype;
begin
  if v_admin is null or not (
    private.is_current_user_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = v_admin and p.role = 'admin'::public.app_role
    )
  ) then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('approved'::public.verification_status, 'rejected'::public.verification_status) then
    raise exception 'Invalid review status';
  end if;
  if p_reviewer_note is not null and length(p_reviewer_note) > 2000 then
    raise exception 'Reviewer note is too long';
  end if;
  select * into v_req
  from public.verification_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Verification request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'Request has already been reviewed'; end if;

  update public.verification_requests
  set status = p_status,
      reviewer_note = nullif(trim(p_reviewer_note), ''),
      reviewed_by = v_admin,
      reviewed_at = now()
  where id = p_request_id;

  if p_status = 'approved' then
    update public.profiles
    set role = v_req.requested_role
    where id = v_req.user_id;
  end if;
end;
$function$;

revoke all on function public.review_verification_request(uuid, public.verification_status, text) from public, anon;
grant execute on function public.review_verification_request(uuid, public.verification_status, text) to authenticated;
