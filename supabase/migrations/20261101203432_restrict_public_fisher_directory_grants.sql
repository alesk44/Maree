-- Remove implicit/default browser access before granting the intended read path.
revoke all privileges on table public.public_fisher_directory from public, anon, authenticated;
