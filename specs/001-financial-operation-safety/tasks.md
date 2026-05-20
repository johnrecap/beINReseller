# Tasks: Financial Operation Safety

**Input**: Design documents from `specs/001-financial-operation-safety/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Include targeted tests or scripted simulations because the feature protects live money.

**Organization**: Tasks are grouped by user story/phase so each phase can be implemented and tested without breaking current production flow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after dependencies are satisfied.
- **[Story]**: Maps to a user story from `spec.md`.
- Every task includes exact file paths.

## Phase 1: Setup and Baseline

**Purpose**: Create a safe implementation boundary before touching financial behavior.

- [X] T001 Read `specs/001-financial-operation-safety/spec.md`, `plan.md`, `research.md`, and all files in `contracts/` to understand required behavior.
- [X] T002 Inspect current payment/cancel flow in `worker/src/http-queue-processor.ts`, `worker/src/http/HttpClientService.ts`, `src/app/api/operations/[id]/cancel/route.ts`, and `src/lib/refund.ts`.
- [X] T003 Record current risky branches in `worker/src/http-queue-processor.ts`: generic catch refund, confirm timeout refund, final result failure refund, cancel confirm refund, installment failure refund.
- [X] T004 Record current risky branches in `worker/src/http/HttpClientService.ts`: pay error, busy timeout, no confirmation, balance unreadable, caught confirm error.
- [X] T005 Confirm current duplicate-refund database guard exists in `prisma/migrations/20260216193000_add_review_required_and_financial_guards/migration.sql`.
- [X] T006 Run baseline compile checks before editing: `cmd /c npx tsc --noEmit --pretty false` and `cmd /c npm --prefix worker run build`.
- [X] T007 Create a short implementation note in `docs/superpowers/tasks/2026-05-08-reseller-panel-hardening-tasks.md` linking this Spec Kit feature.

**Checkpoint**: No code behavior changed. Baseline known.

---

## Phase 2: Foundational Outcome Model

**Purpose**: Define one shared vocabulary for safe refund decisions.

- [X] T008 [P] Create or identify a small outcome type in `worker/src/http/HttpClientService.ts` for final Pay results: confirmed success, confirmed not charged, uncertain review.
- [X] T009 [P] Create or identify a small outcome helper in `worker/src/http-queue-processor.ts` that decides whether a failed result is refund-safe or review-required.
- [X] T010 Ensure helper names and comments in `worker/src/http-queue-processor.ts` explain the business rule: after final Pay, unknown means review, not refund.
- [X] T011 Add a test plan or script note for outcome categories under `specs/001-financial-operation-safety/quickstart.md` if a test framework is not added.
- [X] T012 Run targeted TypeScript check after helper-only changes: `cmd /c npm --prefix worker run build`.

**Checkpoint**: Shared outcome language exists, but no refund behavior has changed yet.

---

## Phase 3: User Story 1 - Protect Owner Funds After beIN Payment (Priority: P1) MVP

**Goal**: Never auto-refund after final beIN Pay unless non-charge is confirmed.

**Independent Test**: Simulate final Pay success, balance decrease, busy, timeout, no confirmation, login redirect, and network failure. Refund only occurs for confirmed non-charge.

### Tests for User Story 1

- [X] T013 [P] [US1] Add a focused test or scripted simulation for "success text found" in `worker/src/http/HttpClientService.ts` behavior or a nearby test/simulation file.
- [X] T014 [P] [US1] Add a focused test or scripted simulation for "dealer balance decreased but no success text" behavior.
- [X] T015 [P] [US1] Add a focused test or scripted simulation for "Transaction is busy after Pay" behavior.
- [X] T016 [P] [US1] Add a focused test or scripted simulation for "timeout/network error after Pay" behavior.
- [X] T017 [P] [US1] Add a focused test or scripted simulation for "balance unreadable after Pay" behavior.

### Implementation for User Story 1

- [X] T018 [US1] Update `worker/src/http/HttpClientService.ts` so a clear success message returns confirmed success with beIN balance evidence when available.
- [X] T019 [US1] Update `worker/src/http/HttpClientService.ts` so balance decrease after Pay is not returned as a refund-safe failure.
- [X] T020 [US1] Update `worker/src/http/HttpClientService.ts` so busy/timeouts/no confirmation/unreadable balance after Pay return an uncertain review outcome.
- [X] T021 [US1] Update `worker/src/http/HttpClientService.ts` so caught errors after Pay are not plain failures unless Pay was definitely not submitted.
- [X] T022 [US1] Update `worker/src/http-queue-processor.ts` confirm-purchase branch so uncertain outcomes set operation to `REVIEW_REQUIRED` and do not call `refundUser`.
- [X] T023 [US1] Update `worker/src/http-queue-processor.ts` generic catch path so it does not refund if the operation is already in final-payment review conditions.
- [X] T024 [US1] Store beIN balance before/after evidence in `worker/src/http-queue-processor.ts` response/audit data when available.
- [X] T025 [US1] Ensure `worker/src/http-queue-processor.ts` deletes operation session only after evidence is stored for success/review outcomes.
- [X] T026 [US1] Run `cmd /c npm --prefix worker run build`.
- [X] T027 [US1] Run the US1 simulations/tests and confirm refund count stays zero for uncertain outcomes.

**Checkpoint**: Final Pay uncertainty cannot refund automatically.

---

## Phase 4: User Story 2 - Safe Cancellation Around Final Payment (Priority: P1)

**Goal**: Cancellation before final Pay remains normal; cancellation during/after final Pay becomes review-only.

**Independent Test**: Cancel before final Pay, during final Pay, after success, after review-required, and after prior refund.

### Tests for User Story 2

- [X] T028 [P] [US2] Add a focused test or scripted simulation for cancellation before final Pay in `src/app/api/operations/[id]/cancel/route.ts`.
- [X] T029 [P] [US2] Add a focused test or scripted simulation for cancellation while status is `COMPLETING`.
- [X] T030 [P] [US2] Add a focused test or scripted simulation for cancellation when status is `COMPLETED`.
- [X] T031 [P] [US2] Add a focused test or scripted simulation for duplicate cancellation when a refund already exists.

### Implementation for User Story 2

- [X] T032 [US2] Update `src/app/api/operations/[id]/cancel/route.ts` to determine whether final payment may have started before refunding.
- [X] T033 [US2] Update `src/app/api/operations/[id]/cancel/route.ts` so `COMPLETING` or final-payment-started operations move to review instead of refunding.
- [X] T034 [US2] Update `src/app/api/operations/[id]/cancel/route.ts` so terminal operations are never overwritten.
- [X] T035 [US2] Update `worker/src/http-queue-processor.ts` `handleCancelConfirmHttp` so it uses guarded updates and does not refund if final Pay may have started.
- [X] T036 [US2] Ensure `worker/src/http-queue-processor.ts` cancel path cannot overwrite `COMPLETED` or `REVIEW_REQUIRED`.
- [X] T037 [US2] Ensure `src/lib/refund.ts` still prevents duplicate refunds and returns false instead of throwing for duplicate refund attempts.
- [X] T038 [US2] Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T039 [US2] Run `cmd /c npm --prefix worker run build`.
- [X] T040 [US2] Run the US2 simulations/tests and confirm late cancellation creates no refund.

**Checkpoint**: Late cancellation cannot create owner-loss refund.

---

## Phase 5: User Story 3 - Preserve Existing Live Operations During Rollout (Priority: P1)

**Goal**: Production operations already running are not disrupted.

**Independent Test**: Seed operations in all major statuses and run the updated handlers against duplicate/late jobs.

- [X] T041 [P] [US3] Review `src/app/api/cron/timeout-operations/route.ts` and `src/app/api/cron/cleanup-stuck-operations/route.ts` for refund-after-final-payment risks.
- [X] T042 [P] [US3] Review `src/lib/operation-dispatch.ts` for retry behavior when Redis is unavailable.
- [X] T043 [US3] Add guarded handling so timeout cleanup does not refund operations that may have submitted final Pay.
- [X] T044 [US3] Add rollout notes to `specs/001-financial-operation-safety/quickstart.md` for pausing workers, backup, smoke test, and resume.
- [X] T045 [US3] Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T046 [US3] Run `cmd /c npm --prefix worker run build`.

**Checkpoint**: Existing active operations can continue or move to review without balance rewrites.

---

## Phase 6: User Story 4 - Safe Speed Improvements (Priority: P2)

**Goal**: Keep renewal fast before payment, but do not skip post-payment safety.

**Independent Test**: Compare package-loading behavior with cached and uncached STB/session data; verify final Pay still performs fresh outcome verification.

- [X] T047 [P] [US4] Review session reuse in `worker/src/http-queue-processor.ts` and `worker/src/http/HttpClientService.ts`.
- [X] T048 [P] [US4] Review STB/package caching in `worker/src/http-queue-processor.ts`.
- [X] T049 [US4] Keep cached session/STB use only before final Pay in `worker/src/http-queue-processor.ts`.
- [X] T050 [US4] Ensure final Pay result verification in `worker/src/http/HttpClientService.ts` does not use stale package cache to decide refund eligibility.
- [X] T051 [US4] Remove or reduce non-essential debug logging around final Pay in `worker/src/http/HttpClientService.ts` after safety tests pass.
- [X] T052 [US4] Run `cmd /c npm --prefix worker run build`.

**Checkpoint**: Speed improvements are limited to safe pre-payment steps.

---

## Phase 7: Admin Review and Reconciliation Visibility

**Purpose**: Make review-required operations understandable and safe to resolve.

- [X] T053 [P] Review existing integrity reports in `src/app/api/admin/reports/integrity/*`.
- [X] T054 [P] Review existing detector logic in `src/lib/integrity/detector.ts` and `worker/src/lib/integrity-detector.ts`.
- [X] T055 Add review evidence fields to existing operation response/audit data in `worker/src/http-queue-processor.ts` without requiring destructive migration.
- [X] T056 If response/audit data is insufficient, plan a backward-compatible migration in `prisma/schema.prisma` and `prisma/migrations/`.
- [X] T057 Add admin-facing review notes or summary in existing integrity report endpoints under `src/app/api/admin/reports/integrity/`.
- [X] T058 Run `cmd /c npx prisma generate` if schema changes were made.
- [X] T059 Run `cmd /c npx tsc --noEmit --pretty false`.

**Checkpoint**: Admins can decide review cases without guessing.

---

## Phase 8: Final Verification and Production Gate

**Purpose**: Confirm the work is safe before production.

- [X] T060 Run `cmd /c npx prisma generate`.
- [X] T061 Run `cmd /c npx tsc --noEmit --pretty false`.
- [X] T062 Run `cmd /c npm --prefix worker run build`.
- [X] T063 Run targeted ESLint for all edited app and worker files.
- [X] T064 Run `git diff --check`.
- [X] T065 Scan edited files for the mojibake patterns listed in `AGENTS.md`.
- [X] T066 Run US1 final-payment simulations and record results.
- [X] T067 Run US2 cancellation-race simulations and record results.
- [ ] T068 Run a staging renewal smoke test with a safe test card/account.
- [ ] T069 Run a staging card-check smoke test.
- [ ] T070 Confirm no customer balance changed outside expected transaction records.
- [ ] T071 Confirm no automatic refund was created for uncertain post-payment outcomes.
- [X] T072 Update `docs/superpowers/tasks/2026-05-08-reseller-panel-hardening-tasks.md` with completed verification.
- [ ] T073 Commit the completed phase with a focused message.

**Checkpoint**: Ready for controlled production rollout only after all verification passes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: Starts immediately.
- **Phase 2**: Depends on Phase 1.
- **Phase 3 (US1)**: Depends on Phase 2. This is the MVP and must ship before any other risky production change.
- **Phase 4 (US2)**: Depends on Phase 2 and should follow US1.
- **Phase 5 (US3)**: Depends on US1 and US2 decisions.
- **Phase 6 (US4)**: Depends on US1 because speed must not weaken payment safety.
- **Phase 7**: Can start after US1 evidence fields are known.
- **Phase 8**: Depends on all implemented phases.

### Parallel Opportunities

- T013-T017 can run in parallel because they cover separate outcome simulations.
- T028-T031 can run in parallel because they cover separate cancellation scenarios.
- T041-T042 can run in parallel.
- T047-T048 can run in parallel.
- T053-T054 can run in parallel.

### MVP Scope

MVP is Phase 1 + Phase 2 + Phase 3. This alone prevents the highest owner-loss scenario: beIN charges but the panel auto-refunds.

## Implementation Strategy

1. Implement Phase 3 before changing cancellation behavior.
2. Validate Phase 3 independently with simulated beIN outcomes.
3. Implement Phase 4 cancellation safety.
4. Validate cancellation races independently.
5. Add rollout and admin visibility after core owner-loss protections pass.
6. Do speed improvements last.

## Production Safety Notes

- Do not deploy during peak usage.
- Do not bulk-update old balances.
- Do not remove existing refund guards.
- Do not change Mobile renewal or Store behavior.
- Keep every phase separately commit-able and rollback-able.
