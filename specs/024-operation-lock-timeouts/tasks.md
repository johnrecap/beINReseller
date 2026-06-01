# Tasks: Operation Lock Timeouts

**Input**: Design documents from `specs/024-operation-lock-timeouts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature affects money movement, beIN account assignment, cancellation timing, final Pay safety, and admin unlock behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup And Test Seams

- [X] T001 Add shared operation timing constants in `src/lib/operations/timing.ts`
  - Reason: Package, confirmation, heartbeat, and warning windows must have one source of truth.
  - Expected: Constants expose package selection 30s, confirmation 10s, warning 3s, heartbeat interval 2s, heartbeat stale 5s.
  - Possible bugs: UI and server can drift if one path keeps hardcoded numbers.
  - Fix/Mitigation: Replace hardcoded renewal timing values with the shared constants in later tasks.
  - Verification: `rg -n "120_000|30000|HEARTBEAT_TTL_SECONDS|warningThreshold = 10" src worker tests`

- [X] T002 [P] Add unit test fixtures for renewal timing and lock ownership in `tests/helpers/operation-lock-timeout-fixtures.ts`
  - Reason: Risky behavior needs repeatable fixtures before implementation.
  - Expected: Fixtures can create pre-Pay, final-confirm, final-Pay-started, and review handoff states.
  - Possible bugs: Fixtures can hide real behavior if they omit response evidence.
  - Fix/Mitigation: Include operation status, selected package, customer balance, beIN account id, and final Pay evidence.
  - Verification: `cmd /c npx tsc --noEmit --pretty false`

- [X] T003 [P] Add worker lock helper test seam in `worker/tests/helpers/account-lock-fixtures.ts`
  - Reason: Account locking must be tested without relying only on live Redis timing.
  - Expected: Tests can simulate lock owner, stale lock, release, and force unlock cases.
  - Possible bugs: Mock behavior can diverge from Redis ownership rules.
  - Fix/Mitigation: Mirror owner-check and TTL behavior from current account-locking utilities.
  - Verification: `cmd /c npx tsc -p worker/tsconfig.json --noEmit --pretty false`

---

## Phase 2: Foundational Safety Tests

- [X] T004 [P] Add failing package timer and balance-gate tests in `tests/unit/operation-lock-timeouts.test.ts`
  - Reason: Package selection must expire at 30 seconds and block low balance without deduction.
  - Expected: Tests fail until package selection uses the new 30 second deadline and balance gate.
  - Possible bugs: Test may only check response text and miss lock release.
  - Fix/Mitigation: Assert operation status, transaction count, and lock release intent.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

- [X] T005 [P] Add failing final confirmation timer/idempotency tests in `tests/unit/operation-lock-timeouts.test.ts`
  - Reason: 10 second final confirmation and duplicate submit safety protect customer balance.
  - Expected: Tests fail until final confirmation rejects expired windows and still deducts once only.
  - Possible bugs: Duplicate dispatch can pass if only balance is checked.
  - Fix/Mitigation: Assert deduction count and dispatch/evidence count.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

- [X] T006 [P] Add failing heartbeat exit safety tests in `tests/unit/operation-lock-timeouts.test.ts`
  - Reason: Missing heartbeat must cancel before Pay but not after Pay.
  - Expected: Tests fail until pre-Pay stale heartbeat cancels and post-Pay stale heartbeat moves through review/completion rules.
  - Possible bugs: A post-Pay exit could still call cancellation code.
  - Fix/Mitigation: Assert no refund/cancel when final Pay evidence exists.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

- [X] T007 [P] Add failing account lock isolation tests in `worker/tests/account-lock-timeouts.test.ts`
  - Reason: One beIN account must not serve two active operations.
  - Expected: Tests fail until lock ownership includes operation-aware acquisition/release behavior.
  - Possible bugs: Tests can pass if they check only lock existence, not owner operation.
  - Fix/Mitigation: Assert second operation cannot acquire until first release.
  - Verification: `cmd /c npx tsx --test worker/tests/account-lock-timeouts.test.ts`

- [X] T008 [P] Add failing admin unlock tests in `tests/unit/admin-bein-account-unlock.test.ts`
  - Reason: Admin unlock must release stuck locks without changing financial outcome.
  - Expected: Tests fail until admin unlock enforces authorization, reason, audit, and no money/status mutation.
  - Possible bugs: Test may not cover operations already in review.
  - Fix/Mitigation: Include active, stale, and review-required operations.
  - Verification: `cmd /c npx tsx --test tests/unit/admin-bein-account-unlock.test.ts`

---

## Phase 3: User Story 1 - Reserve One beIN Account Per Active Operation (Priority: P1)

**Goal**: beIN account is owned by one active operation and released on terminal/review handoff.

**Independent Test**: With one eligible beIN account, start two renewals and verify the second cannot use the locked account until the first releases it.

- [X] T009 [US1] Store operation-aware lock owner data in `worker/src/pool/account-locking.ts`
  - Reason: Current locks identify worker ownership but not enough operation context for visibility and release rules.
  - Expected: Lock value includes worker id and operation id without secrets.
  - Possible bugs: Existing unlock ownership checks can fail if value format changes.
  - Fix/Mitigation: Preserve backward compatibility with old string lock values during read/unlock.
  - Verification: `cmd /c npx tsx --test worker/tests/account-lock-timeouts.test.ts`

- [X] T010 [US1] Pass operation id into account acquisition in `worker/src/pool/account-pool-manager.ts`
  - Reason: Lock acquisition must connect a beIN account to the operation that owns it.
  - Expected: New renewal account selection records operation id in the active lock.
  - Possible bugs: Other worker jobs may call account acquisition without operation id.
  - Fix/Mitigation: Keep an overload/default for non-renewal jobs and update renewal paths explicitly.
  - Verification: `cmd /c npx tsc -p worker/tsconfig.json --noEmit --pretty false`

- [X] T011 [US1] Keep renewal lock through active customer decision states in `worker/src/http-queue-processor.ts`
  - Reason: The beIN account must remain reserved from package availability through Pay or safe cancellation.
  - Expected: Lock is not released immediately after packages are loaded; it remains until operation outcome/review handoff.
  - Possible bugs: Long-held locks can expire if TTL is not renewed.
  - Fix/Mitigation: Extend lock while operation remains active and use short decision timers.
  - Verification: `cmd /c npx tsx --test worker/tests/account-lock-timeouts.test.ts`

- [X] T012 [US1] Release lock on completion, pre-Pay cancellation/failure, and review handoff in `worker/src/http-queue-processor.ts`
  - Reason: Locks must not block capacity after the operation no longer needs exclusive provider balance attribution.
  - Expected: Completed, safe failed, pre-Pay cancelled, and review-required operations release the lock after evidence is saved.
  - Possible bugs: Review handoff can release before evidence is persisted.
  - Fix/Mitigation: Release only after the operation update succeeds.
  - Verification: `cmd /c npx tsx --test worker/tests/account-lock-timeouts.test.ts tests/unit/final-payment-guardrails.test.ts`

---

## Phase 4: User Story 2 - Short Decision Windows With Balance Checks (Priority: P2)

**Goal**: 30 second package selection, 10 second confirmations, balance checks at package selection and final confirmation.

**Independent Test**: Let package selection and confirmation expire; verify no deduction before final confirmation and lock release before Pay.

- [X] T013 [US2] Set package-selection deadline to 30 seconds in `worker/src/http-queue-processor.ts`
  - Reason: Packages currently allow a longer selection window that holds beIN accounts too long.
  - Expected: Newly loaded packages expire after 30 seconds.
  - Possible bugs: Existing pollers may still display stale packages after expiry.
  - Fix/Mitigation: Ensure package polling returns expired/cancelled status after deadline.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

- [X] T014 [US2] Enforce package-selection expiry and balance gate in `src/app/api/operations/[id]/select-package/route.ts`
  - Reason: Server must block low balance and expired selection even if UI is stale.
  - Expected: Expired package selection stops safely; insufficient balance blocks without deduction.
  - Possible bugs: Expired operations may remain locked if cancellation path does not release.
  - Fix/Mitigation: Route expired selection through shared pre-Pay cancellation/release behavior.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

- [X] T015 [US2] Set first and final confirmation windows to 10 seconds in `worker/src/http-queue-processor.ts`
  - Reason: Confirmation windows must match the agreed fast decision flow.
  - Expected: First confirmation and final confirmation deadlines are 10 seconds for new operations.
  - Possible bugs: A 10 second timer can expire while the UI is still transitioning.
  - Fix/Mitigation: Start each timer only after the relevant screen/state is ready for the customer.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

- [X] T016 [US2] Re-check balance and idempotency in `src/app/api/operations/[id]/confirm-purchase/route.ts`
  - Reason: Customer balance can change after package selection, and duplicate confirms must not double-charge.
  - Expected: Final confirmation blocks low balance, deducts once, dispatches once, and clears pre-Pay timers.
  - Possible bugs: Legacy amount handling can misread already-deducted operations.
  - Fix/Mitigation: Preserve existing deployment-safety branch for old operations and add tests for both paths.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts tests/unit/final-payment-guardrails.test.ts`

- [X] T017 [US2] Update renewal UI countdown and warning threshold in `src/app/dashboard/renew/page.tsx`
  - Reason: UI must show the correct 30/10/10 windows and 3 second warning.
  - Expected: Package timer and confirmation timers match server deadlines and warn only near expiry.
  - Possible bugs: UI timer can keep running after operation status changes.
  - Fix/Mitigation: Reset timer state on operation id, step, and expiry changes.
  - Verification: Manual quickstart Scenario 4 plus `cmd /c npm run build`

---

## Phase 5: User Story 3 - Cancel On Customer Exit Before Pay (Priority: P3)

**Goal**: Leaving before Pay cancels quickly; leaving after Pay never cancels/refunds automatically.

**Independent Test**: Close the page before Pay and after Pay; verify only pre-Pay cancellation happens.

- [X] T018 [US3] Reduce heartbeat stale threshold to 5 seconds in `src/app/api/operations/[id]/heartbeat/route.ts`
  - Reason: Customer exit should release locks quickly before Pay.
  - Expected: Heartbeat response and expiry logic use the 5 second stale window.
  - Possible bugs: Slow networks may produce false cancellation.
  - Fix/Mitigation: Send heartbeat every 2 seconds and always re-check final Pay evidence before cancellation.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

- [X] T019 [US3] Update heartbeat client interval to 2 seconds in `src/hooks/useOperationHeartbeat.ts`
  - Reason: A 5 second stale threshold needs heartbeat signals more often than every 5 seconds.
  - Expected: Active pre-Pay screens send lightweight heartbeat every 2 seconds.
  - Possible bugs: Increased request rate can add server load.
  - Fix/Mitigation: Avoid unnecessary DB writes when heartbeat expiry does not need extension, if practical.
  - Verification: `cmd /c npm run build`

- [X] T020 [US3] Add best-effort page leave cancellation before Pay in `src/app/dashboard/renew/page.tsx`
  - Reason: A leave signal can cancel faster than waiting for missed heartbeat.
  - Expected: Navigating away or closing the tab before Pay attempts safe cancellation.
  - Possible bugs: Browser may drop the request or send it after Pay started.
  - Fix/Mitigation: Server cancellation must re-check operation phase and reject after Pay.
  - Verification: Manual quickstart Scenario 5

- [X] T021 [US3] Harden cleanup timeout cancellation before/after Pay in `src/app/api/cron/cleanup-stuck-operations/route.ts`
  - Reason: Background cleanup must make the same safe decision as heartbeat.
  - Expected: Pre-Pay stale heartbeat cancels/releases; post-Pay stale heartbeat moves through review/completion rules only.
  - Possible bugs: Cleanup could refund a post-Pay operation.
  - Fix/Mitigation: Use existing final-payment-started evidence checks before any refund.
  - Verification: `cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts tests/unit/operation-lock-timeouts.test.ts`

- [X] T022 [US3] Ensure cancel-confirm cannot cancel after final Pay evidence in `src/app/api/operations/[id]/cancel-confirm/route.ts`
  - Reason: Manual or automatic cancel requests can race with final Pay.
  - Expected: Cancel before Pay is allowed; cancel after Pay is rejected or converted to review-safe handling.
  - Possible bugs: Existing cancel jobs may still run after a state race.
  - Fix/Mitigation: Add worker-side re-check in CANCEL_CONFIRM before pressing provider cancel/refund actions.
  - Verification: `cmd /c npx tsx --test tests/unit/operation-lock-timeouts.test.ts`

---

## Phase 6: User Story 4 - Admin Visibility And Stuck Lock Recovery (Priority: P4)

**Goal**: Admin can inspect and force unlock stuck beIN account locks without deciding money movement.

**Independent Test**: Simulate a stale lock, unlock it as admin, and verify financial state is unchanged.

- [X] T023 [US4] Add lock status reader in `worker/src/pool/account-locking.ts`
  - Reason: Admin UI needs safe lock metadata without provider secrets.
  - Expected: Reader returns locked/unlocked/stale, owner operation id, owner worker id, and lock age when available.
  - Possible bugs: Old lock values may parse as invalid and crash the admin API.
  - Fix/Mitigation: Treat unknown legacy values as locked with unknown owner.
  - Verification: `cmd /c npx tsx --test worker/tests/account-lock-timeouts.test.ts`

- [X] T024 [US4] Add admin force unlock API in `src/app/api/admin/bein-accounts/[id]/unlock/route.ts`
  - Reason: Admins need a controlled recovery path for stuck locks.
  - Expected: Admin-only endpoint requires reason, releases lock, records audit, and does not mutate operation financial status.
  - Possible bugs: Unauthorized users could unlock accounts or unlock could hide money uncertainty.
  - Fix/Mitigation: Enforce admin auth and keep unlock separate from review decisions.
  - Verification: `cmd /c npx tsx --test tests/unit/admin-bein-account-unlock.test.ts`

- [X] T025 [US4] Show lock status and force unlock action in admin beIN accounts UI
  - Reason: Admins need visibility and a controlled button, not hidden manual Redis operations.
  - Expected: UI shows locked/stale status, owner operation id, age, reason input, success, and failure states.
  - Possible bugs: UI could expose sensitive account/session data.
  - Fix/Mitigation: Display labels, ids, and timestamps only; never secrets.
  - Verification: Manual quickstart Scenario 7 plus `cmd /c npm run build`

---

## Phase 7: Polish And Cross-Cutting Verification

- [X] T026 Update recovery-health/admin reporting copy for new timeout behavior
  - Reason: Admins should understand why operations cancel in 30/10/5 second windows.
  - Expected: Admin-facing messages distinguish package timeout, confirmation timeout, heartbeat exit, Pay review.
  - Possible bugs: Messages can imply refund when no refund happened.
  - Fix/Mitigation: Use neutral messages unless a refund transaction exists.
  - Verification: Manual review of admin recovery/operation pages.

- [X] T027 Run focused safety test suite
  - Reason: This feature touches money, Pay safety, lock ownership, and recovery.
  - Expected: Focused unit/integration tests pass or document known environment skips.
  - Possible bugs: Passing new tests while old guardrail tests regress.
  - Fix/Mitigation: Include both 023 guardrail tests and new 024 tests.
  - Verification: `cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts tests/unit/operation-recovery-classifier.test.ts tests/unit/operation-lock-timeouts.test.ts tests/unit/admin-bein-account-unlock.test.ts worker/tests/account-lock-timeouts.test.ts`

- [X] T028 Run type checks and builds
  - Reason: API, UI, worker, and tests must compile together.
  - Expected: App and worker type checks/builds pass.
  - Possible bugs: Worker-only type drift can be missed by app build.
  - Fix/Mitigation: Run both root and worker TypeScript checks.
  - Verification: `cmd /c npx tsc --noEmit --pretty false`; `cmd /c npx tsc -p worker/tsconfig.json --noEmit --pretty false`; `cmd /c npm --prefix worker run build`; `cmd /c npm run build`

- [X] T029 Run manual quickstart validation from `specs/024-operation-lock-timeouts/quickstart.md`
  - Reason: Browser close, real timers, and admin unlock need manual workflow validation.
  - Expected: All seven quickstart scenarios are validated or environment blockers are documented.
  - Possible bugs: Automated tests may not reproduce browser close behavior.
  - Fix/Mitigation: Validate with a real browser and controlled test beIN/admin data before deploy.
  - Verification: Record results against each quickstart scenario.

- [X] T030 Run diff and encoding safety checks
  - Reason: Repository rules require minimal diffs and no mojibake introduction.
  - Expected: No whitespace errors or new mojibake patterns in changed files.
  - Possible bugs: Existing mojibake can be mistaken for newly introduced text.
  - Fix/Mitigation: Scan added lines and new feature docs separately.
  - Verification: `git diff --check`; `git diff -U0 -- . ':!AGENTS.md' | rg -n "^\\+.*(<mojibake-patterns-from-AGENTS>)"`

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 setup and test seams must finish first.
- Phase 2 failing tests must be written before behavior changes.
- US1 lock ownership should be implemented before US2/US3 timing changes so cancellations release real locks.
- US2 can proceed after US1 lock release rules are available.
- US3 depends on US1 release rules and US2 timing constants.
- US4 can proceed in parallel after lock metadata shape from US1 is stable.
- Polish runs after desired user stories are complete.

### MVP Scope

MVP is US1 + US2: one beIN account per active renewal, 30 second package selection, 10 second confirmations, and balance gates. US3 and US4 complete the operational safety net.

### Parallel Opportunities

- T002 and T003 can run in parallel.
- T004 through T008 can run in parallel after fixtures exist.
- T017 can run after timing constants while backend tasks continue.
- T023 through T025 can run after lock metadata is stable.

## Notes

- Do not expand inactive mobile subscription flows.
- Do not expose provider secrets in lock metadata, admin UI, logs, or tests.
- Do not use admin force unlock as a refund, completion, or review decision.
- After Pay may have started, refund remains blocked unless no-charge evidence exists.
