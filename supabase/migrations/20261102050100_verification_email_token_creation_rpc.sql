create or replace function public.create_verification_email_action_tokens(
  p_request_id uuid, p_approved_hash text, p_rejected_hash text, p_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_approved_hash is null or length(p_approved_hash) <> 64
     or p_rejected_hash is null or length(p_rejected_hash) <> 64
     or p_approved_hash = p_rejected_hash
     or p_expires_at <= now()
     or p_expires_at > now() + interval '25 hours' then
    raise exception 'Invalid email action token payload';
  end if;
  if not exists (select 1 from public.verification_requests where id = p_request_id and status = 'pending') then
    raise exception 'Pending verification request not found';
  end if;
  insert into private.verification_email_action_tokens(request_id, action, token_hash, expires_at)
  values (p_request_id, 'approved', p_approved_hash, p_expires_at),
         (p_request_id, 'rejected', p_rejected_hash, p_expires_at);
end;
$function$;
revoke all on function public.create_verification_email_action_tokens(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_verification_email_action_tokens(uuid,text,text,timestamptz) to service_role;
