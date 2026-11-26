-- Fictional, idempotent fixtures for the isolated Cloudflare/Supabase preview only.
-- Do not apply this file to production. The fixed QR tokens intentionally expose only these demo lots.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000101', 'demo-gorey@example.test'),
  ('00000000-0000-4000-8000-000000000102', 'demo-sthelier@example.test'),
  ('00000000-0000-4000-8000-000000000103', 'demo-rozel@example.test')
on conflict (id) do update set email = excluded.email;

update public.profiles set
  role = 'fisher',
  display_name = 'Profil démo · Gorey',
  phone = null,
  business_email = null,
  boat_name = 'Harbour Sample',
  home_port = 'Gorey',
  fishing_method = 'Casiers',
  bio = 'Profil entièrement fictif, créé pour présenter la maquette Marée Jersey.',
  since_year = 2020
where id = '00000000-0000-4000-8000-000000000101';

update public.profiles set
  role = 'fisher',
  display_name = 'Profil démo · St Helier',
  phone = null,
  business_email = null,
  boat_name = 'Sea Example',
  home_port = 'St Helier',
  fishing_method = 'Ligne',
  bio = 'Profil entièrement fictif, créé pour présenter la maquette Marée Jersey.',
  since_year = 2019
where id = '00000000-0000-4000-8000-000000000102';

update public.profiles set
  role = 'fisher',
  display_name = 'Profil démo · Rozel',
  phone = null,
  business_email = null,
  boat_name = 'North Sample',
  home_port = 'Rozel',
  fishing_method = 'Filet maillant',
  bio = 'Profil entièrement fictif, créé pour présenter la maquette Marée Jersey.',
  since_year = 2021
where id = '00000000-0000-4000-8000-000000000103';

insert into public.verification_requests (
  id, user_id, requested_role, business_name, contact_name, phone,
  evidence_note, status, fisher_category, compliance_details
) values
  ('30000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','fisher','DÉMO — profil fictif Gorey','Profil de démonstration','N/A — données fictives','Enregistrement synthétique pour la maquette. Ne correspond pas à une activité réelle.','approved','independent','{"demo":true}'::jsonb),
  ('30000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102','fisher','DÉMO — profil fictif St Helier','Profil de démonstration','N/A — données fictives','Enregistrement synthétique pour la maquette. Ne correspond pas à une activité réelle.','approved','independent','{"demo":true}'::jsonb),
  ('30000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000103','fisher','DÉMO — profil fictif Rozel','Profil de démonstration','N/A — données fictives','Enregistrement synthétique pour la maquette. Ne correspond pas à une activité réelle.','approved','independent','{"demo":true}'::jsonb)
on conflict (id) do update set
  business_name = excluded.business_name,
  contact_name = excluded.contact_name,
  phone = excluded.phone,
  evidence_note = excluded.evidence_note,
  status = excluded.status,
  fisher_category = excluded.fisher_category,
  compliance_details = excluded.compliance_details;

insert into public.catches (
  id, fisher_id, species, zone, caught_at, landed_at,
  quantity_kg, remaining_kg, price_per_kg, grade, method,
  storage_instructions, status
) values
  ('10000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','Homard bleu','Côte est — Gorey',now()-interval '5 hours',now()-interval '3 hours',8,8,34,'500–800 g','Casiers','Exemple fictif — vivant, conserver au frais.', 'available'),
  ('10000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102','Bar de ligne','Baie de St Aubin',now()-interval '4 hours',now()-interval '2 hours',6,6,24,'1–2 kg','Ligne','Exemple fictif — conserver sur glace.', 'available'),
  ('10000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000103','Coquille Saint-Jacques','Plateau des Minquiers',now()-interval '7 hours',now()-interval '5 hours',12,12,18,'11 cm+','Plongée','Exemple fictif — conserver au frais.', 'available')
on conflict (id) do update set
  fisher_id = excluded.fisher_id,
  species = excluded.species,
  zone = excluded.zone,
  caught_at = excluded.caught_at,
  landed_at = excluded.landed_at,
  quantity_kg = excluded.quantity_kg,
  remaining_kg = excluded.remaining_kg,
  price_per_kg = excluded.price_per_kg,
  grade = excluded.grade,
  method = excluded.method,
  storage_instructions = excluded.storage_instructions,
  status = excluded.status;

insert into private.catch_public_traceability_tokens (catch_id, token) values
  ('10000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000101'),
  ('10000000-0000-4000-8000-000000000102','90000000-0000-4000-8000-000000000102'),
  ('10000000-0000-4000-8000-000000000103','90000000-0000-4000-8000-000000000103')
on conflict (catch_id) do update set token = excluded.token;

commit;
