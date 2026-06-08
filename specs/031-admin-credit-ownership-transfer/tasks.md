# Tasks: Admin Credit Requests And Unified Ownership Transfer

**Input**: Design documents from `specs/031-admin-credit-ownership-transfer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This changes credit request eligibility, notification routing, and ownership transfer behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Guardrails)

**Purpose**: Add tests and audit visibility before changing risky behavior.

- [x] T001 [P] Add owner classification tests in `tests/unit/user-ownership-classification.test.ts`
  - Reason: Credit requests and transfers need one consistent current-owner decision.
  - Expected: Tests cover admin-owned, manager-owned, agent-owned, legacy admin-owned, unowned, and conflicting ownership evidence.
  - Possible bugs: Tests may hide duplicate-owner cases by only using clean fixtures.
  - Fix/Mitigation: Include fixtures with multiple manager links, multiple active agent assignments, and both manager plus agent ownership.
  - Verification: `npx tsx --test tests/unit/user-ownership-classification.test.ts` fails before implementation and passes after the helper is implemented.

- [x] T002 [P] Add admin-owned credit request tests in `tests/unit/credit-request-ownership.test.ts`
  - Reason: The requested change is to allow admin-owned users to request credit while preserving blocks for manager-owned and unowned users.
  - Expected: Tests prove admin-owned and agent-owned users are eligible, while manager-owned and unowned users are blocked.
  - Possible bugs: Legacy admin fallback can accidentally allow all users with `createdById`.
  - Fix/Mitigation: Add a test where `createdById` exists but a current manager or agent owner also exists; current owner must win.
  - Verification: `npx tsx --test tests/unit/credit-request-ownership.test.ts`.

- [x] T003 [P] Add Telegram owner-label tests in `tests/unit/credit-request-telegram.test.ts`
  - Reason: Admin-owned requests must not be reported with fake agent text.
  - Expected: Tests cover agent-owned, admin-owned, and legacy-admin messages with safe owner wording.
  - Possible bugs: Existing retry route can still pass `-` as an agent name.
  - Fix/Mitigation: Include retry-style input in the test fixtures.
  - Verification: `npx tsx --test tests/unit/credit-request-telegram.test.ts`.

- [x] T004 [P] Extend WhatsApp handoff tests in `tests/unit/credit-request-whatsapp-handoff.test.ts`
  - Reason: Null-agent admin-owned requests must not resolve a current agent assignment at approval time.
  - Expected: Tests prove admin-owned/null-agent handoff skips assignment lookup and uses default WhatsApp settings.
  - Possible bugs: A later agent assignment can be used because the query filters by user id when agent id is null.
  - Fix/Mitigation: Add a fixture with a user id and a current active assignment but admin-owned request snapshot.
  - Verification: `npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts`.

- [x] T005 [P] Add transfer service tests in `tests/unit/user-ownership-transfer.test.ts`
  - Reason: The unified transfer must close all old owner links before creating the selected owner.
  - Expected: Tests cover admin-to-agent, agent-to-manager, manager-to-admin, manager-to-agent, and dirty current ownership cleanup.
  - Possible bugs: Tests can verify only the new owner and miss stale old owners.
  - Fix/Mitigation: Assert closed assignment ids, removed manager link ids, and final owner.
  - Verification: `npx tsx --test tests/unit/user-ownership-transfer.test.ts`.

- [ ] T006 [P] Add integration tests for admin-owned credit request creation in `tests/integration/credit-request-admin-owned.test.ts`
  - Reason: Route-level behavior can differ from pure helper behavior.
  - Expected: A real admin-owned user can create a request and the stored snapshots show admin/direct owner evidence.
  - Possible bugs: Integration setup may require a database URL and isolated fixture cleanup.
  - Fix/Mitigation: Use generated test users and clean up only those ids.
  - Verification: `npx tsx --test tests/integration/credit-request-admin-owned.test.ts`.

- [ ] T007 [P] Add integration tests for ownership transfer endpoint in `tests/integration/admin-user-ownership-transfer.test.ts`
  - Reason: Transaction cleanup, target validation, and audit writes must work together.
  - Expected: Endpoint leaves exactly one current owner and writes audit evidence for each tested direction.
  - Possible bugs: Tests can become flaky if they depend on existing production-like users.
  - Fix/Mitigation: Create isolated test users for each direction.
  - Verification: `npx tsx --test tests/integration/admin-user-ownership-transfer.test.ts`.

---

## Phase 2: Foundational (Data, Classification, And Audit)

**Purpose**: Build shared ownership and owner-evidence foundations before changing user flows.

- [x] T008 Create owner classification helper in `src/lib/users/ownership.ts`
  - Reason: Multiple routes need the same decision about whether a user is admin-owned, manager-owned, agent-owned, legacy admin-owned, or unowned.
  - Expected: Helper returns owner type, safe label, owner ids, conflict metadata, and legacy fallback flag.
  - Possible bugs: Helper can prioritize historical creator over current ownership.
  - Fix/Mitigation: Current active manager/admin link or active agent assignment must win over `createdById`.
  - Verification: `npx tsx --test tests/unit/user-ownership-classification.test.ts`.

- [x] T009 Add nullable credit request owner evidence migration in `prisma/migrations/20260608120000_credit_request_owner_snapshot/migration.sql`
  - Reason: New credit requests need owner type evidence so null-agent admin requests are distinguishable from broken rows.
  - Expected: Migration adds nullable owner evidence fields without rewriting old requests.
  - Possible bugs: Non-null columns can fail deployment on historical rows.
  - Fix/Mitigation: Keep new fields nullable and populate only for new requests.
  - Verification: `npx prisma validate` and migration SQL review.

- [x] T010 Update app Prisma schema in `prisma/schema.prisma`
  - Reason: Application code needs typed access to new credit request owner evidence.
  - Expected: `CreditRequest` exposes nullable owner evidence fields matching the migration.
  - Possible bugs: Missing `@map` values can create column name drift.
  - Fix/Mitigation: Match migration column names explicitly.
  - Verification: `npx prisma validate`.

- [x] T011 Update worker Prisma schema in `worker/prisma/schema.prisma`
  - Reason: Repository schema sync expects app and worker schemas to stay aligned.
  - Expected: Worker schema includes the same credit request owner evidence fields when the model exists there.
  - Possible bugs: Worker build can fail if schema drift remains.
  - Fix/Mitigation: Mirror only schema-compatible fields and run the schema sync/build checks.
  - Verification: `npm --prefix worker run build`.

- [x] T012 Create data audit helper in `src/lib/users/ownership-audit.ts`
  - Reason: Production data may already contain duplicate or conflicting current ownership rows.
  - Expected: Helper produces counts and sample ids for duplicate manager/admin links, duplicate active agent assignments, mixed ownership, and legacy admin fallback users.
  - Possible bugs: Audit can be too expensive if it scans without limits in UI routes.
  - Fix/Mitigation: Keep audit as an admin/manual diagnostic helper or script path, not a normal page load dependency.
  - Verification: Add focused assertions in `tests/unit/user-ownership-classification.test.ts` or run a targeted script if one is created.

**Checkpoint**: Owner classification and owner evidence are ready for credit request and transfer stories.

---

## Phase 3: User Story 1 - Admin-Owned Users Can Request Credit (Priority: P1) MVP

**Goal**: Admin-owned users can submit credit requests without an agent assignment, while manager-owned and unowned users stay blocked.

**Independent Test**: Admin-owned user request succeeds and manager-owned/unowned requests fail with clear reasons.

- [x] T013 [US1] Replace credit eligibility checks in `src/lib/credit-requests/permissions.ts`
  - Reason: Current eligibility requires an active agent assignment and blocks admin-owned users.
  - Expected: Eligibility allows `AGENT`, `ADMIN`, and `LEGACY_ADMIN`, and blocks `MANAGER` and `UNOWNED`.
  - Possible bugs: Manager-owned users can become eligible if admin/manager ownership is not distinguished by owner role.
  - Fix/Mitigation: Use `src/lib/users/ownership.ts` classification, not a boolean manager-owned check.
  - Verification: `npx tsx --test tests/unit/credit-request-ownership.test.ts`.

- [x] T014 [US1] Update credit request context loading in `src/app/api/credit-requests/route.ts`
  - Reason: The route currently loads active manager ownership and active agent assignment separately and then requires the assignment.
  - Expected: Route receives one current owner classification and uses it for GET eligibility and POST creation.
  - Possible bugs: POST can still reject admin-owned users if it checks `!activeAgentAssignment`.
  - Fix/Mitigation: Replace assignment-required guard with owner-type guard.
  - Verification: `npx tsx --test tests/integration/credit-request-admin-owned.test.ts`.

- [x] T015 [US1] Store owner evidence for new requests in `src/app/api/credit-requests/route.ts`
  - Reason: Admin-owned requests need truthful review and handoff evidence later.
  - Expected: Agent-owned requests store existing agent snapshots; admin-owned requests store owner type/label and no fake agent data.
  - Possible bugs: Admin-owned requests can store empty strings as fake agent names.
  - Fix/Mitigation: Store null for agent fields when owner type is admin or legacy admin.
  - Verification: `npx tsx --test tests/integration/credit-request-admin-owned.test.ts`.

- [x] T016 [US1] Update credit request list types in `src/lib/credit-requests/types.ts`
  - Reason: User and admin screens need owner type/label without guessing from agent fields.
  - Expected: List item types include owner evidence and remain compatible with existing agent-owned rows.
  - Possible bugs: UI can crash on historical rows where owner evidence is null.
  - Fix/Mitigation: Add safe display fallback for old rows.
  - Verification: `npm run build`.

- [x] T017 [US1] Update request form owner messaging in `src/components/credit-requests/RequestCreditForm.tsx`
  - Reason: Admin-owned users should not see confusing agent-only text.
  - Expected: Form shows admin/direct or agent/group owner context, and blocked reasons for manager-owned/unowned users.
  - Possible bugs: Text can overflow or show stale owner after refresh.
  - Fix/Mitigation: Use existing compact form patterns and reload eligibility after successful submit.
  - Verification: Manual quickstart Scenario 1 and Scenario 2.

**Checkpoint**: User Story 1 is complete when admin-owned credit creation works independently.

---

## Phase 4: User Story 2 - Admin-Owned Credit Notifications And WhatsApp Handoff Are Correct (Priority: P1)

**Goal**: Admin-owned credit requests send truthful Telegram messages and use default WhatsApp handoff after approval.

**Independent Test**: Admin-owned notification payloads and handoff destinations use admin/default data, not agent data.

- [x] T018 [US2] Update Telegram message input in `src/lib/credit-requests/telegram.ts`
  - Reason: Current formatting assumes an agent and can print fake agent values.
  - Expected: Message builder accepts owner type/label and formats agent-owned and admin-owned requests truthfully.
  - Possible bugs: Existing agent-owned messages can lose source group details.
  - Fix/Mitigation: Keep agent fields optional and include them only when owner type is agent.
  - Verification: `npx tsx --test tests/unit/credit-request-telegram.test.ts`.

- [x] T019 [US2] Update notification sender input in `src/lib/credit-requests/notifications.ts`
  - Reason: Notification code must pass owner evidence instead of required agent fields.
  - Expected: Sender accepts nullable agent data and owner labels, and preserves disabled/missing-target behavior.
  - Possible bugs: Notification can be marked sent when Telegram settings are incomplete.
  - Fix/Mitigation: Keep existing settings validation before attempting send.
  - Verification: `npx tsx --test tests/unit/credit-request-telegram.test.ts`.

- [x] T020 [US2] Update credit request notification call sites in `src/app/api/credit-requests/route.ts`
  - Reason: Request creation must send admin-owned owner evidence to Telegram.
  - Expected: Agent-owned calls use agent snapshots; admin-owned calls use admin/direct owner snapshots.
  - Possible bugs: Notification logs can omit owner label and make retry unclear.
  - Fix/Mitigation: Include safe owner type/label in notification metadata.
  - Verification: `npx tsx --test tests/integration/credit-request-admin-owned.test.ts`.

- [x] T021 [US2] Update notification retry route in `src/app/api/admin/credit-requests/[id]/notification-retry/route.ts`
  - Reason: Retry currently can pass placeholder agent values for rows without agent snapshots.
  - Expected: Retry rebuilds message from stored owner evidence and never invents an agent.
  - Possible bugs: Old historical rows with null owner evidence can show blank owner.
  - Fix/Mitigation: Use safe fallback label such as admin/direct only when evidence supports it; otherwise show unknown owner safely.
  - Verification: `npx tsx --test tests/unit/credit-request-telegram.test.ts`.

- [x] T022 [US2] Fix null-agent handoff resolution in `src/lib/credit-requests/whatsapp-handoff.ts`
  - Reason: Admin-owned requests must not query active assignments by user id when the request snapshot has no agent.
  - Expected: Null-agent/admin-owned requests use default group or phone only.
  - Possible bugs: Agent-owned requests with missing group URL could lose existing fallback behavior.
  - Fix/Mitigation: Branch by owner snapshot first; only agent-owned requests can query captured/current agent data.
  - Verification: `npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts`.

- [x] T023 [US2] Update approval handoff call in `src/app/api/admin/credit-requests/[id]/decision/route.ts`
  - Reason: Approval must pass owner evidence to handoff instead of only user id and nullable agent id.
  - Expected: Admin-owned approvals open/copy default WhatsApp destination information.
  - Possible bugs: Missing default destination can silently produce no handoff.
  - Fix/Mitigation: Return an explicit warning state for missing default destination.
  - Verification: Manual quickstart Scenario 3.

- [x] T024 [US2] Update admin review display in `src/components/admin/credit-requests/AdminCreditRequestsClient.tsx`
  - Reason: Review cards must show owner evidence clearly for admin-owned requests.
  - Expected: Admin-owned cards show admin/direct owner wording and handoff warnings when default destination is missing.
  - Possible bugs: Historical rows can display confusing blanks.
  - Fix/Mitigation: Add safe fallback display for old rows without owner evidence.
  - Verification: Manual admin credit review check.

**Checkpoint**: User Story 2 is complete when notifications and WhatsApp handoff are truthful for admin-owned requests.

---

## Phase 5: User Story 3 - Admin Can Transfer User Ownership To One Current Owner (Priority: P2)

**Goal**: Admin can move any normal user to admin, manager/distributor, or agent ownership and leave exactly one current owner.

**Independent Test**: Transfer one user through all owner directions and confirm stale owner rows are removed/closed.

- [ ] T025 [US3] Extend transfer planning in `src/lib/agents/assignment-transfer.ts`
  - Reason: Existing transfer logic is agent-focused and should either delegate to or support the unified transfer rules.
  - Expected: Shared transfer planning can describe cleanup of previous manager/admin links and active agent assignments.
  - Possible bugs: Existing `/api/admin/agent-assignments` behavior can regress.
  - Fix/Mitigation: Keep existing agent transfer tests and add compatibility tests around the old route.
  - Verification: `npx tsx --test tests/unit/agent-assignment-transfer.test.ts tests/unit/user-ownership-transfer.test.ts`.

- [x] T026 [US3] Implement unified transfer service in `src/lib/users/ownership-transfer.ts`
  - Reason: Transfer safety belongs in one transaction, not split across UI-specific route handlers.
  - Expected: Service validates actor/target/user, removes old manager/admin links, closes active agent assignments, creates selected new owner, and returns transfer result.
  - Possible bugs: Cleanup can remove historical inactive assignments instead of only current ownership.
  - Fix/Mitigation: Scope cleanup to current manager/admin links and active agent assignments only.
  - Verification: `npx tsx --test tests/unit/user-ownership-transfer.test.ts`.

- [x] T027 [US3] Add transfer audit writer in `src/lib/users/ownership-transfer.ts`
  - Reason: Admin needs evidence of what changed and why.
  - Expected: Every successful transfer writes actor, target user, previous owner evidence, cleanup ids, new owner, and optional reason.
  - Possible bugs: Audit details can include sensitive runtime data if raw records are stored.
  - Fix/Mitigation: Serialize only safe ids, role labels, usernames/display names, and cleanup ids.
  - Verification: `npx tsx --test tests/unit/user-ownership-transfer.test.ts`.

- [x] T028 [US3] Add target list endpoint in `src/app/api/admin/user-ownership/targets/route.ts`
  - Reason: The transfer dialog needs valid active admins, managers/distributors, and agents.
  - Expected: Endpoint returns active, not-deleted targets grouped by owner type with safe labels.
  - Possible bugs: Deleted or inactive targets can appear and fail later.
  - Fix/Mitigation: Apply active/deleted filters in the endpoint and tests.
  - Verification: `npx tsx --test tests/integration/admin-user-ownership-transfer.test.ts`.

- [x] T029 [US3] Add transfer endpoint in `src/app/api/admin/user-ownership/route.ts`
  - Reason: Admin UI needs one route for all ownership target types.
  - Expected: Endpoint calls the unified transfer service and returns final owner plus cleanup evidence.
  - Possible bugs: Non-admin users can call transfer if authorization is copied incorrectly.
  - Fix/Mitigation: Reuse exact admin authorization guard and add negative auth test.
  - Verification: `npx tsx --test tests/integration/admin-user-ownership-transfer.test.ts`.

- [ ] T030 [US3] Delegate old agent assignment route to unified service in `src/app/api/admin/agent-assignments/route.ts`
  - Reason: Existing agent transfer UI paths should not keep old unsafe cleanup behavior.
  - Expected: Agent assignment transfers use the same cleanup and audit rules while preserving response shape where needed.
  - Possible bugs: Existing admin agents screen can break if response fields change.
  - Fix/Mitigation: Keep compatibility response fields and add/keep existing integration tests.
  - Verification: `npx tsx --test tests/integration/admin-agent-assignments.test.ts`.

**Checkpoint**: User Story 3 is complete when service and endpoints leave one current owner and audit evidence.

---

## Phase 6: User Story 4 - Admin UI Makes Current Owner And Transfer Target Clear (Priority: P3)

**Goal**: Admin users screen displays current owner and offers one clear transfer dialog.

**Independent Test**: Transfer dialog works for admin, manager, and agent targets and the list refreshes with one owner.

- [x] T031 [US4] Add current owner fields to admin users API in `src/app/api/admin/users/route.ts`
  - Reason: UI must show current ownership, not historical creator-only data.
  - Expected: Listed users include `currentOwner` type, label, and conflict marker.
  - Possible bugs: Query can become too slow if it performs per-row unbounded lookups.
  - Fix/Mitigation: Batch load ownership evidence for listed users only.
  - Verification: `npm run build` and focused admin users API test if available.

- [ ] T032 [US4] Update ownership filter helper in `src/lib/admin/users-ownership-filter.ts`
  - Reason: Recent filtering fixes must remain compatible with the new classifier.
  - Expected: Users moved away from admin no longer appear as admin-owned, and users moved to admin do appear correctly.
  - Possible bugs: Legacy fallback can show a transferred user under admin because `createdById` remains admin.
  - Fix/Mitigation: Legacy fallback only applies when no current manager/admin link and no active agent assignment exist.
  - Verification: `npx tsx --test tests/unit/admin-users-ownership-filter.test.ts tests/unit/user-ownership-classification.test.ts`.

- [x] T033 [US4] Replace transfer dialog in `src/components/admin/users/TransferOwnershipDialog.tsx`
  - Reason: The current dialog only transfers to agents and cannot express admin/manager targets.
  - Expected: Dialog offers target type selector, target search/list, agent-only source group fields, validation errors, and loading state.
  - Possible bugs: Agent fields can be submitted for admin/manager targets.
  - Fix/Mitigation: Build payload from selected target type only and validate server-side too.
  - Verification: Manual quickstart Scenarios 4, 5, and 6.

- [x] T034 [US4] Wire transfer dialog into `src/components/admin/users/UsersTable.tsx`
  - Reason: The admin users page needs to call the unified transfer endpoint and refresh rows after success.
  - Expected: Existing transfer action opens the new dialog and row refresh shows new owner only.
  - Possible bugs: Old `TransferToAgentDialog` import can remain and duplicate actions.
  - Fix/Mitigation: Replace the old import/use path and keep one transfer action.
  - Verification: `npm run build` and manual admin users transfer check.

- [ ] T035 [US4] Update admin agents client compatibility in `src/components/admin/agents/AdminAgentsClient.tsx`
  - Reason: Existing agent assignment screen may still call the old endpoint and should not break after unified service changes.
  - Expected: Agent assignment UI keeps working or clearly uses the unified route without changing visible behavior unexpectedly.
  - Possible bugs: Existing users can disappear from agent UI after refresh due to owner classification mismatch.
  - Fix/Mitigation: Keep compatibility tests and refresh assignment list after successful transfer.
  - Verification: `npx tsx --test tests/integration/admin-agent-assignments.test.ts` and manual agent assignment screen check.

**Checkpoint**: User Story 4 is complete when admin UI clearly shows and changes current owner.

---

## Final Phase: Verification And Release Safety

- [ ] T036 Run focused credit request tests
  - Reason: This is the highest-priority behavior change.
  - Expected: Eligibility, creation, Telegram, and WhatsApp handoff tests pass.
  - Possible bugs: Integration tests may require database environment variables.
  - Fix/Mitigation: Run unit tests locally and document any DB-gated tests that could not run.
  - Verification: `npx tsx --test tests/unit/credit-request-ownership.test.ts tests/unit/credit-request-telegram.test.ts tests/unit/credit-request-whatsapp-handoff.test.ts tests/integration/credit-request-admin-owned.test.ts`.

- [ ] T037 Run focused ownership transfer tests
  - Reason: Transfer can affect user visibility across admin, manager, and agent areas.
  - Expected: Unit and integration transfer tests pass, including dirty-data cleanup.
  - Possible bugs: Existing agent assignment tests can fail from response shape changes.
  - Fix/Mitigation: Preserve compatibility response shape or update tests only when behavior intentionally changes.
  - Verification: `npx tsx --test tests/unit/user-ownership-classification.test.ts tests/unit/user-ownership-transfer.test.ts tests/integration/admin-user-ownership-transfer.test.ts tests/integration/admin-agent-assignments.test.ts`.

- [x] T038 Run schema and build verification
  - Reason: Owner evidence migration and UI/API changes can break generated types or production build.
  - Expected: Prisma validation and web build pass.
  - Possible bugs: Worker schema drift can break worker build even if worker code is not functionally changed.
  - Fix/Mitigation: Mirror schema changes and build worker when schema changes.
  - Verification: `npx prisma validate && npm run build && npm --prefix worker run build`.

- [ ] T039 Run production ownership data audit
  - Reason: Strict ownership constraints and transfer safety depend on knowing current data quality.
  - Expected: Audit reports duplicate manager/admin links, duplicate active agent assignments, mixed ownership, and legacy admin fallback counts.
  - Possible bugs: Audit can expose too much user data in logs.
  - Fix/Mitigation: Output counts and masked/sample ids only for admin/developer review.
  - Verification: Run the audit helper/script created by T012 on production before enabling strict indexes.

- [x] T040 Run encoding and diff safety checks
  - Reason: Repository rules require minimal, encoding-safe edits.
  - Expected: No whitespace errors and no introduced mojibake patterns in changed files.
  - Possible bugs: Existing mojibake in untouched files can produce noisy scans.
  - Fix/Mitigation: Scan changed files only and do not rewrite unrelated files.
  - Verification: `git diff --check` plus changed-file scan for the mojibake patterns listed in `AGENTS.md`.

- [ ] T041 Prepare production deploy notes from `AGENTS.md`
  - Reason: Production has a live database and must not build while `bein-web` serves the old `.next` directory.
  - Expected: Deploy notes use `npx prisma migrate deploy`, stop `bein-web`, remove `.next`, build, restart web, build worker, restart worker processes, and check logs.
  - Possible bugs: Using `npx prisma db push` or building while web is running can break production.
  - Fix/Mitigation: Follow production server notes exactly and only use db push if explicitly requested as a workaround.
  - Verification: Compare final deploy commands with `AGENTS.md`.

---

## Dependencies And Execution Order

- Phase 1 tests should be written before implementation changes.
- Phase 2 owner classification and owner evidence block all user stories.
- User Stories 1 and 2 form the MVP for admin-owned credit requests.
- User Story 3 can start after Phase 2 but should ship after the credit request MVP if the work is split.
- User Story 4 depends on transfer endpoints and admin users API owner fields.
- Final verification depends on all selected stories for the release.

## Parallel Opportunities

- T001 through T007 can be written in parallel because they target different test files.
- T009 through T012 can proceed in parallel after the owner evidence shape is agreed.
- T018 through T024 can be implemented in parallel with T025 through T030 if separate agents own credit notifications/handoff and ownership transfer.
- T033 through T035 can proceed after endpoint contracts stabilize.

## Implementation Strategy

1. Build owner classification and tests.
2. Ship MVP: admin-owned credit requests plus notification and WhatsApp handoff fixes.
3. Add unified ownership transfer service and endpoints.
4. Update admin UI for current owner display and transfer target selection.
5. Run audit, focused tests, build checks, and deploy safety checks.
