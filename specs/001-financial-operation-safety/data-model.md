# Data Model: Financial Operation Safety

## Operation

Represents a customer-initiated action.

Relevant fields:
- `id`
- `userId`
- `customerId`
- `type`
- `cardNumber`
- `status`
- `amount`
- `selectedPackage`
- `beinAccountId`
- `responseMessage`
- `responseData`
- `finalConfirmExpiry`
- `completedAt`

State rules:
- Pre-payment statuses can move to cancellation if no final Pay has started.
- Final-payment statuses must not be overwritten by late cancellation.
- Uncertain final-payment outcomes should move to `REVIEW_REQUIRED`.
- Terminal statuses must not be overwritten by late worker jobs.

## Transaction

Represents customer balance movement.

Relevant fields:
- `id`
- `userId`
- `operationId`
- `type`
- `amount`
- `balanceAfter`
- `notes`
- `createdAt`

Rules:
- Each operation can have at most one customer refund.
- Refund must be tied to clear reason/evidence.
- Deduction and refund totals must be reconcilable.

## beIN Payment Evidence

Represents evidence collected around final Pay.

Fields to store in existing response/audit data, or in a dedicated review record if added:
- `beinBalanceBefore`
- `beinBalanceAfter`
- `beinBalanceDelta`
- `successTextFound`
- `errorTextFound`
- `outcomeCategory`
- `rawReason`
- `capturedAt`

Outcome categories:
- `CONFIRMED_SUCCESS`
- `CONFIRMED_NOT_CHARGED`
- `UNCERTAIN_REVIEW_REQUIRED`

## Manual Review Item

Represents an operation where automation stopped to avoid financial loss.

Suggested fields if schema is extended:
- `operationId`
- `reason`
- `customerDeductedAmount`
- `refundCreated`
- `beinBalanceBefore`
- `beinBalanceAfter`
- `recommendedAction`
- `createdAt`
- `resolvedAt`
- `resolvedBy`

Allowed admin actions:
- Mark completed
- Refund customer
- Keep review pending
- Add correction transaction

## Cancellation Request

Represents a customer cancellation attempt.

Minimum data needed:
- `operationId`
- `requestedAt`
- `operationStatusAtRequest`
- `finalPaymentStarted`
- `safeToRefund`
- `result`

Results:
- `CANCELLED_AND_REFUNDED`
- `CANCELLED_NO_REFUND_NEEDED`
- `REVIEW_REQUIRED`
- `REJECTED_TERMINAL`
