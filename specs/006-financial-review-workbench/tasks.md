# Tasks: Financial Review Workbench

**Input**: Design documents from `specs/006-financial-review-workbench/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/review-workbench-contract.md`, `quickstart.md`

**Tests**: Include focused API and build verification because this is a financial admin workflow.

**Organization**: Tasks are grouped by user story. Each implementation task includes Reason, Fix, Expected, and Avoid so the worker understands why the task exists and what risk it controls.

## Phase 1: Setup and Baseline

**Purpose**: Confirm the current behavior and available data before adding a new decision workflow.

- [ ] T001 Review `src/app/api/admin/reports/integrity/summary/route.ts` and document the existing `reviewRequired.operations` fields.
  - Reason: The current system already extracts useful review evidence, but the UI does not expose it as an action workflow.
  - Fix: Map existing fields before creating new API shapes.
  - Expected: The implementation reuses proven evidence fields instead of duplicating logic.
  - Avoid: Do not invent a second definition of beIN delta, refund state, or review reason.

- [ ] T002 Review `src/app/dashboard/admin/reports/integrity/page.tsx` and identify which parts remain analytics-only.
  - Reason: The page is currently overloaded and confusing.
  - Fix: Decide what stays in Integrity Reports and what moves to Financial Review.
  - Expected: Integrity Reports remains useful without being the refund decision page.
  - Avoid: Do not delete scan/backfill/reporting functions during this feature.

- [ ] T003 Review `src/app/api/admin/users/[id]/balance/route.ts` and `src/app/api/admin/users/[id]/correct-balance/route.ts` for existing balance mutation patterns.
  - Reason: Review refunds must not use generic manual balance tools.
  - Fix: Identify transaction creation and balance update conventions to reuse safely.
  - Expected: Refund implementation creates operation-linked transactions consistently.
  - Avoid: Do not create unlinked balance top-ups as refunds.

- [ ] T004 Review `src/components/layout/Sidebar.tsx` for admin navigation structure.
  - Reason: The user needs to know where to find the new review page quickly.
  - Fix: Find the right sidebar group and label pattern.
  - Expected: The new page is reachable in one obvious admin menu item.
  - Avoid: Do not hide Financial Review under the existing confusing Integrity Reports link only.

---

## Phase 2: Foundational Data and Safety

**Purpose**: Add the minimum shared structures needed for safe decisions.

- [ ] T005 Add `FinancialReviewDecision` model planning to `prisma/schema.prisma` and mirror it in `worker/prisma/schema.prisma`.
  - Reason: Admin financial decisions need audit data beyond operation status.
  - Fix: Add a dedicated model with operation, action, note, admin, refund transaction, evidence snapshot, and timestamp.
  - Expected: Every review decision is traceable.
  - Avoid: Do not store final financial decisions only in loose JSON with no queryable audit trail.

- [ ] T006 Create a migration for `FinancialReviewDecision` after reviewing production migration safety.
  - Reason: New audit data requires persistent storage.
  - Fix: Add an additive migration with indexes and no destructive changes.
  - Expected: Existing operations and transactions remain untouched.
  - Avoid: Do not alter existing balances, transactions, or operation statuses in the migration.

- [ ] T007 Create shared financial review types in `src/lib/financial-review/types.ts`.
  - Reason: API, UI, and action code need one vocabulary for state, recommendation, and decision action.
  - Fix: Define review states, evidence shape, decision actions, and response payload types.
  - Expected: UI and routes cannot drift on status names.
  - Avoid: Do not hardcode the same status strings across many components.

- [ ] T008 Create evidence extraction helpers in `src/lib/financial-review/evidence.ts`.
  - Reason: `responseData` may be object-shaped or legacy JSON string and evidence can be incomplete.
  - Fix: Safely parse response data and derive user deduction, beIN delta, refund state, and recommendation.
  - Expected: Review cards display consistent evidence.
  - Avoid: Do not call unsafe `JSON.parse` on unknown response data.

- [ ] T009 Create review action helpers in `src/lib/financial-review/actions.ts`.
  - Reason: Refund and no-refund decisions must be idempotent and auditable.
  - Fix: Centralize decision creation, duplicate refund checks, balance update, transaction creation, and status update rules.
  - Expected: API route stays small and financial rules are testable.
  - Avoid: Do not put money movement only inside a React component or unchecked route body.

---

## Phase 3: User Story 1 - Review Required Queue (Priority: P1) MVP

**Goal**: Admin can open a dedicated page and see operations needing financial review.

**Independent Test**: A seeded `REVIEW_REQUIRED` operation appears on `/dashboard/admin/financial-review` with enough fields to identify it.

- [ ] T010 [P] [US1] Add `GET /api/admin/financial-review` in `src/app/api/admin/financial-review/route.ts`.
  - Reason: The review page needs a focused endpoint instead of pulling everything from Integrity Reports summary.
  - Fix: Return only review operations, filters, summary counts, and normalized evidence.
  - Expected: The UI loads a clean review queue.
  - Avoid: Do not expose this endpoint to manager or user roles.

- [ ] T011 [P] [US1] Add API contract tests or route-level checks for admin-only access and basic list shape.
  - Reason: This is a financial workflow and must not leak data.
  - Fix: Verify unauthenticated/non-admin requests fail and admin requests return normalized objects.
  - Expected: Access control is proven before UI work.
  - Avoid: Do not rely only on the sidebar to hide the page.

- [ ] T012 [US1] Create `src/app/dashboard/admin/financial-review/page.tsx`.
  - Reason: Admin needs a dedicated entry point separate from analytics.
  - Fix: Add page wrapper, title, and server/client handoff.
  - Expected: `/dashboard/admin/financial-review` renders in the admin dashboard.
  - Avoid: Do not make this a sub-section buried deep in the existing report table.

- [ ] T013 [US1] Create `src/components/admin/financial-review/FinancialReviewClient.tsx`.
  - Reason: Filtering, tabs, loading states, and refresh belong in a focused client component.
  - Fix: Fetch the new endpoint and manage search, filters, and tab state.
  - Expected: Admin can switch between pending, follow-up, refunded, and beIN executed views.
  - Avoid: Do not mix the full Integrity Reports table state into this component.

- [ ] T014 [US1] Add sidebar navigation in `src/components/layout/Sidebar.tsx`.
  - Reason: The user could not find where review work should happen.
  - Fix: Add a clear admin menu item for Financial Review.
  - Expected: Admin can reach the page in under 2 clicks.
  - Avoid: Do not replace or remove the existing Integrity Reports link.

---

## Phase 4: User Story 2 - Evidence Cards (Priority: P1)

**Goal**: Admin understands every review item without decoding raw report rows.

**Independent Test**: Open a review card and verify user deduction, beIN delta, refund state, and recommendation are visible.

- [ ] T015 [P] [US2] Create `src/components/admin/financial-review/ReviewOperationCard.tsx`.
  - Reason: A card layout is easier to scan than the current dense table.
  - Fix: Show operation identity, amount, card, user, package, beIN account, status badges, and quick actions.
  - Expected: Admin can understand one case at a glance.
  - Avoid: Do not show only technical issue codes as the primary text.

- [ ] T016 [P] [US2] Create `src/components/admin/financial-review/ReviewEvidencePanel.tsx`.
  - Reason: Evidence needs a consistent readable format.
  - Fix: Show beIN before/after/delta, user deduction, refund state, response message, and recommendation.
  - Expected: Admin can decide whether to refund or not with less confusion.
  - Avoid: Do not hide missing evidence; label it clearly as incomplete.

- [ ] T017 [US2] Add empty, loading, and error states to `FinancialReviewClient.tsx`.
  - Reason: Admin should know whether there are no cases or the page failed to load.
  - Fix: Add clear states for zero results, loading, and API errors.
  - Expected: No blank or misleading screen.
  - Avoid: Do not treat API failure as "no pending reviews".

- [ ] T018 [US2] Add filters for state, date range, search, evidence completeness, refund state, and beIN account.
  - Reason: Review volume can grow and the admin needs quick triage.
  - Fix: Bind filters to the GET endpoint query parameters.
  - Expected: Admin finds a target operation quickly.
  - Avoid: Do not run expensive integrity scans from filter changes.

---

## Phase 5: User Story 3 - Safe Decisions and Refunds (Priority: P1)

**Goal**: Admin can safely resolve a review operation with audit trail and duplicate-refund protection.

**Independent Test**: Resolve staging operations through no-refund, refund, and follow-up paths and verify balance/transaction/audit outcomes.

- [ ] T019 [P] [US3] Add `POST /api/admin/financial-review/[operationId]/resolve` in `src/app/api/admin/financial-review/[operationId]/resolve/route.ts`.
  - Reason: Review decisions need a dedicated route with financial safeguards.
  - Fix: Validate admin role, operation state, action, required note, and acknowledgement.
  - Expected: Only valid admin decisions are accepted.
  - Avoid: Do not let client-side checks be the only protection.

- [ ] T020 [US3] Implement `REFUND_CUSTOMER` transaction flow in `src/lib/financial-review/actions.ts`.
  - Reason: Money must be returned only once and linked to the reviewed operation.
  - Fix: Use a database transaction to check existing refund, update balance, create refund transaction, and save review decision.
  - Expected: Repeated submit cannot create duplicate refund.
  - Avoid: Do not update user balance without creating the refund transaction.

- [ ] T021 [US3] Implement `BEIN_EXECUTED_NO_REFUND` decision flow in `src/lib/financial-review/actions.ts`.
  - Reason: Some operations really succeeded on beIN and should not be refunded.
  - Fix: Save final decision and note without changing balance.
  - Expected: Operation leaves pending review and admin can see why no refund happened.
  - Avoid: Do not create withdrawal, deposit, or refund transactions for this path.

- [ ] T022 [US3] Implement `KEEP_UNDER_REVIEW` decision flow in `src/lib/financial-review/actions.ts`.
  - Reason: Some cases need later manual checking.
  - Fix: Save note and decision while keeping the item visible in follow-up/pending state.
  - Expected: Admin can defer without losing the case.
  - Avoid: Do not mark the operation completed or hide it from all review filters.

- [ ] T023 [US3] Create `src/components/admin/financial-review/ReviewDecisionDialog.tsx`.
  - Reason: Refund decisions need confirmation and a required note.
  - Fix: Add dialog per action with clear warning, note field, and submit state.
  - Expected: Admin intentionally confirms risky money decisions.
  - Avoid: Do not allow one-click refund without acknowledgement.

- [ ] T024 [US3] Add duplicate-submit handling in UI after decision submit.
  - Reason: Admin may double click or refresh after submitting.
  - Fix: Disable submit while pending and refresh the card from server response.
  - Expected: UI matches server idempotency and avoids confusion.
  - Avoid: Do not optimistically show refunded until the server confirms it.

---

## Phase 6: User Story 4 - Simplify Integrity Reports (Priority: P2)

**Goal**: Keep reports for analytics while pointing operational decisions to the new page.

**Independent Test**: Integrity Reports still loads, scans still work, and a review callout links to Financial Review.

- [ ] T025 [US4] Add review-required callout to `src/app/dashboard/admin/reports/integrity/page.tsx`.
  - Reason: Existing users may still open Integrity Reports first.
  - Fix: Show count and link to Financial Review when pending review operations exist.
  - Expected: Admin is guided to the right workflow.
  - Avoid: Do not duplicate refund/no-refund buttons on Integrity Reports.

- [ ] T026 [US4] Reduce visual emphasis of dense issue rows in `src/app/dashboard/admin/reports/integrity/page.tsx`.
  - Reason: The current screen feels like the main decision center.
  - Fix: Make issue rows clearly analytics/reconciliation data and keep actions limited to issue status notes.
  - Expected: Less confusion between mismatch issue review and money refund review.
  - Avoid: Do not remove filters or scan actions that admins may still need.

---

## Phase 7: Verification and Production Gate

**Purpose**: Prove the workflow is safe before production deployment.

- [ ] T027 Run `npm run build`.
  - Reason: Dashboard and API route changes must compile.
  - Fix: Build the web app and fix TypeScript or route errors.
  - Expected: Build completes successfully.
  - Avoid: Do not deploy with TypeScript errors hidden by local dev mode.

- [ ] T028 Run `git diff --check`.
  - Reason: Whitespace and patch errors create noisy deploy diffs.
  - Fix: Check the full diff before commit.
  - Expected: No whitespace errors.
  - Avoid: Do not ignore diff-check failures in generated docs or migrations.

- [ ] T029 Verify mojibake safety on changed files.
  - Reason: This repository has encoding-sensitive Arabic text.
  - Fix: Search changed files for new mojibake markers before commit.
  - Expected: No accidental encoding corruption.
  - Avoid: Do not rewrite source files with risky PowerShell text APIs.

- [ ] T030 Manually test refund/no-refund/follow-up paths on staging data using `quickstart.md`.
  - Reason: Financial safety cannot be proven by build alone.
  - Fix: Execute the manual workflow and inspect operation, transaction, and review decision records.
  - Expected: Exactly one correct outcome per decision.
  - Avoid: Do not test real production refunds without explicit approval.

- [ ] T031 Commit and push the feature only after build and manual safety checks pass.
  - Reason: Production branch should only receive verified financial workflow changes.
  - Fix: Commit small, reviewed changes with clear message.
  - Expected: Deployment candidate is traceable.
  - Avoid: Do not mix unrelated UI redesign or announcement work into this feature commit.

## Dependencies and Execution Order

- Phase 1 must finish before data/API design changes.
- Phase 2 blocks all user stories.
- US1 and US2 form the MVP display workflow.
- US3 adds financial decision actions and should not start until evidence display is stable.
- US4 can be done after US1 because it only links users to the new page.
- Phase 7 is required before deployment.

## Parallel Opportunities

- T010 and T011 can run alongside initial page scaffolding after Phase 2.
- T015 and T016 can run in parallel because they create separate UI components.
- T019 and T023 can run in parallel after action types are defined, but server rules must be reviewed before enabling the UI action.

## Implementation Strategy

1. Build read-only queue first.
2. Add evidence cards and filters.
3. Add decision actions with server-side safety.
4. Link Integrity Reports to the new page.
5. Verify build, diff, encoding, and staging money flows.
