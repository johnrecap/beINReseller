# Tasks: Financial Review Workbench

**Input**: Design documents from `specs/006-financial-review-workbench/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `ui-content-map.md`, `contracts/review-workbench-contract.md`, `quickstart.md`

**Tests**: Include focused API/build/manual checks because this is a financial admin workflow.

**Task Detail Rule**: Every task includes Reason, Benefit, Expected, and Risks to avoid so another engineer can understand purpose, business return, target outcome, and safety boundaries before touching code. UI tasks must also follow `ui-content-map.md` exactly for visible components, labels, buttons, fields, dialogs, and states.

## Phase 1: Baseline and Current-State Mapping

**Purpose**: Confirm the current review, refund, and beIN evidence behavior before adding new screens or money actions.

- [ ] T001 Review current review evidence in `src/app/api/admin/reports/integrity/summary/route.ts`.
  - Reason: Existing code already gathers `REVIEW_REQUIRED` evidence, but it is buried in Integrity Reports.
  - Benefit: Reuses trusted data and avoids creating a second meaning for balance delta, refund state, or review reason.
  - Expected: A short implementation note listing every reusable field for the new queue.
  - Risks to avoid: Do not duplicate evidence logic before understanding what already exists.

- [ ] T002 Review confusing UI areas in `src/app/dashboard/admin/reports/integrity/page.tsx`.
  - Reason: The current screen mixes analytics, scan tools, mismatch rows, and operational refund decisions.
  - Benefit: Keeps analytics useful while moving decisions to a simpler page.
  - Expected: A list of elements that remain in Integrity Reports and elements that move to Financial Review.
  - Risks to avoid: Do not remove scan, backfill, or analytics functions while simplifying the decision workflow.

- [ ] T003 Review customer/user balance mutation patterns in `src/app/api/admin/users/[id]/balance/route.ts` and `src/app/api/admin/users/[id]/correct-balance/route.ts`.
  - Reason: Review refunds must not become generic manual balance edits.
  - Benefit: Refunds stay operation-linked and auditable.
  - Expected: A safe refund pattern for transaction creation and balance updates.
  - Risks to avoid: Do not return money without a transaction linked to the reviewed operation.

- [ ] T004 Review renewal final-payment evidence in `worker/src/http/HttpClientService.ts` and `worker/src/http-queue-processor.ts`.
  - Reason: The workbench must explain whether beIN was likely charged or the result is uncertain.
  - Benefit: Admin sees business evidence instead of raw logs.
  - Expected: Clear mapping from worker outcomes to review labels such as likely charged, not confirmed, or unclear.
  - Risks to avoid: Do not treat "job completed" as proof that beIN renewed the card.

- [ ] T005 Review existing card/package check flow in `src/app/api/operations/[id]/packages/route.ts`, `worker/src/http/HttpClientService.ts`, and related operation routes.
  - Reason: The new "check card now" action should use existing safe read/check behavior where possible.
  - Benefit: Reduces risk of accidentally submitting a renewal or payment while verifying a card.
  - Expected: A chosen implementation path for verification that only reads/checks beIN card state.
  - Risks to avoid: Do not call any method that adds to cart, sells, pays, refunds, or mutates user balance.

---

## Phase 2: Shared Language, Types, and Data Safety

**Purpose**: Create shared vocabulary and storage so API, UI, and decisions stay consistent.

- [ ] T006 Add shared review types in `src/lib/financial-review/types.ts`.
  - Reason: API routes and React components need one vocabulary for review state, recommendation, evidence, decision action, and verification outcome.
  - Benefit: Reduces status-string drift and makes later maintenance easier.
  - Expected: Typed objects for review queue rows, evidence summaries, card checks, and decision responses.
  - Risks to avoid: Do not scatter duplicate string literals across API routes and components.

- [ ] T007 Add plain-language mapping helpers in `src/lib/financial-review/plain-language.ts`.
  - Reason: Admin-facing text must avoid internal issue codes and confusing programming terms.
  - Benefit: Admin can decide what happened without reading logs or codes.
  - Expected: Functions that convert technical evidence into the exact readable labels, reasons, and recommendations defined in `specs/006-financial-review-workbench/ui-content-map.md`.
  - Risks to avoid: Do not hide raw details completely; keep them available under advanced details for support.

- [ ] T008 Add evidence extraction helpers in `src/lib/financial-review/evidence.ts`.
  - Reason: `responseData` can be an object, legacy JSON string, incomplete, or malformed.
  - Benefit: The page can safely show consistent evidence without crashing.
  - Expected: Safe parsing for user deduction, beIN balance before/after, beIN delta, refund state, response message, and worker review reason.
  - Risks to avoid: Do not call unsafe `JSON.parse` on unknown values without guards.

- [ ] T009 Add `FinancialReviewDecision` and `FinancialReviewCardCheck` models to `prisma/schema.prisma` and mirror them in `worker/prisma/schema.prisma`.
  - Reason: Decisions and card checks need an audit trail that survives page reloads and disputes.
  - Benefit: Later admins can see who checked, who decided, why, and whether a refund transaction exists.
  - Expected: Additive schema with operation links, admin links, action/outcome fields, notes, evidence snapshots, and timestamps.
  - Risks to avoid: Do not change existing balances, transactions, or operation status values in the schema task.

- [ ] T010 Create additive migration files for the review workbench models in `prisma/migrations/` and `worker/prisma/migrations/`.
  - Reason: Production database changes need explicit review and deployment control.
  - Benefit: aapanel/database backups can be taken before applying a clear additive migration.
  - Expected: Migration creates only new tables/indexes/relations required for decisions and card checks.
  - Risks to avoid: Do not include destructive SQL, data rewrites, or automatic status changes.

---

## Phase 3: User Story 1 - Dedicated Review Queue (Priority: P1)

**Goal**: Admin opens one clear page and sees only operations that need financial review.

**Independent Test**: A `REVIEW_REQUIRED` operation appears on `/dashboard/admin/financial-review` with user, amount, card, package, beIN account, readable reason, and current state.

- [ ] T011 [P] [US1] Add `GET /api/admin/financial-review` in `src/app/api/admin/financial-review/route.ts`.
  - Reason: The workbench needs a focused endpoint instead of loading the full Integrity Reports table.
  - Benefit: Faster, cleaner queue data for admins.
  - Expected: Endpoint returns summary counts, filtered operations, normalized evidence, latest decision, and latest card verification.
  - Risks to avoid: Do not allow non-admin access or leak full user/account data beyond what the workbench needs.

- [ ] T012 [P] [US1] Add route-level access and shape checks for `src/app/api/admin/financial-review/route.ts`.
  - Reason: This endpoint exposes financial cases and customer identifiers.
  - Benefit: Access control is proven before relying on the UI.
  - Expected: Unauthenticated and non-admin requests fail; admin response has stable fields.
  - Risks to avoid: Do not rely on sidebar hiding as the only security control.

- [ ] T013 [US1] Create page entry in `src/app/dashboard/admin/financial-review/page.tsx`.
  - Reason: Admin needs a dedicated place, not another section inside the overloaded report page.
  - Benefit: Reduces confusion and gives review work its own workflow.
  - Expected: Dashboard route renders the Financial Review page shell.
  - Risks to avoid: Do not bury the page under Integrity Reports only.

- [ ] T014 [US1] Create queue container in `src/components/admin/financial-review/FinancialReviewClient.tsx`.
  - Reason: Filtering, refreshing, tabs, loading state, and empty state belong in a focused client component.
  - Benefit: UI state remains understandable and separate from report analytics.
  - Expected: Admin can view pending, follow-up, refunded, and no-refund states using the exact tab/filter/empty/error copy from `ui-content-map.md`.
  - Risks to avoid: Do not import the full Integrity Reports table state into this component.

- [ ] T015 [US1] Add admin sidebar link in `src/components/layout/Sidebar.tsx`.
  - Reason: The user needs to know where the review page is.
  - Benefit: Pending reviews become discoverable in normal admin navigation.
  - Expected: Financial Review is reachable from the sidebar using the label `مراجعة العمليات` without removing Integrity Reports.
  - Risks to avoid: Do not replace existing report links that admins may still need.

---

## Phase 4: User Story 2 - Plain Evidence Cards (Priority: P1)

**Goal**: Admin understands what happened without reading raw logs or internal codes.

**Independent Test**: A review card explains user charge, beIN charge evidence, card verification status, refund status, and recommendation in plain text.

- [ ] T016 [P] [US2] Create `src/components/admin/financial-review/ReviewOperationCard.tsx`.
  - Reason: The current table is dense and hard to interpret.
  - Benefit: One operation becomes readable as a case card with clear priority and actions.
  - Expected: Card shows every header field, badge, primary button, secondary button, and disabled state listed under `ReviewOperationCard` in `ui-content-map.md`.
  - Risks to avoid: Do not make internal issue code the primary visible text.

- [ ] T017 [P] [US2] Create `src/components/admin/financial-review/ReviewReasonText.tsx`.
  - Reason: The admin asked for reasons without programming terms or unclear words.
  - Benefit: Every case starts with "what likely happened" in business language.
  - Expected: Component renders only the title/body/recommendation texts defined under `ReviewReasonText` in `ui-content-map.md`.
  - Risks to avoid: Do not overstate certainty when evidence is incomplete.

- [ ] T018 [P] [US2] Create `src/components/admin/financial-review/ReviewEvidencePanel.tsx`.
  - Reason: Admin still needs the numbers behind the recommendation.
  - Benefit: Decisions are backed by visible evidence without scanning raw logs.
  - Expected: Panel shows every row, missing-value label, warning, and advanced-details toggle defined under `ReviewEvidencePanel` in `ui-content-map.md`.
  - Risks to avoid: Do not hide missing or conflicting evidence.

- [ ] T019 [US2] Add filters/search in `src/components/admin/financial-review/FinancialReviewClient.tsx`.
  - Reason: Review volume can grow and admins need quick triage.
  - Benefit: Admin finds cases by card, user, operation, state, beIN account, refund state, and date window.
  - Expected: Filters include every label, placeholder, option, and button defined under `ReviewFilters` in `ui-content-map.md`.
  - Risks to avoid: Do not trigger expensive backfill/scan actions from simple filter changes.

- [ ] T020 [US2] Add advanced technical details section to `ReviewEvidencePanel.tsx`.
  - Reason: Developers/support may still need raw codes during investigation.
  - Benefit: UI stays simple by default while preserving diagnostics.
  - Expected: Raw issue codes and JSON snippets are collapsed behind `تفاصيل تقنية` exactly as defined in `ui-content-map.md`.
  - Risks to avoid: Do not expose raw sensitive secrets, passwords, tokens, or full credential data.

---

## Phase 5: User Story 4 - Card Verification Evidence (Priority: P1)

**Goal**: Admin can check the current card/subscription state before refunding or closing a review.

**Independent Test**: Clicking "check card now" stores a verification result and does not submit renewal, payment, refund, or balance changes.

- [ ] T021 [P] [US4] Add safe verification service in `src/lib/financial-review/card-verification.ts`.
  - Reason: The admin needs current card evidence, not only old logs.
  - Benefit: A failed or successful verification becomes explicit evidence for the decision.
  - Expected: Service checks current card/subscription state and returns `LIKELY_RENEWED`, `NOT_CONFIRMED`, or `CHECK_FAILED`.
  - Risks to avoid: Do not call purchase, add-to-cart, sell, pay, refund, or user-balance mutation paths.

- [ ] T022 [US4] Add `POST /api/admin/financial-review/[operationId]/verify-card` in `src/app/api/admin/financial-review/[operationId]/verify-card/route.ts`.
  - Reason: Card verification must be admin-only, auditable, and tied to one operation.
  - Benefit: Each check records who ran it, when, and what evidence was returned.
  - Expected: Route stores `FinancialReviewCardCheck` and returns readable summary plus recommendation.
  - Risks to avoid: Do not auto-resolve, auto-refund, or auto-close the operation from this route.

- [ ] T023 [P] [US4] Create `src/components/admin/financial-review/CardVerificationPanel.tsx`.
  - Reason: Verification needs a clear button, progress state, latest result, and failure messaging.
  - Benefit: Admin can verify without leaving the workbench.
  - Expected: Panel shows every state, button, badge, field, and message defined under `CardVerificationPanel` in `ui-content-map.md`.
  - Risks to avoid: Do not show a failed beIN/proxy check as proof that renewal failed.

- [ ] T024 [US4] Connect `CardVerificationPanel.tsx` to `ReviewOperationCard.tsx`.
  - Reason: Card verification is part of each review case, not a separate report.
  - Benefit: Admin sees logs, balances, and current card evidence in one place.
  - Expected: A card refreshes after verification and updates recommendation text.
  - Risks to avoid: Do not overwrite older verification history when showing the latest result.

---

## Phase 6: User Story 3 - Safe Decisions and Refunds (Priority: P1)

**Goal**: Admin can resolve a review with audit trail and duplicate-refund protection.

**Independent Test**: Resolve staging operations through no-refund, refund, and keep-review paths and verify balances, transactions, status, and audit records.

- [ ] T025 [P] [US3] Add `POST /api/admin/financial-review/[operationId]/resolve` in `src/app/api/admin/financial-review/[operationId]/resolve/route.ts`.
  - Reason: Review decisions need a dedicated server route with financial safeguards.
  - Benefit: The server, not the UI, owns the final money rules.
  - Expected: Route validates admin role, operation state, action, note, acknowledgement, and current refund state.
  - Risks to avoid: Do not trust client-side checks for money decisions.

- [ ] T026 [US3] Implement decision helpers in `src/lib/financial-review/actions.ts`.
  - Reason: Refund, no-refund, and keep-review actions must share idempotency and audit rules.
  - Benefit: One tested code path prevents duplicate refunds and inconsistent status updates.
  - Expected: Helpers create `FinancialReviewDecision`, update operation state where appropriate, and return a normalized result.
  - Risks to avoid: Do not split balance mutation and transaction creation outside one database transaction.

- [ ] T027 [US3] Implement `REFUND_CUSTOMER` flow in `src/lib/financial-review/actions.ts`.
  - Reason: Some reviewed operations did not renew and customer money must be returned.
  - Benefit: Refunds become traceable and cannot be repeated.
  - Expected: Exactly one operation-linked refund transaction is created, user balance updates once, and decision is recorded.
  - Risks to avoid: Do not create duplicate refund transactions on refresh, retry, or double click.

- [ ] T028 [US3] Implement `BEIN_EXECUTED_NO_REFUND` flow in `src/lib/financial-review/actions.ts`.
  - Reason: Some cases show beIN renewal/charge evidence and should not be refunded.
  - Benefit: Admin can close the dispute with a recorded reason and no money movement.
  - Expected: Decision is stored, item leaves pending queue, and user balance stays unchanged.
  - Risks to avoid: Do not create refund, deposit, withdrawal, or adjustment transactions in this path.

- [ ] T029 [US3] Implement `KEEP_UNDER_REVIEW` flow in `src/lib/financial-review/actions.ts`.
  - Reason: Some cases remain unclear after evidence and card verification.
  - Benefit: Admin can keep tracking the case without losing it.
  - Expected: Note is stored and the item remains visible under pending/follow-up state.
  - Risks to avoid: Do not hide the operation from all filters or mark it completed.

- [ ] T030 [US3] Create `src/components/admin/financial-review/ReviewDecisionDialog.tsx`.
  - Reason: Money decisions need confirmation, readable warning, and required note.
  - Benefit: Reduces accidental refunds or premature no-refund decisions.
  - Expected: Dialog supports refund, no-refund, and keep-review with the exact titles, warnings, fields, checkbox, buttons, success messages, and errors defined in `ui-content-map.md`.
  - Risks to avoid: Do not allow one-click refund or empty-note final decisions.

---

## Phase 7: User Story 5 - Integrity Reports and Customer/Admin Surfacing (Priority: P2)

**Goal**: Keep Integrity Reports as analytics while making review status visible in the right places.

**Independent Test**: Integrity Reports still works, links to Financial Review, and operations/history show a clear "under admin review" status.

- [ ] T031 [US5] Add Financial Review callout to `src/app/dashboard/admin/reports/integrity/page.tsx`.
  - Reason: Existing admins may still open Integrity Reports first.
  - Benefit: They are guided to the correct action screen.
  - Expected: Report page shows the exact callout title, body, count label, and buttons defined under `Integrity Reports Callout` in `ui-content-map.md`.
  - Risks to avoid: Do not duplicate refund/no-refund buttons on Integrity Reports.

- [ ] T032 [US5] Update operation status labels in `src/lib/constants.ts` and related translation/status helper files.
  - Reason: `REVIEW_REQUIRED` currently has weak or missing friendly display in parts of the UI.
  - Benefit: Customers/admins see "under admin review" instead of a confusing raw status.
  - Expected: Status labels cover `REVIEW_REQUIRED` using the exact user-facing text in `ui-content-map.md`.
  - Risks to avoid: Do not rename enum values or break existing status comparisons.

- [ ] T033 [US5] Update user-facing operation tables in `src/components/history/OperationsTable.tsx` and relevant renewal/operation pages.
  - Reason: Customers need to know their case is being reviewed instead of thinking it disappeared or failed silently.
  - Benefit: Fewer support complaints and clearer expectations.
  - Expected: Review-required operations display the exact customer-facing status label/helper text from `ui-content-map.md`.
  - Risks to avoid: Do not expose internal beIN account names, worker logs, or financial investigation details to customers.

---

## Phase 8: Verification and Production Gate

**Purpose**: Prove the plan and implementation are safe before deployment.

- [ ] T034 Run `npm run build`.
  - Reason: Dashboard pages, API routes, Prisma types, and shared helpers must compile.
  - Benefit: Catches TypeScript and route errors before deployment.
  - Expected: Build completes successfully.
  - Risks to avoid: Do not deploy with errors hidden by local dev mode.

- [ ] T035 Run `git diff --check`.
  - Reason: Whitespace and patch artifacts create noisy and risky deployment diffs.
  - Benefit: Keeps review clean.
  - Expected: No whitespace errors.
  - Risks to avoid: Do not ignore diff-check failures in migrations or docs.

- [ ] T036 Verify encoding/mojibake safety on changed files.
  - Reason: This repository contains Arabic UI text and has explicit encoding safety rules.
  - Benefit: Prevents accidental corruption of Arabic labels or strings.
  - Expected: No new mojibake markers or replacement characters in changed text.
  - Risks to avoid: Do not use risky PowerShell write APIs or full-file rewrites for source code.

- [ ] T037 Execute the manual validation flow in `specs/006-financial-review-workbench/quickstart.md`.
  - Reason: Financial safety cannot be proven by build alone.
  - Benefit: Confirms real admin workflow, duplicate-refund protection, and card verification safety.
  - Expected: One correct outcome per decision path, no money movement from card verification, and all visible copy matches `ui-content-map.md`.
  - Risks to avoid: Do not test real production refunds without explicit approval and backup readiness.

- [ ] T038 Commit and push only after the verification gate passes.
  - Reason: Production deployment should receive a traceable, reviewed financial workflow.
  - Benefit: Rollback and audit remain straightforward.
  - Expected: One focused commit for the implemented workbench changes.
  - Risks to avoid: Do not mix unrelated announcement/sidebar redesign work into this feature.

## Dependencies and Execution Order

- Phase 1 must finish before schema, API, or UI work.
- Phase 2 blocks all user stories because it defines shared language, evidence, and audit storage.
- US1 and US2 form the read-only MVP.
- US4 can start after Phase 2 and becomes the practical evidence step before decisions.
- US3 must start only after evidence display and server-side safety are clear.
- US5 can run after US1 because it mainly links and labels the new workflow.
- Phase 8 is required before production deployment.

## Parallel Opportunities

- T001, T002, T003, T004, and T005 can be done in parallel because they are read-only reviews.
- T006, T007, and T008 can be done in parallel after baseline mapping.
- T011 and T012 can run alongside T013/T014 after shared types exist.
- T016, T017, T018, and T020 can run in parallel because they touch separate UI/helper files.
- T021 and T023 can run in parallel, but T022 should wait until the service contract is stable.
- T025 and T030 can run in parallel after action types are defined, but UI actions must remain disabled until server rules are complete.

## Implementation Strategy

1. Build the read-only review queue first.
2. Add plain-language evidence cards.
3. Add safe card verification as evidence only.
4. Add refund/no-refund/keep-review decisions with server-side idempotency.
5. Link Integrity Reports and update user/admin status labels.
6. Run build, diff, encoding, and manual financial checks before deployment.
