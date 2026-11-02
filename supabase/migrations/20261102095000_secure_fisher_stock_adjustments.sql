-- Fisher inventory edits must not restore stock already reserved by restaurants.
-- Stock can only be reduced from the current remaining balance; replenishment uses a new catch lot.
create or replace function public.update_catch_inventory(
  p_catch_id uuid,
  p_remaining_kg numeric default null,
  p_price_per_kg numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_fisher_id uuid;
  v_current_remaining numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_remaining_kg is null and p_price_per_kg is null then
    raise exception 'No inventory changes supplied';
  end if;
  if p_remaining_kg is not null and (p_remaining_kg < 0 or p_remaining_kg > 10000) then
    raise exception 'Invalid remaining stock quantity';
  end if;
  if p_price_per_kg is not null and (p_price_per_kg < 0 or p_price_per_kg > 10000) then
    raise exception 'Invalid price';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'fisher'::public.app_role
  ) then
    raise exception 'Only fisher accounts can edit catch inventory';
  end if;

  select c.fisher_id, c.remaining_kg
    into v_fisher_id, v_current_remaining
  from public.catches c
  where c.id = p_catch_id
  for update;

  if not found or v_fisher_id <> v_user_id then
    raise exception 'Catch not found or not owned by this fisher';
  end if;

  if p_remaining_kg is not null and p_remaining_kg > v_current_remaining then
    raise exception 'Stock cannot be increased on an existing lot; publish a new lot instead';
  end if;

  update public.catches
  set remaining_kg = coalesce(p_remaining_kg, remaining_kg),
      price_per_kg = coalesce(p_price_per_kg, price_per_kg),
      status = case
        when coalesce(p_remaining_kg, remaining_kg) = 0 then 'sold_out'::public.catch_status
        else 'available'::public.catch_status
      end
  where id = p_catch_id;
end;
$function$;

revoke all on function public.update_catch_inventory(uuid, numeric, numeric) from public, anon;
grant execute on function public.update_catch_inventory(uuid, numeric, numeric) to authenticated;

-- All browser-side catch edits now go through the ownership-checked RPC.
revoke update on table public.catches from authenticated;
