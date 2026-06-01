# Contracts: Operation Lock Timeouts

## Renewal Package Selection

**Interface**: `POST /api/operations/{operationId}/select-package`

### Inputs

- Authenticated reseller session.
- `packageIndex`.
- Optional promo code.

### Required Behavior

1. Confirm operation ownership.
2. Confirm operation is still in package-selection state.
3. Confirm the 30 second package-selection window has not expired.
4. Confirm reseller balance is at least the selected package price.
5. Do not deduct money.
6. Move the operation to the next confirmation step and preserve selected package evidence.

### Failure Outcomes

- Expired window: operation is safely cancelled/expired before Pay and beIN account lock is released.
- Insufficient balance: operation stops before Pay with no deduction.
- Duplicate or stale submit: no extra state transition.

## Final Confirmation

**Interface**: `POST /api/operations/{operationId}/confirm-purchase`

### Inputs

- Authenticated reseller session.
- Operation awaiting final confirmation.

### Required Behavior

1. Confirm operation ownership.
2. Confirm 10 second final confirmation window has not expired.
3. Confirm reseller balance is still sufficient.
4. Deduct reseller balance exactly once.
5. Record final Pay dispatch evidence exactly once.
6. Clear customer-waiting timers that must not expire the operation after final confirmation.

### Failure Outcomes

- Insufficient balance: no deduction and no Pay dispatch.
- Duplicate submit: return current state without duplicate deduction or duplicate dispatch.
- Queue failure before Pay: operation remains retryable or safely fails according to no-Pay evidence.

## Heartbeat And Leave Cancellation

**Interfaces**:

- `POST /api/operations/{operationId}/heartbeat`
- Best-effort page leave cancellation endpoint or existing cancel endpoint before Pay.

### Required Behavior

1. Heartbeat is accepted only from the operation owner.
2. Heartbeat applies only before final Pay starts.
3. Missing heartbeat for 5 seconds cancels the operation only if Pay has not started.
4. Page leave before Pay attempts immediate cancellation and lock release.
5. Page leave after Pay does not cancel or refund.

### Failure Outcomes

- Browser leave signal not delivered: heartbeat timeout handles cleanup.
- Network delay causes missed heartbeat: cancellation must still verify final Pay did not start before cancelling.

## Admin Force Unlock

**Interface**: `POST /api/admin/bein-accounts/{accountId}/unlock`

### Inputs

- Authenticated admin.
- Required reason.
- Optional operation id if the UI knows the owner.

### Required Behavior

1. Verify admin authorization.
2. Read current lock owner and age if available.
3. Release the lock.
4. Record audit evidence with admin, account, operation, reason, and result.
5. Do not change operation status, customer balance, provider charge evidence, or review decision.

### Failure Outcomes

- Unauthorized user: reject.
- Missing reason: reject.
- No active lock: return a safe no-op result with audit context.

## Admin Lock Visibility

**Interface**: Existing beIN accounts admin UI/API, extended with lock status.

### Required Behavior

1. Show whether each account is unlocked, locked, or stale.
2. Show operation id and lock age when available.
3. Hide provider secrets and session data.
4. Provide force unlock action only to authorized admins.
