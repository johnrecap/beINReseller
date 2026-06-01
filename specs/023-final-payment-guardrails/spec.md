# Feature Specification: Final Payment Guardrails

**Feature Branch**: `023-final-payment-guardrails`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "Keep deduction at the final confirmation step, not package selection. Fix renewal problems by clearing stale timers at final confirmation, recording that final payment is about to be sent before pressing beIN Pay, re-checking the operation immediately before Pay, extending post-pay beIN balance verification, sending uncertain outcomes to manual review instead of auto-refund, and applying the same safety rules to installment paths. Inactive app subscription flows are excluded from this feature because they are not active in the current project."

## User Scenarios & Testing

### User Story 1 - Safe Renewal Final Confirmation (Priority: P1)

A reseller starts a renewal, selects a package, then confirms payment. The panel deducts the reseller balance only at the final confirmation step, immediately locks the operation into a final-payment path, clears stale waiting timers, and only then allows the beIN Pay action to proceed.

**Why this priority**: This is the root renewal issue. The system must not let cleanup, timeout recovery, or another operation treat the request as expired while final payment is being sent.

**Independent Test**: Run a renewal through package selection and final confirmation while forcing an expired heartbeat/final-confirm timer before the worker processes the final job. The operation must not auto-refund or expire after final confirmation; it must either complete or move to manual review.

**Acceptance Scenarios**:

1. **Given** a renewal is waiting for final confirmation, **When** the reseller confirms payment, **Then** the reseller balance is deducted once, old heartbeat/final-confirm deadlines stop influencing recovery, and the final payment job is created once.
2. **Given** the operation was already moved out of final confirmation, **When** the reseller confirms again, **Then** no second deduction and no second final payment job are created.
3. **Given** a cleanup or timeout runner sees the operation after final confirmation, **When** final payment has not yet been sent, **Then** it retries/keeps the dispatch instead of expiring or refunding the operation.
4. **Given** final payment is about to be sent, **When** the worker cannot first persist the final-payment-started marker, **Then** the worker must not press beIN Pay.
5. **Given** the operation became terminal before the worker presses Pay, **When** the worker re-checks the operation, **Then** it skips beIN Pay and leaves the terminal status unchanged.

---

### User Story 2 - Safer beIN Outcome Verification (Priority: P2)

After beIN Pay is submitted, the system waits long enough to detect delayed beIN balance changes before deciding the outcome. If the result is unclear, the operation moves to manual review and no automatic refund is issued.

**Why this priority**: A short balance check can read stale beIN data. That makes a real charge look like a failed or unclear operation.

**Independent Test**: Simulate beIN Pay returning no success message and a delayed balance decrease. The operation must remain pending for delayed verification or complete when the delayed decrease appears. If no reliable proof appears, it must move to manual review without auto-refund.

**Acceptance Scenarios**:

1. **Given** beIN confirms success immediately, **When** final payment finishes, **Then** the operation completes and evidence records before/after balances where available.
2. **Given** beIN returns "busy" or no clear success message, **When** the first balance read is unchanged, **Then** the system performs delayed checks before final classification.
3. **Given** delayed checks show the expected beIN balance decrease, **When** the decrease matches the package price, **Then** the operation completes.
4. **Given** delayed checks are inconclusive, **When** final payment was submitted, **Then** the operation moves to manual review and refund is blocked until an admin decision.
5. **Given** beIN clearly proves no charge, **When** the reseller balance was deducted, **Then** refund is allowed exactly once.

---

### User Story 3 - Installment Uses The Same Safety Rule (Priority: P3)

Installment payment must follow the same final-payment safety rule: no auto-refund after Pay may have reached beIN, no missing final-payment-started evidence, and safe refunds only when no-charge evidence exists.

**Why this priority**: The same debt risk exists outside the renewal path because installment Pay can also reach beIN before the panel has a final result.

**Independent Test**: Execute the installment confirmation path in failure simulations. It must either complete, remain retryable before Pay, safely refund only with no-charge evidence, or move to manual review after Pay may have started.

**Acceptance Scenarios**:

1. **Given** an installment final payment starts, **When** the worker reaches the Pay step, **Then** final-payment-started evidence exists before Pay is submitted.
2. **Given** installment Pay may have reached beIN and the result is unclear, **When** recovery runs, **Then** the operation moves to manual review rather than auto-refund.
3. **Given** installment Pay is confirmed as not charged, **When** refund is safe, **Then** the reseller balance refund is applied exactly once.

---

### User Story 4 - Manual Review Closes Financial Uncertainty (Priority: P4)

An admin reviews uncertain operations, records whether beIN charged or did not charge, applies the correct completion/refund decision, and the operation stops appearing as unresolved.

**Why this priority**: Review is the safety net. If review decisions only save notes and do not close the case, operations remain confusing and debt cannot be resolved cleanly.

**Independent Test**: Move a renewal into manual review, then approve a "beIN charged" decision and a "not charged, refund" decision on separate operations. Each operation must leave the unresolved review list with a clear final outcome and audit evidence.

**Acceptance Scenarios**:

1. **Given** an operation is in manual review and beIN was charged, **When** an admin confirms the charge, **Then** the operation is completed or marked as reviewed-complete with evidence and no refund.
2. **Given** an operation is in manual review and beIN was not charged, **When** an admin confirms refund, **Then** the reseller balance is refunded once and the operation leaves unresolved review.
3. **Given** an admin enters a review decision, **When** evidence is missing, **Then** the system requires a clear reason before closing the review.

### Edge Cases

- Reseller balance becomes insufficient between package selection and final confirmation.
- Two tabs submit final confirmation for the same operation.
- A heartbeat or hard deadline has already expired before the reseller clicks final confirmation.
- Redis accepts a job but the worker is delayed for more than the old 30 second final confirmation window.
- The worker starts final payment, then network/proxy/session failure occurs before a beIN response is returned.
- beIN balance is temporarily unchanged even though the package is later charged.
- beIN balance decreases by an amount different from the selected package price.
- The worker crashes after final-payment-started evidence but before recording the final result.
- Cleanup cron, timeout cron, and maintenance runner all inspect the same operation around the same time.
- Existing legacy operations have `COMPLETING` status without modern phase evidence.
- Existing pending dispatch rows have exhausted retries before this feature is deployed.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST keep reseller balance deduction at the final confirmation step, not at package selection.
- **FR-002**: Final confirmation MUST atomically prevent duplicate confirmations for the same operation.
- **FR-003**: Final confirmation MUST deduct reseller balance only when sufficient balance exists at the same decision point.
- **FR-004**: Final confirmation MUST clear or replace stale heartbeat/final-confirm deadlines so cleanup cannot treat the operation as expired after confirmation.
- **FR-005**: Final confirmation MUST persist a dispatch or retry record before returning success to the user.
- **FR-006**: The worker MUST persist final-payment-started evidence before submitting any beIN Pay request.
- **FR-007**: If final-payment-started evidence cannot be persisted, the worker MUST NOT submit beIN Pay.
- **FR-008**: Immediately before beIN Pay, the worker MUST re-read the operation and skip Pay if the operation is terminal, cancelled, refunded, expired, or otherwise no longer allowed to pay.
- **FR-009**: Recovery, cleanup, timeout, and maintenance logic MUST NOT auto-refund an operation after final payment may have started unless there is confirmed evidence that beIN was not charged.
- **FR-010**: The system MUST perform delayed beIN balance verification when Pay was submitted but success is not immediately confirmed.
- **FR-011**: Delayed verification MUST complete the operation if the expected beIN balance decrease appears.
- **FR-012**: Delayed verification MUST move the operation to manual review if the result remains unclear.
- **FR-013**: The system MUST record beIN balance evidence, expected package cost, final-payment-started timestamp, and review/refund decision evidence where available.
- **FR-014**: Installment final payment MUST use the same final-payment-started and no-auto-refund rules as renewal.
- **FR-015**: Safe no-charge refunds MUST use reseller balance refund logic and remain idempotent.
- **FR-016**: Inactive app subscription flows are out of scope for this feature and MUST NOT be changed by this implementation.
- **FR-017**: Manual review decisions MUST close the unresolved review state with a clear final financial outcome.
- **FR-018**: Admin review closure MUST prevent duplicate refunds and duplicate beIN spend ledger entries.
- **FR-019**: All final-payment safety behavior MUST be covered by focused tests before implementation changes.
- **FR-020**: The implementation MUST preserve sensitive data boundaries; no beIN password, TOTP secret, cookie, session, ViewState, or raw token may be exposed in logs, UI, or API responses.

### Key Entities

- **Operation**: The reseller work item being renewed, paid, reviewed, failed, refunded, or completed.
- **Final Payment Evidence**: Operation evidence showing whether final Pay was not started, is about to start, was submitted, was verified, or needs review.
- **Operation Dispatch**: The persisted instruction to send work to the worker, including retry status and failure evidence.
- **Balance Transaction**: The reseller balance movement connected to the operation.
- **beIN Balance Evidence**: Before/after dealer balance readings and expected price used to decide success, no-charge, or manual review.
- **Manual Review Decision**: Admin decision and evidence that closes an uncertain operation as charged, not charged/refunded, or still unresolved.
- **beIN Spend Ledger**: Confirmed provider-side spend record used to detect duplicates and reconcile debt.

## Success Criteria

### Measurable Outcomes

- **SC-001**: No renewal can be auto-refunded or expired after final payment may have started unless no-charge evidence exists.
- **SC-002**: Duplicate final confirmation attempts for one renewal create at most one reseller deduction and one final payment dispatch.
- **SC-003**: Delayed beIN balance verification can detect a provider balance decrease appearing after the first post-pay read.
- **SC-004**: 100% of uncertain post-pay outcomes enter manual review with refund blocked until an admin decision.
- **SC-005**: Installment simulations follow the same no-auto-refund-after-Pay rule.
- **SC-006**: Safe no-charge refunds return to reseller balance exactly once.
- **SC-007**: Admin review decisions close unresolved review cases without duplicate refunds or duplicate provider spend records.

## Assumptions

- The existing final confirmation UX remains: package selection does not deduct; final confirmation deducts.
- Existing operation status names remain unless implementation proves a new status is required.
- Existing `responseData` phase evidence can be extended without an immediate database migration.
- Current recovery and dispatch watchdog flows remain in use and must be made safer rather than replaced wholesale.
- beIN is treated as eventually consistent after Pay, so delayed verification is required.
- Manual review is the intended fallback when evidence is incomplete.
- Inactive app subscription flows are excluded from this feature.
