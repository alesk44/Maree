-- Authenticated transactional entry points for the restaurant/fisher workflow.
-- Both functions enforce role/ownership checks internally and use a locked search_path.

-- Atomic reservation endpoint: locks the lot before checking/decrementing stock.
create function public.reserve_catch(
  p_catch_id uuid,
  p_quantity_kg numeric,
  p_requested_slot timestamptz,
  p_fulfilment text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role;
  v_catch public.catches%rowtype;
  v_order_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role is distinct from 'restaurant'::public.app_role then
    raise exception 'Only restaurant accounts can place orders';
  end if;

  if p_quantity_kg is null or p_quantity_kg < 0.5 or mod(p_quantity_kg, 0.5) <> 0 then
    raise exception 'Quantity must be at least 0.5 kg in 0.5 kg increments';
  end if;
  if p_requested_slot is null or p_requested_slot <= now() then
    raise exception 'Requested slot must be in the future';
  end if;
  if p_fulfilment is null or p_fulfilment not in ('delivery', 'collection') then
    raise exception 'Invalid fulfilment method';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Note is too long';
  end if;

  select c.* into v_catch
  from public.catches c
  where c.id = p_catch_id
  for update;

  if not found or v_catch.status <> 'available' then
    raise exception 'Catch lot is not available';
  end if;
  if p_quantity_kg > v_catch.remaining_kg then
    raise exception 'Requested quantity exceeds available stock';
  end if;

  insert into public.orders (
    catch_id, restaurant_id, quantity_kg, requested_slot, fulfilment, note
  ) values (
    p_catch_id, v_user_id, p_quantity_kg, p_requested_slot, p_fulfilment, nullif(trim(p_note), '')
  ) returning id into v_order_id;

  update public.catches
  set remaining_kg = remaining_kg - p_quantity_kg,
      status = case when remaining_kg - p_quantity_kg = 0 then 'sold_out'::public.catch_status else 'available'::public.catch_status end
  where id = p_catch_id;

  return v_order_id;
end;
$body$;

revoke all on function public.reserve_catch(uuid, numeric, timestamptz, text, text) from public, anon;
grant execute on function public.reserve_catch(uuid, numeric, timestamptz, text, text) to authenticated;

-- Allow the owner of a catch to advance its order through the fulfilment workflow.
create or replace function public.update_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.order_status;
  v_fisher_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('confirmed'::public.order_status, 'ready'::public.order_status, 'delivered'::public.order_status) then
    raise exception 'Invalid target status';
  end if;

  select o.status, c.fisher_id
    into v_current, v_fisher_id
  from public.orders o
  join public.catches c on c.id = o.catch_id
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'Order not found';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'fisher'::public.app_role
  ) then
    raise exception 'Only fisher accounts can update orders';
  end if;

  if v_fisher_id <> v_user_id then
    raise exception 'Only the lot owner can update this order';
  end if;

  if not (
    (v_current = 'submitted'::public.order_status and p_status = 'confirmed'::public.order_status) or
    (v_current = 'confirmed'::public.order_status and p_status = 'ready'::public.order_status) or
    (v_current = 'ready'::public.order_status and p_status = 'delivered'::public.order_status)
  ) then
    raise exception 'Invalid order status transition';
  end if;

  update public.orders set status = p_status where id = p_order_id;
end;
$$;

revoke all on function public.update_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.update_order_status(uuid, public.order_status) to authenticated;
