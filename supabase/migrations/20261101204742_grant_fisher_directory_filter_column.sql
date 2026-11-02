-- The invoker-security view filters on profiles.role, so callers need that
-- single additional column privilege; RLS still limits rows to fisher profiles.
grant select (role) on table public.profiles to anon, authenticated;
