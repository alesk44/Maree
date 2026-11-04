-- Private fisher compliance evidence and server-enforced publishing eligibility.
alter table public.verification_requests
  add column if not exists fisher_category text
    check (fisher_category is null or fisher_category in ('independent', 'professional')),
  add column if not exists compliance_details jsonb not null default '{}'::jsonb;

create table if not exists public.verification_documents (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.verification_requests(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 document_type text not null check (document_type in ('fishing_licence','vessel_registration','business_licence','safety_training','species_permit','food_business_registration','food_safety_plan','other')),
 file_path text not null unique,
 original_filename text not null,
 mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
 size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
 expires_at date,
 review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','not_applicable')),
 reviewer_note text,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.verification_documents enable row level security;
drop policy if exists "Owners can view own verification documents" on public.verification_documents;
create policy "Owners can view own verification documents" on public.verification_documents for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Owners can attach documents to own requests" on public.verification_documents;
create policy "Owners can attach documents to own requests" on public.verification_documents for insert to authenticated with check (
 user_id = (select auth.uid()) and exists (select 1 from public.verification_requests vr where vr.id = request_id and vr.user_id = (select auth.uid()))
);
drop policy if exists "Admins can review verification documents" on public.verification_documents;
create policy "Admins can review verification documents" on public.verification_documents for all to authenticated
using (private.is_current_user_admin() or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::app_role))
with check (private.is_current_user_admin() or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::app_role));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fisher-compliance','fisher-compliance',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];
drop policy if exists "Fisher owns compliance uploads" on storage.objects;
create policy "Fisher owns compliance uploads" on storage.objects for insert to authenticated
with check (bucket_id='fisher-compliance' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Fisher reads own compliance uploads" on storage.objects;
create policy "Fisher reads own compliance uploads" on storage.objects for select to authenticated
using (bucket_id='fisher-compliance' and ((storage.foldername(name))[1]=(select auth.uid())::text or private.is_current_user_admin()));
drop policy if exists "Fisher deletes own compliance uploads" on storage.objects;
create policy "Fisher deletes own compliance uploads" on storage.objects for delete to authenticated
using (bucket_id='fisher-compliance' and ((storage.foldername(name))[1]=(select auth.uid())::text or private.is_current_user_admin()));
drop policy if exists "Fishers can publish their own lots" on public.catches;
drop policy if exists "Fishers can update their own lots" on public.catches;
drop policy if exists "Approved fishers only publish catches" on public.catches;
create policy "Approved fishers only publish catches" on public.catches for insert to authenticated
with check (fisher_id=(select auth.uid())
 and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='fisher'::app_role)
 and exists (select 1 from public.verification_requests vr where vr.user_id=(select auth.uid()) and vr.requested_role='fisher' and vr.status='approved'));
drop policy if exists "Approved fishers only update catches" on public.catches;
create policy "Approved fishers only update catches" on public.catches for update to authenticated
using (fisher_id=(select auth.uid())
 and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='fisher'::app_role)
 and exists (select 1 from public.verification_requests vr where vr.user_id=(select auth.uid()) and vr.requested_role='fisher' and vr.status='approved'))
with check (fisher_id=(select auth.uid())
 and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='fisher'::app_role)
 and exists (select 1 from public.verification_requests vr where vr.user_id=(select auth.uid()) and vr.requested_role='fisher' and vr.status='approved'));
comment on column public.verification_requests.fisher_category is 'Applicant-selected pathway; independent fishers are prioritised but commercial legal requirements still apply.';
comment on column public.verification_requests.compliance_details is 'Applicant declarations for manual review; not proof of regulatory approval.';
