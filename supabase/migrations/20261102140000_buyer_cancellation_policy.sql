-- Buyer cancellation policy: free at least 24 hours before the requested slot;
-- late cancellation requires the fisher's explicit decision and chosen penalty.
alter table public.orders
  add column if not exists cancellation_request_status text not null default 'none'
    check (cancellation_request_status in ('none','pending','offered','approved','rejected')),
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_decided_at timestamptz,
  add column if not exists cancellation_penalty numeric(10,2) not null default 0
    check (cancellation_penalty >= 0);

create index if not exists orders_cancellation_pending_idx
  on public.orders(catch_id, cancellation_requested_at)
  where cancellation_request_status = 'pending';

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
  v_remaining numeric(8,2);
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
  if v_order.cancellation_request_status in ('pending','offered') then
    raise exception 'Cancellation request is already awaiting a response';
  end if;
  if v_order.requested_slot <= now() then raise exception 'The requested slot has already started'; end if;

  if v_order.requested_slot >= now() + interval '24 hours' then
    perform 1 from public.catches c where c.id = v_order.catch_id for update;
    if not found then raise exception 'Catch lot not found'; end if;
    select c.remaining_kg into v_remaining from public.catches c where c.id = v_order.catch_id;
    update public.catches
      set remaining_kg = remaining_kg + v_order.quantity_kg,
          status = case when remaining_kg + v_order.quantity_kg > 0
            then 'available'::public.catch_status else 'sold_out'::public.catch_status end
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

create or replace function public.decide_order_cancellation(
  p_order_id uuid,
  p_approve boolean,
  p_penalty numeric default 0
)
returns void
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
  if p_penalty is null or p_penalty < 0 then raise exception 'Invalid cancellation penalty'; end if;
  select p.role into v_role from public.profiles p where p.id = v_user_id;
  if v_role is distinct from 'fisher'::public.app_role then
    raise exception 'Only fisher accounts can decide late cancellations';
  end if;

  select o.* into v_order
  from public.orders o
  join public.catches c on c.id = o.catch_id
  where o.id = p_order_id
    and coalesce(o.fisher_id_snapshot, c.fisher_id) = v_user_id
  for update of o;
  if not found then raise exception 'Order not found for this fisher'; end if;
  if v_order.status not in ('submitted'::public.order_status, 'confirmed'::public.order_status)
     or v_order.cancellation_request_status <> 'pending' then
    raise exception 'No pending cancellation request for this order';
  end if;

  if p_approve then
    -- The fisher proposes a penalty; the buyer must explicitly accept it
    -- before the order is cancelled and stock is restored.
    update public.orders
      set cancellation_request_status = 'offered',
          cancellation_decided_at = now(),
          cancellation_penalty = round(p_penalty, 2)
      where id = p_order_id;
  else
    update public.orders
      set cancellation_request_status = 'rejected',
          cancellation_decided_at = now(),
          cancellation_penalty = 0
      where id = p_order_id;
  end if;
end;
$function$;

revoke all on function public.decide_order_cancellation(uuid, boolean, numeric) from public, anon;
grant execute on function public.decide_order_cancellation(uuid, boolean, numeric) to authenticated;

comment on column public.orders.cancellation_request_status is 'Buyer cancellation workflow: free cancellation approved automatically >=24h before slot; otherwise fisher decision required.';
comment on column public.orders.cancellation_penalty is 'Late-cancellation penalty selected by the owning fisher in GBP; zero means no penalty.';

create or replace function public.respond_order_cancellation(
  p_order_id uuid,
  p_accept boolean
)
returns void
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
    raise exception 'Only restaurant accounts can respond to a cancellation offer';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and restaurant_id = v_user_id
  for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.cancellation_request_status <> 'offered'
     or v_order.status not in ('submitted'::public.order_status, 'confirmed'::public.order_status) then
    raise exception 'No cancellation offer is awaiting your response';
  end if;

  if p_accept then
    perform 1 from public.catches c where c.id = v_order.catch_id for update;
    if not found then raise exception 'Catch lot not found'; end if;
    update public.catches
      set remaining_kg = remaining_kg + v_order.quantity_kg,
          status = case when remaining_kg + v_order.quantity_kg > 0
            then 'available'::public.catch_status else 'sold_out'::public.catch_status end
      where id = v_order.catch_id;
    update public.orders
      set status = 'cancelled'::public.order_status,
          cancellation_request_status = 'approved',
          cancellation_decided_at = now()
      where id = p_order_id;
  else
    update public.orders
      set cancellation_request_status = 'rejected',
          cancellation_decided_at = now(),
          cancellation_penalty = 0
      where id = p_order_id;
  end if;
end;
$function$;

revoke all on function public.respond_order_cancellation(uuid, boolean) from public, anon;
grant execute on function public.respond_order_cancellation(uuid, boolean) to authenticated;
