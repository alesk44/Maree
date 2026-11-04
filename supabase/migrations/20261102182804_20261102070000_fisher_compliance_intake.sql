-- Fisher eligibility and Jersey compliance declarations for Marée.
alter table public.verification_requests
  add column if not exists fisher_category text
    check (fisher_category is null or fisher_category in ('independent', 'professional')),
  add column if not exists compliance_details jsonb not null default '{}'::jsonb;

comment on column public.verification_requests.fisher_category is
  'Applicant-selected pathway. Independent fishers are prioritised; this does not waive commercial fishing or food-law requirements.';
comment on column public.verification_requests.compliance_details is
  'Applicant declarations and reference details for manual admin review. These are not proof of regulatory approval.';
