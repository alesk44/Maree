-- Anonymous directory access is limited by RLS to fisher profiles.
create policy "Public can read verified fisher profiles"
  on public.profiles for select to anon, authenticated
  using (role = 'fisher');

grant select on public.profiles to anon;
