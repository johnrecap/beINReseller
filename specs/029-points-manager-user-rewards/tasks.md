# Tasks: Points Settings Save And Manager-Owned User Points

**Input**: Design documents from `specs/029-points-manager-user-rewards/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This changes point settings and financial-adjacent point ledger behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Guardrails)

**Purpose**: Lock the current bug and new behavior into tests before changing production code.

- [x] T001 [P] Add save precedence tests in `tests/unit/points-admin-settings-normalization.test.ts`
  - Reason: The current bug is caused by current and legacy setting names being submitted together.
  - Expected: Tests show current field names win over legacy aliases for user, agent, and manager default rates.
  - Possible bugs: Tests may only cover user rate and miss agent/manager aliases.
  - Fix/Mitigation: Include all three existing aliases and the new manager-owned user rate in the fixtures.
  - Verification: `npx tsx --test tests/unit/points-admin-settings-normalization.test.ts` fails before implementation.

- [x] T002 [P] Add admin settings save/readback integration tests in `tests/integration/admin-points-settings-save.test.ts`
  - Reason: The user-facing failure is a successful save message with stale visible values.
  - Expected: Tests save changed defaults and overrides, reload settings, and assert the saved values are returned.
  - Possible bugs: Test data can conflict with existing seeded users.
  - Fix/Mitigation: Create isolated test users or use generated ids and clean up only those rows.
  - Verification: `npx tsx --test tests/integration/admin-points-settings-save.test.ts` fails before implementation.

- [x] T003 [P] Add manager-owned user routing tests in `tests/unit/points-operation-awards.test.ts`
  - Reason: The new rule changes who can receive operation spend points.
  - Expected: Tests cover disabled manager-only behavior and enabled manager-plus-user behavior.
  - Possible bugs: Tests can accidentally use the normal user-global rate instead of the dedicated rate.
  - Fix/Mitigation: Use distinct rates in fixtures so the asserted user points prove the dedicated rate was used.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts` fails before implementation.

- [x] T004 [P] Add worker parity tests in `tests/unit/worker-points-awards.test.ts`
  - Reason: The worker has separate point-award logic that must match the web app.
  - Expected: Worker-side fixtures produce the same disabled/enabled recipients as web-side fixtures.
  - Possible bugs: Worker logic may be hard to test because it is coupled to Prisma calls.
  - Fix/Mitigation: Extract a small pure recipient/rate helper if needed before changing behavior.
  - Verification: `npx tsx --test tests/unit/worker-points-awards.test.ts` fails before implementation or documents the extraction need.

---

## Phase 2: Foundational (Data And Normalization)

**Purpose**: Add the data shape and shared normalization needed by all stories.

- [x] T005 Add Prisma migration in `prisma/migrations/20260604130000_points_manager_owned_user_rate/migration.sql`
  - Reason: The new feature needs a persisted enable switch and a persisted dedicated rate owner type.
  - Expected: Migration adds the new point rule owner type and `manager_owned_user_points_enabled` with default false.
  - Possible bugs: PostgreSQL enum migration can fail if generated in a transaction that cannot add enum values safely.
  - Fix/Mitigation: Follow Prisma's generated migration pattern for enum changes and test with `npx prisma migrate dev` or review generated SQL before deploy.
  - Verification: `npx prisma validate` and migration SQL review.

- [x] T006 Update app Prisma schema in `prisma/schema.prisma`
  - Reason: Application code and Prisma client need the new setting and owner type.
  - Expected: `PointProgramSettings` exposes `managerOwnedUserPointsEnabled` and `PointRuleOwnerType` includes the manager-owned user default.
  - Possible bugs: Missing mapping can create a column name mismatch in production.
  - Fix/Mitigation: Use explicit `@map` matching the migration column name.
  - Verification: `npx prisma validate`.

- [x] T007 Update worker Prisma schema in `worker/prisma/schema.prisma`
  - Reason: Worker build and runtime must understand the same schema.
  - Expected: Worker schema mirrors the app schema for point settings and point rule owner type.
  - Possible bugs: App and worker schemas can drift and break worker build.
  - Fix/Mitigation: Run the repository schema sync check after edits.
  - Verification: `npm run check:schema-sync`.

- [x] T008 Create admin settings normalization helper in `src/lib/points/admin-settings-normalization.ts`
  - Reason: Save precedence should be tested outside the route handler.
  - Expected: Helper accepts raw save data, validates current-vs-legacy precedence, preserves zero values, and reports duplicates.
  - Possible bugs: Helper may convert invalid text to zero and silently save bad data.
  - Fix/Mitigation: Keep numeric validation strict at the API boundary and test invalid values.
  - Verification: `npx tsx --test tests/unit/points-admin-settings-normalization.test.ts`.

- [x] T009 Extend point settings reader types in `src/lib/points/settings.ts`
  - Reason: Operation award logic needs the manager-owned user enable switch and dedicated rate lookup.
  - Expected: Settings snapshot includes `managerOwnedUserPointsEnabled`, and rate lookup can resolve the new manager-owned user rate.
  - Possible bugs: Existing callers can break if the snapshot shape changes without defaults.
  - Fix/Mitigation: Return a default false value when the settings row does not exist.
  - Verification: `npx tsc --noEmit` or `npm run build`.

**Checkpoint**: Schema, normalization, and settings readers are ready for user-story implementation.

---

## Phase 3: User Story 1 - Save Point Settings Reliably (Priority: P1) MVP

**Goal**: The admin can change point settings and see the saved values persist after reload.

**Independent Test**: Save changed defaults and overrides through the admin settings route and confirm GET returns the same values.

- [x] T010 [US1] Update save parsing in `src/app/api/admin/points/settings/route.ts`
  - Reason: The route currently prefers legacy aliases over current visible fields.
  - Expected: Current fields win, legacy fields are fallback only, and manager-owned user fields are accepted.
  - Possible bugs: Old clients could break if aliases are removed entirely.
  - Fix/Mitigation: Keep alias fallback but never prefer alias over current fields.
  - Verification: `npx tsx --test tests/unit/points-admin-settings-normalization.test.ts`.

- [x] T011 [US1] Update admin settings transaction in `src/app/api/admin/points/settings/route.ts`
  - Reason: The new enable switch and rate must save atomically with existing point rules.
  - Expected: Transaction updates `PointProgramSettings`, deactivates previous active rules for affected owner types, and creates current active rules.
  - Possible bugs: Deactivating too broad a set can remove unrelated future rules.
  - Fix/Mitigation: Scope deactivation to the exact point rule owner types managed by this page.
  - Verification: `npx tsx --test tests/integration/admin-points-settings-save.test.ts`.

- [x] T012 [US1] Return saved canonical values from `src/app/api/admin/points/settings/route.ts`
  - Reason: The client needs confirmation that persisted values match the screen.
  - Expected: PUT returns current settings/defaults or triggers a reliable reload path with canonical field names.
  - Possible bugs: Response can omit override values and still leave stale UI state.
  - Fix/Mitigation: Either return a complete snapshot or always reload before showing success.
  - Verification: Integration test asserts readback values after save.

- [x] T013 [US1] Update client draft loading in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: `setDefaults(payload.defaults)` can preserve legacy alias keys in client state.
  - Expected: Client draft stores only current default keys and new manager-owned user fields.
  - Possible bugs: Missing fallback can show zero if server response is stale during deploy.
  - Fix/Mitigation: Read current keys first and use legacy keys only as display fallback during rollout.
  - Verification: Manual admin save test in `specs/029-points-manager-user-rewards/quickstart.md`.

- [x] T014 [US1] Update client save payload in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: Broad object spreading can re-send hidden stale aliases.
  - Expected: Save payload explicitly includes only current setting/default fields and override arrays.
  - Possible bugs: Forgetting a field can reset a setting to zero or false.
  - Fix/Mitigation: Build the payload field-by-field and cover all defaults in tests/manual checklist.
  - Verification: `npx tsx --test tests/integration/admin-points-settings-save.test.ts`.

- [x] T015 [US1] Move success timing after readback in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: Success before reload can mislead the admin when values do not persist.
  - Expected: Success appears only after saved values are applied to the screen.
  - Possible bugs: A successful save followed by a temporary reload failure may look like a failed save.
  - Fix/Mitigation: Show a precise reload error and keep the draft visible for retry.
  - Verification: Manual test by simulating save success plus failed reload, or component review if no UI test seam exists.

- [x] T016 [US1] Validate duplicate overrides in `src/app/api/admin/points/settings/route.ts`
  - Reason: Duplicate owner rows can create ambiguous active rules.
  - Expected: Duplicate agent or manager ids return 400 with duplicate id lists.
  - Possible bugs: Duplicate detection can treat blank override rows as duplicates.
  - Fix/Mitigation: Run duplicate detection after blank overrides are filtered by the client and after API validation normalizes arrays.
  - Verification: Add duplicate case to `tests/integration/admin-points-settings-save.test.ts`.

**Checkpoint**: User Story 1 is complete when settings save, reload, and display the changed values reliably.

---

## Phase 4: User Story 2 - Enable Points For Users Under Managers (Priority: P2)

**Goal**: Admin can enable users under managers to earn their own points at a dedicated rate.

**Independent Test**: Disabled setting keeps manager-only behavior; enabled setting adds a user point entry at the manager-owned user rate.

- [x] T017 [US2] Extend recipient/rate types in `src/lib/points/operation-awards.ts`
  - Reason: Manager-owned user points need a rate kind that is not the normal user rate.
  - Expected: Recipient model can represent a USER ledger owner with `MANAGER_OWNED_USER` rate kind.
  - Possible bugs: Ledger role can be confused with rate kind and store an invalid role.
  - Fix/Mitigation: Keep `ownerRoleAtTime` as real roles only and keep rate kind separate.
  - Verification: `npx tsc --noEmit` or `npm run build`.

- [x] T018 [US2] Update manager-owned recipient resolution in `src/lib/points/operation-awards.ts`
  - Reason: The current manager-owned branch returns the manager only.
  - Expected: When enabled, the manager remains a recipient and the active operation user is added as a second recipient.
  - Possible bugs: Inactive or deleted operation users could receive points.
  - Fix/Mitigation: Reuse active/not-deleted user checks before adding the user recipient.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [x] T019 [US2] Resolve the manager-owned user rate in `src/lib/points/settings.ts`
  - Reason: User extra points under managers must use the dedicated rate.
  - Expected: Rate lookup returns `MANAGER_OWNED_USER_DEFAULT` for manager-owned user recipients and zero when no active rule exists.
  - Possible bugs: The normal user-global rate could accidentally be used.
  - Fix/Mitigation: Use distinct test fixture rates and assert the snapshot rate in built ledger entries.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [x] T020 [US2] Persist manager-owned user rate from the admin route in `src/app/api/admin/points/settings/route.ts`
  - Reason: The admin-defined rate must be saved in point rules.
  - Expected: The route writes one active manager-owned user default rule with `ownerUserId = null`.
  - Possible bugs: The new rate can be omitted from GET and look like it was reset.
  - Fix/Mitigation: Update GET and PUT together and include readback tests.
  - Verification: `npx tsx --test tests/integration/admin-points-settings-save.test.ts`.

- [x] T021 [US2] Keep historical ledger rows untouched in `src/lib/points/operation-awards.ts`
  - Reason: This feature must not recalculate old operations.
  - Expected: Only future qualifying completions create entries under the new rule.
  - Possible bugs: A backfill or retry path may call award logic on already-awarded operations.
  - Fix/Mitigation: Preserve existing idempotency and `skipDuplicates` behavior.
  - Verification: Unit test confirms no duplicate entries are built for existing source ids where helper seam exists; otherwise verify existing idempotency remains unchanged.

**Checkpoint**: User Story 2 is complete when manager-owned user points can be enabled without changing existing manager awards.

---

## Phase 5: User Story 3 - Keep All Completion Paths Consistent (Priority: P2)

**Goal**: Web app and worker point-award behavior match for the new setting.

**Independent Test**: Worker-side tests use the same manager-owned user cases as web-side tests.

- [x] T022 [US3] Update worker rate owner types in `worker/src/lib/points.ts`
  - Reason: Worker currently only knows user, agent, and manager rate owner types.
  - Expected: Worker can resolve the manager-owned user default rate.
  - Possible bugs: Type unions can drift from Prisma enum names.
  - Fix/Mitigation: Use Prisma-generated types where practical or mirror exact enum strings.
  - Verification: `npm --prefix worker run build`.

- [x] T023 [US3] Update worker manager-owned recipient behavior in `worker/src/lib/points.ts`
  - Reason: Worker currently awards manager-owned user operations to the manager only.
  - Expected: Worker adds the user recipient only when the setting is enabled and the user is active.
  - Possible bugs: Worker may not select `managerOwnedUserPointsEnabled` from settings.
  - Fix/Mitigation: Extend the settings select and default missing settings to disabled.
  - Verification: `npx tsx --test tests/unit/worker-points-awards.test.ts`.

- [x] T024 [US3] Compare web and worker fixtures in `tests/unit/worker-points-awards.test.ts`
  - Reason: The two paths should not drift silently.
  - Expected: Disabled and enabled manager-owned user scenarios match expected recipients and rates.
  - Possible bugs: Test may duplicate implementation details instead of expected behavior.
  - Fix/Mitigation: Assert business outcomes: recipients, owner roles, rate snapshots, and point counts.
  - Verification: `npx tsx --test tests/unit/worker-points-awards.test.ts`.

**Checkpoint**: User Story 3 is complete when both completion paths pass the same manager-owned user scenarios.

---

## Phase 6: User Story 4 - Make The Screen Understandable To Admins (Priority: P3)

**Goal**: Admin labels clearly separate normal user, manager-owned user, agent, and manager rates.

**Independent Test**: Open the admin screen and confirm every rate has a distinct label and saving still works.

- [x] T025 [US4] Add manager-owned user controls in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: Admin needs a visible switch and rate field for the new behavior.
  - Expected: Screen includes an enable control and points-per-1000 field for users under managers.
  - Possible bugs: Disabled control can still send stale or unexpected values.
  - Fix/Mitigation: Always send the explicit enabled state and rate; behavior uses the enabled switch.
  - Verification: Manual admin screen test in `specs/029-points-manager-user-rewards/quickstart.md`.

- [x] T026 [US4] Rename default rate labels in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: Admin must distinguish normal users from users under managers.
  - Expected: Labels clearly identify normal user points, manager-owned user points, agent points, and manager points.
  - Possible bugs: Overlong labels can overflow in Arabic/English layouts.
  - Fix/Mitigation: Keep labels concise and check desktop/mobile responsive widths if the page is tested visually.
  - Verification: Manual browser check of the Points Settings page.

- [x] T027 [US4] Preserve override row behavior in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: Existing agent/manager override rows must still support blank default and explicit zero.
  - Expected: Blank override saves as default; `0` saves as explicit zero.
  - Possible bugs: Number conversion can turn blank into zero.
  - Fix/Mitigation: Keep override values as strings until payload construction and filter blanks before numeric conversion.
  - Verification: Manual override semantics test in `specs/029-points-manager-user-rewards/quickstart.md`.

**Checkpoint**: User Story 4 is complete when the screen is understandable and preserves existing override behavior.

---

## Final Phase: Verification And Release Safety

- [x] T028 Run focused point settings tests
  - Reason: Save reliability is the primary reported bug.
  - Expected: Normalization and admin settings save/readback tests pass.
  - Possible bugs: Integration tests may need database environment variables.
  - Fix/Mitigation: If DB integration is gated, document skipped tests and run unit coverage plus manual API verification.
  - Verification: `npx tsx --test tests/unit/points-admin-settings-normalization.test.ts tests/integration/admin-points-settings-save.test.ts`.

- [x] T029 Run focused operation award tests
  - Reason: The new manager-owned user rule changes point ledger recipients.
  - Expected: Web and worker routing tests pass.
  - Possible bugs: Worker tests may require helper extraction before they can run without a real queue.
  - Fix/Mitigation: Keep worker recipient logic testable through a pure helper if needed.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts tests/unit/worker-points-awards.test.ts`.

- [x] T030 Run schema and build verification
  - Reason: Prisma enum/settings changes affect app and worker builds.
  - Expected: Schema validation, schema sync, Prisma generation, web build, and worker build pass.
  - Possible bugs: Worker schema can drift or Prisma client generation can fail after enum changes.
  - Fix/Mitigation: Fix schema drift before build and regenerate Prisma clients.
  - Verification: `npx prisma validate && npm run check:schema-sync && npx prisma generate && npm run build && npm --prefix worker run build`.

- [x] T031 Run encoding and diff safety checks
  - Reason: Repository rules require minimal, encoding-safe edits.
  - Expected: No whitespace errors and no introduced mojibake patterns in changed files.
  - Possible bugs: Existing mojibake in untouched files can create noisy results.
  - Fix/Mitigation: Scan only changed files and do not rewrite unrelated files.
  - Verification: `git diff --check` and a changed-file scan for the mojibake patterns listed in `AGENTS.md`.

- [x] T032 Prepare deployment notes from `AGENTS.md`
  - Reason: Production has a live database and PM2 worker processes.
  - Expected: Final release notes use `npx prisma migrate deploy`, stop/rebuild/start web safely, build worker, restart worker processes, and check logs.
  - Possible bugs: Running `db push` or building while web serves `.next` can break production.
  - Fix/Mitigation: Follow the production server notes exactly.
  - Verification: Compare final deploy commands with `AGENTS.md`.

---

## Dependencies And Execution Order

- Phase 1 tests should be written before implementation changes.
- Phase 2 schema and normalization work blocks all user stories.
- User Story 1 is the MVP and should ship first if work is split.
- User Story 2 depends on Phase 2 and can start after settings/rate source exists.
- User Story 3 depends on the User Story 2 behavior decision but can be implemented in parallel after the data model is ready.
- User Story 4 depends on the settings fields from Phase 2 and can proceed in parallel with User Story 2 after the API contract is stable.
- Final verification depends on all implemented stories.

## Parallel Opportunities

- T001 through T004 can be written in parallel because they target different test files.
- T005 through T009 have some ordering around schema generation, but T008 can be developed while migration/schema work is reviewed.
- T017 through T020 can be implemented alongside T022 through T024 if two agents own web and worker files separately.
- T025 through T027 can run after the API contract is stable and do not need to block worker work.

## Implementation Strategy

1. Fix the save bug first: tests, normalization, API save/readback, client canonical payload.
2. Add the manager-owned user setting and rate source with migration and schema sync.
3. Update web operation awards and verify disabled/enabled behavior.
4. Update worker operation awards and verify parity.
5. Polish labels and manual admin screen behavior.
6. Run full focused verification and prepare production-safe deploy commands.
