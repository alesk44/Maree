-- Keep public fisher cards readable without exposing private profile contact data.
-- Revoke broad table grants inherited from the initial setup, then grant only
-- the columns required by the public catalogue and authenticated role checks.
revoke all privileges on table public.profiles from anon, authenticated;

grant select (id, display_name, boat_name, home_port, fishing_method, bio, since_year)
  on table public.profiles to anon;

grant select (id, role, display_name, boat_name, home_port, fishing_method, bio, since_year)
  on table public.profiles to authenticated;

-- Users may update their own display name only. Phone numbers remain private
-- and are not selectable by browser roles.
grant update (display_name)
  on table public.profiles to authenticated;

-- Keep the RLS policies as the row-level boundary: anonymous users see only
-- verified fisher rows; authenticated users see their own row or public fisher rows.
