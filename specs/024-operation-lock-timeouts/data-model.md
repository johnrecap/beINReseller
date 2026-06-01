# Data Model: Operation Lock Timeouts

## Operation

Represents a reseller renewal request from card entry through package selection, confirmation, Pay, completion, cancellation, failure, or review.

### Relevant Fields

- `id`
- `userId`
- `cardNumber`
- `status`
- `beinAccountId`
- `selectedPackage`
- `amount`
- `finalConfirmExpiry`
- `lastHeartbeat`
- `heartbeatExpiry`
- `responseData`
- `completedAt`

### Validation Rules

- Package selection is valid only while status is `AWAITING_PACKAGE` and the package-selection deadline has not expired.
- Final confirmation is valid only while status is `AWAITING_FINAL_CONFIRM` and the final confirmation deadline has not expired.
- Final confirmation may create one customer deduction at most.
- Cancellation from customer exit is safe only before final Pay starts.
- After final Pay starts, missed heartbeat must not move the operation to cancelled/refunded.

### State Transitions

```text
PENDING/PROCESSING
  -> AWAITING_PACKAGE
  -> COMPLETING
  -> AWAITING_FINAL_CONFIRM
  -> COMPLETING
  -> COMPLETED
  -> REVIEW_REQUIRED

AWAITING_PACKAGE
  -> CANCELLED/EXPIRED when package selection times out or customer exits

AWAITING_FINAL_CONFIRM
  -> CANCELLED/EXPIRED when final confirmation times out before Pay

COMPLETING after final Pay evidence
  -> COMPLETED when provider charge is confirmed
  -> FAILED only when no-charge/refund rules allow it
  -> REVIEW_REQUIRED when provider outcome is unclear
```

## beIN Account Lock

Represents exclusive use of one beIN account by one active operation.

### Relevant Fields

- `beinAccountId`
- `operationId`
- `ownerWorkerId`
- `acquiredAt`
- `expiresAt`
- `lastExtendedAt`
- `phase`
- `releaseReason`
- `releasedAt`

### Validation Rules

- A lock can have only one active owner at a time.
- A new operation must not use a locked beIN account.
- Lock release is expected on completion, pre-Pay cancellation/failure, and review handoff after evidence is saved.
- Force unlock must record admin actor and reason.
- Force unlock must not change operation financial state.

## Decision Window

Represents a customer-facing timer that controls how long a step may remain open.

### Relevant Fields

- `operationId`
- `windowType`: package selection, first confirmation, final confirmation
- `expiresAt`
- `warningThresholdSeconds`
- `expiredAt`
- `expireAction`

### Validation Rules

- Package selection window is 30 seconds.
- First confirmation and final confirmation windows are 10 seconds.
- Warning threshold for 10 second windows is 3 seconds.
- Expiration before Pay cancels safely and releases lock.
- Expiration after Pay follows final-payment guardrails, not cancellation.

## Heartbeat Evidence

Represents proof that the customer is still present before Pay.

### Relevant Fields

- `operationId`
- `lastHeartbeatAt`
- `heartbeatExpiresAt`
- `statusAtHeartbeat`
- `finalPayStarted`

### Validation Rules

- Heartbeat applies only to customer-waiting states before Pay.
- Missing heartbeat for 5 seconds before Pay triggers cancellation.
- Missing heartbeat after final Pay starts does not cancel or refund.
- Heartbeat updates should be lightweight enough to avoid unnecessary server load.

## Admin Unlock Decision

Represents an admin action to release a stuck beIN account lock.

### Relevant Fields

- `adminUserId`
- `beinAccountId`
- `operationId`
- `reason`
- `lockAgeSeconds`
- `createdAt`
- `result`

### Validation Rules

- Only authorized admins may create unlock decisions.
- A reason is required.
- Unlock decisions do not decide refunds, charges, completion, or failure.
- Sensitive beIN runtime secrets must never be included.
