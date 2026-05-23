# Tasks: Operation Timeout Reliability

**Input**: Design documents from `specs/012-operation-timeout-reliability/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/maintenance-contract.md](./contracts/maintenance-contract.md), [quickstart.md](./quickstart.md)

**Tests**: Include focused unit/integration tests, build verification, and staging scenarios because this touches financial state, provider final payment, Redis locks, and PM2 runtime behavior.

**Task Detail Rule**: Every task includes Reason, Fix, Expected, Risk, Mitigation, and Error handling.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm current behavior and prepare safe test coverage before changing lifecycle logic.

- [X] T001 Confirm branch, dirty workspace, and current feature context with `git status --short --branch` and `.specify/feature.json`
  - Reason: This work must not mix with unrelated brand, credit, or previous operation-safety changes.
  - Fix: Record branch and touched files before edits.
  - Expected: A clean baseline with only `specs/012-operation-timeout-reliability` changes before implementation starts.
  - Risk: Accidentally reverting or overwriting unrelated user changes.
  - Mitigation: Review `git diff --name-status` before every implementation batch.
  - Error handling: Stop and ask before touching files if unrelated modified source files are present in the same target areas.

- [X] T002 [P] Map waiting-state deadlines in `worker/src/http-queue-processor.ts`
  - Reason: `AWAITING_PACKAGE` and `AWAITING_FINAL_CONFIRM` already receive hard deadlines, but they are not always persisted as terminal states.
  - Fix: Document where `finalConfirmExpiry`, `heartbeatExpiry`, and `lastHeartbeat` are set.
  - Expected: A short implementation note showing current timeout sources and intended deadlines.
  - Risk: Changing timeout duration without understanding existing UX.
  - Mitigation: Keep existing two-minute package and short final-confirm deadlines unless product explicitly changes them.
  - Error handling: If multiple conflicting deadlines exist, choose the shortest hard deadline only after logging the conflict.

- [X] T003 [P] Map passive expiry responses in `src/app/api/operations/[id]/packages/route.ts` and heartbeat route
  - Reason: Some routes return `EXPIRED` without updating the database.
  - Fix: Identify all UI polling paths that detect expiry.
  - Expected: List of routes that must call the shared recovery service.
  - Risk: UI appears expired while DB still shows active.
  - Mitigation: Require persistence before returning expired status.
  - Error handling: If recovery fails, return a retryable error and keep the operation visible as active/recovering, not silently expired.

- [X] T004 [P] Map cron and dispatch watchdog behavior in `src/app/api/cron/*`
  - Reason: Existing cron endpoints depend on something calling them.
  - Fix: Identify cleanup, timeout, and dispatch routes and their authorization/runtime assumptions.
  - Expected: Confirmation of which recovery paths are passive HTTP endpoints today.
  - Risk: Assuming production cron is configured when PM2 does not show it.
  - Mitigation: Add a PM2-owned maintenance runner in later tasks.
  - Error handling: If CRON_SECRET is missing, maintenance must fail visibly instead of silently doing nothing.

- [X] T005 [P] Map customer deduction timing in `src/app/api/operations/[id]/confirm-purchase/route.ts`
  - Reason: Balance can be deducted before worker completion.
  - Fix: Document the exact point where status becomes `COMPLETING`, balance is deducted, and job dispatch is attempted.
  - Expected: Clear boundary between pre-deduction and post-deduction recovery.
  - Risk: Refunding or failing the wrong phase.
  - Mitigation: Recovery rules must check customer deduction and final Pay evidence.
  - Error handling: If response data is malformed, classify as review-required when money may be affected.

- [X] T006 [P] Compare current final-confirm flow with `origin/main` in `worker/src/http-queue-processor.ts` and `worker/src/http/HttpClientService.ts`
  - Reason: The working `origin/main` flow held the beIN account lock during `CONFIRM_PURCHASE`; the current flow removed that protection and also awaits a final-pay evidence callback before POST Pay.
  - Fix: Document exact differences for account lock scope, OK submit, Pay submit, keepalive overlap, balance-before/after capture, and `finalPaySubmitted` timing.
  - Expected: Evidence fields and lock differences are known before classification and session-safety changes.
  - Risk: Treating form field names as the root cause while missing the session/account race.
  - Mitigation: Use the `origin/main` working pattern as the reference for lock scope and keep current field names unless evidence proves they changed.
  - Error handling: If comparison shows another material difference, add it to this spec before implementation instead of patching blindly.

---

## Phase 2: Foundational (Shared Recovery Rules)

**Purpose**: Build one source of truth for stale operation recovery before route or worker behavior changes.

**CRITICAL**: No endpoint-specific timeout patch should be added before this phase is complete.

- [X] T007 Create focused tests for expiry classification in `tests/unit/operation-recovery-classifier.test.ts`
  - Reason: Timeout rules must be proven before money logic changes.
  - Fix: Add cases for `AWAITING_PACKAGE`, `AWAITING_FINAL_CONFIRM`, `COMPLETING` without deduction, and `COMPLETING` with deduction.
  - Expected: Tests fail until classifier exists.
  - Risk: Writing tests that mirror a bad implementation.
  - Mitigation: Base expected outcomes on [data-model.md](./data-model.md) state rules.
  - Error handling: Add explicit expected review outcome for incomplete evidence.

- [X] T008 Create provider evidence tests in `worker/tests/http-client-payment-classification.test.ts`
  - Reason: Server Error handling must use provider balance evidence.
  - Fix: Test success text, matching balance delta, unchanged balance, and missing balance cases.
  - Expected: Tests fail until classification is centralized.
  - Risk: False success when floating decimals differ slightly.
  - Mitigation: Use decimal-safe amount comparison with a small currency tolerance only if existing code already supports it.
  - Error handling: Ambiguous balance evidence must produce `UNCERTAIN_REVIEW_REQUIRED`.

- [X] T009 Implement recovery classifier in `src/lib/operations/recovery-classifier.ts`
  - Reason: All cleanup callers need the same decision logic.
  - Fix: Add pure functions that return `EXPIRE`, `CANCEL`, `SAFE_REFUND`, `RETRY_DISPATCH`, `COMPLETE`, `REVIEW_REQUIRED`, or `NO_ACTION`.
  - Expected: Unit tests from T007 pass.
  - Risk: Classifier performs database or provider side effects.
  - Mitigation: Keep classifier pure and side-effect free.
  - Error handling: Unknown status returns `NO_ACTION` with reason instead of throwing.

- [X] T010 Implement shared recovery executor in `src/lib/operations/recovery.ts`
  - Reason: Routes and maintenance runner need one idempotent state-change path.
  - Fix: Re-read operation inside a transaction, apply classifier result, update operation, create activity log, refund only when safe, and release locks.
  - Expected: One operation gets one safe recovery outcome.
  - Risk: Duplicate refunds under parallel cleanup.
  - Mitigation: Use conditional status updates and operation-linked refund idempotency.
  - Error handling: If refund fails, mark/keep `REVIEW_REQUIRED` and log refund failure.

- [X] T011 Implement recovery lock helper in `src/lib/operations/recovery-locks.ts`
  - Reason: Multiple maintenance cycles or route calls can process the same operation.
  - Fix: Add short Redis/database lock per operation id and per maintenance category.
  - Expected: Concurrent callers skip or wait safely.
  - Risk: Lock leak keeps operation unrecoverable.
  - Mitigation: Use short TTL and release in finally blocks.
  - Error handling: Lock acquisition failure returns skipped/retry-later result.

- [X] T012 Update operation safety helpers in `src/lib/operation-safety.ts`
  - Reason: Current financial safety decisions must include timeout and dispatch failure phases.
  - Fix: Extend existing safety classification instead of duplicating money rules.
  - Expected: Safe refund vs review-required remains consistent across worker and web.
  - Risk: Breaking existing review/refund behavior.
  - Mitigation: Add tests for existing known categories before changing.
  - Error handling: Any unknown final-payment phase defaults to review-required.

---

## Phase 3: User Story 1 - Abandoned Renewal Expires Reliably (Priority: P1) MVP

**Goal**: Operations abandoned by the user stop being active automatically.

**Independent Test**: Start renewal, leave page, wait past deadline, verify persisted terminal state.

- [X] T013 [US1] Update `src/app/api/operations/[id]/packages/route.ts` to persist hard expiry through the shared recovery service
  - Reason: Returning `EXPIRED` without DB update leaves stale active operations.
  - Fix: Call `recoverOperationIfNeeded` when `finalConfirmExpiry` is past.
  - Expected: Polling the packages endpoint closes expired waiting operations.
  - Risk: Route becomes slower under load.
  - Mitigation: Only call recovery when deadline is actually expired.
  - Error handling: Return recovery failure message and keep operation retryable if DB update fails.

- [X] T014 [US1] Update `src/app/api/operations/[id]/heartbeat/route.ts` to use shared recovery
  - Reason: Heartbeat currently owns some expiry behavior independently.
  - Fix: Replace route-local terminal decisions with shared recovery calls.
  - Expected: Heartbeat and maintenance produce the same status outcome.
  - Risk: Existing heartbeat response shape changes.
  - Mitigation: Preserve current response fields while sourcing status from recovery result.
  - Error handling: If recovery lock is held, return current status with retry hint.

- [X] T015 [US1] Update active operation APIs and UI filters in `src/app/api/operations/route.ts` and `src/app/dashboard/operations/active/page.tsx`
  - Reason: Expired operations should not remain in active views after persistence.
  - Fix: Exclude terminal/review states and surface deadline countdown only for active states.
  - Expected: Active list reflects database truth.
  - Risk: Hiding a still-recovering operation too early.
  - Mitigation: Keep `COMPLETING` visible until recovered or review-required.
  - Error handling: Show recovery-pending state if maintenance is currently processing.

- [X] T016 [US1] Add integration test `tests/integration/operation-timeout-recovery.test.ts`
  - Reason: Unit tests do not prove persistence and active-list behavior.
  - Fix: Seed waiting operation with expired deadline, call packages/heartbeat/recovery, assert DB state.
  - Expected: Operation transitions out of active state.
  - Risk: Test depends on real clock timing.
  - Mitigation: Use fixed timestamps and direct DB seed values.
  - Error handling: If test framework cannot run DB tests locally, document manual SQL/API equivalent in quickstart.

**Checkpoint**: Abandoned package/final-confirm operations persist terminal status without browser heartbeat.

---

## Phase 4: User Story 2 - Deducted Customer Money Never Disappears Silently (Priority: P1)

**Goal**: Any operation with customer balance deduction reaches completed, refunded, or review-required state.

**Independent Test**: Force dispatch/worker failure after deduction and verify visible safe outcome.

- [X] T017 [US2] Add dispatch watchdog helper in `src/lib/queue/dispatch-operation-jobs.ts`
  - Reason: If job dispatch fails after status changes to `COMPLETING`, the operation can remain stuck.
  - Fix: Detect `COMPLETING` operations without a dispatched/active worker job and retry dispatch or recover.
  - Expected: Dispatch failure cannot leave deducted money hidden.
  - Risk: Dispatching duplicate final confirmation jobs.
  - Mitigation: Use idempotent job ids and operation status conditions.
  - Error handling: If dispatch retry fails repeatedly, move to review-required or safe refund based on evidence.

- [X] T018 [US2] Update `src/app/api/operations/[id]/confirm-purchase/route.ts` to record dispatch evidence atomically
  - Reason: Recovery needs to know whether deduction happened and whether dispatch succeeded.
  - Fix: Store phase/evidence in response data before and after dispatch attempt.
  - Expected: Recovery can distinguish pre-dispatch, dispatch-failed, and dispatched states.
  - Risk: Response data merge corrupts legacy JSON/object formats.
  - Mitigation: Use existing safe response-data parser/merge helper.
  - Error handling: Malformed legacy response data is preserved under review evidence, not discarded.

- [X] T019 [US2] Update timeout cron route `src/app/api/cron/timeout-operations/route.ts` to call shared recovery
  - Reason: Timeout route currently has its own stale-operation decisions.
  - Fix: Replace local money/status updates with `recoverOperationIfNeeded`.
  - Expected: Completing timeout behavior matches operation-safety rules.
  - Risk: Existing cron response changes.
  - Mitigation: Preserve summary counts and add decision categories.
  - Error handling: Per-operation errors are counted and logged without failing the whole cycle.

- [X] T020 [US2] Add integration test `tests/integration/operation-dispatch-watchdog.test.ts`
  - Reason: The specific customer complaint is silent deduction without visible result.
  - Fix: Seed deducted `COMPLETING` cases with no job and assert retry/refund/review.
  - Expected: No seeded case remains silently active or failed.
  - Risk: Test accidentally triggers real worker/provider calls.
  - Mitigation: Mock queue/provider boundaries.
  - Error handling: If queue mock fails, assert no money mutation happens.

**Checkpoint**: Deducted operations cannot disappear without refund, completion, or review visibility.

---

## Phase 5: User Story 3 - Final beIN Confirmation Uses One Protected Session (Priority: P1)

**Goal**: Reduce beIN Server Error and false outcomes by protecting final confirmation session/account usage.

**Independent Test**: Concurrent final confirmations on the same beIN account serialize and classify correctly.

- [ ] T021 [US3] Add final confirmation lock tests in `worker/tests/confirm-purchase-account-lock.test.ts`
  - Reason: The old stable flow protected critical beIN session usage; current final confirmation must not overlap.
  - Fix: Test same-account concurrent confirm attempts and keepalive overlap.
  - Expected: Second caller waits/skips safely while first holds final-confirm lock.
  - Risk: Test uses implementation-specific timing.
  - Mitigation: Use fake lock provider and deterministic promises.
  - Error handling: Lock timeout should produce retry/review-safe result, not duplicate pay.

- [X] T022 [US3] Restore final-confirm beIN account locking in `worker/src/http-queue-processor.ts`
  - Reason: beIN WebForms state is not safe for concurrent final payment on the same account/session.
  - Fix: Acquire account lock before restoring operation session and hold through OK, Pay, balance check, classification, and session save.
  - Expected: Final confirmation cannot race with keepalive or another operation on the same beIN account.
  - Risk: Reduced throughput or lock contention.
  - Mitigation: Lock only final confirmation critical section and set short TTL.
  - Error handling: On lock acquisition failure, retry job or keep operation review-safe, never submit Pay twice.

- [X] T023 [US3] Update keepalive/account usage to respect final-confirm lock in `worker/src/http/session-cache.ts` and keepalive worker path
  - Reason: Keepalive can hit the same beIN session during final confirmation.
  - Fix: Skip or defer keepalive for accounts with active final-confirm lock.
  - Expected: Keepalive no longer corrupts ViewState/cart/payment context.
  - Risk: Session expires if keepalive skips too long.
  - Mitigation: Final-confirm lock TTL is short; next keepalive cycle resumes.
  - Error handling: If lock stale, expire it by TTL and log stale lock recovery.

- [X] T024 [US3] Centralize provider payment outcome classification in `worker/src/http/HttpClientService.ts`
  - Reason: Page title "Server Error" alone is not the business outcome.
  - Fix: Classify by success text, pay submitted flag, balance before/after, and expected amount.
  - Expected: Matching balance decrease marks charged/completed; unchanged balance supports safe failure; missing/conflicting evidence goes review.
  - Risk: Floating amount mismatch causes false review.
  - Mitigation: Use existing currency parsing and exact package amount from operation.
  - Error handling: Missing balance after final Pay becomes `UNCERTAIN_REVIEW_REQUIRED`.

- [X] T025 [US3] Ensure final Pay evidence is written only at actual provider Pay submit in `worker/src/http/HttpClientService.ts`
  - Reason: Pre-final confirmation should not be treated as final Pay started.
  - Fix: Move or verify `finalPaySubmitted` evidence at the real direct-payment POST boundary; do not `await` a non-essential DB update before POST Pay, or make it non-blocking if it must happen before the request.
  - Expected: Safe refund remains possible before actual final Pay, and the OK-to-Pay critical window is not widened by database latency.
  - Risk: Marking too late loses evidence if process crashes after submit.
  - Mitigation: Prefer writing immediately after the Pay submit is sent; if writing before submit, do it best-effort without blocking the provider request and keep the final-confirm account lock held.
  - Error handling: If process crashes after evidence write, recovery conservatively routes to review.

**Checkpoint**: Final confirmation is serialized per account and provider outcomes are evidence-based.

---

## Phase 6: User Story 4 - Admin Can See Timeout And Recovery Health (Priority: P2)

**Goal**: Admin/support can detect whether cleanup is running and which cases need action.

**Independent Test**: Create stale cases, run maintenance, and verify health/review visibility.

- [X] T026 [US4] Add maintenance runner in `src/lib/maintenance/operation-maintenance-runner.ts`
  - Reason: HTTP cron routes do nothing unless something calls them.
  - Fix: Implement a server-owned loop that calls shared recovery and dispatch watchdog on intervals.
  - Expected: Cleanup continues even when no browser is open.
  - Risk: Runner crashes and silently stops.
  - Mitigation: Run under PM2 with restart and summary logs.
  - Error handling: Each cycle catches errors, logs them, and schedules next cycle.

- [X] T027 [US4] Add process entry script `src/scripts/operation-maintenance.ts`
  - Reason: PM2 needs a concrete command/process to start.
  - Fix: Bootstrap the maintenance runner with environment validation.
  - Expected: A named `bein-maintenance` process can be started and monitored.
  - Risk: Missing env variables cause silent no-op.
  - Mitigation: Fail fast with clear log if database/Redis/secret config is missing.
  - Error handling: Startup failure exits non-zero so PM2 marks it errored.

- [X] T028 [US4] Update `ecosystem.config.js` or `worker/ecosystem.config.js` to include maintenance process
  - Reason: Deployment must start maintenance with other services.
  - Fix: Add a PM2 app entry with safe restart settings and no duplicate process count.
  - Expected: `pm2 status` shows web, workers, keepalive, and maintenance.
  - Risk: Running multiple maintenance instances creates duplicate recovery attempts.
  - Mitigation: Set one instance and keep leader lock as defense in depth.
  - Error handling: Duplicate runner sees leader lock and skips processing.

- [X] T029 [US4] Add admin recovery health endpoint `src/app/api/admin/recovery-health/route.ts`
  - Reason: Admin needs visible health, not only server logs.
  - Fix: Return last cycle time, stale counts, recent errors, and stuck operation counts.
  - Expected: Admin can tell cleanup is alive within one minute.
  - Risk: Exposing sensitive operation data.
  - Mitigation: Return counts and non-sensitive summaries only.
  - Error handling: If health data missing, return degraded status instead of 500.

- [X] T030 [US4] Add admin recovery health page `src/app/dashboard/admin/recovery-health/page.tsx`
  - Reason: Operators need a simple place to view maintenance status.
  - Fix: Render health cards, recent recovery decisions, and stale process warning.
  - Expected: Stale runner is obvious from the UI.
  - Risk: Adding another admin page without navigation clarity.
  - Mitigation: Link from existing monitoring/review areas only if desired.
  - Error handling: Show degraded/error state when endpoint fails.

- [X] T031 [US4] Ensure review-required cases appear in existing review/admin screens
  - Reason: Uncertain final Pay must not be hidden as failed.
  - Fix: Verify or update financial review filters and user stats to include `REVIEW_REQUIRED`.
  - Expected: Admin sees all financially impacted uncertain cases.
  - Risk: Review queue includes harmless expired operations.
  - Mitigation: Include only cases with deduction, provider uncertainty, or explicit review reason.
  - Error handling: If evidence is incomplete, show "needs manual review" with missing fields listed.

**Checkpoint**: Recovery health and review cases are visible to admin/support.

---

## Phase 7: User Story 5 - Production Rollout Is Safe Under Pressure (Priority: P2)

**Goal**: Validate under concurrent usage and deploy without breaking unrelated panel features.

**Independent Test**: Run the quickstart scenarios and build checks before production deploy.

- [ ] T032 [US5] Run abandoned package selection scenario from `specs/012-operation-timeout-reliability/quickstart.md`
  - Reason: This verifies the original two-minute timeout complaint.
  - Fix: Execute scenario and record result.
  - Expected: Operation closes automatically and no balance is deducted.
  - Risk: Testing only UI hides DB persistence issue.
  - Mitigation: Check database/API status after UI closes.
  - Error handling: If operation remains active, inspect maintenance logs and recovery lock state.

- [ ] T033 [US5] Run final confirmation abandonment scenario from `specs/012-operation-timeout-reliability/quickstart.md`
  - Reason: This verifies final confirm does not hang for hours/days.
  - Fix: Execute scenario and record result.
  - Expected: Operation becomes terminal or review-required within target time.
  - Risk: Mistaking review-required for failure.
  - Mitigation: Check financial evidence and expected state.
  - Error handling: If stuck, manually run recovery endpoint and compare result.

- [ ] T034 [US5] Run dispatch failure after deduction scenario from `specs/012-operation-timeout-reliability/quickstart.md`
  - Reason: This verifies silent customer deduction recovery.
  - Fix: Pause/mock dispatch in staging and run recovery.
  - Expected: Retry, safe refund, or review-required occurs exactly once.
  - Risk: Triggering real provider final Pay during test.
  - Mitigation: Mock provider or use staging account only.
  - Error handling: If provider may have been hit, move case to review and do not auto-refund.

- [ ] T035 [US5] Run concurrent same-account final confirmation scenario
  - Reason: This validates the account lock under pressure.
  - Fix: Start two final confirms on the same beIN account and observe locking.
  - Expected: No overlapping final Pay and no duplicate charges.
  - Risk: Real double charge in production.
  - Mitigation: Use staging/test account or dry-run/mocked provider.
  - Error handling: If overlap detected, stop deployment and keep old flow.

- [X] T036 [US5] Run `npm run build`
  - Reason: Web routes, admin pages, and shared TypeScript must compile.
  - Fix: Build the root app.
  - Expected: Build passes.
  - Risk: Hidden route/type errors reach production.
  - Mitigation: Treat build failure as deployment blocker.
  - Error handling: Fix compile errors before any deploy command.

- [X] T037 [US5] Run `npm --prefix worker run build`
  - Reason: Worker payment/session changes must compile.
  - Fix: Build worker package.
  - Expected: Worker build passes.
  - Risk: Root build passes but worker crashes in production.
  - Mitigation: Worker build is mandatory gate.
  - Error handling: Fix worker types before restart.

- [X] T038 [US5] Run `git diff --check`
  - Reason: Keep deployment diff clean.
  - Fix: Check whitespace errors.
  - Expected: No diff-check failures.
  - Risk: Patch artifacts or line-ending issues.
  - Mitigation: Fix only reported changed lines.
  - Error handling: Do not ignore diff-check failure in source/migration files.

- [X] T039 [US5] Run changed-file mojibake scan
  - Reason: Repository has Arabic UI text and encoding safety rules.
  - Fix: Scan changed files for new mojibake markers.
  - Expected: No new mojibake markers, replacement characters, or corrupted Arabic text.
  - Risk: False positives from existing template text.
  - Mitigation: Compare only changed files and inspect context.
  - Error handling: Revert only the corrupted edit, not unrelated user changes.

---

## Final Phase: Deployment And Monitoring

**Purpose**: Make production deployment observable and reversible.

- [X] T040 Document production deployment commands in `specs/012-operation-timeout-reliability/quickstart.md`
  - Reason: Restarting web/worker without maintenance leaves the same bug.
  - Fix: Include commands to build web, build worker, start/restart maintenance, save PM2, and verify status.
  - Expected: Operator can deploy without missing maintenance.
  - Risk: Wrong command stops all services unnecessarily.
  - Mitigation: Use targeted `pm2 restart`/`pm2 start` commands and verify process names.
  - Error handling: Include rollback note to stop maintenance and restart previous web/worker commit if needed.

- [X] T041 Add log examples for successful recovery and review-required outcomes
  - Reason: Operators need to know what normal recovery looks like.
  - Fix: Document expected log snippets without secrets.
  - Expected: Support can distinguish healthy cleanup from failure.
  - Risk: Logs reveal user/proxy/provider secrets.
  - Mitigation: Mask card, account, proxy, and credential values.
  - Error handling: If sensitive data is found in logs, mask it before release.

- [X] T042 Update admin/support runbook for stuck operations
  - Reason: Manual cancellation should become fallback, not normal workflow.
  - Fix: Add steps: check health, check review queue, inspect operation evidence, avoid manual refund if provider may have charged.
  - Expected: Admin follows a consistent process for suspicious cases.
  - Risk: Human refunds a charged operation.
  - Mitigation: Runbook emphasizes provider balance evidence and review-required state.
  - Error handling: If evidence conflicts, escalate instead of deciding automatically.

- [X] T043 Commit only focused reliability changes after all gates pass
  - Reason: Financial and provider fixes must be reviewable.
  - Fix: Stage only files tied to this spec.
  - Expected: One focused commit for operation timeout reliability.
  - Risk: Mixing unrelated UI/spec changes.
  - Mitigation: Review `git diff --name-status` and `git diff --cached`.
  - Error handling: Unstage unrelated files and leave them untouched.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **US1 (Phase 3)**: Depends on shared recovery service.
- **US2 (Phase 4)**: Depends on shared recovery and operation safety.
- **US3 (Phase 5)**: Can start after evidence tests but should complete before pressure rollout.
- **US4 (Phase 6)**: Depends on shared recovery service and can run alongside US3 after Phase 2.
- **US5 (Phase 7)**: Depends on selected implementation phases.
- **Final Phase**: Runs after verification gates.

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 abandoned operation expiry.
3. Complete US2 deducted-money recovery.
4. Stop and validate quickstart scenarios 1-3 before final beIN lock work.

### Parallel Opportunities

- T002-T006 can run in parallel.
- T007 and T008 can run in parallel.
- T013-T016 and T017-T020 can be implemented by separate workers after Phase 2.
- T026-T031 can run alongside US3 after shared recovery exists.
- T036 and T037 can run in parallel.

## Notes

- Do not implement automatic refund after final Pay uncertainty.
- Do not rely on browser heartbeat as the only timeout mechanism.
- Do not rely on HTTP cron endpoints unless a runner or external cron is verified.
- Do not expose beIN credentials, proxy credentials, Telegram token, or raw cookies in logs.
- Do not change unrelated credit-agent, points, rewards, or panel redesign behavior.
