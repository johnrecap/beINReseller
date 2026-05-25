# Tasks: Spend-Based Points and Cash Redemptions

**Input**: Design documents from `specs/014-points-rewards-spend-ledger/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature changes financial accounting, so tests must be written before implementation where a seam exists.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the accounting seams and migration surface shared by all stories.

- [X] T001 Create focused point test files in `tests/unit/points-calculation.test.ts`, `tests/unit/points-operation-awards.test.ts`, and `tests/integration/points-cash-redemption.test.ts`
  - Reason: Financial point behavior needs test-first coverage before changing production paths.
  - Expected: Empty or failing test files exist with node:test structure and imports planned around a points service seam.
  - Possible bugs: Tests can become too coupled to Prisma internals or require a live database too early.
  - Fix/Mitigation: Keep unit tests around pure helpers and reserve Prisma transaction behavior for integration tests.
  - Verification: `npx tsx --test tests/unit/points-calculation.test.ts` runs and fails only because assertions are not implemented yet.

- [X] T002 [P] Document existing point creation removal targets in `specs/014-points-rewards-spend-ledger/research.md`
  - Reason: The old model creates points in credit approval and manager top-up flows; those paths must be explicitly removed.
  - Expected: Research notes list the exact old files and behaviors to delete or bypass.
  - Possible bugs: Missing one old point creation path leaves duplicate or premature earning.
  - Fix/Mitigation: Use `rg "pointLedgerEntry.create|calculatePoints|getManagerTopupRate|getUserCreditRequestRate|getAgentCreditRequestRate" src worker tests`.
  - Verification: The research file contains the old source paths and the grep command output is reviewed.

- [X] T003 [P] Add a migration planning note for legacy point entries in `specs/014-points-rewards-spend-ledger/data-model.md`
  - Reason: Existing point entries were earned under the wrong trigger and must not be confused with spend-earned points.
  - Expected: Data model states whether legacy entries are excluded from cash conversion or classified separately.
  - Possible bugs: Old top-up-earned points could become convertible cash unintentionally.
  - Fix/Mitigation: Make the migration classify legacy source types and ensure summary helpers separate legacy totals.
  - Verification: Data model has an explicit legacy calculation rule.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the schema, settings, and pure accounting helpers needed before any user story is implemented.

- [X] T004 Add Prisma schema support for spend-based point settings, operation spend source types, cash redemptions, and reversals in `prisma/schema.prisma`
  - Reason: The database must represent enablement, start date, conversion ratio, new point sources, and cash redemption audit links.
  - Expected: Schema includes a settings model, source enum values, cash redemption model, and required relations/indexes.
  - Possible bugs: Enum changes can break existing Prisma generation or old source values.
  - Fix/Mitigation: Preserve existing enum values and add new values without renaming legacy values.
  - Verification: `npx prisma validate` and `npx tsc --noEmit` after generation.

- [X] T005 Create a migration under `prisma/migrations/` for the point settings, source enum additions, cash redemption table, and indexes
  - Reason: Production databases need an explicit, reviewable migration path.
  - Expected: Migration adds settings storage, source enum values, cash redemption table, and indexes for owner/status/source aggregation.
  - Possible bugs: PostgreSQL enum changes can fail inside incompatible transaction contexts.
  - Fix/Mitigation: Follow existing migration style for `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
  - Verification: `node scripts/check-prisma-schema-sync.js`.

- [X] T006 Mirror Prisma schema changes into `worker/prisma/schema.prisma`
  - Reason: The worker has its own schema copy and schema sync check requires consistency.
  - Expected: Worker schema contains the same point settings, enum, redemption, and index definitions.
  - Possible bugs: App and worker generated clients diverge.
  - Fix/Mitigation: Keep definitions aligned and run the schema sync check.
  - Verification: `node scripts/check-prisma-schema-sync.js`.

- [X] T007 [P] Implement pure point math and summary helpers in `src/lib/points/calculation.ts`
  - Reason: Earning and conversion require deterministic math independent from API routes.
  - Expected: Helpers calculate points from amount/rate, conversion balance from point ratio, and summaries from ledger-like rows.
  - Possible bugs: Floating point rounding can create small balance or point discrepancies.
  - Fix/Mitigation: Reuse existing four-decimal point rounding and document balance rounding behavior.
  - Verification: `npx tsx --test tests/unit/points-calculation.test.ts`.

- [X] T008 [P] Implement point settings reader and validator in `src/lib/points/settings.ts`
  - Reason: All earn and conversion paths need the same settings validation.
  - Expected: Helper returns disabled/invalid reasons, effective start date, role default rates, owner override rates, and conversion ratio.
  - Possible bugs: Zero overrides can be treated as missing and fall back to defaults.
  - Fix/Mitigation: Return explicit `{ found: true, rate: 0 }` for zero override rules.
  - Verification: Add unit coverage in `tests/unit/points-calculation.test.ts` for zero override behavior.

- [X] T009 [P] Implement point balance aggregation helper in `src/lib/points/balance.ts`
  - Reason: Wallets, conversions, users list, and admin views need consistent totals.
  - Expected: Helper separates available, lifetime earned, converted, reversed, and legacy totals.
  - Possible bugs: Negative entries can be double-counted or legacy entries can inflate available points.
  - Fix/Mitigation: Classify by source type and sign, and test mixed ledgers.
  - Verification: `npx tsx --test tests/unit/points-calculation.test.ts`.

- [X] T010 Create a small points namespace barrel or import convention in `src/lib/points/index.ts`
  - Reason: APIs and services should import point helpers consistently without circular dependencies.
  - Expected: The module exports calculation, settings, balance, award, and redemption helpers as they are added.
  - Possible bugs: Barrel exports can create circular imports if services import API code.
  - Fix/Mitigation: Keep `src/lib/points` independent from `src/app`.
  - Verification: `npx tsc --noEmit`.

**Checkpoint**: Foundation ready. User story implementation can start after schema and helper tests are in place.

---

## Phase 3: User Story 1 - Award Points From Completed Spend (Priority: P1) MVP

**Goal**: Points are created only after completed subscription spend and routed to the correct owners.

**Independent Test**: Complete or simulate qualifying operations for manager-owned, agent-owned, direct, before-start, disabled, and duplicate-processing cases.

### Tests for User Story 1

- [X] T011 [P] [US1] Write point award routing tests in `tests/unit/points-operation-awards.test.ts`
  - Reason: Manager-only, agent-plus-user, and direct-user routing are the highest-risk business rules.
  - Expected: Tests cover manager-owned user, agent-owned user, direct user, both-relationships manager precedence, and deleted/inactive recipient skip.
  - Possible bugs: The implementation can accidentally award both manager and user or double-award a user with both relationships.
  - Fix/Mitigation: Tests must assert exact recipient owner ids, not just totals.
  - Verification: Test file fails before implementation and passes after `src/lib/points/operation-awards.ts`.

- [X] T012 [P] [US1] Write point award eligibility tests in `tests/unit/points-operation-awards.test.ts`
  - Reason: Disabled settings, start date, non-completed status, zero amount, and zero rate must all be safe no-ops.
  - Expected: Tests assert skipped reasons and zero ledger writes for ineligible operations.
  - Possible bugs: Old or failed operations can earn points.
  - Fix/Mitigation: Eligibility checks must run before recipient resolution and DB writes.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [X] T013 [P] [US1] Write idempotency tests in `tests/unit/points-operation-awards.test.ts`
  - Reason: Operation completion and recovery paths can retry the same operation.
  - Expected: Tests prove repeated processing creates no duplicate owner/source entries.
  - Possible bugs: Duplicate retries can inflate points.
  - Fix/Mitigation: Use unique owner/source constraints and conflict-tolerant create logic.
  - Verification: The second processing attempt returns existing/skipped behavior.

### Implementation for User Story 1

- [X] T014 [US1] Implement completed-operation point award service in `src/lib/points/operation-awards.ts`
  - Reason: Awarding logic needs a single service used by all completion paths.
  - Expected: Service loads settings, validates eligibility, resolves recipients, calculates points, and writes ledger entries idempotently.
  - Possible bugs: Service may query ownership after relationships changed and not reflect completion-time intent.
  - Fix/Mitigation: Use current manager link and active agent assignment as specified, and store ownership snapshots in notes/details.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [X] T015 [US1] Remove point creation from credit request approval in `src/app/api/admin/credit-requests/[id]/decision/route.ts`
  - Reason: Credit approval is a top-up event, not actual subscription spend.
  - Expected: Approval still adds balance and transaction, but creates no point ledger entries.
  - Possible bugs: Removing imports can break points preview in the admin credit request list.
  - Fix/Mitigation: Keep preview only if clearly labeled as deprecated, or remove preview consistently from list UI/API.
  - Verification: Focused manual credit approval returns success and `rg "pointLedgerEntry.create" src/app/api/admin/credit-requests/[id]/decision/route.ts` finds no point creation.

- [X] T016 [US1] Remove manager top-up point creation in `src/app/api/manager/users/[id]/balance/route.ts`
  - Reason: Manager points must be earned from managed user subscription spend, not balance transfer.
  - Expected: Manager deposits and withdrawals continue to update balances and transactions without point entries.
  - Possible bugs: Removing point code can leave unused imports or change manager balance transaction behavior.
  - Fix/Mitigation: Delete only point-related imports and block; leave balance guards intact.
  - Verification: `npx tsc --noEmit` and manual manager deposit flow still returns success.

- [X] T017 [US1] Wire award service into operation completion in `src/app/api/operations/[id]/confirm-purchase/route.ts`
  - Reason: Confirm purchase is one path that can set paid operations toward completion and must award points when completion is reached.
  - Expected: When the route transitions an operation to completed or confirms completion, it invokes the award service safely.
  - Possible bugs: Awarding before final completion can violate completed-only rule.
  - Fix/Mitigation: Call only after the persisted status is `COMPLETED`.
  - Verification: Integration or manual operation completion creates point entries only after completed status.

- [X] T018 [US1] Wire award service into installment completion in `src/app/api/operations/[id]/confirm-installment/route.ts`
  - Reason: Installment operations also represent paid subscription spend.
  - Expected: Completed installment operations award points using `operation.amount`.
  - Possible bugs: Installment failure/refund paths can accidentally award points before refund.
  - Fix/Mitigation: Invoke only after successful final status persistence.
  - Verification: Simulated installment completion awards once; failed installment awards zero.

- [X] T019 [US1] Wire award service into worker completion path in `worker/src/http-queue-processor.ts`
  - Reason: The worker can mark operations completed outside the interactive API routes.
  - Expected: Worker-completed operations trigger the same idempotent award service or an equivalent app-side processing hook.
  - Possible bugs: Worker schema/client imports may not share app lib code directly.
  - Fix/Mitigation: If direct sharing is unsafe, add a small worker-local call with the same contract and tests, or queue a server-side reconciliation path.
  - Verification: Worker TypeScript build succeeds with `npm --prefix worker run build`.

- [X] T020 [US1] Add recovery/reconciliation awarding in `src/lib/operations/recovery.ts`
  - Reason: Recovery may discover operations already completed without normal completion hooks.
  - Expected: Recovery can safely invoke the idempotent award processor for completed operations.
  - Possible bugs: Recovery can award points to old operations before `pointsStartAt`.
  - Fix/Mitigation: Reuse the same eligibility check inside the award service.
  - Verification: Existing recovery tests pass and a new completed-after-start fixture awards once.

- [X] T021 [US1] Implement point reversal helper in `src/lib/points/reversals.ts`
  - Reason: Refunds/corrections after completion must reverse earned points without deleting audit entries.
  - Expected: Helper creates negative `POINT_REVERSAL` entries for original spend recipients idempotently.
  - Possible bugs: Reversal source ids can collide with earn entries or duplicate on retry.
  - Fix/Mitigation: Use stable reversal source ids such as `operationId:ownerId:reversalReason`.
  - Verification: Add unit tests in `tests/unit/points-operation-awards.test.ts` for one-time reversal.

- [X] T022 [US1] Wire reversal helper into refund/correction paths in `src/lib/refund.ts` and `src/app/api/admin/users/[id]/correct-balance/route.ts`
  - Reason: Balance reversals after completed spend must keep points aligned with net accounting.
  - Expected: Refund or correction linked to an operation reverses related spend-earned point entries.
  - Possible bugs: Generic balance corrections without operation context can reverse unrelated points.
  - Fix/Mitigation: Only reverse when an operation id or original point source is known.
  - Verification: Integration test covers refund after awarded operation and verifies negative point adjustment.

**Checkpoint**: User Story 1 is complete when all new points come only from completed operations and old top-up/credit paths no longer create points.

---

## Phase 4: User Story 2 - Convert Points To Balance Immediately (Priority: P2)

**Goal**: Authenticated owners convert available points into their own balance atomically.

**Independent Test**: Seed available points and settings, call conversion endpoint, and verify point deduction plus balance credit.

### Tests for User Story 2

- [X] T023 [P] [US2] Write cash conversion calculation tests in `tests/unit/points-calculation.test.ts`
  - Reason: Conversion ratio must be deterministic and reject invalid settings.
  - Expected: Tests cover valid ratio, fractional requests, invalid zero ratio, insufficient points, and rounding.
  - Possible bugs: Conversion can over-credit balance due to rounding or invalid settings.
  - Fix/Mitigation: Centralize conversion math and assert snapshots.
  - Verification: Unit tests fail before implementation and pass after conversion helper.

- [X] T024 [P] [US2] Write point cash redemption integration tests in `tests/integration/points-cash-redemption.test.ts`
  - Reason: Atomic point deduction plus balance credit is a financial transaction.
  - Expected: Tests prove success, insufficient points, invalid settings, inactive owner, and concurrent retry behavior.
  - Possible bugs: Partial writes can deduct points without crediting balance or credit balance without deducting points.
  - Fix/Mitigation: Use a single Prisma transaction and guarded available-point check.
  - Verification: `npx tsx --test tests/integration/points-cash-redemption.test.ts`.

### Implementation for User Story 2

- [X] T025 [US2] Implement cash redemption service in `src/lib/points/cash-redemption.ts`
  - Reason: Conversion logic must be shared by API and tests and isolated from UI.
  - Expected: Service validates owner, settings, available points, creates negative ledger entry, creates balance transaction, and returns snapshots.
  - Possible bugs: Available points read can race with another conversion.
  - Fix/Mitigation: Re-check available points inside the transaction and use serializable or guarded write semantics where appropriate.
  - Verification: Integration tests for concurrent conversion conflict.

- [X] T026 [US2] Add wallet endpoint in `src/app/api/points/wallet/route.ts`
  - Reason: Users, agents, and managers need to see available points and conversion settings.
  - Expected: GET returns point summary, conversion ratio, and recent cash conversions for the authenticated owner.
  - Possible bugs: Endpoint may expose another user's conversions.
  - Fix/Mitigation: Filter exclusively by authenticated user id.
  - Verification: API test or manual request as two users proves isolation.

- [X] T027 [US2] Add cash redemption endpoint in `src/app/api/points/cash-redemptions/route.ts`
  - Reason: Self-service conversion needs a dedicated immediate endpoint separate from reward catalog approvals.
  - Expected: POST validates input and returns converted points, credited balance, available points after, and transaction id.
  - Possible bugs: Unsupported roles like admin might convert points if not intended.
  - Fix/Mitigation: Allow only active USER, AGENT, and MANAGER unless spec is changed.
  - Verification: Integration tests cover allowed roles and forbidden role behavior.

- [X] T028 [US2] Update rewards wallet UI in `src/components/rewards/RewardsClient.tsx`
  - Reason: The existing rewards page currently shows catalog redemption, not instant cash conversion.
  - Expected: Page shows point summary, conversion ratio, point input, calculated balance credit, and recent conversions.
  - Possible bugs: Old catalog buttons can remain and confuse users.
  - Fix/Mitigation: Remove or clearly separate old catalog UI from cash conversion v1.
  - Verification: Browser/manual flow converts points and refreshes balances.

- [X] T029 [US2] Update dashboard rewards page behavior in `src/app/dashboard/rewards/page.tsx`
  - Reason: Page-level authorization and copy must match immediate point-to-balance conversion.
  - Expected: Authenticated allowed roles can access the page; unauthorized or inactive users are redirected or rejected according to existing auth rules.
  - Possible bugs: Managers or agents can be hidden by old rewards permissions despite needing conversion.
  - Fix/Mitigation: Use explicit role/permission rule aligned with the contract.
  - Verification: Manual navigation as USER, AGENT, MANAGER, and ADMIN.

**Checkpoint**: User Story 2 is complete when conversion is immediate, atomic, and self-scoped.

---

## Phase 5: User Story 3 - Admin Controls Earning And Conversion Rules (Priority: P3)

**Goal**: Admins can enable the program, set the start date, set earn rates, preserve zero overrides, and set conversion ratio.

**Independent Test**: Save settings, complete operations, and convert points to verify settings drive both earning and redemption.

### Tests for User Story 3

- [X] T030 [P] [US3] Write admin points settings validation tests in `tests/unit/points-calculation.test.ts`
  - Reason: Settings validation controls whether money-related conversion and earning can run.
  - Expected: Tests cover enabled without start date, invalid conversion ratio, zero earn rates, and zero owner override.
  - Possible bugs: Invalid settings can allow zero-dollar conversion or fallback from zero override.
  - Fix/Mitigation: Reject invalid conversion and distinguish missing override from zero override.
  - Verification: `npx tsx --test tests/unit/points-calculation.test.ts`.

### Implementation for User Story 3

- [X] T031 [US3] Update admin points settings API in `src/app/api/admin/points/settings/route.ts`
  - Reason: Existing endpoint lacks program start settings and cash conversion ratio and mishandles zero override semantics.
  - Expected: GET/PUT match `contracts/admin-points-settings.md` and preserve zero overrides.
  - Possible bugs: Full replacement update can delete existing active rules unexpectedly.
  - Fix/Mitigation: Keep transactional update, validate owners, and create active settings atomically.
  - Verification: API tests or manual PUT/GET roundtrip including zero override.

- [X] T032 [US3] Update admin points settings UI in `src/components/admin/points/AdminPointsSettingsClient.tsx`
  - Reason: Admins need controls for enablement, start date, earn rates, overrides, and conversion ratio.
  - Expected: UI includes enable toggle, start date input, default rates, owner overrides, conversion points, and conversion amount.
  - Possible bugs: Empty override and zero override can be confused in form state.
  - Fix/Mitigation: Preserve empty string as "use default" and `0` as an explicit override.
  - Verification: Manual UI roundtrip saves empty and zero override correctly.

- [X] T033 [US3] Remove or relabel admin rewards approval dependencies in `src/components/admin/rewards/AdminRewardsClient.tsx`
  - Reason: Cash conversion no longer requires admin approval through reward redemptions.
  - Expected: Admin rewards screen no longer presents point cash conversion as pending approvals; legacy catalog remains separate if retained.
  - Possible bugs: Admins may still approve old redemptions that deduct points but do not credit balance.
  - Fix/Mitigation: Clearly separate legacy catalog approvals from cash conversion audit or hide catalog if out of scope.
  - Verification: Manual admin rewards screen review and no references to cash conversion pending approvals.

- [X] T034 [US3] Update permissions/navigation for rewards and points in `src/lib/permissions.ts` and `src/components/layout/Sidebar.tsx`
  - Reason: USER, AGENT, and MANAGER need point wallet access while admin settings remain admin-only.
  - Expected: Sidebar shows point wallet for allowed roles and admin settings for admins only.
  - Possible bugs: Roles can see links that API rejects or miss links they are allowed to use.
  - Fix/Mitigation: Align page checks, API checks, and sidebar predicates.
  - Verification: Manual sidebar check for USER, AGENT, MANAGER, ADMIN.

**Checkpoint**: User Story 3 is complete when admins can control all rates and conversion settings without code changes.

---

## Phase 6: User Story 4 - Display Points Beside User Balances (Priority: P4)

**Goal**: Admin and manager users lists show point summaries alongside balances.

**Independent Test**: List users after earning/converting points and verify each visible row has correct point summary.

### Tests for User Story 4

- [X] T035 [P] [US4] Write point summary aggregation tests in `tests/unit/points-calculation.test.ts`
  - Reason: User lists depend on correct grouped point totals.
  - Expected: Tests cover earned, converted, reversed, zero activity, and legacy separation.
  - Possible bugs: Converted negative entries can display as negative available or legacy can inflate available.
  - Fix/Mitigation: Normalize display fields and clamp available only where business rules require it.
  - Verification: Unit aggregation tests pass.

### Implementation for User Story 4

- [X] T036 [US4] Add point summaries to admin users API in `src/app/api/admin/users/route.ts`
  - Reason: Admin users table needs balance plus points in the same row data.
  - Expected: Response includes `points` summary for every returned user with batched aggregation.
  - Possible bugs: Per-user queries can make the users page slow.
  - Fix/Mitigation: Query ledger entries for all page user ids in one query and group in memory.
  - Verification: Manual API call shows point summaries and query inspection avoids N+1 pattern.

- [X] T037 [US4] Show point summaries in admin users table in `src/components/admin/users/UsersTable.tsx`
  - Reason: Admins need visual access to points beside balance.
  - Expected: Table displays available and lifetime/converted point summary without layout overflow.
  - Possible bugs: Narrow screens can overflow or hide important balance data.
  - Fix/Mitigation: Use compact stacked text or responsive columns consistent with existing table style.
  - Verification: Browser/manual check at desktop and narrow viewport.

- [X] T038 [US4] Add point summaries to manager users API in `src/app/api/manager/users/route.ts`
  - Reason: Managers need point visibility for their managed users only.
  - Expected: Response includes point summary for users scoped to the authenticated manager.
  - Possible bugs: Aggregation query can include users outside manager scope.
  - Fix/Mitigation: Build summary query from the already scoped user ids only.
  - Verification: Manual/API test with two managers proves isolation.

- [X] T039 [US4] Show point summaries in manager users table in `src/components/manager/users/ManagerUsersTable.tsx`
  - Reason: Manager UI must match the new API data.
  - Expected: Manager table shows each managed user's balance and point summary.
  - Possible bugs: Type mismatch can break manager page rendering.
  - Fix/Mitigation: Update local TypeScript types with nullable/zero-safe points shape.
  - Verification: `npx tsc --noEmit` and manual manager page check.

**Checkpoint**: User Story 4 is complete when user-management views show point summaries without changing authorization scope.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, documentation, and safety checks.

- [X] T040 [P] Update dashboard and agent point summaries in `src/app/api/agent/dashboard/route.ts` and relevant dashboard components
  - Reason: Agent dashboard currently derives points from old ledger status semantics.
  - Expected: Agent dashboard reports available spend-earned points and converted totals consistently with wallet summary.
  - Possible bugs: Agent available points can include legacy top-up entries.
  - Fix/Mitigation: Reuse `src/lib/points/balance.ts`.
  - Verification: Manual agent dashboard after agent-owned user spend.

- [X] T041 [P] Update or deprecate old reward redemption APIs in `src/app/api/rewards/route.ts`, `src/app/api/rewards/redemptions/route.ts`, and `src/app/api/admin/rewards/redemptions/[id]/decision/route.ts`
  - Reason: Old reward catalog flow is not the cash conversion flow and can confuse point accounting.
  - Expected: Old APIs are either hidden from cash UI or clearly restricted to legacy catalog rewards.
  - Possible bugs: Removing endpoints can break old navigation unexpectedly.
  - Fix/Mitigation: Keep read-only or legacy-compatible behavior unless product decision removes catalog entirely.
  - Verification: `rg "Reward redemption request created|Request Redemption" src` confirms old cash-like copy is gone from wallet.

- [X] T042 Run schema, type, and focused test verification from repository root
  - Reason: Financial accounting changes need repeatable verification before handoff.
  - Expected: Schema sync, TypeScript, unit tests, integration tests, and worker build results are recorded.
  - Possible bugs: Full lint may still fail because of unrelated pre-existing issues.
  - Fix/Mitigation: Report pre-existing lint baseline separately and do not hide feature failures.
  - Verification: Run `node scripts/check-prisma-schema-sync.js`, `npx tsc --noEmit`, `npx tsx --test tests/unit/*.test.ts`, `npx tsx --test tests/integration/*.test.ts`, and `npm --prefix worker run build`.

- [X] T043 Run mojibake and encoding safety scan on changed text files
  - Reason: Repository rules require checking no mojibake patterns were introduced.
  - Expected: No new mojibake patterns from the repository encoding rules in edited comments/strings unless already present and unrelated.
  - Possible bugs: Existing mojibake in untouched files can cause noisy output.
  - Fix/Mitigation: Limit scan to changed files with `git diff --name-only` and inspect matches manually.
  - Verification: Build the scan pattern from code points such as `[char]0x00E2`, `[char]0x00C3`, `[char]0x00C2`, and `[char]0x00EF`, then run `Select-String` against changed text files.

- [X] T044 Update quickstart validation evidence in `specs/014-points-rewards-spend-ledger/quickstart.md`
  - Reason: Future implementers need exact reproduction and verification steps.
  - Expected: Quickstart reflects the final implemented endpoints, UI labels, and commands.
  - Possible bugs: Documentation can drift from implementation.
  - Fix/Mitigation: Update quickstart only after final route names and UI flows are confirmed.
  - Verification: Manual quickstart run follows the documented steps without guessing.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on setup; blocks user stories.
- **US1 (Phase 3)**: Depends on foundational and is the MVP.
- **US2 (Phase 4)**: Depends on foundational and point balance helpers; can start after US1 helpers exist.
- **US3 (Phase 5)**: Depends on settings model; can run in parallel with US2 after foundational.
- **US4 (Phase 6)**: Depends on point summary helper and API shape decisions.
- **Polish (Phase 7)**: Depends on selected stories being complete.

### User Story Dependencies

- **US1**: Must land first because all points must be earned correctly before conversion and display.
- **US2**: Depends on correct available point calculation from US1/foundational helpers.
- **US3**: Can proceed after schema/settings foundation but should be verified with US1 and US2.
- **US4**: Depends on final point summary shape.

### Parallel Opportunities

- T002 and T003 can run while T001 creates test skeletons.
- T007, T008, and T009 can be developed in parallel after schema planning.
- US1 test tasks T011-T013 can be written in parallel.
- US2 tests T023-T024 can be written in parallel.
- US4 API and UI tasks can split after the points summary response shape is stable.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 end to end.
3. Validate that points are awarded only after completed operation spend.
4. Stop and verify old credit/top-up point creation is removed.

### Incremental Delivery

1. US1: Correct earning model and idempotent ledger.
2. US3: Admin settings for start, rates, conversion.
3. US2: Immediate conversion to balance.
4. US4: User list visibility.
5. Polish: legacy reward cleanup, dashboard consistency, full verification.

## Notes

- Do not backfill historical spend.
- Do not use risky PowerShell writers for code edits.
- Do not expose beIN secrets or runtime provider state.
- Keep point ledger entries immutable; use negative entries for conversion and reversal.
