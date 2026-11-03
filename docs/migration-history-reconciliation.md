# Supabase migration history reconciliation

Date: 2026-11-03  
Scope: isolated Git branch only. No production migration, migration repair, schema change, or deployment was executed.

## Read-only findings

- Production migration ledger: 44 versions.
- Repository `main`: 42 SQL migration files.
- Isolated branch before reconciliation: 45 SQL migration files (42 baseline + 3 PR #11 migrations).
- Fourteen baseline files already had an exact version match.
- Twenty-six baseline files matched a production migration by functional name but used a different local timestamp.
- Two production ledger entries were duplicates of earlier named migrations, recorded with a filename-prefixed name.
- Two production versions had no source file in any inspected current/feature branch: `20261102043901_enforce_verified_fisher_catch_permissions` and `20261102043926_add_fisher_compliance_intake_fields`.
- Two local historical files had no matching production ledger version: `20261101010000_public_fisher_directory_and_order_status.sql` and `20261101210000_rpc_entrypoints.sql`.

## Version alignment

The following 26 existing SQL files were renamed only; their SQL contents were preserved byte-for-byte. Each new filename uses the exact production version and migration name.

| Previous file | Reconciled file | Action |
|---|---|---|
| `20261101211000_verification_request_indexes.sql` | `20261102010243_verification_request_indexes.sql` | version locale alignée sur l'entrée distante |
| `20261101213000_admin_reporting_read_policies.sql` | `20261102010307_admin_reporting_read_policies.sql` | version locale alignée sur l'entrée distante |
| `20261102010400_harden_update_order_status.sql` | `20261102010343_harden_update_order_status.sql` | version locale alignée sur l'entrée distante |
| `20261102030000_business_and_fisher_profile_details.sql` | `20261102015457_business_and_fisher_profile_details.sql` | version locale alignée sur l'entrée distante |
| `20261102040000_owner_scoped_private_profile_read.sql` | `20261102031941_owner_scoped_private_profile_read.sql` | version locale alignée sur l'entrée distante |
| `20261102050000_verification_email_action_links.sql` | `20261102032605_verification_email_action_links.sql` | version locale alignée sur l'entrée distante |
| `20261102050100_verification_email_token_creation_rpc.sql` | `20261102032644_verification_email_token_creation_rpc.sql` | version locale alignée sur l'entrée distante |
| `20261102060000_profile_avatars.sql` | `20261102040258_profile_avatars.sql` | version locale alignée sur l'entrée distante |
| `20261102070000_fisher_compliance_intake.sql` | `20261102182804_20261102070000_fisher_compliance_intake.sql` | version locale alignée sur l'entrée distante |
| `20261102090000_secure_fisher_compliance_documents_and_listing_gate.sql` | `20261102043827_secure_fisher_compliance_documents_and_listing_gate.sql` | version locale alignée sur l'entrée distante |
| `20261102093000_restrict_private_profile_columns.sql` | `20261102182817_20261102093000_restrict_private_profile_columns.sql` | version locale alignée sur l'entrée distante |
| `20261102095000_secure_fisher_stock_adjustments.sql` | `20261102182823_20261102095000_secure_fisher_stock_adjustments.sql` | version locale alignée sur l'entrée distante |
| `20261102110000_delivery_and_monthly_fisher_billing.sql` | `20261102182915_delivery_and_monthly_fisher_billing.sql` | version locale alignée sur l'entrée distante |
| `20261102130000_allow_fisher_order_refusal.sql` | `20261102182925_allow_fisher_order_refusal.sql` | version locale alignée sur l'entrée distante |
| `20261102131000_realtime_order_status_updates.sql` | `20261102182931_realtime_order_status_updates.sql` | version locale alignée sur l'entrée distante |
| `20261102140000_buyer_cancellation_policy.sql` | `20261102182934_buyer_cancellation_policy.sql` | version locale alignée sur l'entrée distante |
| `20261102150000_external_traceability_records.sql` | `20261102182938_external_traceability_records.sql` | version locale alignée sur l'entrée distante |
| `20261102160000_index_traceability_and_compliance_foreign_keys.sql` | `20261102182942_index_traceability_and_compliance_foreign_keys.sql` | version locale alignée sur l'entrée distante |
| `20261102170000_consolidate_permissive_rls_policies.sql` | `20261102182945_consolidate_permissive_rls_policies.sql` | version locale alignée sur l'entrée distante |
| `20261102180000_restaurant_order_catch_visibility.sql` | `20261102182952_restaurant_order_catch_visibility.sql` | version locale alignée sur l'entrée distante |
| `20261102190000_persistent_notifications.sql` | `20261102183001_persistent_notifications.sql` | version locale alignée sur l'entrée distante |
| `20261102200000_notification_followups.sql` | `20261102183009_notification_followups.sql` | version locale alignée sur l'entrée distante |
| `20261102210000_account_balances_tips_and_settlements.sql` | `20261102183154_account_balances_tips_and_settlements.sql` | version locale alignée sur l'entrée distante |
| `20261102211000_fix_fisher_monthly_invoice_idempotency.sql` | `20261102184312_fix_fisher_monthly_invoice_idempotency.sql` | version locale alignée sur l'entrée distante |
| `20261103120000_harden_traceability_role_guard.sql` | `20261103112321_harden_traceability_role_guard.sql` | version locale alignée sur l'entrée distante |
| `20261103150000_reconcile_monthly_invoice_generators.sql` | `20261103115826_reconcile_monthly_invoice_generators.sql` | version locale alignée sur l'entrée distante |

## Historical entries without recoverable source

The two missing source migrations are represented by comment-only compatibility files at their exact production versions:
- `20261102043901_enforce_verified_fisher_catch_permissions.sql`: the approved-fisher catch INSERT/UPDATE policies are already created by the later canonical `20261102043827_secure_fisher_compliance_documents_and_listing_gate.sql`; live policy definitions were checked read-only.
- `20261102043926_add_fisher_compliance_intake_fields.sql`: both `verification_requests.fisher_category` and `compliance_details` are added idempotently by the canonical secure-compliance migration and reasserted by the later compliance-intake migration; live columns were checked read-only.

Two further duplicate ledger entries are comment-only compatibility files:
- `20261102182759_20261102060000_profile_avatars.sql`, because the same named migration is already recorded at `20261102040258`.
- `20261102182810_20261102090000_secure_fisher_compliance_documents_and_listing_gate.sql`, because the same named migration is already recorded at `20261102043827`.

The original SQL source for these four ledger entries could not be recovered from the repository or inspected branches. The no-op files are a documented reconstruction of the final schema sequence, not a claim to have recovered the original SQL byte-for-byte. The later canonical migrations carry the verified final effects. A clean local reset and all database contract tests must pass before this mapping can be treated as accepted.

## Obsolete local-only files

Two local files had no corresponding production ledger version and would otherwise be pending on a future `db push`. Their old behavior is unsafe to replay:
- `20261101010000_public_fisher_directory_and_order_status.sql` would reintroduce a broad `Public fisher directory` policy. Live RLS instead has the narrower anonymous verified-fisher policy and authenticated permitted-profile policy; the public directory is exposed through the hardened view. This file is now comment-only.
- `20261101210000_rpc_entrypoints.sql` would create a legacy five-argument `reserve_catch` overload. Live production has only the six-argument tip-aware/billing-aware SECURITY DEFINER RPC with empty search_path. The hardened order-status RPC is supplied by the later canonical migration. This file is now comment-only.

## Expected deployment delta after validation

After the clean local reset and the read-only ledger comparison, only the three isolated PR #11 migrations remain pending against the current production ledger:
- `20261103160000_recheck_fisher_eligibility_on_reservation.sql`
- `20261103170000_bind_email_review_action_to_token.sql`
- `20261103180000_add_missing_foreign_key_indexes.sql`

This expected delta is not a deployment authorization. Do not run `supabase db push`, `supabase migration repair`, SQL DDL, Edge Function deploy, Cloudflare deploy, or merge without separate explicit approval. Before any production operation, re-run `migration list`, inspect its exact output, and obtain a reviewed backup/rollback plan.


## Admin-managed commercial settings (2026-11-03)

An additional isolated migration, `20261103190000_admin_managed_delivery_payer.sql`, adds admin-managed commission and delivery rates and a global delivery payer choice (`buyer` or `fisher`). The reservation RPC snapshots the payer. Existing orders keep the historical buyer-paid allocation.

- Buyer-paid delivery is included in the restaurant total and Marée monthly delivery statement.
- Fisher-paid delivery is excluded from the restaurant total and Marée delivery receivable, and deducted from fisher immediate/monthly proceeds.
- Fisher statements retain gross products and tips, show delivery deductions separately, and calculate net payout as products + tips - deductions.
- Marée commission remains restaurant-paid in either mode.
- New contract test: `delivery_fee_payer_contract.test.sql`.

This additional migration and related UI changes remain isolated and have not been applied to production.
