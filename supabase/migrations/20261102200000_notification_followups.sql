-- Second notification tranche: verification decisions and monthly billing lifecycle.
-- All lifecycle events reuse the recipient-scoped notifications table and its existing RLS contract.
-- All rows are created by trusted database triggers; browser clients still cannot insert notifications.

create or replace function private.create_verification_result_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_title text;
  v_body text;
begin
  if old.status is not distinct from new.status
     or new.status not in ('approved'::public.verification_status, 'rejected'::public.verification_status) then
    return new;
  end if;

  if new.status = 'approved'::public.verification_status then
    v_title := 'Vérification approuvée';
    v_body := 'Votre compte a été vérifié. Vous pouvez maintenant accéder à votre espace professionnel.';
  else
    v_title := 'Vérification refusée';
    v_body := 'Votre demande de vérification a été refusée. Consultez votre espace pour connaître la suite.';
  end if;

  insert into public.notifications
    (user_id, event_type, title, body, href, metadata, dedupe_key)
  values
    (new.user_id,
     'verification_' || new.status::text,
     v_title,
     v_body,
     '/verification',
     jsonb_build_object('request_id', new.id, 'status', new.status),
     'verification:' || new.id::text || ':result:' || new.status::text || ':' || new.user_id::text)
  on conflict (dedupe_key) do nothing;

  return new;
end;
$function$;

revoke all on function private.create_verification_result_notification() from public, anon, authenticated;

drop trigger if exists verification_requests_result_notification on public.verification_requests;
create trigger verification_requests_result_notification
  after update of status on public.verification_requests
  for each row execute function private.create_verification_result_notification();


create or replace function private.create_fisher_invoice_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications
      (user_id, event_type, title, body, href, metadata, dedupe_key)
    values
      (new.fisher_id, 'fisher_invoice_created', 'Nouvelle facture mensuelle disponible',
       'Votre relevé mensuel de produits est disponible dans votre espace pêcheur.',
       '/espace-pecheur',
       jsonb_build_object('invoice_id', new.id, 'period_start', new.period_start, 'period_end', new.period_end, 'subtotal', new.subtotal),
       'fisher-invoice:' || new.id::text || ':created:' || new.fisher_id::text),
      (new.restaurant_id, 'restaurant_fisher_invoice_created', 'Nouvelle facture pêcheur reçue',
       'Un relevé mensuel de produits est disponible dans votre espace restaurant.',
       '/restaurant',
       jsonb_build_object('invoice_id', new.id, 'period_start', new.period_start, 'period_end', new.period_end, 'subtotal', new.subtotal),
       'fisher-invoice:' || new.id::text || ':created:' || new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  elsif old.status is distinct from new.status and new.status = 'paid' then
    insert into public.notifications
      (user_id, event_type, title, body, href, metadata, dedupe_key)
    values
      (new.restaurant_id, 'fisher_invoice_paid', 'Paiement de facture confirmé',
       'Le pêcheur a confirmé la réception du règlement de votre facture mensuelle.',
       '/restaurant',
       jsonb_build_object('invoice_id', new.id, 'paid_at', new.paid_at),
       'fisher-invoice:' || new.id::text || ':paid:' || new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  elsif old.status is distinct from new.status and new.status = 'void' then
    insert into public.notifications
      (user_id, event_type, title, body, href, metadata, dedupe_key)
    values
      (new.restaurant_id, 'fisher_invoice_voided', 'Facture pêcheur annulée',
       'Une facture mensuelle de produits a été annulée. Consultez votre espace restaurant.',
       '/restaurant',
       jsonb_build_object('invoice_id', new.id),
       'fisher-invoice:' || new.id::text || ':void:' || new.restaurant_id::text),
      (new.fisher_id, 'fisher_invoice_voided', 'Facture mensuelle annulée',
       'Un relevé mensuel de produits a été annulé. Consultez votre espace pêcheur.',
       '/espace-pecheur',
       jsonb_build_object('invoice_id', new.id),
       'fisher-invoice:' || new.id::text || ':void:' || new.fisher_id::text)
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$function$;

revoke all on function private.create_fisher_invoice_notifications() from public, anon, authenticated;

drop trigger if exists fisher_monthly_invoice_notifications on public.fisher_monthly_invoices;
create trigger fisher_monthly_invoice_notifications
  after insert or update of status on public.fisher_monthly_invoices
  for each row execute function private.create_fisher_invoice_notifications();


create or replace function private.create_maree_invoice_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications
      (user_id, event_type, title, body, href, metadata, dedupe_key)
    values
      (new.restaurant_id, 'maree_invoice_created', 'Votre relevé Marée est disponible',
       'Votre relevé mensuel de commission et de livraison est disponible.',
       '/restaurant',
       jsonb_build_object('invoice_id', new.id, 'period_start', new.period_start, 'period_end', new.period_end,
         'commission_total', new.commission_total, 'delivery_total', new.delivery_total),
       'maree-invoice:' || new.id::text || ':created:' || new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  elsif old.status is distinct from new.status and new.status = 'declared_paid' then
    for v_admin_id in
      select p.id from public.profiles p where p.role = 'admin'::public.app_role
      union
      select au.user_id from private.admin_users au
    loop
      insert into public.notifications
        (user_id, event_type, title, body, href, metadata, dedupe_key)
      values
        (v_admin_id, 'maree_invoice_payment_declared', 'Paiement Marée à vérifier',
         'Un restaurant a déclaré le règlement de son relevé mensuel.',
         '/admin',
         jsonb_build_object('invoice_id', new.id, 'restaurant_id', new.restaurant_id,
           'payment_method', new.payment_method, 'payment_reference', new.payment_reference),
         'maree-invoice:' || new.id::text || ':declared:' || v_admin_id::text)
      on conflict (dedupe_key) do nothing;
    end loop;
  elsif old.status is distinct from new.status and new.status = 'paid' then
    insert into public.notifications
      (user_id, event_type, title, body, href, metadata, dedupe_key)
    values
      (new.restaurant_id, 'maree_invoice_payment_verified', 'Paiement Marée confirmé',
       'L’administration a vérifié le règlement de votre relevé mensuel.',
       '/restaurant',
       jsonb_build_object('invoice_id', new.id, 'verified_at', new.verified_at),
       'maree-invoice:' || new.id::text || ':verified:' || new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  elsif old.status is distinct from new.status and new.status = 'void' then
    insert into public.notifications
      (user_id, event_type, title, body, href, metadata, dedupe_key)
    values
      (new.restaurant_id, 'maree_invoice_voided', 'Relevé Marée annulé',
       'Votre relevé mensuel Marée a été annulé. Consultez votre espace restaurant.',
       '/restaurant',
       jsonb_build_object('invoice_id', new.id),
       'maree-invoice:' || new.id::text || ':void:' || new.restaurant_id::text)
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$function$;

revoke all on function private.create_maree_invoice_notifications() from public, anon, authenticated;

drop trigger if exists maree_monthly_commission_invoice_notifications on public.maree_monthly_commission_invoices;
create trigger maree_monthly_commission_invoice_notifications
  after insert or update of status on public.maree_monthly_commission_invoices
  for each row execute function private.create_maree_invoice_notifications();
