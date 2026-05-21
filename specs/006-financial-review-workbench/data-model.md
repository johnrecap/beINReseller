# Data Model: Financial Review Workbench

## Existing Entity: Operation

Represents a user/customer action such as renewal, balance check, or signal refresh.

Relevant fields:

- `id`
- `userId`
- `customerId`
- `type`
- `cardNumber`
- `amount`
- `status`
- `responseMessage`
- `responseData`
- `selectedPackage`
- `beinAccountId`
- `createdAt`
- `updatedAt`
- `completedAt`

Review-specific rules:

- `status = REVIEW_REQUIRED` is the first eligibility gate, but the operation also needs financial impact before it appears in the review queue.
- Financial impact means user/customer deduction, held/refund-blocked money, an operation-linked debit/refund concern, or uncertain final provider payment after deduction.
- Completed operations, active normal operations, cancelled operations, and failures with no deduction/held balance are excluded from the review queue.
- `responseData.auditSnapshot` may contain user deduction and beIN balance evidence.
- `responseData` may be object-shaped or a legacy JSON string and must be parsed safely.

## Existing Entity: Transaction

Represents balance movement.

Relevant fields:

- `id`
- `userId`
- `adminId`
- `operationId`
- `amount`
- `balanceAfter`
- `type`
- `notes`
- `createdAt`

Review-specific rules:

- A review refund must use `type = REFUND`.
- A review refund must include the reviewed `operationId`.
- A second refund for the same operation must be blocked.

## Existing Entity: OperationIntegrityIssue

Represents detected mismatch analytics.

Review-specific rules:

- It can provide supporting evidence, but it is not the source of truth for review decisions.
- Its status should not be used as the only indicator that money was returned or not returned.

## Proposed Entity: FinancialReviewDecision

Represents an admin decision for a `REVIEW_REQUIRED` operation.

Fields:

- `id`: unique decision id.
- `operationId`: reviewed operation.
- `action`: `BEIN_EXECUTED_NO_REFUND`, `REFUND_CUSTOMER`, or `KEEP_UNDER_REVIEW`.
- `decisionNote`: required admin note.
- `reviewedById`: admin user who made the decision.
- `refundTransactionId`: nullable link to refund transaction.
- `evidenceSnapshot`: JSON copy of evidence visible when the decision was made.
- `createdAt`: decision timestamp.

Validation rules:

- `decisionNote` is required for all actions.
- `REFUND_CUSTOMER` must create or link exactly one operation refund transaction.
- `BEIN_EXECUTED_NO_REFUND` must not change user balance.
- `KEEP_UNDER_REVIEW` must not hide the operation from the pending queue.

## Proposed Entity: FinancialReviewCardCheck

Represents a safe admin-triggered check of the current beIN card/subscription state for a reviewed operation.

Fields:

- `id`: unique check id.
- `operationId`: reviewed operation.
- `cardNumber`: card number checked.
- `checkedById`: admin user who ran the check.
- `outcome`: `LIKELY_RENEWED`, `NOT_CONFIRMED`, or `CHECK_FAILED`.
- `packageName`: package detected on the card when available.
- `expiryDate`: expiry date detected on the card when available.
- `evidenceSummary`: plain-language text shown to the admin.
- `rawEvidenceSnapshot`: JSON snapshot for later support/debugging.
- `errorMessage`: nullable error or unclear reason.
- `createdAt`: check timestamp.

Validation rules:

- Card check must never create a renewal, payment, refund, or user-balance movement.
- Card check must require admin access.
- A failed card check must be stored as evidence instead of hiding the failure.
- Latest check should be displayed first, but older checks remain available for audit.

## Review State Model

Derived states:

- `NEEDS_DECISION`: Operation status is `REVIEW_REQUIRED` and no final decision exists.
- `FOLLOW_UP`: Latest decision is `KEEP_UNDER_REVIEW`.
- `REFUNDED`: Latest final decision is `REFUND_CUSTOMER` and refund transaction exists.
- `BEIN_EXECUTED`: Latest final decision is `BEIN_EXECUTED_NO_REFUND`.

## Evidence Recommendation Model

Derived recommendations:

- `LIKELY_BEIN_EXECUTED`: beIN delta is close to requested amount or success message exists.
- `LIKELY_CARD_RENEWED`: latest card verification shows the expected package or a matching expiry/subscription state.
- `REFUND_POSSIBLE`: user was deducted, no refund exists, and combined evidence does not show beIN charge or card renewal.
- `NEEDS_FOLLOW_UP`: evidence missing, conflicting, verification failed, or refund blocked.

Recommendations never execute money movement automatically.

## Plain-Language Reason Model

Primary labels should be derived from technical evidence and shown before any raw codes.

Examples:

- "The user was charged, and beIN balance appears to have dropped by the same amount."
- "The user was charged, but there is no clear beIN charge evidence yet."
- "The card check could not confirm the renewal."
- "A refund already exists for this operation."
- "Evidence is incomplete; keep under review or check the card."

Raw technical codes remain available only in an advanced details area.
