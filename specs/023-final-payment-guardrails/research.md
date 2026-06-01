# Research: Final Payment Guardrails

## Decision 1: Keep deduction at final confirmation

**Decision**: Reseller balance deduction remains at final confirmation, not package selection.

**Rationale**: Package selection can be abandoned, delayed, or cancelled. Charging at package selection creates unnecessary refund paths before the user has explicitly approved payment. Final confirmation is the user-intent point and should remain the charge point.

**Alternatives considered**:

- Deduct at package selection: rejected because it charges users who may not finish final confirmation.
- Deduct after beIN Pay: rejected because it can create provider charge without reseller deduction if the panel update fails after Pay.
- Reserve at package selection and capture at confirmation: possible future enhancement, but bigger scope than the current fix.

## Decision 2: Clear stale final-confirm and heartbeat deadlines on final confirmation

**Decision**: After final confirmation succeeds, old waiting deadlines must no longer drive expiry or refund decisions.

**Rationale**: The current risk is that stale deadlines can cause cleanup or recovery to expire/refund while the worker is still preparing final Pay. Once the user confirms, the operation is no longer "waiting for final confirmation"; it is in final payment execution.

**Alternatives considered**:

- Increase the existing 30 second deadline only: rejected because a longer stale deadline still has the same race.
- Disable cleanup globally: rejected because cleanup is useful for genuinely abandoned operations.

## Decision 3: Persist final-payment-started before beIN Pay

**Decision**: The worker must persist evidence that final Pay is about to be submitted before making the beIN Pay request. If this persist step fails, the Pay request must not be sent.

**Rationale**: After Pay is submitted, the system cannot always know whether beIN charged if network/proxy/session failure happens. The evidence marker protects against unsafe auto-refunds.

**Alternatives considered**:

- Persist only after Pay returns: rejected because a crash or timeout after Pay can lose the only evidence that Pay may have reached beIN.
- Rely on operation status `COMPLETING`: rejected because `COMPLETING` also covers pre-Pay work and creates too many false reviews.

## Decision 4: Re-check operation immediately before Pay

**Decision**: The worker must re-read the operation immediately before Pay and confirm the operation is still allowed to pay.

**Rationale**: Jobs can be delayed. Admin actions, recovery, duplicate attempts, or cancellation may happen after the job started. The final pre-Pay check prevents paying a cancelled/refunded/expired operation.

**Alternatives considered**:

- Trust the operation loaded at job start: rejected because it can be stale by the time Pay is reached.
- Trust account lock alone: rejected because the account lock protects provider account concurrency, not operation financial state.

## Decision 5: Delayed verification before review

**Decision**: When beIN Pay returns ambiguous output, the worker should perform delayed balance checks before final classification.

**Rationale**: beIN balance can be eventually consistent. A short 3 second check is not enough to prove no charge in all cases.

**Alternatives considered**:

- Treat unchanged first read as failed: rejected because it can misclassify delayed charges.
- Always send ambiguous operations directly to review: safe but increases manual review volume unnecessarily.

## Decision 6: Manual review is the only safe fallback after Pay uncertainty

**Decision**: After Pay may have reached beIN, refund is blocked unless no-charge evidence exists. Ambiguous outcomes go to manual review.

**Rationale**: This prevents the worst debt case: beIN charged while the panel refunded the user.

**Alternatives considered**:

- Refund on timeout: rejected because timeout after Pay is not proof of no charge.
- Complete on any success-looking text: rejected because stale or partial provider responses can create false completions.

## Decision 7: Installment must share the same safety rule

**Decision**: Installment final provider Pay must persist final-payment-started evidence and must block refund unless no-charge evidence exists.

**Rationale**: The same debt risk exists outside reseller renewal because installment Pay can reach beIN and then fail before the panel records a final result.

**Alternatives considered**:

- Fix only reseller renewal: rejected because the known risk remains in installment paths.
- Include inactive app subscription renewal: rejected for this feature because it is not active in the current project.
