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

- `status = REVIEW_REQUIRED` means the operation needs admin financial review.
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

## Review State Model

Derived states:

- `NEEDS_DECISION`: Operation status is `REVIEW_REQUIRED` and no final decision exists.
- `FOLLOW_UP`: Latest decision is `KEEP_UNDER_REVIEW`.
- `REFUNDED`: Latest final decision is `REFUND_CUSTOMER` and refund transaction exists.
- `BEIN_EXECUTED`: Latest final decision is `BEIN_EXECUTED_NO_REFUND`.

## Evidence Recommendation Model

Derived recommendations:

- `LIKELY_BEIN_EXECUTED`: beIN delta is close to requested amount or success message exists.
- `REFUND_POSSIBLE`: user was deducted, no refund exists, and evidence does not show beIN charge.
- `NEEDS_FOLLOW_UP`: evidence missing, conflicting, or refund blocked.

Recommendations never execute money movement automatically.
