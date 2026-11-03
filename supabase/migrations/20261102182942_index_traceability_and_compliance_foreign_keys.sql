-- Cover foreign-key lookups identified by the live Supabase performance advisor.
create index if not exists verification_email_action_tokens_request_idx
  on private.verification_email_action_tokens(request_id);
create index if not exists verification_documents_request_idx
  on public.verification_documents(request_id);
create index if not exists verification_documents_user_idx
  on public.verification_documents(user_id);
create index if not exists verification_documents_reviewed_by_idx
  on public.verification_documents(reviewed_by)
  where reviewed_by is not null;
create index if not exists catch_traceability_codes_scanned_by_idx
  on public.catch_traceability_codes(scanned_by);
create index if not exists catch_traceability_events_actor_idx
  on public.catch_traceability_events(actor_id);
