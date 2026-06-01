# Tasks: Final Payment Guardrails

**Input**: Design documents from `specs/023-final-payment-guardrails/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature changes money movement, provider final payment timing, timeout recovery, refunds, and financial review closure.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Focused Failing Tests)

**Purpose**: Capture the risky behavior before implementation changes.

- [X] T001 Create final confirmation safety tests in `tests/unit/final-payment-guardrails.test.ts`
  - Reason: The main bug is a timing window after final confirmation where stale deadlines can expire or refund an operation.
  - Expected: Tests fail until confirmation clears stale waiting deadlines, prevents duplicate deduction, and records dispatch exactly once.
  - Possible bugs: Tests may overfit to `responseData` shape instead of required financial behavior.
  - Fix/Mitigation: Assert observable operation status, amount, dispatch count, and refund decision rather than exact JSON formatting.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts` fails before implementation.

- [X] T002 Extend recovery classifier tests in `tests/unit/operation-recovery-classifier.test.ts`
  - Reason: Recovery must never auto-refund after final Pay may have started unless no-charge evidence exists.
  - Expected: Tests cover stale heartbeat after confirmation, final-payment-started evidence, dispatch pending/exhausted, confirmed no-charge, and legacy `COMPLETING`.
  - Possible bugs: A legacy `COMPLETING` case can become too conservative and send safe pre-Pay failures to review.
  - Fix/Mitigation: Include separate cases for pre-Pay dispatch pending, final-payment-started, and confirmed no-charge.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts`.

- [X] T003 Extend worker final-pay tests in `worker/tests/http-client-final-pay-delay.test.ts` and `worker/tests/http-client-payment-classification.test.ts`
  - Reason: beIN balance can update after the first read; the worker must wait before deciding review/no-charge.
  - Expected: Tests cover delayed expected decrease, unchanged after all checks, mismatched decrease, immediate success text, and ambiguous timeout.
  - Possible bugs: Test timing can become slow or flaky if real timers are used.
  - Fix/Mitigation: Keep delay values configurable/testable and use simulated classification helpers where possible.
  - Verification: `cmd /c npx tsx --test worker/tests/http-client-final-pay-delay.test.ts` and `cmd /c npx tsx --test worker/tests/http-client-payment-classification.test.ts`.

- [X] T004 Add safe reseller refund routing tests in `tests/unit/final-payment-guardrails.test.ts`
  - Reason: Safe no-charge refunds must return reseller balance exactly once, while post-Pay uncertainty must not auto-refund.
  - Expected: Tests fail until safe pre-Pay or confirmed no-charge cases refund reseller balance once and ambiguous after-Pay cases move to review.
  - Possible bugs: Tests may allow duplicate refunds if they only assert final balance.
  - Fix/Mitigation: Assert refund transaction count and operation outcome together.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

---

## Phase 2: Foundational (Shared Safety Helpers)

**Purpose**: Create one shared decision layer before changing routes and worker flows.

- [X] T005 Add final payment phase helpers in `src/lib/operation-safety.ts`
  - Reason: Routes, worker, recovery, and review need one source of truth for whether Pay has not started, is starting, was submitted, was verified, or needs review.
  - Expected: Helpers parse and merge final-payment evidence without exposing sensitive session data.
  - Possible bugs: Existing phase values can be overwritten and lose recovery evidence.
  - Fix/Mitigation: Preserve existing response keys and only update final-payment evidence fields.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts`.

- [X] T006 Update recovery decisions in `src/lib/operations/recovery-classifier.ts`
  - Reason: Recovery must distinguish pre-Pay dispatch work from after-Pay uncertainty.
  - Expected: Dispatch pending before Pay retries, stale deadlines after confirmation do not expire, after-Pay uncertainty goes to review, confirmed no-charge permits one refund.
  - Possible bugs: Old operations without phase evidence can be classified incorrectly.
  - Fix/Mitigation: Keep a conservative legacy path for deducted `COMPLETING` operations without evidence.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts`.

- [X] T007 Update recovery application in `src/lib/operations/recovery.ts`
  - Reason: Classifier decisions must translate into idempotent database updates, correct refund behavior, and lock handling.
  - Expected: Recovery never auto-refunds after Pay may have started; safe refunds remain idempotent; review-required operations preserve audit evidence.
  - Possible bugs: Recovery may release account locks too early or leave dispatch retry rows stale.
  - Fix/Mitigation: Keep retry decisions from releasing locks unnecessarily and log recovery evidence.
  - Verification: `cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts`.

- [X] T008 Update dispatch watchdog behavior in `src/lib/operation-dispatch.ts`
  - Reason: Exhausted final confirmation dispatch before Pay can be recovered differently than failure after Pay started.
  - Expected: Pending dispatch is retried while safe; exhausted dispatch before Pay can fail/refund safely; after-Pay evidence goes to review.
  - Possible bugs: Duplicate jobs can be treated as failure instead of already-dispatched success.
  - Fix/Mitigation: Preserve existing duplicate-job handling and add tests for duplicate dispatch rows.
  - Verification: `cmd /c npx tsx --test tests/integration/operation-dispatch-watchdog.test.ts`.

---

## Phase 3: User Story 1 - Safe Renewal Final Confirmation (Priority: P1) MVP

**Goal**: Final confirmation deducts once, clears stale waiting deadlines, records dispatch, and blocks unsafe Pay if state changes.

**Independent Test**: Confirm a renewal after stale waiting deadlines exist; no cleanup auto-refund/expiry happens after confirmation.

### Tests for User Story 1

- [X] T009 [US1] Add route-level confirm purchase scenarios in `tests/unit/final-payment-guardrails.test.ts`
  - Reason: The confirm route is where user balance deduction, stale deadlines, and dispatch are joined.
  - Expected: Tests cover sufficient balance, insufficient balance, duplicate confirm, stale heartbeat, stale finalConfirmExpiry, and dispatch failure evidence.
  - Possible bugs: Route tests can become hard to maintain if they mock too much Prisma behavior.
  - Fix/Mitigation: Keep tests around helper/extracted transaction logic if direct route testing is too heavy.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

### Implementation for User Story 1

- [X] T010 [US1] Refine final confirmation transaction in `src/app/api/operations/[id]/confirm-purchase/route.ts`
  - Reason: The current flow changes state, then deducts, while stale deadlines can remain attached to the operation.
  - Expected: One guarded transaction sets final-payment dispatch state, deducts once when balance is sufficient, records transaction once, and clears/replaces stale heartbeat/final-confirm deadlines.
  - Possible bugs: Insufficient balance can leave the operation stuck in `COMPLETING`.
  - Fix/Mitigation: Ensure failed deduction leaves the operation in a clearly retryable final-confirm state with no deduction.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

- [X] T011 [US1] Prevent stale active-list recovery after final confirmation in `src/app/api/operations/route.ts`, `src/app/api/operations/[id]/heartbeat/route.ts`, and `src/app/api/operations/[id]/packages/route.ts`
  - Reason: UI polling and heartbeat endpoints can trigger recovery while a confirmed operation is transitioning to worker payment.
  - Expected: After confirmation, stale waiting deadlines do not cause expiry/refund; the UI reports final payment execution or review.
  - Possible bugs: Genuinely abandoned waiting operations may stop expiring.
  - Fix/Mitigation: Only change behavior after final confirmation/dispatch evidence exists.
  - Verification: Manual active operations polling plus `cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts`.

- [X] T012 [US1] Add final pre-Pay operation re-check in `worker/src/http-queue-processor.ts`
  - Reason: A job can become stale after it starts; the worker must not press Pay if the operation was cancelled, expired, refunded, or reviewed.
  - Expected: Worker re-reads operation immediately before Pay and skips Pay for terminal or disallowed states.
  - Possible bugs: The re-check can reject valid operations if evidence fields are missing.
  - Fix/Mitigation: Allow only the explicitly safe pre-Pay/final-payment-starting states and test legacy behavior separately.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

- [X] T013 [US1] Persist final-payment-started evidence before renewal Pay in `worker/src/http-queue-processor.ts`
  - Reason: If the worker cannot save evidence, pressing Pay would create an unsafe unknown state.
  - Expected: Pay is submitted only after durable final-payment-started evidence is saved; failed evidence persistence aborts before provider Pay.
  - Possible bugs: A transient DB failure can increase review/failure count but should not charge beIN.
  - Fix/Mitigation: Treat persistence failure as pre-Pay failure with no Pay submission and clear logging.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

---

## Phase 4: User Story 2 - Safer beIN Outcome Verification (Priority: P2)

**Goal**: Delayed provider balance changes can complete the operation, while unclear after-Pay outcomes go to review without auto-refund.

**Independent Test**: Simulate delayed beIN balance decrease after first unchanged read; operation completes when evidence appears.

### Tests for User Story 2

- [X] T014 [P] [US2] Add delayed provider outcome fixtures in `worker/tests/helpers/final-pay-fixtures.ts`
  - Reason: Final Pay tests need repeatable immediate, delayed, mismatched, and unclear provider outcomes.
  - Expected: Fixtures model success text, busy text, unchanged balance, delayed expected decrease, delayed mismatch, and unreadable balance.
  - Possible bugs: Fixtures may hide behavior inside mocks instead of testing classification.
  - Fix/Mitigation: Keep fixtures as simple data and assert classification separately.
  - Verification: `cmd /c npx tsx --test worker/tests/http-client-payment-classification.test.ts`.

### Implementation for User Story 2

- [X] T015 [US2] Extend final-pay delay configuration in `worker/src/http/HttpClientService.ts`
  - Reason: A fixed 3 second read is too short to prove no charge in all ambiguous cases.
  - Expected: Ambiguous Pay outcomes perform delayed verification windows and expose testable delay configuration.
  - Possible bugs: Longer waits can tie up worker capacity.
  - Fix/Mitigation: Use bounded retry count and document defaults; keep immediate success path fast.
  - Verification: `cmd /c npx tsx --test worker/tests/http-client-final-pay-delay.test.ts`.

- [X] T016 [US2] Refine final-pay classification in `worker/src/http/HttpClientService.ts`
  - Reason: Unchanged balance immediately after Pay should not always mean safe no-charge if delayed verification has not completed.
  - Expected: Confirmed success, confirmed no-charge, mismatched decrease, and unclear review are classified distinctly.
  - Possible bugs: Confirmed no-charge can become too hard to prove and increase review volume.
  - Fix/Mitigation: Keep explicit no-charge patterns for clear provider failure before/after Pay and expected unchanged evidence after all delayed checks.
  - Verification: `cmd /c npx tsx --test worker/tests/http-client-payment-classification.test.ts`.

- [X] T017 [US2] Persist post-pay verification evidence in `worker/src/http-queue-processor.ts`
  - Reason: Admin review needs before/after balances, expected cost, outcome category, and reason.
  - Expected: Completed and review-required operations store audit evidence without sensitive session data.
  - Possible bugs: Persisting evidence can overwrite previously saved recovery details.
  - Fix/Mitigation: Merge evidence with existing response data and preserve audit snapshots.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-recovery-foundation.test.ts`.

---

## Phase 5: User Story 3 - Installment Safety (Priority: P3)

**Goal**: Installment payment follows the same no-auto-refund-after-Pay rule as renewal.

**Independent Test**: Simulated installment failures either safely refund before Pay/confirmed no-charge or move to review after Pay may have started.

### Tests for User Story 3

- [X] T018 [P] [US3] Add installment final-pay evidence tests in `tests/unit/final-payment-guardrails.test.ts`
  - Reason: Installment currently needs the same pre-Pay evidence guarantee as renewal.
  - Expected: Tests fail until installment Pay persists final-payment-started evidence before provider submission.
  - Possible bugs: Tests may not exercise the two-step installment Pay popup path.
  - Fix/Mitigation: Include both direct/no-popup and popup path evidence expectations if the seam allows it.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

- [X] T019 [P] [US3] Add installment safe refund/review tests in `tests/unit/final-payment-guardrails.test.ts`
  - Reason: Installment must refund reseller balance only when Pay definitely did not charge beIN.
  - Expected: Tests fail until confirmed no-charge refunds reseller balance once and ambiguous after-Pay installment outcomes move to manual review.
  - Possible bugs: Tests can confuse a pre-Pay failure with an after-Pay ambiguous failure.
  - Fix/Mitigation: Use separate fixtures for no final-payment-started evidence, final-payment-started evidence, and confirmed no-charge evidence.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

### Implementation for User Story 3

- [X] T020 [US3] Add installment final-payment-started evidence in `worker/src/http-queue-processor.ts`
  - Reason: Installment Pay can reach beIN and then fail before result recording just like renewal.
  - Expected: `CONFIRM_INSTALLMENT` persists final-payment-started evidence before provider Pay and uses review on uncertainty.
  - Possible bugs: Installment may record evidence too early before the real final Pay step.
  - Fix/Mitigation: Place evidence immediately before the actual provider Pay request, not before loading installment details.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

- [X] T021 [US3] Apply installment review/no-charge classification in `worker/src/http-queue-processor.ts`
  - Reason: Installment needs the same final outcome decisions as renewal after provider Pay.
  - Expected: Confirmed installment charge completes; confirmed no-charge can refund safely; ambiguous after-Pay moves to review without refund.
  - Possible bugs: Installment can be marked failed even though Pay may have reached beIN.
  - Fix/Mitigation: Reuse the same final-payment evidence and review decision rules used by renewal.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

- [X] T022 [US3] Keep safe installment refunds on reseller balance logic in `src/lib/refund.ts`, `worker/src/utils/error-handler.ts`, and `worker/src/http-queue-processor.ts`
  - Reason: Installment/reseller operations must not auto-refund after Pay may have started, and safe refunds must be idempotent.
  - Expected: Safe pre-Pay or confirmed no-charge installment failures refund reseller balance once; ambiguous after-Pay operations go to review.
  - Possible bugs: A retry can create a duplicate reseller refund transaction.
  - Fix/Mitigation: Assert refund idempotency and block refund when final-payment-started evidence exists without no-charge proof.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

---

## Phase 6: User Story 4 - Manual Review Closure (Priority: P4)

**Goal**: Admin review decisions close uncertainty with a clear financial outcome and no duplicate refund/spend entries.

**Independent Test**: Admin marks one review as charged and another as no-charge/refunded; both leave unresolved review.

### Tests for User Story 4

- [X] T023 [P] [US4] Add financial review closure tests in `tests/unit/final-payment-guardrails.test.ts`
  - Reason: Review decisions must be more than notes; they must close the financial case.
  - Expected: Tests cover charged closure, no-charge refund closure, duplicate refund prevention, and missing evidence rejection.
  - Possible bugs: Unit tests may not cover admin authorization.
  - Fix/Mitigation: Keep route-level authorization checks covered manually or with existing admin route tests.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

### Implementation for User Story 4

- [X] T024 [US4] Update review decision route in `src/app/api/admin/financial-review/[operationId]/decision/route.ts`
  - Reason: Admin decisions must close unresolved review and apply the correct financial outcome.
  - Expected: Charged decisions complete/close without refund; no-charge decisions refund reseller balance once; unresolved decisions remain review-required with reason.
  - Possible bugs: Closing review can hide operations that still need action.
  - Fix/Mitigation: Require explicit decision type and evidence reason; keep unresolved option separate.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`.

- [X] T025 [US4] Update financial review list behavior in `src/app/api/admin/financial-review/route.ts`
  - Reason: Closed reviews should not keep appearing as unresolved.
  - Expected: Unresolved review list filters out closed decisions while audit evidence remains available.
  - Possible bugs: Admins may lose visibility into recently closed reviews.
  - Fix/Mitigation: Provide closed/recent filter if current UI already supports it, or keep audit route discoverable.
  - Verification: Manual admin review list check.

---

## Final Phase: Verification And Deployment Notes

- [X] T026 Run focused tests
  - Reason: Money and recovery behavior can regress across worker and app layers.
  - Expected: All focused operation, worker final-pay, recovery, dispatch, and new guardrail tests pass.
  - Possible bugs: Some tests may depend on environment variables or database state.
  - Fix/Mitigation: Record pre-existing failures and keep new tests isolated.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts`, `cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts`, `cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts`, `cmd /c npx tsx --test tests/integration/operation-dispatch-watchdog.test.ts`, `cmd /c npx tsx --test worker/tests/http-client-payment-classification.test.ts`, `cmd /c npx tsx --test worker/tests/http-client-final-pay-delay.test.ts`.

- [X] T027 Run build and type checks
  - Reason: Route/worker changes cross TypeScript app and worker boundaries.
  - Expected: Type check and production build pass.
  - Possible bugs: Worker-only types may not be covered by Next build.
  - Fix/Mitigation: Run both app build and worker tests/build if available.
  - Verification: `cmd /c npm run build` and any worker build script present in `worker/package.json`.

- [ ] T028 Perform manual quickstart validation from `specs/023-final-payment-guardrails/quickstart.md`
  - Reason: Real beIN, proxy, and provider timing behavior cannot be fully proven by unit tests.
  - Expected: Renewal, delayed provider, installment, and admin review scenarios match the quickstart.
  - Possible bugs: Staging data may not have a card/package with required conditions.
  - Fix/Mitigation: Use controlled test accounts/cards and record unavailable scenarios explicitly.
  - Verification: Complete each quickstart section and capture observed status/result.

- [X] T029 Perform encoding and diff safety checks
  - Reason: Repository editing rules require minimal diffs and no mojibake.
  - Expected: No whitespace errors, no mojibake patterns, no BOM introduced.
  - Possible bugs: Arabic or copied provider text can be corrupted by unsafe write methods.
  - Fix/Mitigation: Use `apply_patch` for edits and scan changed paths.
  - Verification: `git diff --check` and `rg -n "misencoded-text-patterns" src worker tests specs/023-final-payment-guardrails`.

- [X] T030 Prepare production deploy notes
  - Reason: Worker and web must be deployed in a safe order, and migrations if any must run before processes restart.
  - Expected: Notes state whether migration exists, then follow the production deployment order in `AGENTS.md`.
  - Possible bugs: Restarting only web or only worker can run mismatched final-payment logic.
  - Fix/Mitigation: Deploy web, worker, and maintenance together from the same branch.
  - Verification: `pm2 status` and recent `bein-web`, worker, and maintenance logs after deploy.

## Dependencies

- Phase 1 before behavior changes.
- Phase 2 before route/worker changes.
- User Story 1 is the MVP and should be completed before other stories.
- User Story 2 depends on Phase 2 and can proceed after US1 begins if the final-pay helper interface is stable.
- User Story 3 depends on Phase 2 and should reuse the same final payment safety helpers.
- User Story 4 depends on the review outcome categories from US2/US3.
- Final verification depends on all implemented stories.

## Parallel Opportunities

- T001, T002, T003, and T004 can be created in parallel.
- T005 and T006 should be coordinated; T007 and T008 can follow independently.
- T014 and T018/T019 can be written in parallel.
- T020, T021, and T022 touch separate paths but should share refund/review decisions from Phase 2.
- T026 and T029 run after implementation and can be executed separately.

## Implementation Strategy

### MVP First

1. Complete Phase 1 tests.
2. Complete Phase 2 safety helpers.
3. Complete Phase 3 reseller renewal final confirmation and worker pre-Pay guard.
4. Validate renewal no longer auto-refunds/expires after final confirmation.

### Incremental Delivery

1. MVP renewal guardrails.
2. Delayed beIN outcome verification.
3. Installment parity.
4. Admin review closure.

### Safety Rule

After provider Pay may have been submitted, refund is blocked unless the system has confirmed no-charge evidence. Anything else goes to manual review.
