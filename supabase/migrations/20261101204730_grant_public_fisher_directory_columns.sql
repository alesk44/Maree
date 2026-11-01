-- Expose only the directory view, never the base profile table wholesale.
grant select on table public.public_fisher_directory to anon, authenticated;
