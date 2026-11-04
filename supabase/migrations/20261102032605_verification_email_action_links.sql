create table if not exists private.verification_email_action_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.verification_requests(id) on delete cascade,
  action public.verification_status not null check (action in ('approved','rejected')),
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table private.verification_email_action_tokens enable row level security;
revoke all on private.verification_email_action_tokens from public, anon, authenticated;

create or replace function public.review_verification_request_by_email_token(p_token_hash text)
returns text language plpgsql security definer set search_path = ''
as $function$
declare
  v_action_token private.verification_email_action_tokens%rowtype;
  v_req public.verification_requests%rowtype;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 then raise exception 'Invalid or expired approval link'; end if;
  select * into v_action_token from private.verification_email_action_tokens where token_hash = p_token_hash for update;
  if not found or v_action_token.consumed_at is not null or v_action_token.expires_at <= now() then raise exception 'This approval link is invalid, expired, or already used'; end if;
  select * into v_req from public.verification_requests where id = v_action_token.request_id for update;
  if not found or v_req.status <> 'pending' then raise exception 'This request has already been reviewed'; end if;
  update private.verification_email_action_tokens set consumed_at = now() where id = v_action_token.id;
  update public.verification_requests set status = v_action_token.action,
    reviewer_note = case when v_action_token.action = 'approved' then 'Approved from the administrator email confirmation link.' else 'Rejected from the administrator email confirmation link.' end,
    reviewed_by = null, reviewed_at = now() where id = v_req.id;
  if v_action_token.action = 'approved' then update public.profiles set role = v_req.requested_role where id = v_req.user_id; end if;
  return v_action_token.action::text;
end;
$function$;
revoke all on function public.review_verification_request_by_email_token(text) from public, anon, authenticated;
grant execute on function public.review_verification_request_by_email_token(text) to service_role;
