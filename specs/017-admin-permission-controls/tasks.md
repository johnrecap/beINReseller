# Tasks: Admin Permission Controls

**Input**: Design documents from `specs/017-admin-permission-controls/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature controls user creation and balance actions.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup

**Purpose**: Establish catalog, tests, and migration structure before enforcement changes.

- [X] T001 Create permission catalog skeleton in `src/lib/permissions/catalog.ts`
  - Reason: The app needs stable permission keys before routes and UI can reference them.
  - Expected: Catalog includes user creation, balance add/withdraw, reset password, delete/deactivate, announcements, points, rewards, credit approvals, financial review, and permission management.
  - Possible bugs: Missing a sensitive action can leave a bypass.
  - Fix/Mitigation: Cross-check catalog against admin and manager mutation routes with `rg "POST|PATCH|DELETE" src/app/api/admin src/app/api/manager`.
  - Verification: Catalog exports compile with `npx tsc --noEmit`.

- [X] T002 [P] Create permission evaluator test file in `tests/unit/permission-evaluator.test.ts`
  - Reason: Evaluation order is the security core and must be tested before implementation.
  - Expected: Test placeholders cover inactive user, global block, user override, role setting, and static default fallback.
  - Possible bugs: Tests can depend on Prisma too early.
  - Fix/Mitigation: Keep evaluator tests pure with fixture objects first.
  - Verification: `npx tsx --test tests/unit/permission-evaluator.test.ts` initially fails only for missing implementation.

- [X] T003 [P] Create integration test files in `tests/integration/admin-permissions.test.ts` and `tests/integration/manager-permission-enforcement.test.ts`
  - Reason: API enforcement must be proven for admin and manager workflows.
  - Expected: Tests cover global freeze, role deny, user override, and protected admin lockout.
  - Possible bugs: Integration tests may require seed data that is not isolated.
  - Fix/Mitigation: Use existing test helpers or create self-contained fixtures with cleanup.
  - Verification: Test files exist and describe required scenarios.

---

## Phase 2: Foundational

**Purpose**: Add shared data and evaluation services used by all stories.

- [X] T004 Add Prisma models and migration for permission settings in `prisma/schema.prisma` and `prisma/migrations/`
  - Reason: Dynamic role settings, user overrides, global blocks, protected admins, and audit events need structured storage.
  - Expected: Migration adds non-destructive tables and indexes from `data-model.md`.
  - Possible bugs: Migration can fail on production because of naming conflicts or unsupported constraints.
  - Fix/Mitigation: Use new table names, no destructive changes, and `npx prisma migrate dev --create-only` locally before review.
  - Verification: `npx prisma migrate diff` or schema sync check passes.

- [X] T005 Implement permission evaluator in `src/lib/permissions/evaluator.ts`
  - Reason: All UI and API checks must use one evaluation order.
  - Expected: Evaluator returns allowed/denied, source, and optional global block code.
  - Possible bugs: A missing user override can be treated as deny instead of fallback.
  - Fix/Mitigation: Unit tests for every evaluation branch.
  - Verification: `npx tsx --test tests/unit/permission-evaluator.test.ts`.

- [X] T006 Implement audit writer in `src/lib/permissions/audit.ts`
  - Reason: Permission changes and rejected unsafe changes must be traceable.
  - Expected: Helper records actor, target, permission key, old value, new value, result, and reason.
  - Possible bugs: Audit writer can throw and block unrelated reads.
  - Fix/Mitigation: Use it only in mutations and surface write failures clearly.
  - Verification: Integration tests assert audit rows after permission changes.

- [X] T007 Add API guard helpers in `src/lib/auth-utils.ts` or `src/lib/permissions/guards.ts`
  - Reason: Routes need simple reusable calls such as requirePermissionWithMobile.
  - Expected: Helpers preserve current auth behavior and add permission evaluation before mutations.
  - Possible bugs: AGENT role can accidentally inherit manager/admin access if hierarchy helpers are reused incorrectly.
  - Fix/Mitigation: Use exact role where needed and evaluator for action access.
  - Verification: Unit tests cover role boundaries.

**Checkpoint**: Foundation is complete when permission evaluation can be tested without modifying existing behavior.

---

## Phase 3: User Story 1 - Global User Creation Freeze (Priority: P1) MVP

**Goal**: One switch blocks panel user creation for all admins and managers.

**Independent Test**: Enable freeze and verify admin and manager create-user APIs return 403 without creating users.

- [X] T008 [P] [US1] Add global freeze API tests in `tests/integration/admin-permissions.test.ts`
  - Reason: Freeze is the highest-priority safety control.
  - Expected: Tests cover enable, disable, admin create blocked, manager create blocked, and unrelated reads still allowed.
  - Possible bugs: Freeze can block editing existing users by mistake.
  - Fix/Mitigation: Test read/edit routes separately from create routes.
  - Verification: Focused integration test.

- [X] T009 [US1] Add global permission settings routes under `src/app/api/admin/permissions/global/`
  - Reason: Admin panel needs to read and update the freeze.
  - Expected: Protected admin can toggle freeze with optional reason.
  - Possible bugs: Any admin can toggle safety controls without permission-management access.
  - Fix/Mitigation: Guard route with permission-management permission.
  - Verification: Integration test checks unauthorized actors get 403.

- [X] T010 [US1] Enforce freeze in admin user creation route `src/app/api/admin/users/route.ts`
  - Reason: Admin creation must be blocked by the hard global setting.
  - Expected: POST create user returns 403 with `PANEL_USER_CREATION_DISABLED` when enabled.
  - Possible bugs: Create-under-agent path can bypass the freeze.
  - Fix/Mitigation: Check freeze before all create branches.
  - Verification: Integration test creates no user row while freeze is enabled.

- [X] T011 [US1] Enforce freeze in manager user creation route `src/app/api/manager/users/route.ts`
  - Reason: Managers must also be blocked globally.
  - Expected: Manager POST returns 403 with the same code when enabled.
  - Possible bugs: Manager balance transfer on create can partially run before block.
  - Fix/Mitigation: Check freeze before parsing and before transaction writes.
  - Verification: Integration test confirms manager balance is unchanged.

- [X] T012 [US1] Disable or hide admin create buttons in `src/components/admin/users/UsersTable.tsx`
  - Reason: UI should reflect the hard block clearly.
  - Expected: Admin sees creation disabled when freeze is enabled.
  - Possible bugs: UI state can become stale after toggle.
  - Fix/Mitigation: Fetch effective/global permissions when page loads and after save.
  - Verification: Manual admin users page check.

- [X] T013 [US1] Disable manager create button in `src/components/manager/ManagerPageContent.tsx`
  - Reason: Managers should not see an action that will fail.
  - Expected: Create-user dialog is hidden or disabled with a clear message.
  - Possible bugs: Other manager dashboard content can fail to render if permission fetch fails.
  - Fix/Mitigation: Default to server-safe behavior and show read-only dashboard on fetch error.
  - Verification: Manual manager dashboard check.

**Checkpoint**: MVP is complete when global freeze blocks admin and manager creation server-side.

---

## Phase 4: User Story 2 - Role-Level Permission Control (Priority: P2)

**Goal**: Protected admins can deny or allow actions for a whole role.

**Independent Test**: Deny manager create-user or balance add at role level and verify all managers are blocked.

- [X] T014 [P] [US2] Add role permission API tests in `tests/integration/admin-permissions.test.ts`
  - Reason: Role changes must apply broadly and safely.
  - Expected: Tests cover set deny, set allow, remove setting, and audit event creation.
  - Possible bugs: Removing a setting can leave a stale deny cached.
  - Fix/Mitigation: Evaluator reads latest settings or uses explicit cache invalidation.
  - Verification: Integration tests pass.

- [X] T015 [US2] Add role permission routes under `src/app/api/admin/permissions/roles/`
  - Reason: Admin panel needs role-level save/read.
  - Expected: GET lists effective role settings; PATCH saves one role permission.
  - Possible bugs: Unknown permission keys can be stored.
  - Fix/Mitigation: Validate against permission catalog.
  - Verification: Tests reject unknown keys.

- [X] T016 [US2] Enforce manager create permission in `src/app/api/manager/users/route.ts`
  - Reason: Role deny must block manager-created users even when freeze is off.
  - Expected: Managers without permission get 403 before writes.
  - Possible bugs: Admin calling manager route can inherit manager behavior unexpectedly.
  - Fix/Mitigation: Decide actor role explicitly and test admin/manager cases.
  - Verification: Manager enforcement integration test.

- [X] T017 [US2] Enforce manager balance add/withdraw permissions in `src/app/api/manager/users/[id]/balance/route.ts`
  - Reason: Add and withdraw are separate money actions and must be independently controlled.
  - Expected: Deposit checks add permission; withdrawal checks withdraw permission.
  - Possible bugs: Negative amount can be evaluated against the wrong permission.
  - Fix/Mitigation: Determine action after validation and before transaction.
  - Verification: Tests cover positive and negative amount.

- [X] T018 [US2] Add admin permission management UI in `src/components/admin/permissions/`
  - Reason: Admins need a panel page to edit role permissions.
  - Expected: UI groups permissions by category and saves role-level allow/deny/default.
  - Possible bugs: Large permission table can be confusing.
  - Fix/Mitigation: Add search/filter and category grouping.
  - Verification: Manual role deny and allow flow.

---

## Phase 5: User Story 3 - Individual User Permission Overrides (Priority: P3)

**Goal**: Protected admins can override permissions for one account.

**Independent Test**: Deny one manager balance withdraw and verify another manager remains unaffected.

- [X] T019 [P] [US3] Add user override tests in `tests/integration/admin-permissions.test.ts`
  - Reason: Per-user restrictions are the main exception workflow.
  - Expected: Tests cover deny override, allow override, remove override, and same-role unaffected account.
  - Possible bugs: User override can leak to same role users through bad query.
  - Fix/Mitigation: Always filter override by exact user id and permission key.
  - Verification: Integration test with two managers.

- [X] T020 [US3] Add user override routes under `src/app/api/admin/permissions/users/`
  - Reason: Admin panel needs save/delete/read for account-specific overrides.
  - Expected: PATCH saves override; DELETE removes override; GET lists effective state.
  - Possible bugs: Overrides can be created for deleted users and confuse UI.
  - Fix/Mitigation: Allow viewing historical rows but reject new overrides for deleted users.
  - Verification: Tests cover deleted user rejection.

- [X] T021 [US3] Add user override UI in `src/components/admin/permissions/`
  - Reason: Admins need to search users and apply exceptions.
  - Expected: UI shows effective source: default, role setting, user override, or global block.
  - Possible bugs: Admin can misread allow/deny source.
  - Fix/Mitigation: Use explicit badges and confirmation on critical denies.
  - Verification: Manual override flow.

- [ ] T022 [US3] Apply permission state to admin users actions in `src/components/admin/users/UsersTable.tsx`
  - Reason: Admin action buttons should match effective permissions.
  - Expected: Create, edit, balance, reset, delete, activate, transfer controls reflect permissions.
  - Possible bugs: Hiding buttons can prevent protected admin from recovering permissions.
  - Fix/Mitigation: Keep permission management page independent and protected.
  - Verification: Manual admin users page check.

---

## Phase 6: User Story 4 - Safety And Audit (Priority: P4)

**Goal**: Permission changes are traceable and cannot lock out the last protected admin.

**Independent Test**: Try to remove the final protected admin's permission-management access and verify rejection plus audit.

- [ ] T023 [P] [US4] Add protected admin tests in `tests/integration/admin-permissions.test.ts`
  - Reason: Lockout prevention is critical.
  - Expected: Tests cover last protected admin rejection and adding another protected admin.
  - Possible bugs: A protected admin can be deleted or disabled without replacement.
  - Fix/Mitigation: Add checks to permission changes first; consider delete/deactivate checks in follow-up.
  - Verification: Integration tests pass.

- [X] T024 [US4] Implement protected admin checks in `src/lib/permissions/protected-admin.ts`
  - Reason: Routes need one helper for lockout validation.
  - Expected: Helper rejects unsafe permission changes.
  - Possible bugs: It can miss user override denies that remove permission-management access.
  - Fix/Mitigation: Evaluate final effective permission after proposed change.
  - Verification: Protected admin tests.

- [X] T025 [US4] Add permission audit views in admin permissions UI
  - Reason: Admins need to see who changed permissions.
  - Expected: UI lists recent permission audit events with filters.
  - Possible bugs: Audit can expose sensitive notes or internal errors.
  - Fix/Mitigation: Store only safe values and redact error details.
  - Verification: Manual audit list check.

---

## Final Phase: Polish And Verification

- [X] T026 Run focused verification commands
  - Reason: Permissions touch security, money, and user management.
  - Expected: Focused unit/integration tests, TypeScript, schema sync, and build pass.
  - Possible bugs: Full build can fail due unrelated environment issues.
  - Fix/Mitigation: Document exact failure and separate unrelated issues.
  - Verification: `npx tsx --test tests/unit/permission-evaluator.test.ts`, `npx tsx --test tests/integration/admin-permissions.test.ts`, `npx tsx --test tests/integration/manager-permission-enforcement.test.ts`, `npx tsc --noEmit`, `npm run build`.

- [X] T027 Update deployment notes and production safety checklist
  - Reason: This feature adds migrations and can block production workflows.
  - Expected: Quickstart includes migration deploy order, rollback switches, and protected admin preflight.
  - Possible bugs: Operators can deploy without protected admin seed.
  - Fix/Mitigation: Add preflight command before enabling restrictions.
  - Verification: Review `specs/017-admin-permission-controls/quickstart.md`.

## Dependencies

- MVP: T001-T013.
- Role permissions: T001-T018.
- User overrides: T001-T022.
- Safety/audit: T001-T027.

## Parallel Opportunities

- T002 and T003 can run in parallel after T001.
- T014 and T019 can be written in parallel once foundational contracts are stable.
- UI tasks can run after route contracts exist, but must not replace server-side enforcement.

## Implementation Strategy

1. Build the global freeze first as the minimum useful safety control.
2. Add the shared evaluator and migrate role/user settings.
3. Protect manager create and balance flows.
4. Expand to admin actions and individual overrides.
5. Finish protected admin safety and audit UI.
