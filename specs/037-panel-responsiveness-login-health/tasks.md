# Tasks: Panel Responsiveness and beIN Login Health

**Input**: spec.md, plan.md, research.md, data-model.md and contracts in this feature.
**Prerequisites**: Planning analysis passes before runtime work is authorized.
**Tests**: Required test-first for account eligibility, recovery and financial-command uncertainty.
**Organization**: Stories are independently testable; direct sequential work, no sub-agents.

## Format: `[ID] [P?] [Story] Description`

Implementation is authorized from 2026-11-04. Tasks remain unchecked until their verification requirements pass. Paths are repository-relative. New files were marked planned at design time. Requirements and dependencies follow each task.

## Required Detail Block For Every Task

Each task retains all five fields from the original task template: Reason, Expected, Possible bugs, Fix/Mitigation and Verification. Checking a task requires current task-specific evidence; documentation does not complete runtime tasks.

## Path Conventions

Existing roots are src, shared, worker/src, tests and worker/tests. Evidence belongs to this feature; existing 027/036 artifacts retain their statuses.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Refresh current source evidence and complete the connected-consumer inventory before implementation.

- [ ] T001 Reconcile source baseline and C01–C07 consumers in `specs/037-panel-responsiveness-login-health/research.md` and `analysis.md`
  - Requirements: FR-007, FR-023, FR-024, SC-007. Depends on: none.
  - Reason: New consumers or source drift could invalidate the planned fix and hide navigation-specific causes.
  - Expected: Current source hashes, complete command/login call-site inventory, conflict keys and unresolved production gaps recorded before runtime edits.
  - Possible bugs: Treating a broad disabled fieldset as proof of the separate navigation freeze; borrowing historical test acceptance.
  - Fix/Mitigation: Reinspect actual shell/dialog/caller paths and distinguish observed behavior, source finding and unverified incident cause.
  - Verification: Q01; rg all PanelDialog/usePanelCommand/busy and recordLoginFailure/login/reLogin callers; compare every match with C01–C07 and the health caller matrix.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish source and planning prerequisites without duplicating existing infrastructure.

**⚠️ CRITICAL**: No runtime changes start until the planning gate and T001 baseline are complete and implementation is authorized.

**Checkpoint**: T001 evidence and the documentation gate permit test authoring; T003–T004 supply the shared command foundation.

T001 and a passing planning gate precede all runtime work. Reuse installed auth, Redis, queue, request and browser infrastructure; no blanket project initialization or package installation. The shared command foundation is owned by US1/T003–T004 rather than duplicated here.

## Phase 3: User Story 1 - Keep using the panel during work (Priority: P1)

**Goal**: SC-001/002/006, preserving interactive navigation and independent work while a command is pending.

**Independent Test**: Hold a command response, hide the dialog, operate a different resource and return without duplicate dispatch, stale writes or blocked pointer/focus.

### Tests for User Story 1 (required)

- [ ] T002 [US1] Add delayed-interaction regressions in `tests/browser/panel-command-cases.cjs`, `panel-bein-dialog-cases.cjs` and `fixtures/panel-ui-entry.jsx`
  - Requirements: FR-001, FR-002, FR-006, FR-007, SC-001, SC-006. Depends on: T001.
  - Reason: Existing busy assertions do not establish that unrelated mouse/keyboard interaction remains possible.
  - Expected: Reproduce blocked Hide/controls and add actual pointer, focus, overlay and delayed-body scenarios for representative C01 before fixing it.
  - Possible bugs: Mock-only navigation masks actual App Router boundaries; a test only checks disabled attributes.
  - Fix/Mitigation: Use real clicks/elementFromPoint and separate fixture interaction proof from isolated real-route loading checks in Q04.
  - Verification: Q04 command and bein-dialogs scopes; capture the expected red case before T005 and retain screenshots/semantic observations.

- [ ] T003 [US1] Author command state/uncertainty cases in planned `tests/unit/panel-command-state.test.ts`
  - Requirements: FR-003, FR-004, FR-005, FR-022, SC-002. Depends on: T001.
  - Reason: Moving ownership can silently permit duplicate financial requests or leak prior-actor form data.
  - Expected: Tests cover atomic multi-resource claims, same/different targets, immutable attempts, storage denial, reload, actor switch and stale results.
  - Possible bugs: Treating any 4xx as pre-effect rejection or releasing uncertainty after a balance read.
  - Fix/Mitigation: Encode endpoint-known pre-effect failures only; unknown outcomes stay blocked; test no payload/secrets in storage.
  - Verification: Q02 `node --import tsx --test tests/unit/panel-command-state.test.ts`; if a seam is needed, extract a behavior-preserving seam before the new assertions and record meaningful red evidence.

### Implementation for User Story 1

**Checkpoint**: After T008, every C01–C07 consumer meets its declared interaction contract; later cross-story integration/visual gates remain open.

- [ ] T004 [US1] Implement dashboard command ownership in planned `src/lib/panel-command-state.ts`, planned `src/components/providers/PanelCommandProvider.tsx`, `src/hooks/usePanelRequest.ts` and `src/components/layout/DashboardShell.tsx`
  - Requirements: FR-001, FR-003, FR-004, FR-005, FR-022, SC-002. Depends on: T002, T003.
  - Reason: Component-local controllers/uncertainty disappear during route or dialog unmount.
  - Expected: Stable per-attempt ownership, advisory resource claims and safe tombstones follow the command contract; read-generation behavior is preserved.
  - Possible bugs: One controller aborts another command; tombstones expire or logout exposes private data; storage failures send unprotected mutations.
  - Fix/Mitigation: Separate controllers, actor partitions and payload lifetimes; write tombstone before dispatch; no automatic financial retry or uncertainty expiry.
  - Verification: Q02 command-state cases and Q04 command scope, including same-tab reload and actor transitions.

- [ ] T005 [US1] Repair shared pending-dialog behavior and C01 in `src/components/ui/dialog.tsx` and `src/app/dashboard/admin/bein-accounts/page.tsx`
  - Requirements: FR-001, FR-002, FR-005, FR-006, SC-001, SC-006. Depends on: T004.
  - Reason: The page fieldset and busy-close guards block independent interaction.
  - Expected: Pending Hide/X/Escape works, form payload stays frozen, unrelated rows work and success refresh does not lock the whole page.
  - Possible bugs: Removing all modality weakens confirmation; body pointer-events hacks hide broken portal cleanup.
  - Fix/Mitigation: Preserve pre-submit modality; rely on Radix lifecycle and keyed state; verify this representative unit before migrating remaining consumers.
  - Verification: Q04 bein-dialogs red cases become green with mouse/keyboard/overlay evidence at three widths; inspect C01 semantically before T006–T008.

- [ ] T006 [US1] Migrate C02 user-money consumers in `src/components/admin/users/AddBalanceDialog.tsx`, `CreditControlDialog.tsx`, `UserStatsDialog.tsx` and `src/components/manager/users/ManagerAddBalanceDialog.tsx`
  - Requirements: FR-001–FR-005, FR-007, SC-001, SC-002. Depends on: T005.
  - Reason: Balance and correction dialogs have blocking close guards and correction uses an unbounded raw fetch.
  - Expected: Scoped pending/uncertain protection, hidden-result tracking and shared body deadlines; no financial endpoint semantics change.
  - Possible bugs: Hiding restarts a correction, stale stats overwrite a newer response or funding-source actions overlap.
  - Fix/Mitigation: Share user/funding conflict keys and immutable attempt state; ordinary stats reads cannot settle unknown mutations.
  - Verification: Q04 financial/stats/dialogs and Q02 actual request-count fixtures; assert one mutation after hide, reopen and reload.

- [ ] T007 [US1] Migrate C03–C04 administration/credit consumers listed in `research.md` under `src/components/admin/users`, `src/components/manager`, `src/components/users`, `src/components/admin/agents`, `src/components/agent` and credit-request components
  - Requirements: FR-001–FR-007, SC-001, SC-002. Depends on: T006.
  - Reason: Shared-dialog changes alone cannot remove parent busy-close guards or conflicting resource mistakes.
  - Expected: Every named C03/C04 component uses its declared conflict set and retains permission/validation/confirmation behavior.
  - Possible bugs: Username creation keys expose input or transfers lock only one affected party.
  - Fix/Mitigation: Use deterministic non-secret identity digest for create keys, never raw names/passwords in tombstones; atomically claim all affected resources.
  - Verification: Q04 users/dialogs/financial and task-specific request-count cases for each named consumer; retain full coverage matrix, not a sample pass.

- [ ] T008 [US1] Migrate C05–C07 and navigation in `src/components/admin/financial-review/FinancialReviewClient.tsx`, `src/components/renewal/InstallmentPaymentFlow.tsx`, `src/app/dashboard/operations/active/page.tsx`, permissions/proxies/reward components, `src/components/layout/SidebarFrame.tsx` and planned `src/app/dashboard/loading.tsx`
  - Requirements: FR-001–FR-007, FR-023, SC-001, SC-002, SC-006. Depends on: T007.
  - Reason: Full-panel scope includes operational confirmation, bulk/settings/reward actions and navigation, not just account dialogs.
  - Expected: Complete C05–C07 coverage; shell remains usable during content loading; current payment/review proof rules remain unchanged.
  - Possible bugs: Confirmation replay, partial bulk resource acquisition, mobile overlay remains or an invented navigation fix lacks reproduction.
  - Fix/Mitigation: Preserve existing durable operation identities/confirmations, atomically claim bulk resources, test actual router/loading boundaries and record any unproven cause explicitly.
  - Verification: Q04 operation-dialogs/active/review/installments/proxies/eid/acceptance, plus real-route delayed loading and C06 permissions cases; Q03 financial invariants.

## Phase 4: User Story 2 - Follow a balance refresh (Priority: P1)

**Goal**: SC-003 and one attributable read-only refresh with explicit outcomes.

**Independent Test**: Submit duplicate refreshes to fixtures, hold provider execution, navigate away, then finish/fail/expire and verify one account-bound result.

### Tests for User Story 2 (required)

- [ ] T009 [US2] Author planned `tests/unit/bein-balance-refresh.test.ts`, `tests/integration/bein-balance-refresh.test.ts` and `worker/tests/bein-balance-refresh.test.ts`
  - Requirements: FR-008–FR-012, FR-022, SC-003. Depends on: T001.
  - Reason: Current timestamp polling and swallowed Worker errors can produce false completion or long timeout.
  - Expected: Red contracts for attributable result, errors, duplicate admission, expired/late claims, lost enqueue reply, auth binding and legacy clients.
  - Possible bugs: Fake Redis tests prove no atomicity; old CHECK_BALANCE is accidentally treated as dealer display read.
  - Fix/Mitigation: Add disposable Redis contention plus existing-account lease assertions; cover both distinct job semantics and legacy payloads.
  - Verification: Q02 all three explicit files; Q03 disposable Redis cases, recorded separately from mock results.

### Implementation for User Story 2

**Checkpoint**: After T013, asynchronous and legacy refresh contracts pass focused tests; native and combined evidence remains T020–T024.

- [ ] T010 [US2] Add planned `shared/bein/balance-refresh.ts` and `shared/bein/balance-refresh-store.ts`
  - Requirements: FR-008–FR-011, FR-022, SC-003. Depends on: T009.
  - Reason: BullMQ removal loses the result needed to attribute one account refresh.
  - Expected: Atomic account admission, owner claims, bounded deadlines/retention and terminal outcome per the balance contract.
  - Possible bugs: TTL expires before execution drains; old worker overwrites a newer result; ambiguous enqueue releases admission.
  - Fix/Mitigation: Enforce request/run identity, underlying execution lease and retention bounds; preserve uncertain dispatch identity.
  - Verification: Q02 store cases and Q03 duplicate-claim, late-write, TTL and unavailable-Redis checks.

- [ ] T011 [US2] Extend `src/app/api/admin/bein-accounts/[id]/check-balance/route.ts` and reuse `src/lib/queue.ts`
  - Requirements: FR-008, FR-009, FR-011, FR-012, FR-022, SC-003. Depends on: T010.
  - Reason: Per-request Queue allocation and synchronous provider waits couple UI latency to external work.
  - Expected: Async 202, bound GET/active lookup and legacy adapter share one store/job; current ADMIN/mobile authorization remains intact.
  - Possible bugs: Cross-account request leakage, malformed mode accepted, old clients break or missing Redis is misreported as no active work.
  - Fix/Mitigation: Validate before admission, bind request/account and current ADMIN on every read, preserve legacy top-level fields and expose safe 503 uncertainty.
  - Verification: Q02 route contract cases for unauthorized/foreign/disabled/legacy/async/lost-response paths and response timing under held provider work.

- [ ] T012 [US2] Wire refresh lifecycle in `worker/src/http-queue-processor.ts` and shared queue payload definitions
  - Requirements: FR-009–FR-012, FR-017, FR-023, SC-003. Depends on: T011.
  - Reason: The existing balance catch swallows errors and cannot attach completion to an admitted request.
  - Expected: Request-owned read/write/finish, correctly rejected failures, bounded HTTP and unchanged account execution guards; legacy jobs remain supported.
  - Possible bugs: Login-owned revision advancement is mistaken for ADMIN drift; late writes overwrite recovery; DB success but Redis failure is called success.
  - Fix/Mitigation: Use current ownership/revision guards, reject stale terminal writes, keep result-loss uncertain and drain HTTP before owned lock cleanup.
  - Verification: Q02 Worker cases and Q03 account edit/recovery race, lease conflict, missing balance, crash and result-write failure scenarios.

- [ ] T013 [US2] Add planned `src/hooks/useBeinBalanceRefresh.ts` and integrate `src/app/dashboard/admin/bein-accounts/page.tsx`
  - Requirements: FR-008–FR-012, FR-021, SC-001, SC-003. Depends on: T005, T012.
  - Reason: The new contract requires short follow-up reads independent of route lifetime.
  - Expected: Two-second nonoverlapping polling, active lookup recovery, per-row progress/result and explicit unavailable/expired states through dashboard ownership.
  - Possible bugs: Poll continues after logout, duplicate POST after lost reply or late result targets another row.
  - Fix/Mitigation: Bind account/request, suspend hidden/offline reads, reconcile active request before explicit read-only retry and never infer financial outcomes.
  - Verification: Q04 bein-dialogs with accepted/queued/running/completed/failed/unavailable/expired cases, navigation return and independent second-account refresh.

## Phase 5: User Story 3 - Repair unusable provider logins (Priority: P1)

**Goal**: SC-004/005, consistent first-terminal quarantine and protected recovery.

**Independent Test**: Run the typed final/intermediate/system/transport matrix and an old-revision result racing manual recovery; assert exact activity/count/reason outcomes.

### Tests for User Story 3 (required)

- [ ] T014 [US3] Extend `worker/tests/login-failure-classification.test.ts`, `login-tracking-recovery.test.ts`, `keepalive-login-recovery.test.ts` and `login-retry-consumers.test.ts`
  - Requirements: FR-013–FR-020, FR-022, SC-004, SC-005. Depends on: T001.
  - Reason: Existing expectations intentionally do not disable unknown outcomes and only count credentials.
  - Expected: Red cases for first-terminal quarantine, final CAPTCHA versus challenge, local pre-auth failure, transport warning and every caller; credential counter meaning is preserved.
  - Possible bugs: Renaming a test expectation hides a semantic regression; system/HTTP errors are treated as bad passwords.
  - Fix/Mitigation: Assert actual SQL predicates/activity/count plus attempt-started/terminal context; preserve 402/407/429 classification and fresh-session success cases.
  - Verification: Q02 existing four-suite command plus Q03 real current-revision/ADMIN race before policy acceptance.

### Implementation for User Story 3

**Checkpoint**: After T018, all inventoried login callers and activation routes follow the policy; full locale/native/browser release checks remain open.

- [ ] T015 [US3] Extend `shared/bein/login-failure.ts`, `worker/src/http/types.ts`, `worker/src/http/HttpClientService.ts` and `worker/src/lib/bein-login-tracking.ts`
  - Requirements: FR-013–FR-017, FR-020, FR-022, SC-004. Depends on: T014.
  - Reason: Typed failure alone lacks terminal-attempt context and current writes depend on a threshold.
  - Expected: Shared final-outcome policy and safe codes, immediate current-revision quarantine, credential-only counts and visible transport/system warnings.
  - Possible bugs: Counting each CAPTCHA retry; revision read failure permits untrackable login; stale warning erases recovery.
  - Fix/Mitigation: Record once after existing recovery, stop before HTTP on missing revision and preserve atomic CAS without retrying against a newer revision.
  - Verification: Q02 policy/tracking tests including persistence failure and positive-auth evidence; Q03 SQL races with duplicate terminal reports.

- [ ] T016 [US3] Migrate all callers in `worker/src/http-queue-processor.ts`, `worker/src/lib/session-keepalive.ts`, `worker/src/lib/provider-report-reader.ts` and inspect `worker/src/pool/account-pool-manager.ts`
  - Requirements: FR-014–FR-017, FR-023, SC-004. Depends on: T012, T015.
  - Reason: Credential-only wrappers and generic pool failures can bypass or contradict the unified policy.
  - Expected: Every fresh/reLogin/CAPTCHA/no-key path records the correct final outcome; transport does not indirectly disable via generic failure counters.
  - Possible bugs: Increased retries/concurrency, lost operation reservations or automatic recovery of a quarantined account.
  - Fix/Mitigation: Preserve existing bounds and snapshot/lease rules; prevent login transport fallthrough only if found, preserving the observed unrelated low-balance caller of markAccountFailed; fail work safely on persistence errors.
  - Verification: Q02 complete caller matrix plus existing recovery/proof regressions; Q03 assignment denied after disable without changing in-flight financial outcomes.

- [ ] T017 [US3] Route every activation through `src/lib/bein-account-recovery.ts`: `src/app/api/admin/bein-accounts/[id]/toggle/route.ts`, `[id]/low-balance/reactivate/route.ts`, `[id]/route.ts` PUT; verify reset endpoints
  - Requirements: FR-017, FR-019, FR-022, SC-004, SC-005. Depends on: T015.
  - Reason: Raw toggle activation can bypass the protected reset-and-activate invariants.
  - Expected: Toggle, low-balance reactivation and edit-to-active all use protected recovery; combined edit/activation is atomic, retains validation/audit and advances revision; counter-only reset never activates.
  - Possible bugs: Clearing another owner's lock, reactivating while reserved or losing unrelated request budgets/snapshots.
  - Fix/Mitigation: Extend the helper only to accept the validated combined edit patch under its owned transaction; busy/recovery failure leaves all edit fields unchanged, and selected-account cleanup preserves unrelated resources.
  - Verification: Q02 existing recovery route tests; Q03 old-failure and old-success races against reset/toggle, asserting unrelated locks/finances unchanged.

- [ ] T018 [US3] Update `src/app/api/admin/bein-accounts/login-failures/route.ts`, `src/components/admin/report-center/LoginMonitorPanel.tsx`, `src/components/admin/SettingsForm.tsx` and account-list health rendering
  - Requirements: FR-018–FR-021, SC-005, SC-006. Depends on: T016, T017.
  - Reason: Threshold filtering hides first and noncredential failures; activity is absent from monitor DTO.
  - Expected: First failure/warning visibility with category/activity and recovery guidance; deprecated threshold metadata is compatible and editing no longer governs policy.
  - Possible bugs: Transport warning says wrong password, manually disabled rows get invented login reasons or old strings render raw secrets.
  - Fix/Mitigation: Decode allowlisted/legacy reasons safely; distinguish warning/review/activity; preserve empty/error/forbidden states and no bulk backfill.
  - Verification: Q02 monitor DTO cases and Q04 report/beIN/settings cases covering every category, legacy reason, first failure, inactive-only and failed reads.

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Verify all stories together, retain semantic evidence and synchronize the implementation handoff without claiming production deployment.

- [ ] T019 Complete ar/en/bn messages in `src/i18n/translations/ar.ts`, `en.ts`, `bn.ts` for all new command/refresh/health consumers
  - Requirements: FR-021, FR-022, SC-006. Depends on: T008, T013, T018.
  - Reason: New states must not leak raw errors or hardcoded untranslated copy.
  - Expected: Existing catalog namespaces cover pending/hide/uncertain/storage/unavailable/health/recovery states and accessible labels.
  - Possible bugs: Missing Bengali key, RTL focus/layout regression, warning communicates false credential certainty.
  - Fix/Mitigation: Use typed catalog keys, inspect all three translations in context and preserve message meanings across failure categories.
  - Verification: Q02 catalog coverage and Q04 locale/keyboard/360-768-1280 semantic review; changed-string/mojibake scan.

- [ ] T020 Complete native race and money-safety evidence in planned `tests/integration/bein-login-health.test.ts`, `tests/integration/bein-balance-refresh.test.ts` and `specs/037-panel-responsiveness-login-health/evidence/`
  - Requirements: FR-004, FR-009–FR-012, FR-015–FR-019, FR-023, SC-002–SC-005. Depends on: T013, T018.
  - Reason: Mocks cannot establish Redis/SQL ownership or prove no unintended financial effects.
  - Expected: Disposable-service evidence covers duplicate admission, process interruption, result loss, revision recovery races and exact untouched money/snapshots.
  - Possible bugs: Ambient production connection used; skipped native cases reported as passing.
  - Fix/Mitigation: Validate isolated test ownership before connecting; record cleanup and skip/block reasons; never run business/provider operations.
  - Verification: Q03 explicit integration files with before/after synthetic-state assertions, no unintended balance/refund/provider actions and cleanup receipts.

- [ ] T021 Finish C01–C07 browser and semantic evidence in `tests/browser/panel-ui-repairs.cjs`, connected case modules and `specs/037-panel-responsiveness-login-health/evidence/`
  - Requirements: FR-001–FR-008, FR-018, FR-021, SC-001, SC-002, SC-003, SC-005, SC-006. Depends on: T019, T020.
  - Reason: A representative pass is insufficient for the accepted whole-panel scope.
  - Expected: Every inventory consumer has delayed-response, hide/navigation and duplicate/conflict results; actual App Router shell evidence is separate from mock navigation.
  - Possible bugs: Screenshot-only claims miss blocked clicks, wrong focus, lost reload protection or misleading state copy.
  - Fix/Mitigation: Combine pointer hit-testing and request counts with screenshots and per-scenario semantic judgment; record unverified production behavior separately.
  - Verification: Q04 complete matrix, exact commands/screenshots and human-readable behavior observations per consumer/locale/viewport.

- [ ] T022 Run integrated checks from `package.json`, `worker/package.json` and `quickstart.md` against final runtime changes
  - Requirements: FR-021–FR-023, SC-002, SC-004, SC-006. Depends on: T021.
  - Reason: Shared hooks/types and Worker changes can break untouched callers or builds.
  - Expected: Current root/Worker suites, types, schema-sync, lint, isolated builds and encoding checks with precise limits.
  - Possible bugs: Testing stale generated files, overwriting a running .next or passing only focused suites as full coverage.
  - Fix/Mitigation: Follow Q05 isolation, inspect scripts, report actual commands/counts/skips and distinguish baseline from introduced failures.
  - Verification: Q05 exact commands and receipts on current source; no release PASS if a required check remains missing.

- [ ] T023 Reconcile runtime delivery in `specs/037-panel-responsiveness-login-health/analysis.md`, `tasks.md`, `docs/PROJECT_GUIDE.md` and `PROJECT_MEMORY.md`
  - Requirements: FR-007, FR-023, FR-024, SC-007. Depends on: T022.
  - Reason: Saved documentation can drift from implementation and hide unchecked scope.
  - Expected: Current task/requirement/evidence mapping, synchronized handoff and re-run analyze; implementation phase later uses converge until no new tasks.
  - Possible bugs: Historical 027/036 gates or user acceptance are incorrectly inferred from local test passes.
  - Fix/Mitigation: Preserve historical IDs/statuses, current hashes and separate mechanical/semantic/production acceptance; never manufacture approval.
  - Verification: Q01 full original-template/detail/link/coverage checks plus ledger validation/freshness and semantic review of actual final diff.

- [ ] T024 Prepare release compatibility evidence in `specs/037-panel-responsiveness-login-health/quickstart.md` and its `evidence/` directory
  - Requirements: FR-011, FR-012, FR-017, FR-020, FR-023, SC-007. Depends on: T023.
  - Reason: Mixed old/new workers can misreport jobs or retain old quarantine policy.
  - Expected: Local compatibility rehearsal and a concrete coordinated release/rollback handoff; production evidence remains separately pending until authorized and observed.
  - Possible bugs: Old worker consumes new job, rollback reactivates accounts or web builds under active traffic.
  - Fix/Mitigation: Drain old consumers before admission, preserve disabled states and exact reviewed topology, stop web before replacing .next; no schema migration for 037.
  - Verification: Q06 legacy/async/old-payload rehearsal and reviewed artifact order; list unexecuted production steps without claiming deployment.

## Dependencies & Execution Order

### Phase Dependencies

T001 precedes all work; US1 tests T002/T003 precede T004; C01/T005 must pass before C02–C07 migration. US2 is T009→T010→T011→T012→T013, with T005 needed for the UI. US3 starts T014→T015, then T016 (also T012) and T017 before T018. T019–T024 integrate all stories.

### User Story Dependencies

US1 state/UI and US2 backend have independent tests, but US2 UI reuses US1. US3 policy is independently testable, while its queue integration follows US2's handler edit to avoid divergent shared-file changes. No simultaneous producers are used.

### Within Each User Story

Capture red behavioral evidence before runtime changes; extract only the narrow seam needed. Keep test writing, code acceptance, visual/semantic evidence and production verification distinct.

### Parallel Opportunities

None scheduled: the user requires direct work without sub-agents. Independent test designs may be reasoned about separately, but shared-file changes execute sequentially.

## Parallel Example: User Story 1

Not scheduled under the no-agent instruction. T002 then T003 then T004 is the selected execution order; no worker/team commands are authorized.

## Implementation Strategy

### MVP First (User Story 1 Only)

Validate C01 after T005 before propagating the shared behavior. This is a representative quality gate, not completion of the requested panel-wide feature.

### Incremental Delivery

Finish remaining US1 consumers, US2 and US3; then local integration, visual review, combined checks and handoff. Do not replace the full requested scope with the representative slice.

### Parallel Team Strategy

Not applicable: direct single-chat work is required and all task ownership remains with the implementer in that chat.

## Notes

All 24 tasks were future implementation/verification work in the preceding documentation delivery. The user has now authorized execution; see evidence/implementation.md for current results and outstanding checks. Q01–Q06 are defined in quickstart. Ranges in Requirements expand inclusively for traceability. Dependencies are mandatory even when a task appears independent in presentation.
