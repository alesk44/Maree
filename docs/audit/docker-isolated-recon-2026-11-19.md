# Marée Jersey — isolated technical reconnaissance

Date: 2026-11-19  
Repository: `alesk44/Maree`  
Audit branch: `work/docker-isolated-audit-20261119`  
Base commit: `6c1921d5f55d3e8567021c0f63fa07b35fe7a8ca`

## Scope and safety

This is a repository/CI-only review performed through GitHub read access. No Supabase production connection was used, no production database or secrets were read or changed, no migrations were applied, no Edge Function or Cloudflare deployment was triggered, and no pull request was merged.

The audit branch was created from `main` and initially compared identical to it (0 commits ahead, 0 behind, 0 changed files). This report is the only planned change on this branch. It does not change application code or database migrations.

## Verified current repository state

- `main` HEAD: `6c1921d5f55d3e8567021c0f63fa07b35fe7a8ca`.
- The audit branch was created at the same commit.
- `main` contains 51 SQL migration files, with the latest file `20261104001000_preserve_catch_state_on_inventory_edit.sql`.
- Five PRs are open and Draft: #3 owner command PWA, #5 traceability schema, #12 owner command PWA isolation, #13 owner/admin AAL2 hardening, and #15 seafood recognition/quota.
- Additional remote branches include accounting-ledger/tips, monthly invoice generator reconciliation, fisher payment double-count fix, Fishial V2 POC, and multiple older integration/security branches. They must be reconciled by exact commit ancestry and file-level diff before selecting code; do not merge them wholesale.
- The repository reports `main` as unprotected and the rulesets API returned an empty list. This is a governance risk: required reviews/status checks are not demonstrably enforced by branch protection. No protection settings were changed.

## CI evidence on the audit branch

Two GitHub Actions workflows ran automatically against the audit branch's base commit on 2026-11-19:

1. **Verify** — SUCCESS. Steps passed: frozen Bun install, Deno checks for the two deployed-source Edge Functions, application build, TypeScript, ESLint, and Vitest.
   Run: https://github.com/alesk44/Maree/actions/runs/44597867219
2. **Database Contract** — SUCCESS. Steps passed: Supabase CLI setup, local Supabase start, local database reset from repository migrations, and pgTAP database tests.
   Run: https://github.com/alesk44/Maree/actions/runs/44597867064

These results validate the unchanged base commit in GitHub Actions. They do not validate a Docker Cloud Sandbox run or any production environment.

## Existing draft release candidates

### PR #13 — owner/admin AAL2 hardening

- 19 changed files; includes an AAL2 database guard/migration, admin MFA UI, email-review hardening, and pgTAP contracts.
- The latest observed PR head was `ec6485e23d0aef7c6ace1fc54cc50e54a0a7c139`.
- Five PR workflows (Marée CI, Build verification, Verify, Supabase migration tests, Database Contract) completed successfully on that SHA on 2026-11-05.
- Its AAL2 contract tests cover AAL1 rejection for privileged admin actions, AAL2 acceptance for allowlisted admins, and rejection of non-allowlisted/profile-admin users.
- The production migration runbook and reconciliation documents are historical snapshots dated 2026-11-05. Their production observations must be rechecked before any release.
- Review gate: verify current owner TOTP enrollment and recovery readiness; recheck live Edge Function `verify_jwt` configuration and action-bound RPC deployment; verify backup/export and restore drill; test every admin mutation path with AAL1/AAL2 and non-admin identities.

### PR #15 — seafood recognition and quota

- 8 changed files; adds separate OpenAI and Fishial adapters, photo-recognition UI integration, a private quota ledger, and quota contract tests.
- The latest observed PR head was `d2ebf267628301a2fc7e7bb9810463012d6116e8`.
- Five PR workflows (Marée CI, Build verification, Verify, Supabase migration tests, Database Contract) completed successfully on that SHA on 2026-11-05.
- The quota design is 3 requests per user per rolling 10 minutes and 10 per user per rolling 24 hours, serialized with a per-user advisory transaction lock.
- The Fishial POC says the owner reported `FISHIAL_CLIENT_ID` and `FISHIAL_CLIENT_SECRET` configured in Supabase, but the adapter is not deployed. This report does not verify those secrets or their values.
- The OpenAI vision adapter requires `OPENAI_API_KEY`; API charges are separate from a ChatGPT subscription and are not covered by Docker compute credits. Do not configure or call it without explicit provider/spend approval.
- Fishial's free tier, image retention and commercial terms still require confirmation. Its docs also warn that an API key configured with an upload folder may store images in a Fishial Portal collection.
- Review gate: test request-body limits, quota behavior under concurrency, provider failure behavior, real image handling/retention, and curated Jersey species mapping before any deployment.

## Supabase migration and production evidence limits

- The repository migration directory currently has 51 files. The main branch includes the fisher eligibility, email-action binding, foreign-key index, cancellation-indemnity, catch-state preservation, and admin-managed delivery-payer migrations.
- PR #13's reconciliation/runbook records a production ledger snapshot from 2026-11-05 with 45 applied migrations and latest applied version `20261103220545_admin_managed_delivery_payer`; it records seven PR #13 migrations and one separate PR #15 migration as absent at that time. This is dated evidence only, not a live check on 2026-11-19.
- The same runbook records the production email-review Edge Function as `verify_jwt=false` at the time of that snapshot, and no verified manual backup/restore drill. Both items are release blockers until rechecked.
- No current production migration list, Auth MFA state, Edge Function version/configuration, Storage inventory, or backup state has been independently re-read in this session.

## Accounting and operational test inventory

The main branch contains focused database contracts for accounting, commission payment, delivery payer, monthly invoice generation, monthly billing atomicity/edge cases, security, foreign-key indexes, and fisher eligibility. It also contains separate shell tests for concurrent stock reservation and concurrent monthly billing generation.

The README and historical audit docs still require real two-account restaurant/fisher end-to-end verification. Passing pgTAP and CI does not prove the live UI, live data, emails, or real payment operations work.

## Next safe sequence when the workstation is available

1. Open the existing Docker sandbox only after checking its state and current compute pricing; keep it paused until needed.
2. Clone/fetch the repository and checkout `work/docker-isolated-audit-20261119`.
3. Confirm the local HEAD matches GitHub before running commands.
4. Run frozen install, Verify scripts, build, typecheck, lint, Vitest, local Supabase reset, pgTAP, and both concurrency scripts inside Docker.
5. Produce a fresh file-level audit of PRs #3/#5/#12/#13/#15 and the accounting fix branches; preserve separate feature boundaries.
6. Only after a local evidence pack exists, prepare isolated code corrections and repeat the full checks.

## Authorization update — 2026-11-19

The repository owner has since explicitly authorized conditional PR merges when the technical review finds a change safe, necessary, and adequately validated. The earlier blanket "no merge to main" line in this report is superseded. This is not a blanket instruction to merge any open PR: each candidate still requires exact-head review, dependency and migration-order checks, current green CI, and a clean mergeability check. PRs #3, #5, #12, #13 and #15 remain Draft in the latest metadata read; no review submissions or inline review threads were returned for #12, #13 or #15.

Fresh connector read on 2026-11-19 confirmed all five workflows completed successfully on the recorded PR heads:
- PR #13 head `ec6485e23d0aef7c6ace1fc54cc50e54a0a7c139`: Marée CI, Build verification, Verify, Supabase migration tests, Database Contract.
- PR #15 head `d2ebf267628301a2fc7e7bb9810463012d6116e8`: the same five workflows.

These workflow results are historical runs attached to those exact commits; they do not replace a new local Docker run or prove production readiness.

Additional current-head CI evidence:
- PR #12 head `31c86859a6d116ab168aa1c692da43e40331badf`: Database Contract, Build verification, Verify, and Marée CI all completed successfully.
- PR #5 head `a5c60c6bd7cea4689b5dc2fd388698a29de2fca0`: Verify and Supabase migration tests completed successfully. Important: PR #5 currently targets `feature/supabase-shared-data-v2`, not `main`; do not merge it until its base/dependency chain is deliberately reconciled.
- PR #3 head `66abf1655e6ad25fadd086f99262af725c85b356`: Verify completed successfully, but it changes 58 files including workflows, migrations and app code, and overlaps PR #12 on five public assistant files. It is not an equivalent or safe substitute for the isolated PR #12.

PR #12 is the narrowest owner-console candidate (8 static PWA files) and its latest four CI workflows are green. Its UI explicitly identifies itself as public and unauthenticated, states that GOD mode grants no privilege, and says the AI engine is not connected. Its service worker only caches same-origin static shell assets. It is a plausible future merge candidate after local Docker checks and final review; it has not been merged.

The following remain prohibited without separate explicit owner approval: production Supabase SQL or migration push/repair; production Auth setting changes; secret changes; Edge Function deployment; Cloudflare production deployment; live-data mutation; and paid API/provider activation. Conditional merge permission does not authorize any of these operations.
