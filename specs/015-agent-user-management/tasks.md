# Tasks: Agent User Management

**Input**: Design documents from `specs/015-agent-user-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature changes user ownership, which drives points, credit request access, and manager/agent visibility.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish ownership-transfer test seams and shared types before UI and route changes.

- [X] T001 Create ownership transfer test files in `tests/unit/agent-assignment-transfer.test.ts` and `tests/integration/admin-agent-assignments.test.ts`
  - Reason: Transfer rules affect future financial point routing and need tests before behavior changes.
  - Expected: New test files use `node:test` and are ready for pure service and API-level scenarios.
  - Possible bugs: Tests can require a live database for pure rules, making local verification brittle.
  - Fix/Mitigation: Keep validation and result-shape rules in unit tests; reserve Prisma transactions for integration tests.
  - Verification: `npx tsx --test tests/unit/agent-assignment-transfer.test.ts` runs and initially fails only for missing implementation imports.

- [X] T002 [P] Document current ownership blockers in `specs/015-agent-user-management/research.md`
  - Reason: The implementation must remove the existing `MANAGER_OWNED` rejection and admin-created user manager link only where agent ownership is requested.
  - Expected: Research lists exact files and current behavior to change.
  - Possible bugs: Missing one old ownership path leaves users visible under managers after transfer.
  - Fix/Mitigation: Confirm with `rg "MANAGER_OWNED|managerUser.create|roleFilter" src/app src/components`.
  - Verification: Research contains current file references and grep command.

- [X] T003 [P] Add transfer API contracts in `specs/015-agent-user-management/contracts/admin-agent-user-transfer.md` and `specs/015-agent-user-management/contracts/admin-create-user-under-agent.md`
  - Reason: Route changes need clear request, response, validation, and postcondition contracts before coding.
  - Expected: Contracts define success and failure shape for create-under-agent and transfer-to-agent.
  - Possible bugs: UI can rely on fields the API does not return.
  - Fix/Mitigation: Include exact response keys and reuse them in TypeScript types.
  - Verification: Contract files exist and include postconditions.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared transfer service that blocks all user stories.

- [X] T004 [P] Write pure validation tests for target user and target agent in `tests/unit/agent-assignment-transfer.test.ts`
  - Reason: Invalid users or agents must be rejected before any ownership mutation.
  - Expected: Tests cover missing user, deleted user, inactive user, non-USER target, missing agent, deleted agent, inactive agent, non-AGENT target, and inactive agent profile.
  - Possible bugs: Deleted or inactive accounts can be assigned, causing invisible or unusable ownership.
  - Fix/Mitigation: Validate account role, deleted state, active state, and profile state explicitly.
  - Verification: Unit test fails before `src/lib/agents/assignment-transfer.ts` exists and passes after implementation.

- [X] T005 [P] Write source group resolution tests in `tests/unit/agent-assignment-transfer.test.ts`
  - Reason: The UI may submit blank source group when an agent profile default exists.
  - Expected: Tests prove explicit source group wins, blank request uses agent default, and missing both rejects with `SOURCE_GROUP_REQUIRED`.
  - Possible bugs: Blank source group can reach credit request snapshots and WhatsApp handoff flows.
  - Fix/Mitigation: Trim input and validate after fallback.
  - Verification: `npx tsx --test tests/unit/agent-assignment-transfer.test.ts`.

- [X] T006 [P] Write ownership result tests in `tests/unit/agent-assignment-transfer.test.ts`
  - Reason: The service must report previous manager/admin and agent ownership for audit logs and UI messages.
  - Expected: Tests cover direct user, manager-owned user, admin-owned user, same-agent user, and different-agent user result modes.
  - Possible bugs: Activity logs can omit previous owner evidence.
  - Fix/Mitigation: Return previous manager owner ids and previous active assignment ids from one result type.
  - Verification: Unit tests assert exact `mode` and previous ownership arrays.

- [X] T007 Implement transfer helper types and validation functions in `src/lib/agents/assignment-transfer.ts`
  - Reason: Shared route behavior needs one validated service boundary.
  - Expected: File exports validation helpers, source group resolver, `AgentTransferResult`, and error codes used by routes.
  - Possible bugs: Types can drift from route response contracts.
  - Fix/Mitigation: Keep exported result keys identical to contract names.
  - Verification: `npx tsx --test tests/unit/agent-assignment-transfer.test.ts`.

- [X] T008 Implement transactional `transferUserToAgent` service in `src/lib/agents/assignment-transfer.ts`
  - Reason: Ownership changes must be atomic to avoid users having no owner or multiple active owners after failures.
  - Expected: Service validates user/agent, resolves source group, removes manager/admin links, ends active assignments, creates target assignment, logs activity, and returns transfer result.
  - Possible bugs: Partial mutations can happen if validation occurs after writes.
  - Fix/Mitigation: Load and validate first inside the transaction, then mutate in a fixed order.
  - Verification: Integration tests in `tests/integration/admin-agent-assignments.test.ts`.

- [X] T009 [P] Add optional duplicate-active-assignment preflight query note in `specs/015-agent-user-management/quickstart.md`
  - Reason: Production may have old duplicate active assignments; hardening needs a safe preflight.
  - Expected: Quickstart contains read-only SQL to find duplicate active assignment rows.
  - Possible bugs: A future migration can fail on production duplicates without warning.
  - Fix/Mitigation: Document preflight before optional partial unique index.
  - Verification: Quickstart includes the duplicate active assignment query.

**Checkpoint**: Foundation is complete when the transfer service is tested and no route or UI duplicates ownership rules.

---

## Phase 3: User Story 1 - View Agents In Users Page (Priority: P1) MVP

**Goal**: Admin users page has a third `مندوبين` tab listing agents with counts, points, and actions.

**Independent Test**: Open users page, select agents tab, search, paginate, and verify agent rows.

### Tests for User Story 1

- [X] T010 [P] [US1] Add admin users agents API tests in `tests/integration/admin-users-agents-tab.test.ts`
  - Reason: The endpoint must return only agents with batched counts and point summaries.
  - Expected: Tests cover `roleFilter=agents`, search, counts response, zero points fallback, and assigned-user count.
  - Possible bugs: Managers/admins can appear in the agents tab or points can require N+1 queries.
  - Fix/Mitigation: Filter role exactly and use one batched point query plus relation counts.
  - Verification: Test fails before API changes and passes after `/api/admin/users` and counts updates.

### Implementation for User Story 1

- [X] T011 [US1] Extend role filter parsing in `src/app/api/admin/users/route.ts`
  - Reason: The API currently accepts only distributors and users.
  - Expected: `roleFilter` accepts `agents` and builds `where.role = 'AGENT'`.
  - Possible bugs: Invalid roleFilter can fall through to all users.
  - Fix/Mitigation: Use an explicit union and default all-list behavior only when no filter is passed.
  - Verification: `npx tsc --noEmit`.

- [X] T012 [US1] Add agents response shape in `src/app/api/admin/users/route.ts`
  - Reason: Agents need assigned-user counts, profile defaults, balance, status, and point summaries.
  - Expected: API returns `assignedUsersCount`, `profile`, and `points` for each agent row.
  - Possible bugs: Querying assignment counts one row at a time slows large admin pages.
  - Fix/Mitigation: Use Prisma `_count` relation selection and one batched point summary query for returned ids.
  - Verification: `npx tsx --test tests/integration/admin-users-agents-tab.test.ts`.

- [X] T013 [US1] Extend tab counts in `src/app/api/admin/users/counts/route.ts`
  - Reason: The tab badge must display agent count.
  - Expected: Response includes `{ distributors, agents, users }`.
  - Possible bugs: Agent count can include deleted agents.
  - Fix/Mitigation: Count only `deletedAt=null` and `role='AGENT'`.
  - Verification: Focused integration test or manual GET to `/api/admin/users/counts`.

- [X] T014 [US1] Extend users table types and state in `src/components/admin/users/UsersTable.tsx`
  - Reason: The component currently has only distributor and user state.
  - Expected: `TabType` includes `agents`, `TabCounts` includes `agents`, and an `Agent` interface covers response fields.
  - Possible bugs: Dialog union types can omit agent fields and break edit/balance actions.
  - Fix/Mitigation: Introduce a shared account row union for dialogs.
  - Verification: `npx tsc --noEmit`.

- [X] T015 [US1] Add `مندوبين` tab and agent fetch handling in `src/components/admin/users/UsersTable.tsx`
  - Reason: Admins need a third tab beside distributors and users.
  - Expected: Switching to agents fetches `roleFilter=agents`, resets page, and renders count badge.
  - Possible bugs: Manager filter from users tab can accidentally affect agents tab.
  - Fix/Mitigation: Apply manager filter only when `activeTab === 'users'`.
  - Verification: Manual tab switch and search in admin users page.

- [X] T016 [US1] Add agent row/table renderer in `src/components/admin/users/UsersTable.tsx`
  - Reason: Agent rows need account actions plus assigned-user count and points.
  - Expected: Table shows username/email, balance/points, profile/default group, status, assigned users, created date, and actions.
  - Possible bugs: Long group labels or emails can overflow compact cells.
  - Fix/Mitigation: Use existing text sizing, `dir-ltr` for email, and constrained row content.
  - Verification: Browser/manual screenshot across desktop width.

**Checkpoint**: User Story 1 is complete when agents can be listed and managed as accounts from the users page.

---

## Phase 4: User Story 2 - Add A User Under An Agent (Priority: P2)

**Goal**: Admins can create a new user directly under a selected agent.

**Independent Test**: Add a new user from an agent row and verify one active assignment and no manager/admin owner link.

### Tests for User Story 2

- [X] T017 [P] [US2] Add create-under-agent API tests in `tests/integration/admin-create-user-under-agent.test.ts`
  - Reason: User creation and assignment must be atomic and must not create a manager/admin link.
  - Expected: Tests cover success, duplicate username/email, invalid agent, source group fallback, and no manager link.
  - Possible bugs: A user can be created without assignment if assignment creation fails.
  - Fix/Mitigation: Wrap user creation and assignment in one Prisma transaction.
  - Verification: Integration test fails before route update and passes after implementation.

### Implementation for User Story 2

- [X] T018 [US2] Extend create user schema in `src/app/api/admin/users/route.ts`
  - Reason: The route must accept optional `agentId` and `sourceGroup` for `USER` creation.
  - Expected: Zod schema validates agent fields only for `role='USER'`.
  - Possible bugs: Agent fields can be accepted for creating managers/admins.
  - Fix/Mitigation: Add validation that rejects `agentId` when role is not `USER`.
  - Verification: `npx tsc --noEmit` and integration tests.

- [X] T019 [US2] Create agent-owned users transactionally in `src/app/api/admin/users/route.ts`
  - Reason: The current route creates a `ManagerUser` link for every admin-created user.
  - Expected: When `agentId` is present, the route creates the user, creates an active agent assignment, skips manager link creation, and logs activity.
  - Possible bugs: Existing normal admin-created users can stop getting their current legacy owner link.
  - Fix/Mitigation: Preserve old behavior only when `role='USER'` and `agentId` is absent.
  - Verification: `npx tsx --test tests/integration/admin-create-user-under-agent.test.ts`.

- [X] T020 [US2] Add add-under-agent dialog state in `src/components/admin/users/UsersTable.tsx`
  - Reason: Admins need to start user creation from a selected agent row.
  - Expected: Clicking add under agent opens create dialog with selected agent context and source group default.
  - Possible bugs: Existing create-user dialog can become too broad or reset default role incorrectly.
  - Fix/Mitigation: Add optional props to `CreateUserDialog` without changing current defaults.
  - Verification: `npx tsc --noEmit`.

- [X] T021 [US2] Extend `src/components/admin/users/CreateUserDialog.tsx` for optional agent ownership
  - Reason: The dialog must submit `agentId` and `sourceGroup` when launched from an agent row.
  - Expected: Dialog shows selected agent context, source group input, and sends agent fields only when provided.
  - Possible bugs: Normal user creation can accidentally include stale agent data after reopening.
  - Fix/Mitigation: Reset agent-specific state on open and close.
  - Verification: Manual create normal user and create under agent both succeed.

- [X] T022 [US2] Refresh counts and agent row after create-under-agent in `src/components/admin/users/UsersTable.tsx`
  - Reason: Assigned-user count and user list should update immediately.
  - Expected: After success, users data and counts refresh and dialog closes.
  - Possible bugs: Agent count changes unexpectedly instead of assigned-user count only.
  - Fix/Mitigation: Refresh current data and counts; do not mutate counts locally.
  - Verification: Manual add under agent increments assigned-user count.

**Checkpoint**: User Story 2 is complete when a new user can be created under an agent without legacy manager/admin ownership.

---

## Phase 5: User Story 3 - Transfer Existing Users To Any Agent (Priority: P3)

**Goal**: Admins can transfer existing users from manager/admin/agent ownership to any agent safely.

**Independent Test**: Transfer manager-owned, admin-owned, and agent-owned users and inspect ownership postconditions.

### Tests for User Story 3

- [X] T023 [P] [US3] Add transfer integration tests in `tests/integration/admin-agent-assignments.test.ts`
  - Reason: The current route rejects manager-owned users and must now transfer them safely.
  - Expected: Tests cover manager-owned transfer, admin-owned transfer, agent-to-agent transfer, same-agent refresh, invalid user, invalid agent, and blank source group.
  - Possible bugs: Users can retain manager links or duplicate active assignments.
  - Fix/Mitigation: Assert exact database postconditions after every transfer.
  - Verification: `npx tsx --test tests/integration/admin-agent-assignments.test.ts`.

- [X] T024 [P] [US3] Add point recipient routing regression test in `tests/unit/points-operation-awards.test.ts`
  - Reason: Transfer must make future point routing treat the user as agent-owned.
  - Expected: Test simulates a transferred user with no manager link and an active agent assignment, asserting user plus agent recipients.
  - Possible bugs: Old manager/admin ownership can still win after transfer.
  - Fix/Mitigation: Ensure transfer removes manager/admin links; keep point service unchanged unless a real bug is found.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

### Implementation for User Story 3

- [X] T025 [US3] Replace manager-owned rejection in `src/app/api/admin/agent-assignments/route.ts`
  - Reason: The existing route rejects the exact transfer the user requested.
  - Expected: POST calls `transferUserToAgent` and returns assignment plus transfer summary.
  - Possible bugs: Existing `replaceExisting=false` behavior can be ignored.
  - Fix/Mitigation: Pass `replaceExisting` into the service and return 409 when ownership exists and replacement is disabled.
  - Verification: `npx tsx --test tests/integration/admin-agent-assignments.test.ts`.

- [X] T026 [US3] Update GET assignment data in `src/app/api/admin/agent-assignments/route.ts`
  - Reason: The existing agents page needs manager/admin ownership labels but should not filter those users out.
  - Expected: GET returns users with `managerOwned`, `activeAssignment`, and enough data to show current owner summary.
  - Possible bugs: Large user lists can become slow if ownership is loaded per user.
  - Fix/Mitigation: Use relation includes already present and avoid extra per-row queries.
  - Verification: Manual agents page load with manager-owned users.

- [X] T027 [US3] Add transfer dialog or action in `src/components/admin/users/UsersTable.tsx`
  - Reason: Admins need to move users from the users page without going to the separate agents page.
  - Expected: User rows expose a transfer-to-agent action that opens target agent/source group form.
  - Possible bugs: The action can appear for agent accounts or distributors.
  - Fix/Mitigation: Show transfer only for `USER` rows.
  - Verification: Browser/manual users tab row action appears only for users.

- [X] T028 [US3] Add transfer dialog component in `src/components/admin/users/TransferToAgentDialog.tsx`
  - Reason: Transfer UI should be contained and testable instead of expanding `UsersTable.tsx` further.
  - Expected: Dialog loads agent options, shows current user, source group, target agent, success/error states, and submits `/api/admin/agent-assignments`.
  - Possible bugs: Agent options can be stale or submit blank source group.
  - Fix/Mitigation: Fetch agents on open and use selected agent default source group when blank.
  - Verification: `npx tsc --noEmit` and manual transfer.

- [X] T029 [US3] Refresh affected tables after transfer in `src/components/admin/users/UsersTable.tsx`
  - Reason: A transferred user should disappear from manager-filtered views and appear under the agent.
  - Expected: Current tab data, counts, and filter state refresh after successful transfer.
  - Possible bugs: Page can remain on an empty high page after transfer.
  - Fix/Mitigation: Reuse existing `nextTotalPages` page clamp logic.
  - Verification: Manual transfer from manager-filtered users tab.

- [X] T030 [US3] Update activity log details in `src/lib/agents/assignment-transfer.ts`
  - Reason: Transfer must be auditable for support and accounting review.
  - Expected: Activity log includes user id, target agent id, source group, previous manager/admin owner ids, previous active assignment ids, mode, and admin actor.
  - Possible bugs: Logging JSON can be inconsistent with existing activity log field type.
  - Fix/Mitigation: Follow existing `activityLog.create` object details pattern used by agent assignment route.
  - Verification: Integration test asserts log action and key details.

**Checkpoint**: User Story 3 is complete when all old ownership paths can transfer to an agent with one active assignment and no manager/admin owner link.

---

## Phase 6: User Story 4 - Unified Admin Agent Assignment Flow (Priority: P4)

**Goal**: Existing agents page and new users page use the same transfer rules and show consistent assignment state.

**Independent Test**: Transfer from both admin entry points and compare database postconditions.

### Implementation for User Story 4

- [X] T031 [US4] Update `src/components/admin/agents/AdminAgentsClient.tsx` eligible user filtering
  - Reason: The existing page filters out manager-owned users, hiding users that should now be transferable.
  - Expected: The user dropdown includes manager-owned, admin-owned, direct, and agent-owned users with current owner labels.
  - Possible bugs: Admins may accidentally transfer a user without seeing current owner context.
  - Fix/Mitigation: Add labels like manager-owned, admin-owned, assigned, or direct in option text.
  - Verification: Manual agents page dropdown includes manager-owned users.

- [X] T032 [US4] Update `src/components/admin/agents/AdminAgentsClient.tsx` assignment submit copy and error handling
  - Reason: The page should describe the action as transfer/assign and handle new transfer response fields.
  - Expected: Success message reflects assignment or transfer; API errors display clear messages.
  - Possible bugs: Old "User assigned" copy can hide that manager ownership was removed.
  - Fix/Mitigation: Use response `transfer.mode` to choose message.
  - Verification: Manual transfer from agents page shows correct success state.

- [X] T033 [US4] Ensure end-assignment behavior remains unchanged in `src/app/api/admin/agent-assignments/route.ts`
  - Reason: Ending an assignment must not recreate manager/admin ownership.
  - Expected: DELETE only inactivates assignment and logs the action.
  - Possible bugs: Developers may try to restore old manager owner after ending an assignment.
  - Fix/Mitigation: Add integration assertion that `manager_users` remains empty after ending an assignment.
  - Verification: `npx tsx --test tests/integration/admin-agent-assignments.test.ts`.

- [X] T034 [US4] Verify manager user visibility after transfer in `src/app/api/manager/users/route.ts`
  - Reason: A transferred user must disappear from the old manager's users list.
  - Expected: No code change if `managerUser` rows are removed; add regression coverage or manual check.
  - Possible bugs: `createdById` fallback could still show transferred users in admin users manager filters.
  - Fix/Mitigation: Revisit admin users filter logic if transferred users appear under old owner due to `createdById`.
  - Verification: Manual old manager users page and admin users filter after transfer.

**Checkpoint**: User Story 4 is complete when both admin pages share the same ownership result.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Verify build quality, security, deployment notes, and encoding safety.

- [X] T035 Run schema sync and TypeScript verification
  - Reason: Route and component types must compile before deployment.
  - Expected: Schema sync passes and TypeScript has no new errors.
  - Possible bugs: Existing generated `.next/dev/types` corruption can create unrelated TypeScript failures.
  - Fix/Mitigation: If generated `.next/dev/types` causes unrelated failures, remove generated `.next/dev` and rerun TypeScript.
  - Verification: `node scripts/check-prisma-schema-sync.js && npx tsc --noEmit`.

- [X] T036 Run focused unit and integration tests
  - Reason: Ownership and points routing regressions must be caught before push.
  - Expected: Agent assignment transfer tests, admin API tests, and points operation tests pass.
  - Possible bugs: Integration tests can be skipped if database env is unavailable.
  - Fix/Mitigation: Document skipped tests and run available unit tests at minimum.
  - Verification: `npx tsx --test tests/unit/*.test.ts` and `npx tsx --test tests/integration/*.test.ts`.

- [X] T037 Perform admin UI smoke test
  - Reason: The feature is a workflow change and TypeScript cannot catch layout or state issues.
  - Expected: Agents tab, add-under-agent dialog, transfer dialog, and agents page assignment flow work manually.
  - Possible bugs: Buttons can overflow or translated labels can be missing.
  - Fix/Mitigation: Use existing fallback labels and compact icon buttons.
  - Verification: Browser/manual walkthrough from `quickstart.md`.

- [X] T038 Scan changed text files for mojibake patterns
  - Reason: Repository has strict encoding safety rules.
  - Expected: No new common mojibake or replacement-character patterns are introduced in changed source/docs.
  - Possible bugs: Arabic UI labels can be corrupted if a risky writer is used.
  - Fix/Mitigation: Use `apply_patch` only for edits and scan changed files before final response.
  - Verification: Run a focused scan against changed files using the repository mojibake signatures from `AGENTS.md`, then confirm any findings are pre-existing or intentionally documented.

- [X] T039 Update deployment notes if an optional migration is added
  - Reason: Production has a live database and should use safe migration deploy commands only when needed.
  - Expected: If no migration is added, deploy commands skip Prisma migration except normal generate/build; if migration is added, use `npx prisma migrate deploy`.
  - Possible bugs: Running `db push` on production can bypass migration history.
  - Fix/Mitigation: Follow `AGENTS.md` production notes.
  - Verification: Final deployment instructions include the correct branch and command order.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on setup and blocks all route/UI changes.
- **User Story 1 (P1)**: Depends on foundational only.
- **User Story 2 (P2)**: Depends on foundational and benefits from US1 agent row data.
- **User Story 3 (P3)**: Depends on foundational and can be built after or alongside US2.
- **User Story 4 (P4)**: Depends on US3 route behavior.
- **Polish**: Depends on selected stories being complete.

### Parallel Opportunities

- T002, T003 can run in parallel.
- T004, T005, T006 can run in parallel.
- T010 can run while T011-T013 are being implemented by another worker.
- T017 can run while UI dialog planning starts.
- T023 and T024 can run in parallel.
- T031 and T032 can run after T025 independently from users page UI polish.

### MVP Scope

MVP is User Story 1 plus the foundational service tests: agents tab visibility and tested transfer service. Full business value requires User Stories 2 and 3 because the user's critical requirement is adding and moving users under agents.

### Implementation Strategy

1. Build and test the transfer service first.
2. Add agents tab read path.
3. Add create-under-agent write path.
4. Replace old assignment rejection with transfer behavior.
5. Wire both UI entry points to the shared behavior.
6. Run verification and prepare production deploy commands.
