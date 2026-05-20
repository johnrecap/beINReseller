# Feature Specification: Financial Review Workbench

**Feature Branch**: `codex/fix-renewal-confirm-session-safety`  
**Created**: 2026-05-20  
**Status**: Draft  
**Input**: User needs a clear Spec Kit plan for replacing the confusing Integrity Reports workflow with a focused admin screen for operations that need manual financial review, including refund and no-refund decisions.

## User Scenarios & Testing

### User Story 1 - Review Required Queue (Priority: P1)

An admin opens a dedicated financial review page and immediately sees only operations that need a decision, separated from the technical Integrity Reports page.

**Why this priority**: The current Integrity Reports screen mixes analytics, mismatch rows, scans, and financial risk in one dense table. The admin cannot quickly answer "who needs money back?" or "which beIN operation probably succeeded?".

**Independent Test**: Seed or locate at least one operation with `REVIEW_REQUIRED`, open the new review page, and verify the operation appears with amount, user, card, beIN account, evidence, and recommended decision.

**Acceptance Scenarios**:

1. **Given** an admin has at least one `REVIEW_REQUIRED` operation, **When** they open Financial Review, **Then** the operation appears in the "Needs decision" view.
2. **Given** there are no pending review operations, **When** the admin opens Financial Review, **Then** the page shows an empty state that says there is nothing awaiting decision.
3. **Given** the admin searches by operation id, card number, username, or beIN account, **When** matching records exist, **Then** the list narrows to those records.

---

### User Story 2 - Understand Evidence Without Reading Raw Logs (Priority: P1)

An admin expands a review card and sees a simple explanation of what happened: user deduction, beIN balance before/after, beIN delta, package, worker message, and whether a refund already exists.

**Why this priority**: Admin decisions are risky if the page only shows codes such as `BEIN_DEBIT_USER_UNDERDEDUCTED` or raw operation ids.

**Independent Test**: Open a review operation with audit snapshot data and verify the card shows a human-readable evidence summary and not only raw technical fields.

**Acceptance Scenarios**:

1. **Given** audit snapshot contains beIN balance before and after, **When** the card is viewed, **Then** the page shows the beIN delta beside the requested amount.
2. **Given** audit snapshot is missing or incomplete, **When** the card is viewed, **Then** the page labels evidence as incomplete and avoids recommending an automatic refund.
3. **Given** a refund transaction already exists, **When** the card is viewed, **Then** refund action is blocked and the existing refund is clearly visible.

---

### User Story 3 - Resolve With Safe Decisions (Priority: P1)

An admin can resolve a review operation by confirming that beIN executed it, refunding the customer, or keeping it under review with a note.

**Why this priority**: `REVIEW_REQUIRED` protects money only if there is an admin action path. Without this, money stays stuck or gets fixed manually through unrelated balance tools.

**Independent Test**: Use one pending review operation and resolve it through each decision path in a controlled environment, verifying balances, transactions, operation status, and audit notes.

**Acceptance Scenarios**:

1. **Given** beIN evidence shows payment likely succeeded, **When** admin chooses "beIN executed - no refund" with a note, **Then** the operation leaves the pending review queue without creating a refund.
2. **Given** admin chooses "Refund customer", **When** no previous refund exists, **Then** one operation-linked refund transaction is created and the operation leaves the pending review queue.
3. **Given** admin chooses "Keep under review", **When** they save a note, **Then** the operation remains visible with the latest note and reviewer identity.
4. **Given** a refund already exists, **When** admin tries to refund again, **Then** the system blocks the duplicate refund.

---

### User Story 4 - Keep Integrity Reports Useful But Not Operationally Confusing (Priority: P2)

An admin can still use Integrity Reports for analytics and mismatch scanning, but day-to-day financial decisions are handled in the new Financial Review page.

**Why this priority**: Existing analytics should not disappear, but the current page should stop being the primary place for refund decisions.

**Independent Test**: Open Integrity Reports and verify it links to Financial Review for pending review items while retaining scan, summary, and issue-list functions.

**Acceptance Scenarios**:

1. **Given** pending review operations exist, **When** admin opens Integrity Reports, **Then** a clear callout links to Financial Review.
2. **Given** admin needs mismatch analytics, **When** they stay on Integrity Reports, **Then** the existing scan and issue summary remain available.

### Edge Cases

- A `REVIEW_REQUIRED` operation has no user id, no amount, or no selected package.
- A refund transaction already exists for the same operation.
- beIN evidence indicates a balance drop but the user deduction evidence is missing.
- The operation was manually edited or resolved by another admin while the page was open.
- The operation came from renewal, signal refresh, balance check, store, or mobile flow with different data shape.
- The existing response data is JSON object or legacy JSON string.
- Admin refreshes after submitting a decision and resubmits the form.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide a dedicated admin-only Financial Review page for operations with `REVIEW_REQUIRED` status.
- **FR-002**: The page MUST list operation id, operation type, customer/user, card number, requested amount, selected package, beIN account, updated time, and current review state.
- **FR-003**: The page MUST show evidence fields in plain language: user deduction total, beIN balance before, beIN balance after, beIN delta, refund status, response message, and review reason.
- **FR-004**: The page MUST support filtering by pending/resolved/follow-up state, date range, operation type, evidence completeness, refund state, beIN account, and search text.
- **FR-005**: The page MUST provide a decision flow for "beIN executed - no refund", "refund customer", and "keep under review".
- **FR-006**: Refund decisions MUST create at most one refund transaction linked to the operation.
- **FR-007**: No-refund decisions MUST record reviewer, timestamp, note, and reason without changing user balance.
- **FR-008**: Keep-under-review decisions MUST preserve the operation in the pending list and record the latest note.
- **FR-009**: The system MUST block review actions for non-admin users.
- **FR-010**: The system MUST preserve the existing Integrity Reports analytics and add a clear link/callout to Financial Review.
- **FR-011**: The system MUST avoid using generic admin balance adjustments as the review refund mechanism.
- **FR-012**: The system MUST log or persist all review decisions so a later admin can see who made the decision and why.
- **FR-013**: The system MUST handle both JSON object and legacy JSON string `responseData` shapes.

### Key Entities

- **Review Operation**: Existing operation requiring manual decision because beIN outcome or refund safety is uncertain.
- **Review Evidence**: Parsed business evidence from operation data, transactions, beIN ledger, and audit snapshots.
- **Review Decision**: Admin action that resolves or annotates the review operation.
- **Refund Transaction**: Operation-linked transaction that returns money to the customer/user exactly once.
- **Integrity Issue**: Existing analytics issue used for mismatch reporting, not the primary action object.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Admin can find all pending review operations from the sidebar in under 2 clicks.
- **SC-002**: Admin can identify whether refund is blocked, already done, or available within 10 seconds of opening a review card.
- **SC-003**: Refund decision path prevents duplicate refund transactions in 100% of repeated-submit attempts.
- **SC-004**: At least 90% of pending review operations show a plain-language recommended next action.
- **SC-005**: Integrity Reports remains available for analytics while financial decisions move to the dedicated review page.

## Assumptions

- Existing admin authentication and role checks remain the source of access control.
- Existing `REVIEW_REQUIRED` operation status remains the entry point for financial review.
- A dedicated review-decision record is preferred for auditability, but the final implementation may reuse operation response metadata if migration risk must be avoided.
- Refunds should be operation-linked and idempotent.
- This feature is for the admin dashboard only; manager and customer views are out of scope.
