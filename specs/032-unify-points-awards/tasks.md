# Tasks: Unified Operation Spend Points

**Input**: Design documents from `specs/032-unify-points-awards/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This changes point awards for completed financial operations.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Tests And Guardrails)

**Purpose**: Lock the expected point-award behavior before changing production code.

- [x] T001 [P] Add shared policy coverage in `tests/unit/points-operation-spend-policy.test.ts`
  - Reason: A single policy needs direct tests for eligibility, owner precedence, recipient output, and skipped reasons.
  - Expected: Tests cover disabled program, before-start operations, admin-owned direct users, legacy admin-created users, unowned users, agent-owned users, manager-owned users, and dirty manager-plus-agent ownership.
  - Possible bugs: Fixtures can accidentally duplicate current logic mistakes and miss the admin-owned direct user decision.
  - Fix/Mitigation: Include explicit assertions that admin receives no operation-spend recipient for admin-owned direct users.
  - Verification: `npx tsx --test tests/unit/points-operation-spend-policy.test.ts`.

- [x] T002 [P] Extend web award tests in `tests/unit/points-operation-awards.test.ts`
  - Reason: The web wrapper currently routes direct admin-created users to admin, which must change.
  - Expected: Tests prove admin-owned direct users receive user points, admin receives none, and existing agent/manager tests still pass.
  - Possible bugs: Updating expectations can hide a missing shared-policy call.
  - Fix/Mitigation: Add a spy or fixture shape that proves the wrapper passes policy-ready owner evidence.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [x] T003 [P] Extend worker award tests in `tests/unit/worker-points-awards.test.ts`
  - Reason: Worker must stop awarding unowned users by default and must match the shared policy.
  - Expected: Tests cover admin-owned direct user, legacy admin fallback, unowned user skip, manager-owned toggle, and agent-owned behavior.
  - Possible bugs: Worker fixtures may not include `createdBy`, so legacy admin fallback can never be tested.
  - Fix/Mitigation: Add the required creator evidence to worker test fixtures before changing worker code.
  - Verification: `npx tsx --test tests/unit/worker-points-awards.test.ts`.

- [x] T004 [P] Add manual completion award tests in `tests/unit/financial-review-points-awards.test.ts`
  - Reason: Manual charged/completed financial-review closure currently can complete an operation without awarding spend points.
  - Expected: Tests prove charged/completed closure calls the point award wrapper once after a successful completion transition.
  - Possible bugs: Test can pass if the award call happens before the operation is actually completed.
  - Fix/Mitigation: Assert the call happens only after the successful completed decision branch.
  - Verification: `npx tsx --test tests/unit/financial-review-points-awards.test.ts`.

- [x] T005 [P] Add completion-path parity integration coverage in `tests/integration/operation-points-completion-parity.test.ts`
  - Reason: Web, worker, recovery, and manual review should not produce different recipients for the same fixture.
  - Expected: Integration test fixtures compare final ledger recipients across supported completion paths.
  - Possible bugs: DB-backed tests can be skipped locally and leave a false sense of coverage.
  - Fix/Mitigation: Mark DB requirements clearly and keep unit parity tests runnable without a database.
  - Verification: `npx tsx --test tests/integration/operation-points-completion-parity.test.ts` when a test database is available.

---

## Phase 2: Foundational (Shared Policy)

**Purpose**: Build the single source of truth before wiring individual completion paths.

- [x] T006 Create shared pure policy in `shared/points/operation-spend-policy.ts`
  - Reason: Web and worker currently duplicate point recipient logic and disagree for admin-owned users.
  - Expected: The module exports pure functions for eligibility, owner classification, recipient resolution, and entry calculation inputs.
  - Possible bugs: The shared module can accidentally import Prisma or Next-only code and break worker build.
  - Fix/Mitigation: Keep the module dependency-free and pass all data as plain objects.
  - Verification: `npx tsx --test tests/unit/points-operation-spend-policy.test.ts`.

- [x] T007 Update app TypeScript imports to include shared policy in `src/lib/points/operation-awards.ts`
  - Reason: The web wrapper must use the shared policy instead of its local recipient resolver.
  - Expected: Web wrapper only loads data, resolves rates, writes ledger rows, and delegates eligibility/recipient decisions to the shared policy.
  - Possible bugs: Removing old helper exports can break existing tests that import them directly.
  - Fix/Mitigation: Re-export compatibility helpers from the shared module when existing tests or reports depend on them.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [x] T008 Update worker build access to shared policy in `worker/tsconfig.json`
  - Reason: Worker currently compiles only `worker/src`, so it cannot safely import a root shared module without a narrow config change.
  - Expected: Worker build includes `shared/points/operation-spend-policy.ts` without compiling unrelated web app files.
  - Possible bugs: Changing `rootDir` broadly can emit unexpected folder structure or compile web-only files.
  - Fix/Mitigation: Include only the shared folder and verify emitted imports with worker build.
  - Verification: `npm --prefix worker run build`.

- [x] T009 Replace worker local recipient logic in `worker/src/lib/points.ts`
  - Reason: Worker must use the same policy and must no longer award unowned users by default.
  - Expected: Worker loads policy-required ownership evidence, delegates recipient resolution, resolves rates, and writes idempotent entries.
  - Possible bugs: Missing `createdBy` or admin-owner evidence can skip legacy admin-owned users.
  - Fix/Mitigation: Update the worker operation query to load creator/admin evidence and test legacy fallback.
  - Verification: `npx tsx --test tests/unit/worker-points-awards.test.ts && npm --prefix worker run build`.

- [x] T010 Add deterministic ownership ordering in `src/lib/points/operation-awards.ts` and `worker/src/lib/points.ts`
  - Reason: Existing queries use a single ownership row without a clear order, which can make dirty data produce inconsistent recipients.
  - Expected: Queries order current manager/admin ownership and active agent assignments deterministically by latest/current evidence.
  - Possible bugs: Choosing a different row than current production expectation can change points for dirty users.
  - Fix/Mitigation: Keep manager/admin precedence, document order, and add dirty-data tests.
  - Verification: `npx tsx --test tests/unit/points-operation-spend-policy.test.ts tests/unit/worker-points-awards.test.ts`.

**Checkpoint**: Shared point-award policy is tested and available to both web and worker.

---

## Phase 3: User Story 1 - One Points Decision For Every Completion Path (Priority: P1) MVP

**Goal**: All completion paths use the same award policy and produce the same recipients.

**Independent Test**: Same operation fixture produces the same point recipients through web, worker, recovery, and manual charged completion.

- [x] T011 [US1] Refactor web award wrapper in `src/lib/points/operation-awards.ts`
  - Reason: Web completion and recovery already call this wrapper, so it must become a shared-policy adapter.
  - Expected: Wrapper returns stable skipped reasons and awarded entries from shared policy decisions.
  - Possible bugs: Existing skipped-reason values can change and break admin diagnostics.
  - Fix/Mitigation: Preserve current reason names where possible and map new policy reasons explicitly.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [x] T012 [US1] Refactor worker award wrapper in `worker/src/lib/points.ts`
  - Reason: Worker handles most live renewals and must match web behavior exactly.
  - Expected: Worker calls the same shared policy, resolves the same rate buckets, and writes the same entry shape.
  - Possible bugs: Worker entry status or notes can drift from web entry shape.
  - Fix/Mitigation: Keep entry creation fields aligned and assert shape in worker tests.
  - Verification: `npx tsx --test tests/unit/worker-points-awards.test.ts`.

- [x] T013 [US1] Wire manual financial-review completion in `src/app/api/admin/financial-review/[operationId]/decision/route.ts`
  - Reason: Manual charged closure should not miss operation-spend points.
  - Expected: When a decision transitions an operation to completed/charged, the route calls `processCompletedOperationPoints` once after the state change.
  - Possible bugs: Calling awards on non-completed or already-reviewed operations can create confusing logs or unnecessary work.
  - Fix/Mitigation: Gate the call on a successful completed transition and rely on ledger idempotency.
  - Verification: `npx tsx --test tests/unit/financial-review-points-awards.test.ts`.

- [x] T014 [US1] Confirm recovery still uses the web wrapper in `src/lib/operations/recovery.ts`
  - Reason: Recovery must benefit from the shared policy without adding a second implementation.
  - Expected: Recovery keeps calling the web wrapper and inherits the shared policy.
  - Possible bugs: Recovery can swallow award failures silently and hide skipped reasons.
  - Fix/Mitigation: Keep safe error logging with operation id and skipped reason only.
  - Verification: `npx tsx --test tests/unit/operation-recovery-classifier.test.ts tests/unit/points-operation-awards.test.ts`.

**Checkpoint**: The MVP is complete when every completion path uses the shared policy.

---

## Phase 4: User Story 2 - Admin-Owned Direct Users Receive Their Own Spend Points (Priority: P1)

**Goal**: User under admin earns their own normal-user spend points. Admin earns none for that operation.

**Independent Test**: Admin-owned direct user completed renewal creates one user ledger entry and no admin ledger entry.

- [x] T015 [US2] Change admin-owned recipient rule in `shared/points/operation-spend-policy.ts`
  - Reason: The approved business rule says the user under admin receives points, not admin.
  - Expected: Admin-owned direct and legacy admin-created users resolve to a normal-user recipient when the operation user is active.
  - Possible bugs: Admin can still appear as a recipient through manager-rate fallback.
  - Fix/Mitigation: Add explicit tests asserting no admin recipient for admin-owned direct users.
  - Verification: `npx tsx --test tests/unit/points-operation-spend-policy.test.ts`.

- [x] T016 [US2] Update web wrapper owner evidence loading in `src/lib/points/operation-awards.ts`
  - Reason: Web wrapper currently has an admin fallback that awards admin; it needs enough evidence to award the user instead.
  - Expected: Admin/direct owner evidence and legacy creator evidence are passed to the shared policy, and admin fallback recipient creation is removed.
  - Possible bugs: Historical user rows without current owner can become unowned if creator evidence is not selected.
  - Fix/Mitigation: Select safe creator role/active/deleted fields and test legacy fallback.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [x] T017 [US2] Update worker owner evidence loading in `worker/src/lib/points.ts`
  - Reason: Worker needs to distinguish admin-owned direct users from truly unowned users.
  - Expected: Worker selects current admin/manager owner, active agent owner, and legacy creator evidence required by the shared policy.
  - Possible bugs: Worker can award unowned users if it only sees an active normal operation user.
  - Fix/Mitigation: Require a valid admin/direct, agent, manager, or legacy admin fallback ownership decision before user points are awarded.
  - Verification: `npx tsx --test tests/unit/worker-points-awards.test.ts`.

- [x] T018 [US2] Preserve idempotency for admin-owned user awards in `src/lib/points/operation-awards.ts` and `worker/src/lib/points.ts`
  - Reason: Changing the owner from admin to user must not create duplicate entries for repeated award attempts after deployment.
  - Expected: The same owner/source uniqueness rule prevents duplicate user entries for the same operation.
  - Possible bugs: If an old admin entry already exists historically, a new user entry could be created for the same old operation during manual reprocessing.
  - Fix/Mitigation: Do not automatically reprocess historical operations; release audit should report historical mismatches instead of fixing them.
  - Verification: Repeat award test in `tests/unit/points-operation-awards.test.ts` and `tests/unit/worker-points-awards.test.ts`.

**Checkpoint**: Admin-owned direct user points are corrected and duplicate-safe.

---

## Phase 5: User Story 3 - Existing Agent And Manager Rules Stay Intact (Priority: P2)

**Goal**: Agent-owned and manager-owned point awards keep current approved behavior.

**Independent Test**: Existing agent-owned and manager-owned fixtures still produce the same recipients and rates.

- [x] T019 [US3] Preserve agent-owned recipient and rate behavior in `shared/points/operation-spend-policy.ts`
  - Reason: Agent-owned users should continue awarding both user and agent points.
  - Expected: Active normal user gets normal user rate; active agent gets default or override agent rate.
  - Possible bugs: Shared policy can skip user points if it incorrectly requires admin ownership.
  - Fix/Mitigation: Keep agent-owned tests as regression coverage.
  - Verification: `npx tsx --test tests/unit/points-operation-spend-policy.test.ts tests/unit/points-operation-awards.test.ts`.

- [x] T020 [US3] Preserve manager-owned toggle behavior in `shared/points/operation-spend-policy.ts`
  - Reason: Manager-owned users should only receive user points when the existing toggle is enabled.
  - Expected: Toggle off gives manager-only; toggle on gives manager plus user with manager-owned-user rate.
  - Possible bugs: Normal user rate can accidentally be used for manager-owned users.
  - Fix/Mitigation: Keep a dedicated `MANAGER_OWNED_USER_DEFAULT` rate bucket in tests and implementation.
  - Verification: `npx tsx --test tests/unit/points-operation-spend-policy.test.ts tests/unit/worker-points-awards.test.ts`.

- [x] T021 [US3] Preserve zero override behavior in `src/lib/points/settings.ts`, `src/lib/points/operation-awards.ts`, and `worker/src/lib/points.ts`
  - Reason: A zero override is a deliberate block for one owner and must not fall back to default.
  - Expected: Explicit zero override creates no positive points for that owner while other recipients remain valid.
  - Possible bugs: Nullish handling can treat zero as missing.
  - Fix/Mitigation: Use null/undefined checks, not truthiness, for override fallback.
  - Verification: `npx tsx --test tests/unit/points-calculation.test.ts tests/unit/points-operation-awards.test.ts tests/unit/worker-points-awards.test.ts`.

**Checkpoint**: Existing non-admin ownership behavior remains stable.

---

## Phase 6: User Story 4 - Admin Settings Page Explains The Rules Clearly (Priority: P3)

**Goal**: Admins can predict who receives points from the settings page.

**Independent Test**: Points settings page labels explain disabled program, admin-owned direct user rate, and manager-owned user toggle behavior.

- [x] T022 [US4] Update settings-page helper text in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: The UI should explain that normal user rate applies to admin-owned direct users and agent-owned users.
  - Expected: Admin sees concise text near default rules and toggles without changing saved values.
  - Possible bugs: Extra text can overflow the existing settings card on smaller screens.
  - Fix/Mitigation: Use compact helper text under existing labels and avoid large layout changes.
  - Verification: Manual check of `/dashboard/admin/points` plus `npm run build`.

- [x] T023 [US4] Add UI copy regression coverage if a component test seam exists in `tests/unit/points-admin-settings-normalization.test.ts`
  - Reason: Copy should remain aligned with the award policy after future edits.
  - Expected: Test or snapshot-level assertion covers the setting names or exported copy constants if extracted.
  - Possible bugs: Adding brittle UI text tests can fail on harmless wording changes.
  - Fix/Mitigation: Prefer exported policy-label constants only if the component already supports a clean seam.
  - Verification: `npx tsx --test tests/unit/points-admin-settings-normalization.test.ts`.

**Checkpoint**: The page matches the new award policy.

---

## Final Phase: Verification And Release Safety

- [x] T024 Run focused points unit tests
  - Reason: This feature changes financial-adjacent point awards.
  - Expected: Policy, web wrapper, worker wrapper, financial review, calculation, and routing tests pass.
  - Possible bugs: Tests can pass locally while DB integration remains unverified.
  - Fix/Mitigation: Document skipped integration tests and run DB-backed tests on a safe database before production.
  - Verification: `npx tsx --test tests/unit/points-operation-spend-policy.test.ts tests/unit/points-operation-awards.test.ts tests/unit/worker-points-awards.test.ts tests/unit/financial-review-points-awards.test.ts tests/unit/points-calculation.test.ts`.

- [x] T025 Run completion parity integration tests
  - Reason: The main goal is parity across completion paths.
  - Expected: Web, worker, recovery, and manual completion fixtures produce matching point recipients.
  - Possible bugs: Integration tests may require environment setup and fixture cleanup.
  - Fix/Mitigation: Use isolated fixture ids and only run on a safe test database.
  - Verification: `npx tsx --test tests/integration/operation-points-completion-parity.test.ts`.

- [x] T026 Run web and worker builds
  - Reason: Shared code must compile in both runtimes.
  - Expected: Web and worker builds pass after the shared policy and tsconfig changes.
  - Possible bugs: Worker build can fail if shared module emits outside expected dist layout.
  - Fix/Mitigation: Keep shared imports narrow and inspect build output if needed.
  - Verification: `npm run build && npm --prefix worker run build`.

- [ ] T027 Run release audit query for missing operation-spend points
  - Reason: Admin needs visibility into completed operations after deployment that did not receive points.
  - Expected: Audit reports counts and sample operation ids only, without changing data.
  - Possible bugs: Audit can expose sensitive customer data in logs.
  - Fix/Mitigation: Output operation ids, safe owner ids, and counts only.
  - Verification: Run the documented audit query/script on staging or production after deployment.

- [x] T028 Run encoding and diff safety checks
  - Reason: Repository rules require minimal, encoding-safe edits.
  - Expected: No whitespace errors and no new mojibake patterns in changed files.
  - Possible bugs: Existing mojibake in old templates can create noise.
  - Fix/Mitigation: Scan only changed files and do not rewrite unrelated files.
  - Verification: `git diff --check` and changed-file scan for the mojibake examples listed in `AGENTS.md`.

- [x] T029 Prepare deployment commands from `AGENTS.md`
  - Reason: Production has a live database and worker processes; deploy must not use unsafe schema pushes.
  - Expected: Commands use `git fetch`, intended branch checkout/pull, `npm ci` only if needed, `npx prisma migrate deploy`, stop web, remove `.next`, build web, restart web, build worker, restart worker processes, and inspect logs.
  - Possible bugs: Building while `bein-web` serves old `.next` can cause stale chunk errors.
  - Fix/Mitigation: Follow the production server notes exactly.
  - Verification: Compare final deploy commands with `AGENTS.md` before sending them.

---

## Dependencies And Execution Order

- Phase 1 tests should be written first.
- Phase 2 shared policy blocks all behavior changes.
- User Story 1 and User Story 2 are the MVP and should ship together.
- User Story 3 confirms existing behavior did not regress.
- User Story 4 can ship after the core behavior is correct.
- Final verification blocks release.

## Parallel Opportunities

- T001 through T005 can run in parallel because they target separate test files.
- T011 through T014 can be split between web/recovery and financial-review owners after T006 through T010 are complete.
- T019 through T021 can run in parallel with T022 after the shared policy is stable.
- T024 and T026 can run in parallel after implementation is complete.

## Implementation Strategy

1. Add tests for the desired award policy and parity.
2. Create the shared pure operation-spend policy.
3. Refactor web and worker wrappers to call the shared policy.
4. Fix admin-owned direct user recipients to user-only.
5. Wire manual financial-review completion into the same award process.
6. Update settings-page wording.
7. Run focused tests, builds, audit, and deploy safety checks.
