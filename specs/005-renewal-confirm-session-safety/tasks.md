# Tasks: Renewal Confirmation Session Safety

**Input**: Design documents from `specs/005-renewal-confirm-session-safety/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/confirmation-safety-contract.md`, `quickstart.md`

**Tests**: Include build verification and focused manual scenarios because this path depends on beIN sessions, Redis, and production-like worker behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup and Baseline

**Purpose**: Confirm current failure shape before edits.

- [x] T001 Review production logs for operation `cmpeeek78008g8dhytoac4ss5` and identify failure before final beIN Pay.
- [x] T002 Review `worker/src/http-queue-processor.ts` for unsafe `JSON.parse(operation.responseData as string)` usage.
- [x] T003 Review `src/app/api/operations/[id]/confirm-purchase/route.ts` for premature final Pay phase writes.
- [x] T004 Review `src/lib/operation-safety.ts` and `worker/src/http-queue-processor.ts` final payment evidence rules.

---

## Phase 2: Foundational Parser and Phase Rules

**Purpose**: Make shared safety behavior reliable before story-specific changes.

- [x] T005 Update `worker/src/http-queue-processor.ts` to use `parseResponseDataObject` for all renewal confirmation response-data reads.
- [x] T006 Update `src/lib/operation-safety.ts` so `FINAL_CONFIRMATION_REQUESTED` is a safe pre-final-payment phase.
- [x] T007 Update `worker/src/http-queue-processor.ts` so `hasFinalPaymentStarted` treats confirmation-requested phases as pre-final-payment.
- [x] T008 Ensure merge helpers preserve existing response data when it is a string or object.

---

## Phase 3: User Story 1 - Restore Confirmation Session Reliably (Priority: P1) MVP

**Goal**: Final confirmation restores operation-scoped Redis session even when response data is an object.

**Independent Test**: Confirm a prepared renewal with object response data and verify there is no object/string JSON parse failure.

- [x] T009 [US1] Update COMPLETE_PURCHASE original-account restore in `worker/src/http-queue-processor.ts` to parse response data safely.
- [x] T010 [US1] Update CONFIRM_PURCHASE session restore in `worker/src/http-queue-processor.ts` to call `restoreOperationSession` without unsafe JSON parsing.
- [x] T011 [US1] Keep legacy `sessionData` fallback in `worker/src/http-queue-processor.ts` for old operations.
- [x] T012 [US1] Verify operation-scoped Redis session is attempted before declaring ViewState missing.

---

## Phase 4: User Story 2 - Mark Final Payment Only When It Really Starts (Priority: P1)

**Goal**: Customer confirmation and real beIN final Pay are separate states.

**Independent Test**: Force confirm job failure before final Pay and verify `finalPaySubmitted` stays false.

- [x] T013 [US2] Change `src/app/api/operations/[id]/confirm-purchase/route.ts` to write `FINAL_CONFIRMATION` or `FINAL_CONFIRMATION_REQUESTED`, not `FINAL_PAY_SUBMITTED`.
- [x] T014 [US2] Keep customer deduction behavior unchanged in `src/app/api/operations/[id]/confirm-purchase/route.ts`.
- [x] T015 [US2] Move worker final Pay evidence update to `worker/src/http/HttpClientService.ts` at the actual beIN Pay submit point.
- [x] T016 [US2] Confirm pre-final-payment failures are not classified as final Pay started.

---

## Phase 5: User Story 3 - Report Outcomes Without Misleading Success (Priority: P1)

**Goal**: Logs and statuses reflect prepared, submitted, completed, or review states accurately.

**Independent Test**: Run COMPLETE_PURCHASE and verify no final success log appears before CONFIRM_PURCHASE.

- [x] T017 [US3] Replace misleading COMPLETE_PURCHASE success log in `worker/src/http-queue-processor.ts`.
- [x] T018 [US3] Ensure CONFIRM_PURCHASE failure before final Pay does not mark the operation completed.
- [x] T019 [US3] Keep Review Required for uncertain post-final-Pay outcomes.

---

## Phase 6: User Story 4 - Keep Production Rollout Safe (Priority: P2)

**Goal**: Deploy without database rewrites or balance changes.

**Independent Test**: Build web and worker with no migrations.

- [x] T020 [US4] Run `npm run build`.
- [x] T021 [US4] Run `cd worker && npm run build`.
- [x] T022 [US4] Review `git diff --check`.
- [x] T023 [US4] Confirm no migration files or balance backfills were added.

## Dependencies

- Phase 2 blocks all user stories.
- US1 and US2 are both MVP and should be completed together.
- US3 depends on US1 and US2 for accurate wording.
- US4 runs after implementation.

## Implementation Strategy

1. Fix parser/session restore first.
2. Fix final Pay phase evidence second.
3. Fix misleading logs third.
4. Build web and worker.
5. Deploy with process restart only; no database restore.
