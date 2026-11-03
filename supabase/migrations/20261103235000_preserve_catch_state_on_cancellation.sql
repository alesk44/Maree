-- Preserve a fisher's manually reserved listing state when an order is cancelled/refused.
-- Only sold-out listings are automatically re-opened when stock is restored.
create or replace function public.request_order_cancellation(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_order public.orders%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role is distinct from 'restaurant'::public.app_role then
    raise exception 'Only restaurant accounts can request cancellation';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and restaurant_id = v_user_id
  for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('submitted'::public.order_status, 'confirmed'::public.order_status) then
    raise exception 'This order can no longer be cancelled';
  end if;
  if v_order.cancellation_request_status in ('pending','offered','rejected') then
    raise exception 'Cancellation request has already been processed or is awaiting a response';
  end if;
  if v_order.requested_slot <= now() then raise exception 'The requested slot has already started'; end if;

  if v_order.requested_slot >= now() + interval '24 hours' then
    perform 1 from public.catches c where c.id = v_order.catch_id for update;
    if not found then raise exception 'Catch lot not found'; end if;
    update public.catches
    set remaining_kg = remaining_kg + v_order.quantity_kg,
        status = case
          when status = 'sold_out'::public.catch_status
               and remaining_kg + v_order.quantity_kg > 0
            then 'available'::public.catch_status
          else status
        end
    where id = v_order.catch_id;
    update public.orders
    set status = 'cancelled'::public.order_status,
        cancellation_request_status = 'approved',
        cancellation_requested_at = now(),
        cancellation_decided_at = now(),
        cancellation_penalty = 0
    where id = p_order_id;
    return 'cancelled';
  end if;

  update public.orders
  set cancellation_request_status = 'pending',
      cancellation_requested_at = now(),
      cancellation_decided_at = null,
      cancellation_penalty = 0
  where id = p_order_id;
  return 'requested';
end;
$function$;

revoke all on function public.request_order_cancellation(uuid) from public, anon;
grant execute on function public.request_order_cancellation(uuid) to authenticated;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_current public.order_status;
  v_fisher_id uuid;
  v_catch_id uuid;
  v_quantity numeric(8,2);
  v_role public.app_role;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_status not in ('confirmed'::public.order_status,'ready'::public.order_status,
      'delivered'::public.order_status,'cancelled'::public.order_status) then
    raise exception 'Invalid target status';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role is distinct from 'fisher'::public.app_role then
    raise exception 'Only fisher accounts can update orders';
  end if;

  select o.status,coalesce(o.fisher_id_snapshot,c.fisher_id),o.catch_id,o.quantity_kg
  into v_current,v_fisher_id,v_catch_id,v_quantity
  from public.orders o join public.catches c on c.id=o.catch_id
  where o.id=p_order_id for update of o;
  if not found then raise exception 'Order not found'; end if;
  if v_fisher_id <> v_user_id then raise exception 'Only the lot owner can update this order'; end if;

  if p_status = 'cancelled'::public.order_status then
    if v_current <> 'submitted'::public.order_status then
      raise exception 'Only submitted orders can be refused';
    end if;
    perform 1 from public.catches c where c.id=v_catch_id for update;
    if not found then raise exception 'Catch lot not found'; end if;
    update public.catches
    set remaining_kg=remaining_kg+v_quantity,
        status=case
          when status='sold_out'::public.catch_status
               and remaining_kg+v_quantity>0
            then 'available'::public.catch_status
          else status
        end
    where id=v_catch_id;
    update public.orders set status='cancelled'::public.order_status where id=p_order_id;
    return;
  end if;

  if not (
    (v_current='submitted'::public.order_status and p_status='confirmed'::public.order_status) or
    (v_current='confirmed'::public.order_status and p_status='ready'::public.order_status) or
    (v_current='ready'::public.order_status and p_status='delivered'::public.order_status)
  ) then raise exception 'Invalid order status transition'; end if;

  update public.orders
  set status=p_status,
      delivered_at=case when p_status='delivered'::public.order_status then now() else delivered_at end
  where id=p_order_id;
end;
$function$;

revoke all on function public.update_order_status(uuid,public.order_status) from public,anon;
grant execute on function public.update_order_status(uuid,public.order_status) to authenticated;
