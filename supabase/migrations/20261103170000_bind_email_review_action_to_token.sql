-- Bind the confirmation page's displayed action to the action stored with the one-time token.
-- Reject mismatches before consuming the token or changing the verification request.
drop function if exists public.review_verification_request_by_email_token(text);

create function public.review_verification_request_by_email_token(
  p_token_hash text,
  p_expected_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_action_token private.verification_email_action_tokens%rowtype;
  v_req public.verification_requests%rowtype;
begin
  if p_token_hash is null or length(p_token_hash) <> 64
    or p_expected_action is null
    or p_expected_action not in ('approved', 'rejected') then
    raise exception 'Invalid or expired approval link';
  end if;

  select * into v_action_token
  from private.verification_email_action_tokens
  where token_hash = p_token_hash
  for update;

  if not found or v_action_token.consumed_at is not null or v_action_token.expires_at <= now() then
    raise exception 'This approval link is invalid, expired, or already used';
  end if;

  if v_action_token.action::text <> p_expected_action then
    raise exception 'Action does not match this confirmation link';
  end if;

  select * into v_req
  from public.verification_requests
  where id = v_action_token.request_id
  for update;

  if not found or v_req.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  update private.verification_email_action_tokens
  set consumed_at = now()
  where id = v_action_token.id;

  update public.verification_requests
  set status = v_action_token.action,
      reviewer_note = case when v_action_token.action = 'approved'
        then 'Approved from the administrator email confirmation link.'
        else 'Rejected from the administrator email confirmation link.' end,
      reviewed_by = null,
      reviewed_at = now()
  where id = v_req.id;

  if v_action_token.action = 'approved' then
    update public.profiles
    set role = v_req.requested_role
    where id = v_req.user_id;
  end if;

  return v_action_token.action::text;
end;
$function$;

revoke all on function public.review_verification_request_by_email_token(text,text) from public, anon, authenticated;
grant execute on function public.review_verification_request_by_email_token(text,text) to service_role;
