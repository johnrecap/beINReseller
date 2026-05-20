# Tasks: Renewal Safety Corrections and beIN Spend Ledger

**Input**: Design documents from `specs/002-renewal-safety-bein-ledger/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. This feature protects live customer balances and real beIN dealer balance.

**Organization**: Tasks are grouped by user story so each phase is independently testable and can be stopped at a checkpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after dependencies are satisfied.
- **[Story]**: Maps to a user story from `spec.md`.
- Every task includes exact file paths.

## Phase 1: Setup and Baseline

**Purpose**: Establish safe context before any implementation work.

- [X] T001 Read `AGENTS.md` and confirm encoding rules, no risky PowerShell write APIs, no full-file rewrites, and no Mobile/Store changes.
- [X] T002 Read `specs/002-renewal-safety-bein-ledger/spec.md` and write down the five user stories in the implementation notes.
- [X] T003 Read `specs/002-renewal-safety-bein-ledger/plan.md` and confirm the source file list matches the current repository structure.
- [X] T004 Read `specs/002-renewal-safety-bein-ledger/research.md` and confirm the decisions: no status-only `COMPLETING` rule, shared refund safety, separate spend ledger.
- [X] T005 Read `specs/002-renewal-safety-bein-ledger/data-model.md` and confirm `Operation.beinAccountId` remains assigned/current account, not confirmed charged account.
- [X] T006 Read all contracts in `specs/002-renewal-safety-bein-ledger/contracts/` before touching code.
- [X] T007 Inspect current cancellation flow in `src/app/api/operations/[id]/cancel/route.ts`, `src/app/api/operations/[id]/cancel-confirm/route.ts`, and `src/lib/cancellation-safety.ts`.
- [X] T008 Inspect current final purchase flow in `src/app/api/operations/[id]/confirm-purchase/route.ts` and `worker/src/http-queue-processor.ts`.
- [X] T009 Inspect current refund helpers in `src/lib/refund.ts` and `worker/src/utils/error-handler.ts`.
- [X] T010 Inspect current timeout and cleanup jobs in `src/app/api/operations/[id]/heartbeat/route.ts`, `src/app/api/cron/timeout-operations/route.ts`, and `src/app/api/cron/cleanup-stuck-operations/route.ts`.
- [X] T011 Inspect current beIN account schema and admin account routes in `prisma/schema.prisma`, `worker/prisma/schema.prisma`, and `src/app/api/admin/bein-accounts/route.ts`.
- [X] T012 Run baseline checks: `cmd /c npx prisma generate`, `cmd /c npx tsc --noEmit --pretty false`, and `cmd /c npm --prefix worker run build`.
- [X] T013 Record baseline command results and current known gaps in `docs/superpowers/tasks/2026-05-08-reseller-panel-hardening-tasks.md`.

**Checkpoint**: No behavior changed. The implementer knows current flow and failure points.

---

## Phase 2: Foundational Tests and Shared Safety Contracts

**Purpose**: Create failing safety simulations before changing money behavior.

- [X] T014 [P] Create `scripts/cancellation-phase-safety-simulations.ts` with fixtures for package-preparation `COMPLETING`, cancellation-confirm `COMPLETING`, final-pay-submitted `COMPLETING`, terminal statuses, and legacy missing phase evidence.
- [X] T015 [P] Create `scripts/refund-safety-simulations.ts` with fixtures for no deduction, one deduction, existing refund, completed operation, review-required operation, and final-pay-may-have-started operation.
- [X] T016 [P] Create `scripts/bein-spend-ledger-simulations.ts` with fixtures for balance delta success, retry-before-charge, unconfirmed success, duplicate worker job, and conflicting duplicate ledger input.
- [X] T017 Run `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` and confirm it fails for the current false `COMPLETING` assumption.
- [X] T018 Run `cmd /c npx tsx scripts/refund-safety-simulations.ts` and confirm it fails for the worker refund guard gap.
- [X] T019 Run `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` and confirm it fails because the ledger helper/table does not exist yet.
- [X] T020 Create `src/lib/operation-safety.ts` with exported types only: `OperationPhaseEvidence`, `SafeRefundDecision`, `OperationSafetyInput`, and reason constants.
- [X] T021 Create `src/lib/operation-safety.ts` helper stubs that return conservative decisions and are covered by the new simulation fixtures.
- [X] T022 Update `src/lib/cancellation-safety.ts` to import or delegate to `src/lib/operation-safety.ts` without changing route behavior yet.
- [X] T023 Run `cmd /c npx tsc --noEmit --pretty false` to confirm shared helper types compile.

**Checkpoint**: Failing tests describe the expected safe behavior before implementation changes.

---

## Phase 3: User Story 1 - Fix Renewal and Cancellation Step Order (Priority: P1) MVP

**Goal**: Stop treating every `COMPLETING` operation as final-payment-started.

**Independent Test**: Package-preparation cancellation and cancellation-confirm before Pay cancel safely; final Pay submitted remains review-only.

### Tests for User Story 1

- [X] T024 [P] [US1] Add a test case in `scripts/cancellation-phase-safety-simulations.ts` where `phase=PACKAGE_PREPARATION`, `status=COMPLETING`, `amount=0`, and expected action is safe cancel without review.
- [X] T025 [P] [US1] Add a test case in `scripts/cancellation-phase-safety-simulations.ts` where `phase=CANCELLATION_CONFIRM`, `status=COMPLETING`, and expected action is safe cancel path.
- [X] T026 [P] [US1] Add a test case in `scripts/cancellation-phase-safety-simulations.ts` where `phase=FINAL_PAY_SUBMITTED`, `status=COMPLETING`, `amount>0`, and expected action is review/no refund.
- [X] T027 [P] [US1] Add a test case in `scripts/cancellation-phase-safety-simulations.ts` where terminal statuses stay terminal and are not overwritten.
- [X] T028 [US1] Run `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` and confirm the new cases fail before implementation.

### Implementation for User Story 1

- [X] T029 [US1] Implement `getOperationPhaseEvidence()` in `src/lib/operation-safety.ts` to read safe markers from `Operation.responseData`.
- [X] T030 [US1] Implement `hasFinalPayStarted()` in `src/lib/operation-safety.ts` using explicit phase evidence, final-pay-submitted marker, deduction evidence, and confirmed post-Pay outcome; do not use `COMPLETING` alone.
- [X] T031 [US1] Implement `decideCancellationSafety()` in `src/lib/operation-safety.ts` for pre-final-Pay cancel, post-final-Pay review, terminal no-op, and legacy conservative cases.
- [X] T032 [US1] Update `src/lib/cancellation-safety.ts` so existing imports keep working while using the new `decideCancellationSafety()` logic.
- [X] T033 [US1] Update `src/app/api/operations/[id]/select-package/route.ts` to write non-sensitive responseData phase evidence for package preparation before queuing `COMPLETE_PURCHASE`.
- [X] T034 [US1] Update `src/app/api/operations/[id]/cancel-confirm/route.ts` to write non-sensitive responseData phase evidence for cancellation-confirm instead of letting `COMPLETING` imply final Pay.
- [X] T035 [US1] Update `src/app/api/operations/[id]/confirm-purchase/route.ts` to write final-confirmation and final-pay-submitted phase evidence at the exact points where customer deduction and final Pay job are queued.
- [X] T036 [US1] Update `src/app/api/operations/[id]/cancel/route.ts` to pass operation amount, responseData, transactions, and status into the shared cancellation decision.
- [X] T037 [US1] Update `src/app/api/operations/[id]/cancel/route.ts` so package-preparation `COMPLETING` can cancel safely when final Pay evidence is absent.
- [X] T038 [US1] Update `src/app/api/operations/[id]/cancel/route.ts` so final-pay-submitted operations move to `REVIEW_REQUIRED` and do not refund automatically.
- [X] T039 [US1] Update `worker/src/http-queue-processor.ts` `handleCancelConfirmHttp` so cancellation-confirm `COMPLETING` is not automatically moved to `REVIEW_REQUIRED`.
- [X] T040 [US1] Update `worker/src/http-queue-processor.ts` to preserve terminal operations in all cancel-confirm and cancellation paths.
- [X] T041 [US1] Update `worker/src/http-queue-processor.ts` final purchase branch to set final-pay-submitted evidence before calling the beIN final Pay action.
- [X] T042 [US1] Run `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` and confirm all US1 cases pass.
- [X] T043 [US1] Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T044 [US1] Run `cmd /c npm --prefix worker run build`.

**Checkpoint**: `COMPLETING` no longer breaks safe cancellation before final Pay.

---

## Phase 4: User Story 2 - Harden Refund and Timeout Safety (Priority: P1)

**Goal**: Every refund and cleanup path uses one safe decision rule.

**Independent Test**: Worker, app, timeout, cleanup, insufficient-balance, and duplicate-refund cases all produce correct balance behavior.

### Tests for User Story 2

- [X] T045 [P] [US2] Add a simulation in `scripts/refund-safety-simulations.ts` proving completed operations cannot refund through worker helper.
- [X] T046 [P] [US2] Add a simulation in `scripts/refund-safety-simulations.ts` proving review-required operations cannot refund through worker helper.
- [X] T047 [P] [US2] Add a simulation in `scripts/refund-safety-simulations.ts` proving duplicate refund returns no-op and does not increment balance twice.
- [X] T048 [P] [US2] Add a simulation in `scripts/refund-safety-simulations.ts` proving amount-positive legacy final-confirmation timeout does not silently cancel without refund/review decision.
- [X] T049 [P] [US2] Add a simulation in `scripts/refund-safety-simulations.ts` proving insufficient customer balance revert only happens from the expected state.
- [X] T050 [US2] Run `cmd /c npx tsx scripts/refund-safety-simulations.ts` and confirm new US2 cases fail before implementation.

### Implementation for User Story 2

- [X] T051 [US2] Add `decideRefundSafety()` to `src/lib/operation-safety.ts` for refund allowed, blocked-review, terminal no-op, and duplicate-refund states.
- [X] T052 [US2] Update `src/lib/refund.ts` to call `decideRefundSafety()` inside the Prisma transaction before incrementing user balance.
- [X] T053 [US2] Update `src/lib/refund.ts` to return a safe no-op for duplicate refund and terminal/review states instead of applying balance changes.
- [X] T054 [US2] Update `worker/src/utils/error-handler.ts` so worker refunds use the same terminal/review/final-pay guards as `src/lib/refund.ts`.
- [X] T055 [US2] Update `worker/src/utils/error-handler.ts` to re-read operation status and refund transaction state inside the same database transaction that would update balance.
- [X] T056 [US2] Update generic catch logic in `worker/src/http-queue-processor.ts` to call `decideRefundSafety()` before any refund.
- [X] T057 [US2] Update confirm-purchase error handling in `src/app/api/operations/[id]/confirm-purchase/route.ts` so insufficient-balance revert uses guarded `updateMany` with expected status/amount/phase.
- [X] T058 [US2] Update `src/app/api/operations/[id]/heartbeat/route.ts` so expired `AWAITING_FINAL_CONFIRM` amount-zero operations can cancel, but amount-positive legacy operations go through refund/review decision.
- [X] T059 [US2] Update `src/app/api/cron/timeout-operations/route.ts` so `COMPLETING` and amount-positive final-confirmation operations use phase evidence before refund or review.
- [X] T060 [US2] Update `src/app/api/cron/cleanup-stuck-operations/route.ts` so refund decisions call the shared helper and record review when final Pay may have started.
- [X] T061 [US2] Update response/audit data writes in `worker/src/http-queue-processor.ts` to include refund blocked reason when automatic refund is refused.
- [X] T062 [US2] Run `cmd /c npx tsx scripts/refund-safety-simulations.ts` and confirm all US2 cases pass.
- [X] T063 [US2] Run `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts` to confirm US1 was not regressed.
- [X] T064 [US2] Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T065 [US2] Run `cmd /c npm --prefix worker run build`.
- [X] T066 [US2] Run targeted ESLint for edited safety files: `cmd /c npx eslint src/lib/operation-safety.ts src/lib/cancellation-safety.ts src/lib/refund.ts src/app/api/operations/[id]/cancel/route.ts src/app/api/operations/[id]/confirm-purchase/route.ts`.

**Checkpoint**: Refunds cannot happen after possible beIN charge and cannot duplicate.

---

## Phase 5: User Story 3 - Record the Final Charged beIN Account (Priority: P1)

**Goal**: Create confirmed spend rows only for the beIN account whose balance was actually charged.

**Independent Test**: Successful charge creates one row; retries before charge do not; duplicate jobs do not duplicate; unconfirmed outcomes are excluded from totals.

### Tests for User Story 3

- [X] T067 [P] [US3] Add a ledger simulation in `scripts/bein-spend-ledger-simulations.ts` for confirmed balance delta creating one row.
- [X] T068 [P] [US3] Add a ledger simulation in `scripts/bein-spend-ledger-simulations.ts` for first account failing before charge and second account being charged; only second account is recorded.
- [X] T069 [P] [US3] Add a ledger simulation in `scripts/bein-spend-ledger-simulations.ts` for unconfirmed success without balance delta; no confirmed spend row is counted.
- [X] T070 [P] [US3] Add a ledger simulation in `scripts/bein-spend-ledger-simulations.ts` for duplicate worker job; only one row exists for operation.
- [X] T071 [P] [US3] Add a ledger simulation in `scripts/bein-spend-ledger-simulations.ts` for conflicting duplicate input; helper returns conflict/review rather than silent overwrite.
- [X] T072 [US3] Run `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` and confirm US3 cases fail before implementation.

### Schema and Data Model

- [X] T073 [US3] Add `BeinAccountSpendLedger` model to `prisma/schema.prisma` with fields and indexes from `specs/002-renewal-safety-bein-ledger/data-model.md`.
- [X] T074 [US3] Add the same `BeinAccountSpendLedger` model to `worker/prisma/schema.prisma` if the worker schema is maintained separately in this repository.
- [X] T075 [US3] Create migration file `prisma/migrations/20260514090000_add_bein_operation_ledger/migration.sql` for `bein_account_spend_ledger`, unique `operation_id`, and date/account indexes.
- [X] T076 [US3] Run `cmd /c npx prisma generate` and resolve generated-client errors without changing financial behavior.
- [X] T077 [US3] Verify migration SQL is additive only and does not update existing `operations`, `transactions`, or `users` rows.

### Ledger Helper and Worker Integration

- [X] T078 [P] [US3] Create `src/lib/bein-spend-ledger.ts` with read/query types used by admin reports.
- [X] T079 [P] [US3] Create `worker/src/lib/bein-spend-ledger.ts` with `recordConfirmedBeinSpend()` helper and idempotency handling.
- [X] T080 [US3] Implement `recordConfirmedBeinSpend()` in `worker/src/lib/bein-spend-ledger.ts` to require operation id, user id, final beIN account id, balance before, balance after, positive spend amount, and evidence source.
- [X] T081 [US3] Implement conflict handling in `worker/src/lib/bein-spend-ledger.ts` when an existing ledger row has a different beIN account id or spend amount.
- [X] T082 [US3] Update `worker/src/http-queue-processor.ts` final purchase success branch to call `recordConfirmedBeinSpend()` after beIN balance decrease is confirmed.
- [X] T083 [US3] Update `worker/src/http-queue-processor.ts` final purchase review branch to call `recordConfirmedBeinSpend()` only when beIN balance decrease is confirmed.
- [X] T084 [US3] Update `worker/src/http-queue-processor.ts` installment/final payment branch to use the same ledger helper if it charges beIN dealer balance.
- [X] T085 [US3] Ensure `worker/src/http-queue-processor.ts` does not write confirmed ledger rows for package loading, package preparation, cancellation-confirm, or failed pre-charge attempts.
- [X] T086 [US3] Update operation response/audit data in `worker/src/http-queue-processor.ts` with `chargedBeinLedgerId` when ledger creation succeeds.
- [X] T087 [US3] Update `src/app/api/operations/[id]/route.ts` to include nullable `chargedBeinAccount` details from the ledger, separate from `operation.beinAccountId`.
- [X] T088 [US3] Run `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` and confirm all US3 ledger cases pass.
- [X] T089 [US3] Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T090 [US3] Run `cmd /c npm --prefix worker run build`.

**Checkpoint**: Confirmed charged beIN account is recorded once and only once.

---

## Phase 6: User Story 4 - Admin Calendar Spend Reports (Priority: P2)

**Goal**: Admin can see how much each beIN account spent by day/week/month/custom range.

**Independent Test**: Seed ledger rows and verify totals by account, panel user, operation type, and date range.

### Tests for User Story 4

- [X] T091 [P] [US4] Add report fixtures in `scripts/bein-spend-ledger-simulations.ts` for two beIN accounts across multiple days.
- [X] T092 [P] [US4] Add report fixtures in `scripts/bein-spend-ledger-simulations.ts` for filtering by panel user.
- [X] T093 [P] [US4] Add report fixtures in `scripts/bein-spend-ledger-simulations.ts` for filtering by operation type.
- [X] T094 [P] [US4] Add report fixtures in `scripts/bein-spend-ledger-simulations.ts` proving unconfirmed review items are not included in confirmed spend totals.
- [X] T095 [US4] Run `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` and confirm report cases fail before report implementation.

### Backend Report Implementation

- [X] T096 [US4] Implement `getBeinSpendSummary()` in `src/lib/bein-spend-ledger.ts` with date range, groupBy, beIN account, user, and operation type filters.
- [X] T097 [US4] Implement `getBeinSpendOperations()` in `src/lib/bein-spend-ledger.ts` with pagination and the same filters.
- [X] T098 [US4] Create `src/app/api/admin/reports/bein-spend/route.ts` for admin-only summary report per `contracts/admin-bein-spend-report-contract.md`.
- [X] T099 [US4] Create `src/app/api/admin/reports/bein-spend/operations/route.ts` for admin-only detail rows per `contracts/admin-bein-spend-report-contract.md`.
- [X] T100 [US4] Add date validation in `src/app/api/admin/reports/bein-spend/route.ts` and `src/app/api/admin/reports/bein-spend/operations/route.ts` to reject missing dates, invalid dates, inverted ranges, and excessive page sizes.
- [X] T101 [US4] Ensure both report routes exclude beIN passwords, cookies, TOTP secrets, proxy credentials, and session data from responses.
- [X] T102 [US4] Add unconfirmed/review counts to `src/lib/bein-spend-ledger.ts` without adding unconfirmed spend into confirmed totals.

### Admin UI Implementation

- [X] T103 [P] [US4] Create `src/app/dashboard/admin/reports/bein-spend/page.tsx` with admin access guard and initial server-rendered shell.
- [X] T104 [P] [US4] Create `src/components/admin/reports/BeinSpendReportClient.tsx` with date range controls for today, week, month, and custom range.
- [X] T105 [US4] Add account, panel user, and operation type filters to `src/components/admin/reports/BeinSpendReportClient.tsx`.
- [X] T106 [US4] Add summary cards to `src/components/admin/reports/BeinSpendReportClient.tsx` for total confirmed spend, operation count, and unconfirmed review count.
- [X] T107 [US4] Add grouped account table to `src/components/admin/reports/BeinSpendReportClient.tsx` showing beIN username/label snapshot, confirmed spend, operation count, review count, and last charged time.
- [X] T108 [US4] Add paginated detail rows to `src/components/admin/reports/BeinSpendReportClient.tsx` showing operation id, panel user, card, package, balances before/after, spend amount, and evidence source.
- [X] T109 [US4] Add navigation link to the beIN spend report in the existing admin reports navigation or admin dashboard file that currently links integrity reports.
- [X] T110 [US4] Run `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts` and confirm report totals pass.
- [X] T111 [US4] Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T112 [US4] Run targeted ESLint for new report files: `cmd /c npx eslint src/lib/bein-spend-ledger.ts src/app/api/admin/reports/bein-spend/route.ts src/app/api/admin/reports/bein-spend/operations/route.ts src/app/dashboard/admin/reports/bein-spend/page.tsx src/components/admin/reports/BeinSpendReportClient.tsx`.

**Checkpoint**: Admin can inspect confirmed beIN spend by account and period.

---

## Phase 7: User Story 5 - Production Rollout Without Breaking Live Balances (Priority: P1)

**Goal**: Prove deployment will not change old balances or disrupt active operations.

**Independent Test**: Staging run with status cases, balance totals, worker smoke test, and report verification.

- [X] T113 [P] [US5] Add production rollout notes to `specs/002-renewal-safety-bein-ledger/quickstart.md` with backup, worker pause, migration, smoke test, and rollback steps.
- [X] T114 [P] [US5] Add a short implementation progress section to `docs/superpowers/tasks/2026-05-08-reseller-panel-hardening-tasks.md` linking `specs/002-renewal-safety-bein-ledger/`.
- [X] T115 [US5] Run `cmd /c npx prisma generate`.
- [X] T116 [US5] Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T117 [US5] Run `cmd /c npm --prefix worker run build`.
- [X] T118 [US5] Run `cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts`.
- [X] T119 [US5] Run `cmd /c npx tsx scripts/refund-safety-simulations.ts`.
- [X] T120 [US5] Run `cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts`.
- [X] T121 [US5] Run `git diff --check` and resolve whitespace errors without full-file rewrites.
- [X] T122 [US5] Scan edited files for mojibake patterns listed in `AGENTS.md`.
- [ ] T123 [US5] On staging, record total user balance before migration using a read-only SQL query saved in rollout notes.
- [ ] T124 [US5] On staging, record transaction counts by type before migration using a read-only SQL query saved in rollout notes.
- [ ] T125 [US5] On staging, apply migration and confirm no `users`, `transactions`, or existing `operations` rows were bulk-updated.
- [ ] T126 [US5] On staging, run one safe renewal smoke test with a test card/account and verify the charged beIN ledger row.
- [ ] T127 [US5] On staging, run one cancellation-before-final-Pay smoke test and verify it cancels safely without false review.
- [ ] T128 [US5] On staging, run one post-final-Pay uncertain-result simulation or controlled worker test and verify review/no refund.
- [ ] T129 [US5] On staging, open the beIN spend report and verify today/week/month/custom totals against ledger rows.
- [ ] T130 [US5] On staging, confirm no automatic refund was created for uncertain post-final-Pay outcomes.
- [ ] T131 [US5] On staging, confirm total user balance after tests matches expected transaction deltas only.
- [ ] T132 [US5] Do not deploy production until T115-T131 are complete and recorded.

**Checkpoint**: Feature is ready for controlled production rollout only after staging evidence is recorded.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: Starts immediately.
- **Phase 2**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2. This is the MVP for correcting the dangerous `COMPLETING` assumption.
- **Phase 4 (US2)**: Depends on Phase 3 because refund safety needs correct phase detection.
- **Phase 5 (US3)**: Depends on Phase 4 because ledger writes must happen only after safe final-payment evidence exists.
- **Phase 6 (US4)**: Depends on Phase 5 because reports must read confirmed ledger rows.
- **Phase 7 (US5)**: Depends on all phases selected for deployment.

### User Story Dependencies

- **US1** can ship independently after Phase 2 and immediately fixes the cancellation/review bug.
- **US2** can ship after US1 and strengthens money safety without needing reports.
- **US3** can ship after US2 and starts recording charged beIN accounts for new operations.
- **US4** can ship after US3 and adds admin reporting.
- **US5** is the rollout gate and must be completed before production deployment.

### Parallel Opportunities

- T014-T016 can run in parallel because they create separate simulation files.
- T024-T027 can run in parallel because they add independent cancellation scenarios.
- T045-T049 can run in parallel because they add independent refund scenarios.
- T067-T071 can run in parallel because they add independent ledger scenarios.
- T091-T094 can run in parallel because they add independent report fixtures.
- T078 and T079 can run in parallel after schema decisions because app read helper and worker write helper are separate files.
- T103 and T104 can run in parallel because page shell and client component are separate files.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 to fix `COMPLETING` ambiguity.
3. Complete Phase 4 to harden refunds and timeout cleanup.
4. Stop and verify before adding ledger/reporting.

### Incremental Delivery

1. Ship US1 + US2 first if urgent owner-money risk exists.
2. Add US3 ledger only after refund safety is stable.
3. Add US4 reports after ledger rows are reliable.
4. Complete US5 staging gate before production deployment.

### Production Safety Notes

- Do not bulk-update old balances.
- Do not infer old confirmed beIN spend from `Operation.beinAccountId`.
- Do not count package price as confirmed spend without balance evidence in v1.
- Do not store beIN secrets or proxy secrets in ledger/report rows.
- Do not touch removed Mobile renewal or Store behavior unless a shared helper change requires a specific safety test.
- Commit each completed phase separately so rollback is possible.
