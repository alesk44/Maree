-- Admin-only transactional review of verification requests.
create or replace function public.review_verification_request(
  p_request_id uuid,
  p_status public.verification_status,
  p_reviewer_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := auth.uid();
  v_req public.verification_requests%rowtype;
begin
  if v_admin is null or not exists (
    select 1 from public.profiles p where p.id = v_admin and p.role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;
  if p_status not in ('approved'::public.verification_status, 'rejected'::public.verification_status) then
    raise exception 'Invalid review status';
  end if;
  if p_reviewer_note is not null and length(p_reviewer_note) > 2000 then
    raise exception 'Reviewer note is too long';
  end if;
  select * into v_req from public.verification_requests where id = p_request_id for update;
  if not found then raise exception 'Verification request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'Request has already been reviewed'; end if;
  update public.verification_requests
  set status = p_status, reviewer_note = nullif(trim(p_reviewer_note), ''),
      reviewed_by = v_admin, reviewed_at = now()
  where id = p_request_id;
  if p_status = 'approved' then
    update public.profiles set role = v_req.requested_role where id = v_req.user_id;
  end if;
end;
$function$;

revoke all on function public.review_verification_request(uuid, public.verification_status, text) from public, anon;
grant execute on function public.review_verification_request(uuid, public.verification_status, text) to authenticated;
