# Data Model: Final Payment Guardrails

## Operation

Represents one reseller renewal or installment operation.

**Relevant fields**:

- `id`
- `type`
- `status`
- `userId`
- `cardNumber`
- `amount`
- `selectedPackage`
- `beinAccountId`
- `finalConfirmExpiry`
- `heartbeatExpiry`
- `responseData`
- `completedAt`

**State expectations**:

- `AWAITING_PACKAGE`: user must choose package; no user deduction for renewal wizard.
- `AWAITING_FINAL_CONFIRM`: user can confirm or cancel; no final provider Pay has started.
- `COMPLETING`: final confirmation or provider execution is in progress.
- `REVIEW_REQUIRED`: provider outcome or refund safety is uncertain.
- `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`: terminal outcomes.

## Final Payment Evidence

Stored in operation evidence payload unless implementation introduces schema fields.

**Fields**:

- `operationPhase`: `DISPATCH_PENDING`, `FINAL_PAY_STARTING`, `FINAL_PAY_SUBMITTED`, `POST_FINAL_PAY_REVIEW`, `PROVIDER_VERIFIED`, `PROVIDER_NOT_CHARGED`, or compatible existing phase values.
- `jobType`: `CONFIRM_PURCHASE` or `CONFIRM_INSTALLMENT`.
- `finalPaySubmitted`: boolean.
- `finalPaySubmittedAt`: timestamp.
- `dealerBalanceBefore`: number or null.
- `dealerBalanceAfter`: number or null.
- `expectedCost`: selected package or installment amount.
- `outcomeCategory`: confirmed success, confirmed no charge, or review required.
- `reviewReason`: human-readable reason for manual review.

**Validation rules**:

- `FINAL_PAY_SUBMITTED` requires `finalPaySubmitted = true`.
- `PROVIDER_VERIFIED` requires charge evidence or a success message plus accepted balance evidence.
- `PROVIDER_NOT_CHARGED` requires confirmed no-charge evidence.
- Absence of evidence on legacy `COMPLETING` operations must be handled conservatively.

## Operation Dispatch

Durable instruction to enqueue worker work.

**Relevant fields**:

- `operationId`
- `jobType`
- `payload`
- `status`
- `attempts`
- `lastError`
- `dispatchedAt`

**Validation rules**:

- One final confirmation dispatch per operation and job type.
- Dispatch pending before final Pay means retry is allowed.
- Dispatch exhausted before final Pay may fail/refund only when no final-payment-started evidence exists.

## Balance Transaction

Records reseller balance deduction/refund.

**Relevant fields**:

- `userId`
- `operationId`
- `type`
- `amount`
- `balanceAfter`

**Validation rules**:

- One operation deduction for one final confirmation.
- One refund maximum per operation.
- Refund is blocked after final Pay may have started unless no-charge evidence exists.

## beIN Balance Evidence

Provider-side before/after balance proof.

**Fields**:

- `beinAccountId`
- `dealerBalanceBefore`
- `dealerBalanceAfter`
- `expectedCost`
- `capturedAt`
- `evidenceSource`

**Validation rules**:

- Expected balance decrease completes the operation.
- Positive but mismatched balance decrease requires manual review.
- Unreadable or unchanged balance after Pay may require delayed verification before final review.

## Manual Review Decision

Admin decision that closes uncertain financial outcome.

**Fields**:

- `operationId`
- `adminId`
- `decision`
- `reason`
- `providerChargeEvidence`
- `refundApplied`
- `closedAt`

**Validation rules**:

- A charged decision must not refund.
- A no-charge decision may refund reseller balance only once.
- Closed review must no longer appear as unresolved.
