-- Narrow, stable view for public fisher directory cards.
create or replace view public.public_fisher_directory as
select id, display_name, boat_name, home_port, fishing_method, bio, since_year
from public.profiles
where role = 'fisher'::public.app_role;
