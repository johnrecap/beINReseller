# Contract: Confirmation Safety

## API Contract

Endpoint: `POST /api/operations/{id}/confirm-purchase`

Required behavior:

- Accept only authenticated owner of the operation.
- Accept only operations in `AWAITING_FINAL_CONFIRM`.
- Move operation to `COMPLETING`.
- Deduct customer balance according to the existing deferred or legacy flow.
- Queue `CONFIRM_PURCHASE`.
- Write operation phase as `FINAL_CONFIRMATION`, with `finalPaySubmitted: false`.
- Must not write `FINAL_PAY_SUBMITTED` before the worker reaches beIN final Pay.

## Worker Contract

Job: `CONFIRM_PURCHASE`

Required behavior:

- Load operation and beIN account.
- Restore STB number if available.
- Restore operation-scoped Redis session by operation id.
- Read response data with a safe parser for string or object values.
- If operation session cannot be restored before final Pay, fail or review according to refund safety and final Pay evidence.
- Mark `FINAL_PAY_SUBMITTED` only at the point where final beIN Pay is submitted or is about to be submitted with direct evidence.
- Mark operation `COMPLETED` only after confirmed beIN success.
- Mark operation `REVIEW_REQUIRED` when final Pay may have started and the outcome is uncertain.

## Logging Contract

- COMPLETE_PURCHASE may log "prepared for final confirmation".
- COMPLETE_PURCHASE must not log "purchase completed successfully".
- CONFIRM_PURCHASE must log whether session restore succeeded before final Pay.
- CONFIRM_PURCHASE must log whether final Pay evidence was written.

## Refund Safety Contract

- Before final Pay evidence: refund can be safe if the customer was deducted and beIN was not reached.
- After final Pay evidence: unknown outcome requires manual review.
- Existing completed or review-required operations must not receive automatic duplicate refunds.
