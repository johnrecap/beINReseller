# Tasks: Fix Points Recipient Routing

**Input**: Design documents from `specs/020-fix-points-routing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This changes points and financial-adjacent ledger behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Understanding)

**Purpose**: Lock the current bug into tests before changing behavior.

- [x] T001 Add failing admin-created direct user routing test in `tests/unit/points-operation-awards.test.ts`
  - Reason: The current bug is that direct admin-created users fall back to USER points.
  - Expected: Test expects ADMIN-only recipient and fails before implementation.
  - Possible bugs: Test can omit the no-agent/no-manager condition and pass for the wrong reason.
  - Fix/Mitigation: Fixture must explicitly set `managerOwnership: null`, `agentAssignment: null`, and `createdBy` as active ADMIN.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts` fails on this new case.

- [x] T002 Add failing no-valid-owner test in `tests/unit/points-operation-awards.test.ts`
  - Reason: The old fallback to USER must be removed when there is no valid ownership path.
  - Expected: Test expects an empty recipient list.
  - Possible bugs: Test could block agent-owned users if too broad.
  - Fix/Mitigation: Keep this test separate from the agent-owned case.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts` fails before implementation.

- [x] T003 Add failing admin role ledger entry test in `tests/unit/points-operation-awards.test.ts`
  - Reason: Admin recipient must be stored as ADMIN, not MANAGER, while using manager rate bucket.
  - Expected: Build award entries preserve `ownerRoleAtTime: ADMIN`.
  - Possible bugs: Type changes can accidentally allow invalid role/rate combinations.
  - Fix/Mitigation: Assert actual role and ownerKind separately.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts` fails before implementation.

---

## Phase 2: Foundational (Recipient Model)

**Purpose**: Make the internal model capable of actual ADMIN ledger role and manager rate kind.

- [x] T004 Update recipient types in `src/lib/points/operation-awards.ts`
  - Reason: Existing `AwardableRole` excludes ADMIN and conflates actual role with rate bucket.
  - Expected: Actual owner role supports ADMIN; ownerKind remains USER/AGENT/MANAGER for rate lookup.
  - Possible bugs: Changing types can break manager/agent tests or Prisma `Role` assignment.
  - Fix/Mitigation: Keep user/agent/manager cases unchanged and add focused type aliases.
  - Verification: `npx tsc --noEmit`.

- [x] T005 Add admin owner validation helper in `src/lib/points/operation-awards.ts`
  - Reason: Admin fallback must only use active, not-deleted ADMIN accounts.
  - Expected: A direct admin creator is receivable only if role ADMIN, active, and not deleted.
  - Possible bugs: Inactive admin could still get points.
  - Fix/Mitigation: Mirror `isReceivableOwner` checks and test inactive/deleted cases.
  - Verification: Unit tests for valid and invalid admin creator cases.

**Checkpoint**: Recipient model can represent admin-as-manager without touching DB writes yet.

---

## Phase 3: User Story 1 - Route New Operation Points Correctly (Priority: P1) MVP

**Goal**: New completed operations award points to the correct owner path.

**Independent Test**: Unit recipient tests pass for agent, manager, admin creator, and no-owner cases.

### Tests for User Story 1

- [x] T006 [P] [US1] Strengthen agent and manager precedence tests in `tests/unit/points-operation-awards.test.ts`
  - Reason: Fixing admin fallback must not break existing correct branches.
  - Expected: Manager-only and USER+AGENT tests still pass and manager wins when both links exist.
  - Possible bugs: Admin fallback could run before agent/manager checks.
  - Fix/Mitigation: Keep routing order manager -> agent -> admin creator -> none.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

### Implementation for User Story 1

- [x] T007 [US1] Update `resolveOperationPointRecipients` in `src/lib/points/operation-awards.ts`
  - Reason: This is the root cause of wrong USER awards.
  - Expected: Routing order is manager link, agent assignment, admin creator fallback, then no recipients.
  - Possible bugs: Direct users not created by admin could silently stop earning points.
  - Fix/Mitigation: This is intended by the clarified rule; verify with explicit no-owner test.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

- [x] T008 [US1] Include `createdBy` in operation user fetch in `src/lib/points/operation-awards.ts`
  - Reason: Recipient resolution needs the admin creator for direct admin-owned users.
  - Expected: `processCompletedOperationPointsInTransaction` selects operation user creator role, activity, and deletion state.
  - Possible bugs: Nested select can increase query size or miss null creator.
  - Fix/Mitigation: Select only id, role, isActive, deletedAt and handle null.
  - Verification: TypeScript and unit tests with mocked operation user shape.

**Checkpoint**: Forward routing bug is fixed for all new operation completions.

---

## Phase 4: User Story 2 - Keep Roles And Rates Accurate (Priority: P2)

**Goal**: Admin awards are auditable as ADMIN while using manager rate rules.

**Independent Test**: Admin recipient creates an ADMIN ledger role and calls rate lookup with ownerKind MANAGER.

### Tests for User Story 2

- [x] T009 [P] [US2] Add rate bucket test for admin-as-manager in `tests/unit/points-operation-awards.test.ts`
  - Reason: Admin has no separate point rule owner type, so this mapping must be explicit.
  - Expected: Admin recipient has `ownerRole: ADMIN` and `ownerKind: MANAGER`.
  - Possible bugs: Future refactor could add admin ownerKind accidentally.
  - Fix/Mitigation: Assert exact recipient object.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts`.

### Implementation for User Story 2

- [x] T010 [US2] Update award entry typing in `src/lib/points/operation-awards.ts`
  - Reason: `OperationSpendAwardEntry.ownerRoleAtTime` must allow ADMIN.
  - Expected: `pointLedgerEntry.createMany` receives actual owner role including ADMIN.
  - Possible bugs: Prisma type mismatch if actual role is not a valid `Role`.
  - Fix/Mitigation: Use Prisma `Role` compatible union and run `npx tsc --noEmit`.
  - Verification: `npx tsc --noEmit`.

- [x] T011 [US2] Verify `getSpendPointRate` calls use manager ownerKind for admin in `src/lib/points/operation-awards.ts`
  - Reason: Admin-as-manager points must use the existing manager settings.
  - Expected: Rate lookup receives `ownerKind: MANAGER` and `ownerUserId: adminId`.
  - Possible bugs: Admin-specific override does not exist, so override may be null and default manager rate applies.
  - Fix/Mitigation: Document that admin uses manager default unless a future admin override is added.
  - Verification: Unit tests and manual review of point settings behavior.

**Checkpoint**: Ledger and rate behavior are correct and auditable.

---

## Phase 5: User Story 3 - Audit And Remediate Existing Wrong Awards (Priority: P3)

**Goal**: Identify and safely correct historical user-owned operation points that should have gone to admin/manager.

**Independent Test**: A pure audit helper classifies sample wrong awards and marks converted risk without mutating data.

### Tests for User Story 3

- [x] T012 [P] [US3] Add historical routing audit tests in `tests/unit/points-routing-audit.test.ts`
  - Reason: Historical detection must be explainable before any data correction is considered.
  - Expected: Tests classify safe available-only candidates and converted review-required candidates.
  - Possible bugs: Audit can over-select legitimate agent-owned user points.
  - Fix/Mitigation: Include an agent-owned fixture that must not be a candidate.
  - Verification: `npx tsx --test tests/unit/points-routing-audit.test.ts`.

### Implementation for User Story 3

- [x] T013 [US3] Add read-only audit helper in `src/lib/points/historical-routing-audit.ts`
  - Reason: Admin needs a safe list of likely wrong historical awards before remediation.
  - Expected: Helper returns candidates, expected owner, points at risk, and converted review flag.
  - Possible bugs: Current ownership may not match historical ownership at award time.
  - Fix/Mitigation: Mark ambiguous records as review-required when point-in-time evidence is missing.
  - Verification: Unit tests and dry-run review.

- [x] T014 [US3] Document remediation SQL/script steps in `specs/020-fix-points-routing/quickstart.md`
  - Reason: Production correction must be deliberate and reviewable.
  - Expected: Quickstart includes dry-run first, backup, review converted candidates, then apply reversals only where approved.
  - Possible bugs: Operators might run correction before backup.
  - Fix/Mitigation: Put backup/review before apply steps and avoid destructive SQL.
  - Verification: Documentation review against `AGENTS.md` production notes.

**Checkpoint**: Historical risk is visible without unsafe automatic debits.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T015 Run point routing and analysis unit tests
  - Reason: Routing affects point balances and the analysis page displays them.
  - Expected: Relevant tests pass.
  - Possible bugs: Analysis summaries may expose historical wrong points differently after route changes.
  - Fix/Mitigation: Keep analysis read-only and verify summaries still reflect ledger data.
  - Verification: `npx tsx --test tests/unit/points-operation-awards.test.ts` and `npx tsx --test tests/unit/points-analysis.test.ts`.

- [x] T016 Run TypeScript and production build
  - Reason: Type changes can break Prisma/Next build boundaries.
  - Expected: TypeScript and build pass.
  - Possible bugs: Build can uncover route imports or server/client boundary issues.
  - Fix/Mitigation: Fix compiler/build errors before deploy.
  - Verification: `npx tsc --noEmit` and `npm run build`.

- [x] T017 Perform mojibake and diff checks
  - Reason: Repository has strict encoding safety rules.
  - Expected: No new mojibake patterns and no whitespace errors.
  - Possible bugs: PowerShell editing can introduce encoding artifacts.
  - Fix/Mitigation: Use `apply_patch` only and run checks.
  - Verification: `rg -n "â|Ã|Â" changed-files` and `git diff --check`.

- [x] T018 Prepare deployment and post-deploy validation notes
  - Reason: Production has live database and PM2 workers.
  - Expected: Notes state no migration expected unless audit index added, and include branch deploy commands.
  - Possible bugs: Forgetting worker build/restart can leave old point routing in background flows.
  - Fix/Mitigation: Include web and worker build/restart.
  - Verification: Compare final commands with `AGENTS.md` server notes.

---

## Dependencies

- Phase 1 before implementation.
- Phase 2 before routing changes.
- User Story 1 is MVP and blocks all deployment.
- User Story 2 depends on User Story 1 recipient model.
- User Story 3 can be implemented after forward fix, or deferred if only forward fix is needed first.

## Parallel Opportunities

- T001, T002, and T003 can be written together before implementation.
- T006 and T009 can be added in parallel because both are test-only.
- T012 can be developed separately from forward routing after Phase 2.

## Implementation Strategy

1. Ship forward routing fix first with tests.
2. Verify ledger role/rate mapping for admin-as-manager.
3. Add historical audit as a dry-run/reporting tool.
4. Only apply historical remediation after review of converted-risk candidates.
