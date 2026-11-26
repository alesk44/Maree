-- Provide an invoice recipient only to the other party on a delivered order.
-- Private business emails stay out of the public profile and directory APIs.
create or replace function public.get_my_order_invoice_contact(p_order_id uuid)
returns table (
  order_id uuid,
  recipient_name text,
  recipient_email text,
  species text,
  quantity_kg numeric,
  unit_price numeric,
  product_subtotal numeric,
  delivered_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.id,
    recipient.display_name,
    coalesce(nullif(btrim(recipient.business_email), ''), nullif(btrim(recipient_auth.email), '')),
    c.species,
    o.quantity_kg,
    coalesce(o.unit_price_snapshot, c.price_per_kg),
    coalesce(o.product_subtotal, round(o.quantity_kg * coalesce(o.unit_price_snapshot, c.price_per_kg), 2)),
    coalesce(o.delivered_at, o.updated_at)
  from public.orders as o
  join public.catches as c on c.id = o.catch_id
  join public.profiles as caller on caller.id = (select auth.uid())
  join public.profiles as recipient on recipient.id = case
    when o.restaurant_id = (select auth.uid()) then coalesce(o.fisher_id_snapshot, c.fisher_id)
    else o.restaurant_id
  end
  left join auth.users as recipient_auth on recipient_auth.id = recipient.id
  where o.id = p_order_id
    and o.status = 'delivered'::public.order_status
    and (select auth.uid()) is not null
    and (
      (o.restaurant_id = (select auth.uid())
        and caller.role = 'restaurant'::public.app_role
        and recipient.role = 'fisher'::public.app_role)
      or
      (coalesce(o.fisher_id_snapshot, c.fisher_id) = (select auth.uid())
        and caller.role = 'fisher'::public.app_role
        and recipient.role = 'restaurant'::public.app_role)
    );
$function$;

revoke all on function public.get_my_order_invoice_contact(uuid) from public, anon, authenticated;
grant execute on function public.get_my_order_invoice_contact(uuid) to authenticated;

comment on function public.get_my_order_invoice_contact(uuid) is
  'Returns a counterpart billing email and delivered product-order details only to the restaurant or fisher on that order.';
