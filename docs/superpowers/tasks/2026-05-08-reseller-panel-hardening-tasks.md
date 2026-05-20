# Reseller Panel Hardening Task Checklist

Use this checklist to track execution. It mirrors the implementation plan but is shorter for day-to-day progress tracking.

## Execution Log

- [x] Phase 1 committed: `12e5c2b fix(auth): harden session authorization claims`.
- [x] Phase 2 committed: `fix(operations): keep bein sessions server-side`.
- [x] Balance Safety committed: `fix(finance): guard balance mutations`.
- [x] Active Card Guard committed: `fix(operations): enforce active card guard`.
- [x] Queue Durability and Worker Account Locking committed: `fix(operations): add durable dispatch and account locks`.
- [x] Financial Operation Safety Speckit Phase 1 baseline completed: `specs/001-financial-operation-safety/baseline.md`.

## Financial Operation Safety Speckit

- [x] Phase 1 baseline only: read Speckit documents, inspected payment/cancel/refund risk branches, confirmed refund idempotency migration, and ran compile/build checks.
- [x] Phase 2 outcome model completed: added final Pay outcome categories and refund-safety helper without changing refund behavior.
- [x] Phase 3 US1 completed: uncertain post-Pay outcomes now move to review instead of automatic refund in worker confirmation paths.
- [x] Phase 4 US2 completed: late cancellation during final payment now moves to review without refund.
- [x] Phase 5 US3 completed: timeout cleanup no longer refunds deducted `COMPLETING` operations; rollout checklist added.
- [x] Phase 6 US4 completed: pre-payment cache boundaries documented and noisy final Pay debug logs reduced.
- [x] Phase 7 admin review visibility completed: review-required audit evidence and integrity summary output added without schema changes.
- [x] Phase 8 local verification completed: Prisma generate, TypeScript, worker build, targeted ESLint, diff check, mojibake scan, US1 simulations, and US2 simulations passed.
- [ ] Phase 8 staging gate pending: safe renewal smoke test, card-check smoke test, live balance reconciliation, and uncertain-outcome refund audit still require staging/production data access.

## Exclusions

- [x] Confirm Mobile app routes are excluded.
- [x] Confirm Store app routes are excluded.
- [x] Confirm current scope is reseller panel, beIN worker, reseller balance, reseller operations, admin/manager APIs.

## High-Sensitivity Files

- [x] Treat `worker/src/http-queue-processor.ts` as high-risk.
- [x] Treat `worker/src/http/HttpClientService.ts` as high-risk.
- [x] Review diffs for touched sensitive files manually before every commit.
- [x] Do not reformat either file.
- [x] Do not move large blocks in either file.

## Auth

- [x] Remove unsafe JWT session merge in `src/lib/auth.config.ts`.
- [x] Make API role authorization use current DB role.
- [x] Reject disabled users.
- [x] Reject stale tokens after password/security-state change.
- [ ] Test USER cannot access admin route.
- [ ] Test demoted manager loses manager access.

## beIN Session Exposure

- [x] Redact session fields from `src/app/api/operations/[id]/route.ts`.
- [x] Stop writing beIN session snapshots into `Operation.responseData`.
- [x] Move session snapshots to Redis/server-only storage.
- [x] Add script or migration to purge existing session snapshots.
- [x] Verify operation API response redaction path removes cookies/session/ViewState.
- [ ] Manually test a live operation API response with real operation data.

## Balance Safety

- [x] Fix atomic debit in `src/app/api/operations/create/route.ts`.
- [x] Fix atomic debit in `src/app/api/operations/bulk/route.ts`.
- [x] Fix admin balance withdrawal/deposit guards.
- [x] Fix manager transfer guards.
- [x] Fix manager create-user initial balance debit guard.
- [x] Add DB non-negative balance constraint or migration plan.
- [ ] Test concurrent deductions.

## Active Card Guard

- [x] Add DB-backed guard for one active operation per card.
- [x] Apply guard to single create flow.
- [x] Apply guard to bulk flow.
- [x] Convert guard conflict to clean API error.
- [ ] Test concurrent same-card requests.

## Queue Durability

- [x] Add durable operation dispatch outbox or equivalent.
- [x] Write outbox row in same transaction as operation/debit.
- [x] Add dispatcher or retry path.
- [x] Do not silently swallow queue failure after debit.
- [ ] Test Redis down scenario.

## Worker Account Locking

- [x] Acquire Redis lock before returning selected beIN account.
- [x] Skip locked accounts.
- [ ] Renew lock during long operations.
- [x] Release lock in success paths.
- [x] Release lock in failure paths.
- [x] Release lock in cancel/timeout paths.
- [ ] Test two workers cannot use same account.

## Worker Logs and TLS

- [x] Remove cookie/session logging.
- [x] Remove TOTP logging.
- [x] Remove CAPTCHA answer/API key logging.
- [x] Add `worker/logs/*.log` to `.gitignore`.
- [x] Remove tracked worker log files from git index.
- [x] Remove global `NODE_TLS_REJECT_UNAUTHORIZED = '0'` from reseller worker and keepalive paths.
- [ ] Test worker HTTPS flow in staging.

## Credential Encryption

- [x] Encrypt beIN TOTP secrets.
- [x] Encrypt proxy passwords.
- [x] Backfill existing plaintext values.
- [x] Add encrypted marker/version.
- [x] Remove silent plaintext fallback after backfill.
- [ ] Run `npx tsx scripts/backfill-credential-encryption.ts --dry-run`.
- [ ] Run `npx tsx scripts/backfill-credential-encryption.ts` after backup.

## Refund Idempotency

- [x] Add unique refund guard.
- [x] Update `src/lib/refund.ts` to rely on DB idempotency.
- [x] Treat duplicate refund conflict as already refunded.
- [ ] Test cancel and timeout refund race.

## Cancellation Race

- [x] Add guarded worker status update helper.
- [x] Replace unguarded active-state writes.
- [x] Stop worker if operation is terminal.
- [x] Test cancel while worker is mid-flow.

## Verification

- [x] Run targeted ESLint for edited app files.
- [ ] Run full `npm run lint`.
- [ ] Run `npm run build`.
- [x] Run `cmd /c npm --prefix worker run build`.
- [x] Run `cmd /c npx tsc --noEmit --pretty false`.
- [x] Run `cmd /c npx prisma generate`.
- [x] Run US1 final-payment simulations.
- [x] Run US2 cancellation-race simulations.
- [x] Run `git diff --check`.
- [x] Search for sensitive log patterns.
- [x] Search touched files for mojibake patterns.
- [x] Review sensitive-file diffs manually.
- [ ] Run staging renewal smoke test with safe test card/account.
- [ ] Run staging card-check smoke test.
- [ ] Confirm no customer balance changed outside expected transaction records.
- [ ] Confirm no automatic refund was created for uncertain post-payment outcomes.
- [ ] Prepare release notes and rollback notes.

## Speckit 002: Renewal Safety and beIN Spend Ledger - Phase 1 Baseline

- [x] Read `AGENTS.md` and confirmed edit constraints: use `apply_patch`, no risky PowerShell text rewrites, no full-file rewrites, no Mobile/Store scope expansion.
- [x] Read `specs/002-renewal-safety-bein-ledger/spec.md`; user stories are cancellation/renewal step order, refund/timeout safety, final charged beIN account ledger, admin date-range spend reports, and production-safe rollout.
- [x] Read `specs/002-renewal-safety-bein-ledger/plan.md`; planned files exist or are intentionally future files for later phases.
- [x] Read `specs/002-renewal-safety-bein-ledger/research.md`; key decisions are no `COMPLETING`-only final-pay marker, shared refund safety, separate confirmed spend ledger, and additive rollout.
- [x] Read `specs/002-renewal-safety-bein-ledger/data-model.md`; `Operation.beinAccountId` remains assigned/current beIN account and must not become the confirmed charged account.
- [x] Read contracts in `specs/002-renewal-safety-bein-ledger/contracts/`.
- [x] Inspected cancellation flow. Current baseline gap: `src/lib/cancellation-safety.ts` still treats `COMPLETING` as final-payment-started without phase evidence.
- [x] Inspected worker final purchase and cancel-confirm flow. Current baseline gap: `worker/src/http-queue-processor.ts` still has `hasFinalPaymentStarted(status)` returning true for `COMPLETING` only.
- [x] Inspected refund helpers. Current baseline gap: `src/lib/refund.ts` blocks completed/review refunds, but `worker/src/utils/error-handler.ts` lacks the same operation-status guard inside refund transaction.
- [x] Inspected timeout and cleanup jobs. Current baseline gap: `timeout-operations` uses `COMPLETING && amount > 0`, while `cleanup-stuck-operations` still refunds any stale amount-positive heartbeat operation.
- [x] Inspected beIN account schema and admin account route. Both root and worker Prisma schemas include `Operation.beinAccountId`, `BeinAccount.dealerBalance`, and `BeinAccount.proxyId`; admin beIN account listing returns safe proxy/account display fields and does not return passwords.
- [x] Baseline verification: `cmd /c npx prisma generate` exited 0.
- [x] Baseline verification: `cmd /c npx tsc --noEmit --pretty false` exited 0.
- [x] Baseline verification: `cmd /c npm --prefix worker run build` exited 0.
- [x] Speckit prerequisite note: `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` rejected the current branch name because it is `codex-auth-phase-1-hardening`, not `002-*`; `.specify/feature.json` still points to `specs/002-renewal-safety-bein-ledger`, so Phase 1 was executed manually on the existing non-main branch.

## Speckit 002: Renewal Safety and beIN Spend Ledger - Phase 2 Foundation

- [x] Created `scripts/cancellation-phase-safety-simulations.ts` with fixtures for package-preparation `COMPLETING`, cancellation-confirm `COMPLETING`, final-pay-submitted `COMPLETING`, terminal status, and legacy final-confirmation status.
- [x] Created `scripts/refund-safety-simulations.ts` with source checks for worker refund transaction guards, terminal status blocking, duplicate refund idempotency, and final-pay guard presence.
- [x] Created `scripts/bein-spend-ledger-simulations.ts` with source/schema checks for the future confirmed beIN spend ledger and helpers.
- [x] Red check: `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` exited 1 as expected; current code incorrectly returns review for package-preparation and cancellation-confirm `COMPLETING`.
- [x] Red check: `cmd /c npx tsx scripts/refund-safety-simulations.ts` exited 1 as expected; current worker refund helper lacks operation-status and final-pay guards inside refund transaction.
- [x] Red check: `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` exited 1 as expected; confirmed spend ledger model and helpers do not exist yet.
- [x] Created `src/lib/operation-safety.ts` with shared safety types, phase evidence parsing stub, cancellation decision stub, refund decision stub, and conservative legacy fallback.
- [x] Updated `src/lib/cancellation-safety.ts` to delegate to `src/lib/operation-safety.ts` while preserving current route behavior because phase evidence is not passed by callers yet.
- [x] Verification: first `cmd /c npx tsc --noEmit --pretty false` exposed a wrapper type mismatch in `src/lib/cancellation-safety.ts`; fixed by reusing the shared `CancellationSafetyDecision` type.
- [x] Verification: second `cmd /c npx tsc --noEmit --pretty false` exited 0.

## Speckit 002: Renewal Safety and beIN Spend Ledger - Phase 3 US1

- [x] Updated `scripts/cancellation-phase-safety-simulations.ts` to call the shared operation safety decision with phase evidence.
- [x] Implemented phase parsing and merge helpers in `src/lib/operation-safety.ts`.
- [x] Updated final-pay detection so explicit `PACKAGE_PREPARATION`, `CANCELLATION_CONFIRM`, and `FINAL_CONFIRMATION` phases do not count as final Pay, while `FINAL_PAY_SUBMITTED`, `POST_FINAL_PAY_REVIEW`, and confirmed charge evidence do.
- [x] Preserved legacy conservative behavior: `COMPLETING` without phase evidence still counts as possible final Pay.
- [x] Added package-preparation phase evidence in `src/app/api/operations/[id]/select-package/route.ts`.
- [x] Added cancellation-confirm phase evidence in `src/app/api/operations/[id]/cancel-confirm/route.ts`.
- [x] Added final-confirmation and final-pay-submitted phase evidence in `src/app/api/operations/[id]/confirm-purchase/route.ts` for new and legacy confirm flows.
- [x] Updated `src/app/api/operations/[id]/cancel/route.ts` to decide cancellation using status, amount, response data, phase evidence, deduction transaction, and refund transaction state.
- [x] Updated `worker/src/http-queue-processor.ts` so `hasFinalPaymentStarted` uses phase evidence and so `CANCEL_CONFIRM` can complete when `COMPLETING` means cancellation-confirm, not final Pay.
- [x] Updated `worker/src/http-queue-processor.ts` to write final-pay-submitted evidence immediately before calling beIN final Pay.
- [x] Verification: `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` exited 0 with 5/5 passing.
- [x] Verification: `cmd /c npx tsc --noEmit --pretty false` exited 0.
- [x] Verification: `cmd /c npm --prefix worker run build` exited 0.

## Speckit 002: Renewal Safety and beIN Spend Ledger - Phase 4 US2

- [x] Expanded `scripts/refund-safety-simulations.ts` to cover worker completed/review refund blocks, duplicate refund idempotency, timeout/cleanup shared decisions, heartbeat amount-positive timeout handling, and guarded insufficient-balance revert.
- [x] Red check: `cmd /c npx tsx scripts/refund-safety-simulations.ts` exited 1 before implementation with 8/10 failing checks.
- [x] Updated `src/lib/operation-safety.ts` refund decision so completed/review-required and post-final-Pay evidence block refund, while safe pre-final cancelled/failed/expired states can still refund.
- [x] Updated `src/lib/refund.ts` so reseller refunds call `decideRefundSafety()` inside the Prisma transaction before incrementing balance and creating the refund transaction.
- [x] Updated `src/lib/refund.ts` so existing refund rows are treated as safe no-op.
- [x] Updated `worker/src/utils/error-handler.ts` so worker refunds re-read operation status and existing refund rows inside the same transaction before changing balance.
- [x] Updated `worker/src/utils/error-handler.ts` with final-pay evidence checks matching app refund safety.
- [x] Updated `src/app/api/operations/[id]/confirm-purchase/route.ts` insufficient-balance revert to guarded `updateMany` with expected `COMPLETING` and `amount: 0`.
- [x] Updated `src/app/api/operations/[id]/heartbeat/route.ts` so amount-positive expired final-confirmation operations use shared refund/review decision instead of silent cancel.
- [x] Updated `src/app/api/cron/timeout-operations/route.ts` to use shared refund decision and phase evidence before refund or review.
- [x] Updated `src/app/api/cron/cleanup-stuck-operations/route.ts` to use shared refund decision and move possible post-final-Pay stale operations to review.
- [x] Verification: `cmd /c npx tsx scripts/refund-safety-simulations.ts` exited 0 with 10/10 passing.
- [x] Verification: `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` exited 0 with 5/5 passing.
- [x] Verification: `cmd /c npx tsc --noEmit --pretty false` exited 0.
- [x] Verification: `cmd /c npm --prefix worker run build` exited 0.
- [x] Verification: targeted ESLint command exited 0.

## Speckit 002: Renewal Safety and beIN Spend Ledger - Phase 5 US3

- [x] Expanded `scripts/bein-spend-ledger-simulations.ts` to cover confirmed positive beIN balance delta, duplicate worker jobs, conflicting duplicate input, no ledger for unconfirmed/no-delta outcomes, and operation API exposure.
- [x] Red check: `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` exited 1 before implementation with 13/14 failing checks.
- [x] Added additive `BeinAccountSpendLedger` model to root and worker Prisma schemas.
- [x] Added additive migration `prisma/migrations/20260514090000_add_bein_operation_ledger/migration.sql`; it creates only the ledger table, unique `operation_id`, indexes, and foreign keys.
- [x] Created `worker/src/lib/bein-spend-ledger.ts` with `recordConfirmedBeinSpend()` requiring operation id, user id, final beIN account id, before/after dealer balances, positive spend amount, and `BALANCE_DELTA` evidence.
- [x] Implemented duplicate idempotency: matching duplicate jobs return the existing ledger row instead of creating another row.
- [x] Implemented conflict handling: different beIN account or spend amount returns `conflict_review_required` instead of overwriting the confirmed ledger.
- [x] Created `src/lib/bein-spend-ledger.ts` with report/read types for upcoming admin views.
- [x] Updated `worker/src/http-queue-processor.ts` to write confirmed ledger rows only after final Pay result has a positive beIN balance decrease.
- [x] Updated final purchase success, final purchase review, installment success, and installment review branches to use the same ledger helper.
- [x] Updated worker audit snapshot to include `chargedBeinLedgerId` when a ledger row exists.
- [x] Updated `src/app/api/operations/[id]/route.ts` to return nullable `chargedBeinAccount` from the ledger, separate from assigned `operation.beinAccountId`.
- [x] Verification: `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` exited 0 with 14/14 passing.
- [x] Verification: `cmd /c npx prisma generate` exited 0.
- [x] Verification: `cmd /c npx tsc --noEmit --pretty false` exited 0.
- [x] Verification: `cmd /c npm --prefix worker run build` exited 0 after fixing ledger helper null narrowing.

## Speckit 002: Renewal Safety and beIN Spend Ledger - Phase 6 US4

- [x] Expanded `scripts/bein-spend-ledger-simulations.ts` to check report helpers, admin-only API routes, date/page validation, credential-safe responses, UI controls, grouped account table, detail rows, and sidebar navigation.
- [x] Red check: `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` exited 1 before implementation with 8/23 failing checks.
- [x] Implemented `getBeinSpendSummary()` in `src/lib/bein-spend-ledger.ts` with date range, groupBy, beIN account, panel user, operation type, and confirmed-only ledger filters.
- [x] Implemented `getBeinSpendOperations()` in `src/lib/bein-spend-ledger.ts` with pagination and safe detail rows.
- [x] Added unconfirmed review counts from `REVIEW_REQUIRED` operations without adding them to confirmed spend totals.
- [x] Added admin-only summary route at `src/app/api/admin/reports/bein-spend/route.ts`.
- [x] Added admin-only paginated detail route at `src/app/api/admin/reports/bein-spend/operations/route.ts`.
- [x] Added validation for missing dates, invalid dates, inverted ranges, large ranges, and excessive page sizes.
- [x] Added admin page shell at `src/app/dashboard/admin/reports/bein-spend/page.tsx`.
- [x] Added `src/components/admin/reports/BeinSpendReportClient.tsx` with today/week/month/custom controls, account/user/type filters, summary cards, account table, and paginated detail table.
- [x] Added sidebar link for `beIN Spend Report` and translation keys in all translation files.
- [x] Verification: `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` exited 0 with 23/23 passing.
- [x] Verification: `cmd /c npx tsc --noEmit --pretty false` exited 0.
- [x] Verification: targeted ESLint command exited 0.

## Speckit 002: Renewal Safety and beIN Spend Ledger - Phase 7 US5

- [x] Added production rollout gate notes to `specs/002-renewal-safety-bein-ledger/quickstart.md`.
- [x] Added backup, worker pause/drain, additive migration, staging smoke test, report verification, rollback, and no-go conditions.
- [x] Added read-only SQL snapshots for total user balance, transaction counts by type, operation counts by status, and active financial operations.
- [x] Verification: `cmd /c npx prisma generate` exited 0.
- [x] Verification: `cmd /c npx tsc --noEmit --pretty false` exited 0.
- [x] Verification: `cmd /c npm --prefix worker run build` exited 0.
- [x] Verification: `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` exited 0 with 5/5 passing.
- [x] Verification: `cmd /c npx tsx scripts/refund-safety-simulations.ts` exited 0 with 10/10 passing.
- [x] Verification: `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` exited 0 with 23/23 passing.
- [x] Verification: `git diff --check` exited 0 with CRLF warnings only.
- [x] Verification: mojibake scan on added diff lines returned no matches.
- [ ] Staging evidence still required before production: pre-migration balance snapshot, transaction snapshot, migration application, safe renewal smoke test, cancellation-before-final-Pay smoke test, uncertain post-final-Pay test, spend report verification, no unexpected refund confirmation, and post-test balance reconciliation.
