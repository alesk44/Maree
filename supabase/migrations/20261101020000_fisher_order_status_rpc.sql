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
