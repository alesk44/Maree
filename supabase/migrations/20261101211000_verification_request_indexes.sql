-- Support common verification inbox and reviewer lookups.
create index if not exists verification_requests_user_id_idx
  on public.verification_requests(user_id);
create index if not exists verification_requests_reviewed_by_idx
  on public.verification_requests(reviewed_by);
