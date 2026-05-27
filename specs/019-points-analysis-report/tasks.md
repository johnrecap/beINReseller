# Tasks: Points Analysis Report

**Input**: Design documents from `specs/019-points-analysis-report/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required for aggregation, row classification, admin API behavior, and report tab wiring because this feature explains financial-adjacent point history.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared types, labels, and tests before creating API or UI.

- [X] T001 Create failing point analysis unit tests in `tests/unit/points-analysis.test.ts`
  - Reason: Summary math and row classification must be correct before showing data to admins.
  - Expected: Tests cover earned, available, converted, reversed, cancelled, pending, and legacy/manual buckets.
  - Possible bugs: Tests can mirror the implementation too closely and miss business mistakes.
  - Fix/Mitigation: Use mixed realistic ledger fixtures from operation spend, Eid reward, cash redemption, and reversal.
  - Verification: `npx tsx --test tests/unit/points-analysis.test.ts` fails before implementation.

- [X] T002 Add Points Analysis tab expectations in `tests/unit/report-center-tabs.test.ts`
  - Reason: The new report must be part of the existing Reports Center instead of another sidebar item.
  - Expected: Tests assert `points-analysis` exists, has a stable href, and resolves from the query string.
  - Possible bugs: A duplicate key or wrong href can hide the tab or break deep links.
  - Fix/Mitigation: Keep unique-key and required-tab assertions.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts` fails until the tab is registered.

- [X] T003 Define report view types in `src/lib/points/analysis.ts`
  - Reason: APIs and UI need a shared contract for summaries, rows, owners, and filter values.
  - Expected: The file exports types for `PointsAnalysisSummary`, `PointsAnalysisRow`, filters, and owner timeline.
  - Possible bugs: Types can drift from the API response contract.
  - Fix/Mitigation: Keep API route serialization using these exported types.
  - Verification: `npx tsc --noEmit`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the read-only backend primitives that every story depends on.

- [X] T004 Implement source label and direction mapping in `src/lib/points/analysis.ts`
  - Reason: Admins need plain language like "Eid reward" and "converted to balance", not raw enum names only.
  - Expected: Every existing `PointLedgerSourceType` maps to a label and direction.
  - Possible bugs: Unknown future source types can crash the report.
  - Fix/Mitigation: Add a safe fallback label for unknown source values.
  - Verification: `npx tsx --test tests/unit/points-analysis.test.ts`.

- [X] T005 Implement summary aggregation in `src/lib/points/analysis.ts`
  - Reason: The report must explain totals consistently with the wallet balance rules.
  - Expected: Summary totals match `summarizePointBalance` for available, earned, converted, and reversed values while adding pending/cancelled/legacy counts.
  - Possible bugs: Negative rows can be double-counted or cancelled rows can reduce available points incorrectly.
  - Fix/Mitigation: Test each status and source combination explicitly.
  - Verification: `npx tsx --test tests/unit/points-analysis.test.ts`.

- [X] T006 Implement filter parsing helpers in `src/lib/points/analysis.ts`
  - Reason: API routes need bounded, validated filters for date range, role, owner, source, status, and conversion state.
  - Expected: Invalid filters return controlled validation errors and page/limit are bounded.
  - Possible bugs: Date filters can shift a day if they ignore Egypt time.
  - Fix/Mitigation: Use `src/lib/egypt-time.ts` for local-to-UTC bounds.
  - Verification: Unit tests include Egypt date boundaries and invalid enum values.

- [X] T007 Review point ledger query indexes before implementation
  - Reason: Global admin date filtering can be slow if existing indexes are insufficient.
  - Expected: Decide whether existing indexes are enough or whether an index migration is needed.
  - Possible bugs: Adding unnecessary indexes can slow writes and complicate production migration.
  - Fix/Mitigation: Add migration only after query plan or schema review shows a need.
  - Verification: Record the decision in the implementation notes or migration PR summary.

**Checkpoint**: Shared point analysis rules are tested and ready for API use.

---

## Phase 3: User Story 1 - See The Whole Points Picture (Priority: P1) MVP

**Goal**: Admins can open a Points Analysis tab and see overall point totals plus a paginated ledger table.

**Independent Test**: Open `/dashboard/admin/reports?tab=points-analysis` as admin and verify summary cards and ledger rows load.

### Tests for User Story 1

- [X] T008 [P] [US1] Add API response shape tests in `tests/unit/points-analysis.test.ts`
  - Reason: The frontend needs a stable response with summary, rows, pagination, and settings.
  - Expected: Tests validate row shaping and safe missing-reference behavior without requiring a browser.
  - Possible bugs: Tests can become brittle if they assert display copy too tightly.
  - Fix/Mitigation: Assert semantic fields, not exact CSS or layout.
  - Verification: `npx tsx --test tests/unit/points-analysis.test.ts`.

### Implementation for User Story 1

- [X] T009 [US1] Register `points-analysis` in `src/components/admin/report-center/report-tabs.ts`
  - Reason: The tab must appear in the existing Reports Center.
  - Expected: `points-analysis` has label, description, and deep link `/dashboard/admin/reports?tab=points-analysis`.
  - Possible bugs: Existing default tab or legacy route helpers can change unexpectedly.
  - Fix/Mitigation: Keep the default tab unchanged and only add the new tab definition.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts`.

- [X] T010 [US1] Add lazy panel loader in `src/components/admin/report-center/report-panel-loaders.ts`
  - Reason: The report center should load only the active report panel.
  - Expected: Points Analysis panel is lazy-loaded like other report tabs.
  - Possible bugs: Import path errors can break the whole report center.
  - Fix/Mitigation: Add import smoke coverage in the report-center test.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts`.

- [X] T011 [US1] Create admin report API `src/app/api/admin/reports/points-analysis/route.ts`
  - Reason: Summary and row data must come from the server, not frontend calculations.
  - Expected: Admin-only GET endpoint returns filtered summary, rows, pagination, and conversion settings.
  - Possible bugs: The API can accidentally expose private notes or related account secrets.
  - Fix/Mitigation: Select only report-safe fields and map responses through `analysis.ts`.
  - Verification: API smoke with an admin session and non-admin denial check.

- [X] T012 [US1] Create `src/components/admin/report-center/PointsAnalysisReportPanel.tsx`
  - Reason: Admins need a readable UI for totals, filters, and the ledger table.
  - Expected: Panel renders summary cards, filter controls, table, loading state, empty state, and error state.
  - Possible bugs: Tables can overflow or text can overlap in RTL/mobile layouts.
  - Fix/Mitigation: Use existing dashboard table containers, fixed controls, and horizontal overflow.
  - Verification: Browser/manual check desktop and mobile widths.

- [X] T013 [US1] Format all points report dates with Egypt helpers in `src/components/admin/report-center/PointsAnalysisReportPanel.tsx`
  - Reason: Previous date bugs came from inconsistent timezone handling.
  - Expected: Filter input and row timestamps use Africa/Cairo consistently.
  - Possible bugs: HTML date inputs can submit local browser time instead of Egypt time.
  - Fix/Mitigation: Use existing Egypt date conversion helpers for filter payloads.
  - Verification: Set a same-day filter and confirm rows do not shift to the previous day.

**Checkpoint**: MVP is complete when the Points Analysis tab shows truthful totals and ledger rows.

---

## Phase 4: User Story 2 - Trace One Owner's Points (Priority: P2)

**Goal**: Admins can search/select one owner and see that owner's point timeline and current point state.

**Independent Test**: Search a known user and confirm their timeline explains source, status, conversion, and related references.

### Tests for User Story 2

- [X] T014 [P] [US2] Add owner timeline tests in `tests/unit/points-analysis.test.ts`
  - Reason: Owner-specific totals must not accidentally summarize only the current page.
  - Expected: Tests prove owner summary uses all owner entries while rows remain paginated.
  - Possible bugs: Owner totals can mismatch the global table when filters are applied.
  - Fix/Mitigation: Test filtered and unfiltered owner timelines separately.
  - Verification: `npx tsx --test tests/unit/points-analysis.test.ts`.

### Implementation for User Story 2

- [X] T015 [US2] Create owner detail API `src/app/api/admin/reports/points-analysis/owners/[id]/route.ts`
  - Reason: The UI needs a focused endpoint for a selected customer's or manager's point path.
  - Expected: Admin-only endpoint returns owner profile, summary, paginated timeline rows, and pagination.
  - Possible bugs: Deleted users can return 404 and hide historical ledger data.
  - Fix/Mitigation: Select users including deleted state when the ledger owner exists.
  - Verification: Query an active owner and a deleted/inactive owner if test data exists.

- [X] T016 [US2] Add owner search and detail state to `src/components/admin/report-center/PointsAnalysisReportPanel.tsx`
  - Reason: Admins need to quickly answer questions for one account.
  - Expected: Search by username/email opens a detail section or drawer with owner totals and timeline.
  - Possible bugs: Search requests can fire too often or race with pagination.
  - Fix/Mitigation: Debounce search input or submit only on explicit action and cancel stale loads.
  - Verification: Search `admin`, `Noman329`, and a missing username manually.

- [X] T017 [US2] Display related operation, redemption, and transaction references in the panel
  - Reason: The admin must see if points came from spending, Eid, or conversion to balance.
  - Expected: Rows show operation id/card reference, redemption id, transaction id, and money value when available.
  - Possible bugs: Missing related rows can cause blank cells that look like data loss.
  - Fix/Mitigation: Render "reference unavailable" for missing joins.
  - Verification: Check rows from operation spend, Eid reward, and cash redemption fixtures.

**Checkpoint**: User Story 2 is complete when one owner can be traced from source to current state.

---

## Phase 5: User Story 3 - Filter And Audit Safely (Priority: P3)

**Goal**: Admins can filter the report without mutating points or balance.

**Independent Test**: Apply filters and verify totals, rows, and pagination match the selected scope.

### Tests for User Story 3

- [X] T018 [P] [US3] Add filter parsing and query-building tests in `tests/unit/points-analysis.test.ts`
  - Reason: Filters control production report correctness and performance.
  - Expected: Tests cover role, source, status, conversion state, owner search, page, limit, and Egypt date range.
  - Possible bugs: Filter combinations can exclude valid rows or include rows outside date range.
  - Fix/Mitigation: Build filter predicates from validated parsed values only.
  - Verification: `npx tsx --test tests/unit/points-analysis.test.ts`.

### Implementation for User Story 3

- [X] T019 [US3] Implement server-side filter query building in `src/app/api/admin/reports/points-analysis/route.ts`
  - Reason: The browser must not download all ledger rows and filter locally.
  - Expected: API applies filters in Prisma where clauses and returns stable newest-first pagination.
  - Possible bugs: Owner search with OR conditions can override other filters.
  - Fix/Mitigation: Compose `AND` clauses explicitly and keep owner search nested.
  - Verification: API smoke requests for each filter combination.

- [X] T020 [US3] Wire filter controls to URL/search params in `src/components/admin/report-center/PointsAnalysisReportPanel.tsx`
  - Reason: Admins need shareable report states and predictable refresh behavior.
  - Expected: Filter changes update the URL and reload data without remounting the whole dashboard.
  - Possible bugs: Empty filters can leave stale query params active.
  - Fix/Mitigation: Remove empty params and reset page to 1 on filter changes.
  - Verification: Apply filters, refresh browser, and confirm state is preserved.

- [X] T021 [US3] Add read-only guardrails in `src/components/admin/report-center/PointsAnalysisReportPanel.tsx`
  - Reason: This report must not be confused with conversion or admin adjustment tools.
  - Expected: No convert, release, delete, or balance adjustment action appears in the report.
  - Possible bugs: Reusing table action components from other screens can introduce mutation buttons.
  - Fix/Mitigation: Use a dedicated read-only row component.
  - Verification: Manual scan of the UI and code search for mutation endpoint calls from the panel.

**Checkpoint**: User Story 3 is complete when filtered auditing works and remains read-only.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T022 Add loading, empty, and error copy in `src/components/admin/report-center/PointsAnalysisReportPanel.tsx`
  - Reason: Admins need clear explanations when no rows exist or the API fails.
  - Expected: The page communicates no-data, no-results, and retry states without technical errors.
  - Possible bugs: Error copy can imply points are lost when only the report failed.
  - Fix/Mitigation: Use neutral wording that says the report could not load.
  - Verification: Temporarily simulate API error in development and confirm copy.

- [X] T023 Add import smoke coverage for `PointsAnalysisReportPanel` in `tests/unit/report-center-tabs.test.ts`
  - Reason: Lazy panel imports can break after refactors.
  - Expected: Tests fail if the panel file or loader export is missing.
  - Possible bugs: Node tests can fail if browser APIs run at module load.
  - Fix/Mitigation: Keep browser APIs inside effects and event handlers.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts`.

- [X] T024 Verify TypeScript and unit tests
  - Reason: The feature touches shared report and point libraries.
  - Expected: Unit tests and TypeScript checks pass.
  - Possible bugs: Existing unrelated tests can fail and obscure feature issues.
  - Fix/Mitigation: Run targeted tests first, then the broader check.
  - Verification: `npx tsx --test tests/unit/points-analysis.test.ts`, `npx tsx --test tests/unit/report-center-tabs.test.ts`, `npx tsc --noEmit`.

- [X] T025 Run production build
  - Reason: Next.js route and client/server boundaries can fail only at build time.
  - Expected: `npm run build` succeeds without Google font network dependency or server-action errors.
  - Possible bugs: Build can fail from unrelated production environment differences.
  - Fix/Mitigation: Record exact build error and separate unrelated failures from feature failures.
  - Verification: `npm run build`.

- [ ] T026 Perform authenticated browser smoke test
  - Reason: The final report must be understandable and usable in the real admin UI.
  - Expected: Admin can open the tab, read totals, filter rows, search owner, and inspect owner timeline.
  - Possible bugs: Auth/session requirements can block local automated browser checks.
  - Fix/Mitigation: Use manual admin session if automated browser cannot authenticate.
  - Verification: Browser/manual flow from `quickstart.md`.

- [X] T027 Document deployment commands and migration decision
  - Reason: Production has a live database and needs safe deploy steps.
  - Expected: Final notes state whether `npx prisma migrate deploy` is needed and list the correct branch deploy commands.
  - Possible bugs: Suggesting `db push` can be risky in production.
  - Fix/Mitigation: Use `migrate deploy` only when a migration exists; otherwise run `prisma generate`.
  - Verification: Compare final deploy notes with `AGENTS.md` production instructions.

---

## Dependencies

- Phase 1 before all implementation.
- Phase 2 before API and UI stories.
- User Story 1 is the MVP and should ship before owner drill-down.
- User Story 2 depends on shared row mapping from User Story 1.
- User Story 3 depends on the base API and panel from User Story 1.
- Final Phase after all selected user stories.

## Parallel Opportunities

- T001 and T002 can run in parallel.
- T008, T014, and T018 can be written in parallel once shared fixtures are agreed.
- T011 and T015 are separate API routes and can be implemented in parallel after T003-T006.
- T012 and T016 touch the same panel and should be sequenced carefully.

## Implementation Strategy

1. Deliver MVP: tab registration, admin API, summary cards, and ledger table.
2. Add owner drill-down after global report is stable.
3. Add advanced filters and URL state.
4. Polish loading/error states and verify with build plus browser smoke test.
