# Phase 1 source baseline — T001

**Captured:** 2026-09-06T23:13:39.840098+00:00 (2026-09-07 Africa/Cairo). **Evidence:** Q01 source/document inspection only.
**Commit:** `7457b7028811759736faa799a8b06b43691b1218`. **Branch:** `034-web-project-memory`, preserved.
**Production revision/data/services:** UNKNOWN; not queried.

## Scope accepted

The maintainer requested Phase 1 / Setup after approving the 036 planning package. This accepts T001 and T002 only. Write scope is `specs/036-audit-remediation/` evidence and tracking documents, `docs/PROJECT_GUIDE.md`, and `PROJECT_MEMORY.md`. References to runtime paths in T002 grant read access for the inventory, not permission to change them.

No application source/schema/migration/dependency/config edits, application tests, builds, DB/Redis/provider requests, service processes, branch changes, commits, fetch/pull/push or deployment are part of this slice. Optional Git commit hooks are not executed. Existing ignore rules already exclude dependency/build/environment paths; they are inspected without edits.

## Frozen inventory and drift

[baseline-sources.json](baseline-sources.json) is the immutable pre-Phase-1 snapshot: 1,116 tracked/non-ignored untracked regular files, byte-based SHA-256, original reviewed SHA-256 when available, and two-character Git status. Empty status means clean tracked content; `??` means untracked. Missing reviewed hash means a new 036 planning artifact, not reviewed runtime code.

| Comparison | Observed result |
| --- | --- |
| Git HEAD -> current tree | 201 changed paths: 83 modified + 118 untracked; no staged paths/deletions at capture |
| Prior review -> planning handoff | 188 earlier paths + 13 new feature-036 planning files |
| 1,103 pre-planning file hashes -> Phase 1 start | 1,099 unchanged; only `.specify/feature.json`, `AGENTS.md`, `docs/PROJECT_GUIDE.md`, `PROJECT_MEMORY.md` changed for planning |
| Prior planning final hash capture -> Phase 1 start | Only the final `PROJECT_MEMORY.md` synchronization differs; freshness tool reports CURRENT |
| Runtime drift since reviewed snapshot | Zero changed/added/removed application files; no audit finding reopened for source drift |
| Current running deployment | Not established by Git or local source hashes |

Hash casing is normalized before comparison. Hash coverage is not a claim that every unchanged file was line-by-line audited. Ignored/generated/dependency/environment/runtime files are excluded by Git discovery; binary assets are hashed without reading/displaying their contents. No secret values, provider payloads or live rows appear in this manifest.

## Audit source reconciliation

Every source below exists in the frozen manifest. Runtime file hashes still match the reviewed snapshot; referenced line numbers were checked against current file lengths. The audit classification/financial conclusions are preserved, not promoted to runtime success.

| Finding | Current source pointers | Repair/verification owner tasks | Drift |
| --- | --- | --- | --- |
| AUD-001 | `src/app/api/store/subscriptions/[id]/route.ts:74`; `src/lib/store-subscription-payment-claim.ts:103`; `src/app/api/store/subscriptions/[id]/select-package/route.ts:290` | T013, T014 | Unchanged source bytes |
| AUD-002 | `worker/src/utils/error-handler.ts:97`; `worker/src/http-queue-processor.ts:6011` | T006, T007, T008 | Unchanged source bytes |
| AUD-003 | `worker/src/http-queue-processor.ts:2933`; `worker/src/lib/fulfillment-finalization.ts:682`; `prisma/schema.prisma:1208` | T003, T004, T009, T010 | Unchanged source bytes |
| AUD-004 | `src/lib/store-subscription.ts:198`; `src/lib/operations/financial-review-refund-finalization.ts:233`; `src/lib/renewal-payment-refund-finalization.ts:81` | T020, T021, T022, T023 | Unchanged source bytes |
| AUD-005 | `src/app/api/operations/start-renewal/route.ts:21`; `src/lib/auth-utils.ts:38`; `src/lib/auth-utils.ts:343` | T002, T027, T028, T029 | Unchanged source bytes |
| AUD-006 | `src/lib/operation-dispatch.ts:54`; `src/app/api/operations/[id]/apply-promo/route.ts:89` | T015, T016, T017 | Unchanged source bytes |
| AUD-007 | `worker/src/http-queue-processor.ts:3343`; `worker/src/lib/renewal-no-charge-finalization.ts:105` | T011, T012 | Unchanged source bytes |
| AUD-008 | `src/components/admin/financial-review/FinancialReviewClient.tsx:815`; `src/lib/operations/manual-fulfillment-finalization.ts:137` | T024, T026, T045 | Unchanged source bytes |
| AUD-009 | `src/app/api/store/subscriptions/[id]/route.ts:65` | T043, T044, T045 | Unchanged source bytes |
| AUD-010 | `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql:37`; `worker/src/pool/account-pool-manager.ts:99` | T035, T036, T055 | Unchanged source bytes |
| AUD-011 | `scripts/verify-sold-report-contract-correlation.ts:249`; `shared/operations/renewal-fulfillment-config.ts:7` | T037, T038, T053 | Unchanged source bytes |
| AUD-012 | `src/lib/operations/manual-fulfillment-finalization.ts:200`; `src/lib/operations/financial-review-refund-finalization.ts:175` | T024, T025, T026, T040, T052 | Unchanged source bytes |
| AUD-013 | `prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql:5`; `prisma/migrations/20260824160000_store_subscription_credit_ledger/migration.sql:16` | T003, T004, T005, T039, T040, T052, T055 | Unchanged source bytes |
| AUD-014 | `src/lib/operation-dispatch.ts:271`; `src/lib/maintenance/operation-maintenance-runner.ts:155`; `src/app/api/cron/dispatch-operation-jobs/route.ts:24` | T002, T030, T031, T034 | Unchanged source bytes |
| AUD-015 | `src/app/api/mobile/subscriptions/check/route.ts:43`; `src/app/api/mobile/subscriptions/renew/route.ts:44` | T046, T047, T054 | Unchanged source bytes |
| AUD-016 | `ecosystem.config.js:70`; `worker/src/customer-index.ts:70`; `worker/ecosystem.config.js` | T002, T041, T042, T055 | Unchanged source bytes |
| AUD-017 | `src/lib/store-subscription-payment-claim.ts:132`; `src/app/api/store/subscriptions/[id]/heartbeat/route.ts:62` | T018, T019 | Unchanged source bytes |
| AUD-018 | `worker/src/lib/fulfillment-finalization.ts:693`; `worker/src/http-queue-processor.ts:4124`; `worker/src/lib/activity-tracker.ts:22` | T032, T033, T034 | Unchanged source bytes |
| AUD-019 | `.github/workflows/ci.yml:85`; `tests/integration/mobile-renewal-payment-finalization-db.test.ts`; `tests/integration/store-subscription-payment-finalization-db.test.ts`; `tests/integration/renewal-payment-refund-finalization-db.test.ts` | T048, T049, T050, T051 | Unchanged source bytes |
| AUD-020 | `AGENTS.md`; `package.json`; `ecosystem.config.js`; `specs/036-audit-remediation/spec.md` | T001, T002, T042, T050, T051, T052, T053, T054, T055, T056, T057, T058 | Runtime refs unchanged; planning refs intentionally updated |

## Spec Kit preparation evidence

- Specify version 0.12.17 is installed; Codex integration has zero missing managed files.
- Six customized shared scripts/templates are the same versions inspected during planning; preserve them, with no forced upgrade.
- Prerequisites resolve `specs/036-audit-remediation` with research, data model, contracts, quickstart and tasks present.
- Requirements checklist: 16/16 complete; safety/coverage checklist: 24/24 complete. These are quality-of-requirements checks.
- Accepted task graph: T001 has no prerequisite; T002 depends only on T001. T003 onward stays unstarted.
- Existing constitution and all 20 AUD / 31 FR mappings are retained.

## Revalidation rule

For later work, enumerate with `git ls-files -c -o --exclude-standard -z`, hash bytes with SHA-256 and compare by path to this frozen snapshot. Compare both changed and missing paths; classify new paths separately. Any runtime drift touching a finding requires reopening its evidence before implementing that finding. Do not regenerate this baseline over the original capture.

Current Phase 1 evidence and tracking files are expected later differences; final scope verification is recorded in [phase-1-verification.md](phase-1-verification.md). Q02–Q12 remain NOT_RUN. Source checks establish the local baseline only.
