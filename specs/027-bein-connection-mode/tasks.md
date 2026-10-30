# Tasks: beIN Connection Mode

**Input**: Design documents from `specs/027-bein-connection-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required because this feature affects beIN account routing, session reuse, operation continuation, and keepalive behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Test Seams First)

**Purpose**: Create failing tests for the risky behavior before changing worker routing or sessions.

- [x] T001 [P] Create admin setting validation tests in `tests/unit/bein-connection-mode-settings.test.ts`
  - Reason: The global setting must accept only safe connection modes and default safely when missing.
  - Expected: Tests cover `assigned_proxy`, `server_ip`, missing value, invalid value, and rejected API update value.
  - Possible bugs: Tests can couple to UI labels instead of stable mode values.
  - Fix/Mitigation: Assert normalized values and API validation behavior, not visual wording.
  - Verification: `npx tsx --test tests/unit/bein-connection-mode-settings.test.ts` fails before implementation.

- [x] T002 [P] Create worker route resolver tests in `worker/tests/bein-connection-route.test.ts`
  - Reason: Workers need one route decision contract before HTTP client creation.
  - Expected: Tests prove assigned-proxy accounts use proxy, no-proxy accounts use direct, server-IP mode ignores proxies, valid snapshots override the global mode, and mismatched snapshots are rejected.
  - Possible bugs: Tests may require real database access if the helper is not pure.
  - Fix/Mitigation: Design the resolver with injectable setting value and plain account fixtures.
  - Verification: `npx tsx --test worker/tests/bein-connection-route.test.ts` fails before implementation.

- [x] T003 [P] Create route-aware session key tests in `worker/tests/session-cache-route-keys.test.ts`
  - Reason: Session mixing is the highest-risk failure mode in this feature.
  - Expected: Tests prove `direct` and `proxy:<id>` sessions for the same account use separate keys and legacy account-only keys are not imported.
  - Possible bugs: Tests can become Redis-dependent and flaky.
  - Fix/Mitigation: Extract pure key-building and route validation helpers before testing Redis operations.
  - Verification: `npx tsx --test worker/tests/session-cache-route-keys.test.ts` fails before implementation.

- [x] T004 [P] Create operation route snapshot tests in `worker/tests/operation-route-snapshot.test.ts`
  - Reason: Continuation steps must not switch route when the global setting changes mid-operation.
  - Expected: Tests cover snapshot creation, same-account reuse, different-account recompute, legacy no-snapshot fallback, and secret exclusion.
  - Possible bugs: Tests can miss nested `responseData` merge paths.
  - Fix/Mitigation: Test pure snapshot merge/preserve helpers and include a fixture with existing responseData fields.
  - Verification: `npx tsx --test worker/tests/operation-route-snapshot.test.ts` fails before implementation.

---

## Phase 2: Foundational (Shared Contracts)

**⚠️ CRITICAL**: These original shared contracts remain prerequisites for every incident change; do not weaken financial or session ownership.

**Checkpoint**: Re-run current route/session regressions in T043; historical completion is not current verification.

**Purpose**: Implement reusable constants and helpers that block all user-story work.

- [x] T005 Implement shared admin connection-mode constants in `src/lib/bein-connection-mode.ts`
  - Reason: The settings API and UI need one source for allowed values and default behavior.
  - Expected: File exports mode constants, allowed value list, default mode, and normalization/validation helpers.
  - Possible bugs: Root app and worker can drift if worker has a separate copy with different values.
  - Fix/Mitigation: Use identical literal values in both helpers and cover both with tests.
  - Verification: `npx tsx --test tests/unit/bein-connection-mode-settings.test.ts`.

- [x] T006 Implement worker route types and resolver in `worker/src/lib/bein-connection-mode.ts`
  - Reason: Worker operations and keepalive must share one effective route contract.
  - Expected: Resolver returns mode, routeKey, accountId, optional proxy metadata, runtime proxyConfig, and non-secret snapshot helpers.
  - Possible bugs: Resolver may include proxy username/password in snapshots or logs.
  - Fix/Mitigation: Split runtime `proxyConfig` from stored `OperationRouteSnapshot` and test snapshot keys.
  - Verification: `npx tsx --test worker/tests/bein-connection-route.test.ts worker/tests/operation-route-snapshot.test.ts`.

- [x] T007 Add route-aware session key helpers in `worker/src/lib/session-cache.ts`
  - Reason: Existing account-only Redis keys cannot distinguish proxy sessions from server-IP sessions.
  - Expected: Helpers build new keys from account id plus route key and expose a route-aware cache identity.
  - Possible bugs: Existing callers can keep using account-only behavior by accident.
  - Fix/Mitigation: Make route-aware functions explicit and update all call sites in later tasks.
  - Verification: `npx tsx --test worker/tests/session-cache-route-keys.test.ts`.

- [x] T008 Add responseData route snapshot helpers in `worker/src/lib/bein-connection-mode.ts`
  - Reason: Multiple worker flows merge `responseData`; route snapshots need a safe preserve/update helper.
  - Expected: Helpers parse existing responseData, merge route metadata, preserve unrelated fields, and reject secrets.
  - Possible bugs: JSON string/object differences can drop existing operation evidence.
  - Fix/Mitigation: Test string and object responseData fixtures and preserve existing keys.
  - Verification: `npx tsx --test worker/tests/operation-route-snapshot.test.ts`.

---

## Phase 3: User Story 1 - Switch beIN Connection Mode Safely (Priority: P1) MVP

**Goal**: Admin can switch new beIN actions between assigned proxies and server IP without editing account proxy assignments.

**Independent Test**: Save server-IP mode, start one low-risk renewal, and confirm the worker route is direct while account proxy assignments remain unchanged.

### Implementation for User Story 1

- [x] T009 [US1] Validate `bein_connection_mode` updates in `src/app/api/settings/route.ts`
  - Reason: The API must reject invalid values before they reach workers.
  - Expected: PUT accepts only `assigned_proxy` or `server_ip`; missing value keeps existing behavior; GET returns normalized admin settings.
  - Possible bugs: Validation can reject unrelated settings because `/api/settings` saves many keys.
  - Fix/Mitigation: Validate only when `bein_connection_mode` is present and leave other setting behavior unchanged.
  - Verification: `npx tsx --test tests/unit/bein-connection-mode-settings.test.ts`.

- [x] T010 [US1] Add explicit connection mode controls in `src/components/admin/SettingsForm.tsx`
  - Reason: Admins need a clear emergency switch without confusing enable/disable wording.
  - Expected: Settings form shows "Use assigned proxies" and "Emergency: use server IP" options, posts `bein_connection_mode`, and explains saved proxies are not deleted.
  - Possible bugs: Radio value may not submit if neither option is selected on first load.
  - Fix/Mitigation: Default to `assigned_proxy` when the setting is missing and include a checked default.
  - Verification: Open settings, switch modes, save, refresh, and confirm selected mode remains.

- [x] T011 [P] [US1] Add Arabic and English setting labels in `src/i18n/translations/ar.ts` and `src/i18n/translations/en.ts`
  - Reason: The settings screen is multilingual and should not rely only on fallback English strings.
  - Expected: Both locales include labels, warning text, and concise help text for the connection mode.
  - Possible bugs: Translation key changes can break existing settings labels.
  - Fix/Mitigation: Add new keys only under existing settings structure and keep existing keys unchanged.
  - Verification: `rg -n "beinConnectionMode|server IP|IP السيرفر" src/i18n/translations`.

- [x] T012 [US1] Ensure admin mode toggle does not mutate proxy assignments in `src/app/api/settings/route.ts`
  - Reason: Emergency mode is temporary and must not clear `bein_accounts.proxy_id`.
  - Expected: Saving `bein_connection_mode` only upserts the settings row and does not update beIN account rows.
  - Possible bugs: Future implementer may add account updates for convenience.
  - Fix/Mitigation: Add a test or explicit assertion that settings save does not call account proxy mutation code.
  - Verification: Inspect diff and run `rg -n "proxyId|beinAccount.update|beinAccount.updateMany" src/app/api/settings/route.ts`.

**Checkpoint**: Admin can save the mode safely. Worker behavior may still be unchanged until later phases.

---

## Phase 4: User Story 2 - Keep Each Operation On One Route (Priority: P1)

**Goal**: Every operation uses one connection route from start through continuation and final confirmation.

**Independent Test**: Start an operation in one mode, toggle mode before final confirmation, and confirm continuation uses the stored route.

### Implementation for User Story 2

- [x] T013 [US2] Update operation client creation to accept an effective route in `worker/src/http-queue-processor.ts`
  - Reason: HTTP clients must be created from resolved routes, not raw `account.proxy`.
  - Expected: `createOperationClient` accepts an effective route and passes `undefined` proxyConfig in server-IP mode.
  - Possible bugs: Existing callers can omit the route and accidentally use old proxy logic.
  - Fix/Mitigation: Update all call sites in the same file and fail loudly when a new-operation route is missing.
  - Verification: `npx tsx --test worker/tests/bein-connection-route.test.ts`.

- [x] T014 [US2] Resolve and store route snapshot during `START_RENEWAL` in `worker/src/http-queue-processor.ts`
  - Reason: Renewal start is the first point where the selected account and route are known.
  - Expected: Operation responseData contains non-secret `beinRoute` snapshot before package loading and user waiting phases.
  - Possible bugs: Updating responseData can overwrite package data, progress state, or existing evidence.
  - Fix/Mitigation: Use the route snapshot merge helper and preserve existing responseData keys.
  - Verification: `npx tsx --test worker/tests/operation-route-snapshot.test.ts`.

- [x] T015 [US2] Preserve stored route in renewal continuations in `worker/src/http-queue-processor.ts`
  - Reason: COMPLETE_PURCHASE, APPLY_PROMO, CONFIRM_PURCHASE, and CANCEL_CONFIRM must not adopt a new global mode mid-flow.
  - Expected: Continuation steps resolve route from the operation snapshot when account id matches.
  - Possible bugs: One continuation path can still call `createOperationClient(account)` directly.
  - Fix/Mitigation: Search and update every `createOperationClient(` call in `worker/src/http-queue-processor.ts`.
  - Verification: `rg -n "createOperationClient\\(" worker/src/http-queue-processor.ts` and route snapshot tests.

- [x] T016 [US2] Recompute route snapshot when a renewal retry intentionally switches accounts in `worker/src/http-queue-processor.ts`
  - Reason: A route snapshot belongs to one beIN account and must not be reused blindly after account retry.
  - Expected: When operation `beinAccountId` changes to a different account, a new route snapshot is stored for that account.
  - Possible bugs: Retrying with another account can continue with the old account's proxy route.
  - Fix/Mitigation: Require account id match before snapshot reuse and update snapshot during account reassignment.
  - Verification: `npx tsx --test worker/tests/operation-route-snapshot.test.ts`.

- [x] T017 [US2] Apply route snapshot rules to signal and installment flows in `worker/src/http-queue-processor.ts`
  - Reason: The same worker client factory is used outside standard renewal and must remain consistent.
  - Expected: SIGNAL_CHECK, SIGNAL_ACTIVATE, START_INSTALLMENT, and CONFIRM_INSTALLMENT use route resolver and preserve per-operation route when applicable.
  - Possible bugs: Installment operations may have different amount/status timing and responseData shape.
  - Fix/Mitigation: Update only the route/client creation and snapshot preservation, not payment timing logic.
  - Verification: `rg -n "SIGNAL_|INSTALLMENT|createOperationClient" worker/src/http-queue-processor.ts` plus worker build.

**Checkpoint**: Operations no longer switch route mid-flow.

---

## Phase 5: User Story 3 - Keep Sessions Route-Safe (Priority: P1)

**Goal**: Proxy-created sessions and server-IP-created sessions never mix.

**Independent Test**: A cached proxy session for an account is not imported when server-IP mode is active for that same account.

### Implementation for User Story 3

- [x] T018 [US3] Update shared session cache APIs to require route context in `worker/src/lib/session-cache.ts`
  - Reason: Existing account-only APIs cannot enforce route safety.
  - Expected: `getSessionFromCache`, `saveSessionToCache`, `deleteSessionFromCache`, `hasValidSession`, TTL, and refresh helpers use account id plus route key.
  - Possible bugs: Changing function signatures can miss call sites and break worker build.
  - Fix/Mitigation: Update all TypeScript compile errors and add route-aware tests before behavior rollout.
  - Verification: `npx tsx --test worker/tests/session-cache-route-keys.test.ts`.

- [x] T019 [US3] Update session cache call sites in `worker/src/http-queue-processor.ts`
  - Reason: Renewal and continuation flows import/save/delete shared sessions frequently.
  - Expected: All shared session operations pass the effective route key and never use legacy account-only cache access.
  - Possible bugs: Login lock wait path can fetch a session without route after another worker logs in.
  - Fix/Mitigation: Carry the same effective route through login lock wait and post-login cache save.
  - Verification: `rg -n "getSessionFromCache|saveSessionToCache|deleteSessionFromCache|extendSessionTTL" worker/src/http-queue-processor.ts`.

- [x] T020 [US3] Add route metadata to operation-scoped session snapshots in `worker/src/lib/session-cache.ts`
  - Reason: Operation snapshots are keyed by operation id and can otherwise bypass route-aware shared cache.
  - Expected: Save/import operation session functions store and validate route metadata when provided.
  - Possible bugs: Old operation snapshots without route metadata can fail unexpectedly.
  - Fix/Mitigation: Treat old snapshots as legacy assigned-proxy only and avoid importing them under server-IP continuation.
  - Verification: `npx tsx --test worker/tests/session-cache-route-keys.test.ts worker/tests/operation-route-snapshot.test.ts`.

- [x] T021 [US3] Reject mismatched operation session imports in `worker/src/http-queue-processor.ts`
  - Reason: Continuation steps must not restore a session created under a different route.
  - Expected: If operation snapshot route differs from current operation route, worker avoids import and performs fresh login or safe failure based on the flow.
  - Possible bugs: Fresh login can increase one-time login count after mode switch.
  - Fix/Mitigation: This is acceptable for route safety; do not add retries or concurrency.
  - Verification: `npx tsx --test worker/tests/operation-route-snapshot.test.ts`.

**Checkpoint**: Route-aware session separation is active.

---

## Phase 6: User Story 4 - Preserve Load And Worker Behavior (Priority: P2)

**Goal**: Emergency mode changes only the route, not throughput, locks, retries, or keepalive pressure.

**Independent Test**: Enable emergency mode and confirm worker logs show the same queue/lock behavior and keepalive cadence.

### Implementation for User Story 4

- [x] T022 [US4] Update keepalive route resolution and client cache keying in `worker/src/lib/session-keepalive.ts`
  - Reason: keepalive currently caches clients by account/proxy assignment and must use the effective route.
  - Expected: keepalive resolves mode per cycle/account, uses route-aware session cache, and caches HTTP clients by account id plus route key.
  - Possible bugs: In-memory client from proxy mode can be reused after switching to server-IP mode.
  - Fix/Mitigation: Include effective routeKey in client cache key and log route on client creation.
  - Verification: `npx tsx --test worker/tests/bein-connection-route.test.ts` and `rg -n "cacheKey|routeKey|getHttpClient" worker/src/lib/session-keepalive.ts`.

- [x] T023 [US4] Preserve account-based locking in `worker/src/http-queue-processor.ts` and `worker/src/lib/session-keepalive.ts`
  - Reason: The same beIN account must not be used concurrently through different routes.
  - Expected: No lock key changes from account id to route id; locks still guard the account only.
  - Possible bugs: Route-aware cache work can accidentally inspire route-aware locks.
  - Fix/Mitigation: Keep lock function signatures unchanged and document account-lock scope in code comments only where helpful.
  - Verification: `npx tsx --test worker/tests/account-lock-timeouts.test.ts`.

- [x] T024 [US4] Confirm no retry, queue, or keepalive frequency increase in `worker/src/http-queue-processor.ts`, `worker/src/lib/session-keepalive.ts`, and `worker/src/keepalive.ts`
  - Reason: User required no added load or workflow disruption.
  - Expected: Retry constants, queue wait rules, worker counts, and keepalive interval handling remain unchanged.
  - Possible bugs: Implementer may add retry-on-direct fallback to hide proxy failures.
  - Fix/Mitigation: Search for fallback/retry changes and keep automatic fallback out of scope.
  - Verification: `git diff -- worker/src/http-queue-processor.ts worker/src/lib/session-keepalive.ts worker/src/keepalive.ts` and `rg -n "fallback|retry|MAX_LOGIN_RETRIES|keepalive_interval" worker/src`.

**Checkpoint**: Emergency mode does not increase load or concurrency.

---

## Phase 7: User Story 5 - Runtime Evidence Without Secrets (Priority: P3)

**Goal**: Admins and maintainers can verify which route was used without exposing secrets.

**Independent Test**: Run one operation in each mode and inspect logs/responseData for route metadata and secret redaction.

### Implementation for User Story 5

- [x] T025 [US5] Add safe route logs in `worker/src/http-queue-processor.ts`
  - Reason: Proxy incidents need clear evidence of whether worker used proxy or server IP.
  - Expected: Logs include operation id, account label/username, mode, routeKey, proxy id/label when used, and never credentials.
  - Possible bugs: Proxy username/password can leak if raw proxy config is logged.
  - Fix/Mitigation: Log only route snapshot fields, not `proxyConfig`.
  - Verification: `rg -n "password|totp|cookie|viewState|proxyConfig" worker/src/http-queue-processor.ts`.

- [x] T026 [US5] Add safe route logs in `worker/src/lib/session-keepalive.ts`
  - Reason: keepalive can otherwise refresh sessions through a route that is hard to diagnose.
  - Expected: keepalive logs mode and routeKey on client creation/refresh without secrets.
  - Possible bugs: Repeated logs can be noisy.
  - Fix/Mitigation: Log on route resolution/client creation and refresh summary, not every cookie/session detail.
  - Verification: `rg -n "routeKey|mode|proxyConfig|password" worker/src/lib/session-keepalive.ts`.

- [x] T027 [US5] Verify route metadata redaction in `worker/tests/operation-route-snapshot.test.ts`
  - Reason: Tests should lock down that snapshots do not store credentials or session data.
  - Expected: Snapshot key set is limited to safe fields.
  - Possible bugs: Future fields can accidentally add secrets to responseData.
  - Fix/Mitigation: Test exact allowed keys and fail when unexpected keys appear.
  - Verification: `npx tsx --test worker/tests/operation-route-snapshot.test.ts`.

---

## Phase 8: Polish & Cross-Cutting Verification

**Purpose**: Build, verify, and prepare safe rollout.

- [x] T028 Run focused tests for route mode, sessions, and snapshots
  - Reason: These tests prove the core safety contract before build.
  - Expected: All focused tests pass.
  - Possible bugs: Tests may pass in isolation but fail when run together due shared Redis or environment state.
  - Fix/Mitigation: Keep tests pure where possible and reset any process-level caches between cases.
  - Verification: `npx tsx --test tests/unit/bein-connection-mode-settings.test.ts worker/tests/bein-connection-route.test.ts worker/tests/session-cache-route-keys.test.ts worker/tests/operation-route-snapshot.test.ts`.

- [x] T029 Run production build checks from repository root and worker
  - Reason: TypeScript signature changes in worker session APIs can break build even if focused tests pass.
  - Expected: Web and worker builds complete.
  - Possible bugs: Root build can expose unrelated pre-existing failures.
  - Fix/Mitigation: Report any pre-existing failures with exact command output and do not hide them.
  - Verification: `npm run build` and `cd worker && npm run build`.

- [x] T030 Run mojibake and secret-safety scans on changed files
  - Reason: Repository rules require encoding safety and the feature must not expose secrets.
  - Expected: No newly introduced mojibake patterns and no secret-bearing route metadata/logging.
  - Possible bugs: Existing mojibake in unchanged code can create false positives.
  - Fix/Mitigation: Scope scan to changed files and note pre-existing matches separately.
  - Verification: `git diff --name-only` then scan changed text files for AGENTS.md mojibake examples and for `password`, `totp`, `cookie`, `viewState`, `proxyConfig`.

- [x] T031 Update deployment notes in `specs/027-bein-connection-mode/quickstart.md`
  - Reason: Production rollout must respect live database and active operations.
  - Expected: Notes explain deploy, restart workers/keepalive or setting reload, test one low-risk operation, and avoid `db push` unless explicitly needed.
  - Possible bugs: Notes can suggest unsafe production migration commands.
  - Fix/Mitigation: Follow AGENTS production server notes and prefer `npx prisma migrate deploy` only if a migration exists.
  - Verification: Read `quickstart.md` and confirm no unsafe production schema push instruction is present.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 test files being present.
- **US1 Admin Setting**: Depends on Phase 2 shared admin constants.
- **US2 Operation Route Stability**: Depends on Phase 2 worker resolver and snapshot helpers.
- **US3 Session Route Safety**: Depends on Phase 2 route/session helpers and US2 route availability.
- **US4 Load Preservation**: Depends on US2 and US3 route/session changes.
- **US5 Evidence**: Can proceed after route helpers exist, but final logging should be verified after US2/US3.
- **Polish**: Depends on selected user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can be implemented after foundation; it delivers admin control but not complete worker behavior alone.
- **User Story 2 (P1)**: Must be completed before enabling the feature for real operations.
- **User Story 3 (P1)**: Must be completed before enabling the feature for real operations.
- **User Story 4 (P2)**: Required before production rollout.
- **User Story 5 (P3)**: Recommended before production rollout for incident diagnostics.

### Parallel Opportunities

- T001-T004 can run in parallel.
- T005 and T006 can run in parallel.
- T009-T011 can run in parallel after T005.
- T025-T027 can run in parallel after route snapshot helpers exist.

## Implementation Strategy

### MVP First

1. Complete Phase 1 tests.
2. Complete Phase 2 foundations.
3. Complete US1, US2, and US3 before using the feature in production.
4. Validate with one low-risk operation.

### Production-Safe Increment

Do not deploy only the UI toggle without route-stable worker and session-route safety. The safe minimum is admin setting + worker route resolver + operation snapshots + route-aware sessions.

## Phase 9: 2026-10-30 incident amendment

Sequential single-agent execution. T001–T031 are historical; the following tasks carry current incident evidence.

### Tests for User Story 1

Existing setting tests plus AC01/05 in T036/T039 verify switching current traffic without changing assignments.

### Tests for User Story 2

Operation route snapshots and actual v1/v2 read-handler tests (T036/T039) distinguish pinned mutations from deferred reads.

### Tests for User Story 3

Session key/route tests and T040 three-account fixtures reject legacy/mismatched purchase sessions.

- [x] T032 [US6] Restore CLI and inspect existing integration in `specs/027-bein-connection-mode/research.md`
  - Reason: Missing CLI prevents verified Spec Kit lifecycle.
  - Expected: Official version/status receipts; preserve customized templates.
  - Possible bugs: Forced upgrade destroys project rules.
  - Fix/Mitigation: Bootstrap only missing skill; no force.
  - Verification: specify version --features --json; specify integration status --json
  - Dependencies: none.

- [x] T033 [US6] Amend specification, design and contracts in `specs/027-bein-connection-mode/{spec,plan,research,data-model,quickstart}.md and contracts/`
  - Reason: FR-021–028 require explicit read exception and ownership policy.
  - Expected: All AC01–AC10 linked; no purchase route or proof weakening.
  - Possible bugs: Old pinned-route prose contradicts new read exception.
  - Fix/Mitigation: Scope exception to deferred verification and original account; preserve history.
  - Verification: Read current artifacts against accepted plan and constitution.
  - Dependencies: T032.

- [x] T034 [US6] Validate requirements checklist and scoped analyze in `specs/027-bein-connection-mode/{checklists/incident-requirements,analysis}.md`
  - Reason: No source changes before a consistent plan.
  - Expected: Zero unresolved CRITICAL/HIGH; each requirement has task and check.
  - Possible bugs: Historical 036 PASS inferred from partial evidence.
  - Fix/Mitigation: Keep 036 gaps open; check current original template labels.
  - Verification: Prerequisites script; original-template verifier and FR/AC coverage review.
  - Dependencies: T033.

- [x] T035 [US6] Reproduce HTTP classification and false-success incident in `worker/tests/login-failure-classification.test.ts`
  - Reason: AC02–04 failures are currently mislabeled credentials.
  - Expected: Red actual GET/POST/tunnel/HTML assertions before fixes.
  - Possible bugs: Mock bypasses real client parsing.
  - Fix/Mitigation: Exercise real HttpClientService with synthetic HTTP boundary.
  - Verification: node --import tsx --test worker/tests/login-failure-classification.test.ts
  - Dependencies: T034.

- [x] T036 [US6] Reproduce deferred route and unsafe reset in `worker/tests/deferred-verification-route.test.ts; tests/unit/bein-account-recovery.test.ts`
  - Reason: AC01/05–09 require connected regressions.
  - Expected: Red assertions for current route and ownership-safe reset.
  - Possible bugs: Pure helper passes while call sites remain pinned.
  - Fix/Mitigation: Test both actual queue branches and both API actions.
  - Verification: node --import tsx --test worker/tests/deferred-verification-route.test.ts tests/unit/bein-account-recovery.test.ts
  - Dependencies: T035.

- [x] T037 [US6] Classify login and require authenticated evidence in `shared/bein/login-failure.ts; worker/src/http/{types,HttpClientService}.ts`
  - Reason: FR-022/023 separate transport from credential rejection.
  - Expected: GET rejection prevents POST; typed safe failures, positive success.
  - Possible bugs: Raw HTML leaks secrets; title-only success.
  - Fix/Mitigation: Allowlist codes/messages and explicit authenticated markers.
  - Verification: T035 suite incl 402 GET/POST/tunnel,407,429,5xx,DNS,timeout,CAPTCHA,explicit rejection,unknown200.
  - Dependencies: T036.

- [x] T038 [US6] Apply classification and atomic tracking to all consumers in `worker/src/lib/{bein-login-tracking,session-keepalive,provider-report-reader}.ts; worker/src/http-queue-processor.ts`
  - Reason: FR-024/AC07 require consistent counters and stale-writer fences.
  - Expected: Only genuine rejection increments; one atomic disable; terminal transport stops loops.
  - Possible bugs: One consumer still string-counts; reset overwritten by late worker.
  - Fix/Mitigation: Inventory all login/submit/tracker sites, ownership before mutation, race tests.
  - Verification: Focused tracking/lease/KeepAlive/report tests; isolated PG/Redis race acceptance.
  - Dependencies: T037.

- [x] T039 [US6] Resolve deferred v1/v2 reads using current mode in `worker/src/http-queue-processor.ts; worker/src/lib/bein-connection-mode.ts`
  - Reason: FR-021 fixes original incident without moving Pay.
  - Expected: Read route pinned per job on original account; purchase snapshot unchanged.
  - Possible bugs: Generic resolver change moves purchase continuation.
  - Fix/Mitigation: Dedicated read-only resolution only.
  - Verification: T036 route suite plus operation-route-snapshot and precise-renewal-journey suites.
  - Dependencies: T038.

- [x] T040 [US6] Isolate deferred read sessions in `worker/src/http-queue-processor.ts; worker/src/lib/session-cache.ts`
  - Reason: FR-011–013/021 prohibit purchase ViewState/wrong-route import.
  - Expected: Use reusable route cache only; stale/mismatched/legacy snapshots ignored.
  - Possible bugs: Old operation restore reintroduces proxy cookies.
  - Fix/Mitigation: Remove operation restore only from deferred reads; preserve purchase restore.
  - Verification: Route cache, three-account, stale-session, missing proxy, duplicate/lost-lease cases.
  - Dependencies: T039.

- [x] T041 [US6] Implement owned manual recovery in `src/lib/bein-account-recovery.ts; src/app/api/admin/bein-accounts/[id]/{reset,login-failures/reset}/route.ts`
  - Reason: FR-025 must restore account without stealing lock.
  - Expected: 409 on busy/reserved; reset counter/reason; activation only explicit action.
  - Possible bugs: Partial DB/cache failure, stolen lock, erased rate budget.
  - Fix/Mitigation: Shared account lease and transactional DB update; compare-owner release; narrow session invalidation.
  - Verification: T036 endpoint tests plus isolated PostgreSQL/Redis races and nonADMIN cases.
  - Dependencies: T040.

- [x] T042 [US6] Present accurate login review and localized actions in `src/app/api/admin/bein-accounts/login-failures/route.ts; src/components/admin/report-center/LoginMonitorPanel.tsx; src/i18n/translations/{ar,en,bn}.ts`
  - Reason: FR-026 unknown errors must not demand password change.
  - Expected: Compatible API, review state and distinct reset actions in three languages.
  - Possible bugs: Missing catalog token or old field consumers break.
  - Fix/Mitigation: Additive fields; reuse components/tokens and test pending/error/empty/mobileRTL.
  - Verification: API projection tests, catalog/type checks and browser state checks.
  - Dependencies: T041.

- [x] T043 [US6] Verify integrated safeguards and current builds in `worker/tests/; tests/unit/; tests/integration/; specs/027-bein-connection-mode/evidence/`
  - Reason: AC01–10 require meaningful combined evidence.
  - Expected: Current local tests, race proof, type/build/UI evidence, no financial mutations.
  - Possible bugs: Mocks mistaken for live or skips reported as passes.
  - Fix/Mitigation: Record skips/failures separately; synthetic HTTP and isolated services only.
  - Verification: npm run test:unit; npm run test:worker; root/worker typechecks/builds; PG/Redis and browser checks.
  - Dependencies: T042.

- [x] T044 [US6] Update safe deployment and project handoff in `specs/027-bein-connection-mode/quickstart.md; docs/PROJECT_GUIDE.md; PROJECT_MEMORY.md; specs/036-audit-remediation/audit-register.md`
  - Reason: FR-028 requires parity/drain/rollback and durable evidence.
  - Expected: Runbook distinguishes local/live; current guide/memory and original-template report.
  - Possible bugs: pm2 save persists incomplete topology; mixed builds serve stale UI.
  - Fix/Mitigation: Verify all roles/count, drain, stop web for build, no queue/lock deletion.
  - Verification: Docs/memory validators, encoding/privacy diff, runbook semantic review; live acceptance remains pending deployment.
  - Dependencies: T043.

- [x] T045 [US6] Analyze and converge current implementation in `specs/027-bein-connection-mode/{analysis,tasks}.md and evidence/`
  - Reason: Constitution and all accepted requirements must match final code.
  - Expected: No unbuilt gaps hidden; new tasks appended where needed.
  - Possible bugs: Checkbox counts substituted for semantic acceptance.
  - Fix/Mitigation: Inspect source and checks; preserve 036 missing contract and unproven live gates.
  - Verification: speckit-analyze + speckit-converge until no new buildable tasks; original-template checker.
  - Dependencies: T044.

## Format and paths

Checklist IDs are stable; US6 is the incident story. No parallel-agent execution. Paths are relative to repository root; worker/src and src are separate runtime owners, shared contains common contracts, worker/tests and tests/unit contain their regression suites.

## Required Detail Block For Every Task

Each task retains Reason, Expected, Possible bugs, Fix/Mitigation and Verification from the original template. New incident tasks also declare dependencies. Historical task checkboxes are not evidence for the incident.

## Path Conventions

Use exact repository-relative paths above. Runtime worker code lives under worker/src; application API/UI under src. Spec artifacts remain in this feature; existing 036 audit-register carries cross-feature obligations.

### Within Each User Story

Reproduce the failure first, inspect the representative red assertion, implement in dependency order, verify negatives and connected consumers, then record current evidence before marking complete.

## Parallel Example: User Story 1

No agents or concurrent mutations are authorized. Independent read-only tool lookups may be batched; task ownership and acceptance remain in this chat.

### Incremental Delivery

Complete T032–T045 in order; no partial production release. Tests may be run per slice, but final combined checks precede the deployment handoff.

### Parallel Team Strategy

Not applicable: the user explicitly requires direct work without agents. All dependencies are executed by the primary agent.

## Notes

No hidden permission, deployment or financial authority comes from checklist completion. Preserve 036 historical gaps and separate local acceptance from upstream/provider acceptance.
