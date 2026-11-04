-- Harden the traceability RPC role gate against NULL / missing profile roles.
-- Preserve the existing ownership checks and atomic writes.
create or replace function public.attach_external_traceability(
  p_catch_id uuid, p_order_id uuid, p_source_kind text, p_external_code text,
  p_source_url text, p_supplier_name text, p_received_at timestamptz,
  p_species text, p_quantity_kg numeric, p_note text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role public.app_role;
  v_catch_id uuid := p_catch_id;
  v_code_type text;
  v_code_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select p.role into v_role from public.profiles p where p.id = v_user_id;

  -- IS DISTINCT FROM treats NULL as unauthorized; plain NOT IN does not.
  if v_role is distinct from 'fisher'::public.app_role
     and v_role is distinct from 'restaurant'::public.app_role then
    raise exception 'Only fisher or restaurant accounts can attach traceability';
  end if;

  if p_source_kind is null or p_source_kind not in ('url','gs1','identifier')
     or p_external_code is null or length(btrim(p_external_code)) not between 1 and 2048
     or p_supplier_name is null or length(btrim(p_supplier_name)) not between 1 and 160
     or p_received_at is null or p_received_at > now()
     or p_species is null or length(btrim(p_species)) not between 1 and 100
     or p_quantity_kg is null or p_quantity_kg <= 0 or p_quantity_kg > 10000
     or (p_note is not null and length(p_note) > 1000)
     or (p_source_url is not null and (length(p_source_url) > 2048 or p_source_url !~* '^https://[^[:space:]]+$'))
     or (p_source_kind = 'url' and p_source_url is null) then
    raise exception 'Invalid traceability details';
  end if;

  v_code_type := case when p_source_kind = 'url' then 'https_url' else p_source_kind end;

  if v_role = 'restaurant'::public.app_role then
    if p_order_id is null then raise exception 'Restaurant traceability must reference one of its orders'; end if;
    select o.catch_id into v_catch_id from public.orders o
    where o.id = p_order_id and o.restaurant_id = v_user_id;
    if not found then raise exception 'Order not found for this restaurant'; end if;
    if p_catch_id is not null and p_catch_id <> v_catch_id then
      raise exception 'Order and catch do not match';
    end if;
  else
    if v_catch_id is null then raise exception 'Fisher traceability must reference an owned catch'; end if;
    if not exists (select 1 from public.catches c where c.id = v_catch_id and c.fisher_id = v_user_id) then
      raise exception 'Catch not found or not owned by this fisher';
    end if;
    if p_order_id is not null and not exists (
      select 1 from public.orders o where o.id = p_order_id and o.catch_id = v_catch_id
    ) then raise exception 'Order does not belong to this catch'; end if;
  end if;

  insert into public.catch_traceability_codes (
    catch_id, order_id, raw_code, code_type, source_url, source_label,
    scanned_by, supplier_name, received_at, species, quantity_kg, note
  ) values (
    v_catch_id, p_order_id, btrim(p_external_code), v_code_type, p_source_url,
    btrim(p_supplier_name), v_user_id, btrim(p_supplier_name), p_received_at,
    btrim(p_species), p_quantity_kg, nullif(btrim(p_note), '')
  ) returning id into v_code_id;

  insert into public.catch_traceability_events (
    catch_id, order_id, event_type, quantity_kg, note, metadata, actor_id, occurred_at
  ) values (
    v_catch_id, p_order_id, 'external_code_scanned', p_quantity_kg,
    nullif(btrim(p_note), ''),
    jsonb_build_object('traceability_code_id', v_code_id, 'code_type', v_code_type,
      'source_url', p_source_url, 'supplier_name', btrim(p_supplier_name),
      'species', btrim(p_species), 'received_at', p_received_at),
    v_user_id, p_received_at
  );
  return v_code_id;
end;
$function$;

revoke all on function public.attach_external_traceability(uuid,uuid,text,text,text,text,timestamptz,text,numeric,text) from public, anon;
grant execute on function public.attach_external_traceability(uuid,uuid,text,text,text,text,timestamptz,text,numeric,text) to authenticated;
