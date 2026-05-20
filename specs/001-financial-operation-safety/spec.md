# Feature Specification: Financial Operation Safety

**Feature Branch**: `001-financial-operation-safety`  
**Created**: 2026-05-13  
**Status**: Draft  
**Input**: User request: "Create Spec Kit plans for safe payment-finalization and safe cancellation so live operations, customer balances, renewal flow, and card checks are not disrupted."

## User Scenarios & Testing

### User Story 1 - Protect Owner Funds After beIN Payment (Priority: P1)

As the site owner, I need the panel to never refund a customer automatically after the final beIN payment step unless the system has confirmed that beIN did not charge the dealer account.

**Why this priority**: This is the largest financial loss risk. If beIN charges the dealer account and the panel refunds the customer, the owner loses the package cost.

**Independent Test**: Simulate final payment outcomes where beIN returns success, failure, busy, timeout, login page, unreadable balance, and network error. The system must complete clear successes, refund only clear non-charges, and move uncertain outcomes to manual review.

**Acceptance Scenarios**:

1. **Given** beIN returns a clear success message after final Pay, **When** the worker processes the response, **Then** the operation is completed and no refund is created.
2. **Given** beIN dealer balance decreases after final Pay, **When** the worker cannot find a success message, **Then** the operation is treated as successful or review-required without refunding the customer.
3. **Given** beIN returns busy, timeout, connection failure, no confirmation, or an unreadable page after final Pay, **When** the worker cannot prove that beIN did not charge, **Then** the operation is moved to manual review and no automatic refund is created.
4. **Given** beIN returns a clear failure before any external charge is possible, **When** the worker confirms no dealer balance reduction, **Then** the customer can be refunded safely.

---

### User Story 2 - Safe Cancellation Around Final Payment (Priority: P1)

As a customer, I can cancel before final payment starts, but if the operation is already at or past final payment, the cancellation must not refund me until the real beIN result is known.

**Why this priority**: Cancellation can race with the worker final payment job. Late cancellation must not overwrite a completed operation or refund a charged operation.

**Independent Test**: Simulate cancellation before final confirmation, during final confirmation, after beIN success, after beIN unknown result, and after a prior refund. Verify status and balance outcomes.

**Acceptance Scenarios**:

1. **Given** an operation is still before final beIN payment, **When** the customer cancels, **Then** the operation can be cancelled and any safe refund is applied once.
2. **Given** final payment has started, **When** the customer cancels, **Then** the operation becomes cancellation-review-required and no automatic refund is created.
3. **Given** final payment completed successfully, **When** a cancellation request arrives late, **Then** the operation remains completed and no refund is created.
4. **Given** a refund already exists for an operation, **When** cancellation is requested again, **Then** no second refund is created.

---

### User Story 3 - Preserve Existing Live Operations During Rollout (Priority: P1)

As an admin, I need the changes to apply safely while production users and workers may already have active operations.

**Why this priority**: The site is live, has real customer balances, and may have in-flight renewal or check operations during deployment.

**Independent Test**: Start with operations in PENDING, PROCESSING, AWAITING_PACKAGE, AWAITING_FINAL_CONFIRM, COMPLETING, COMPLETED, CANCELLED, FAILED, EXPIRED, and REVIEW_REQUIRED. Verify the new rules do not force-change old operations except where explicitly handled by guarded code.

**Acceptance Scenarios**:

1. **Given** an existing operation is active before deployment, **When** the deployment completes, **Then** the operation can continue without unexpected balance changes.
2. **Given** an operation is terminal before deployment, **When** a worker job arrives late, **Then** the terminal status is not overwritten.
3. **Given** an uncertain operation exists during deployment, **When** the new code evaluates it, **Then** it is moved to manual review rather than refunded automatically.

---

### User Story 4 - Keep Renewal and Check Flow Fast Without Risk (Priority: P2)

As a customer, I need renewal and card check screens to stay fast, but not by skipping financial safety checks after payment.

**Why this priority**: Speed matters, but only before the irreversible beIN payment step. Safety must dominate after final Pay.

**Independent Test**: Measure the package-loading and confirmation flow before and after changes. Verify pre-payment cache/session optimizations still work and post-payment verification is not skipped.

**Acceptance Scenarios**:

1. **Given** a valid cached beIN session exists, **When** a renewal starts, **Then** the worker may reuse it before final payment.
2. **Given** a card has a recent STB cache, **When** packages are loaded, **Then** the worker may skip the card check step only before final payment.
3. **Given** final Pay was clicked, **When** the worker verifies the result, **Then** it must not use stale package or STB cache to decide refund eligibility.

### Edge Cases

- beIN charges the dealer account but returns no success text.
- beIN returns "Transaction is busy" for longer than the current retry window.
- Network connection drops immediately after final Pay.
- beIN redirects to login after final Pay.
- Dealer balance cannot be read after final Pay.
- Customer cancels while the worker is confirming payment.
- A duplicate worker job arrives after an operation is already completed, cancelled, failed, expired, or review-required.
- A previous refund already exists before a new cancellation or failure path runs.
- Legacy operations created before this change continue running.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST classify final beIN payment outcomes as confirmed success, confirmed non-charge failure, or uncertain outcome.
- **FR-002**: The system MUST NOT automatically refund a customer for any uncertain outcome after final Pay.
- **FR-003**: The system MUST move uncertain post-payment outcomes to manual review with enough information for an admin to decide.
- **FR-004**: The system MUST consider a beIN dealer balance decrease after final Pay as evidence that the dealer account was charged.
- **FR-005**: The system MUST treat "busy", timeout, no confirmation, unreadable balance, and connection failure after final Pay as uncertain unless there is clear non-charge proof.
- **FR-006**: The system MUST allow normal cancellation before final payment starts.
- **FR-007**: The system MUST convert cancellation during or after final payment into manual review rather than automatic refund.
- **FR-008**: The system MUST keep terminal operations from being overwritten by late worker jobs or late cancel requests.
- **FR-009**: The system MUST prevent duplicate refunds for the same operation.
- **FR-010**: The system MUST preserve existing active operations during rollout and avoid bulk-changing customer balances.
- **FR-011**: The system MUST keep pre-payment speed optimizations only when they cannot influence refund decisions.
- **FR-012**: The system MUST provide admin-facing review data for uncertain payment and cancellation cases.
- **FR-013**: The system MUST keep card check flows from creating owner-loss refunds unless a real external charge or customer deduction is involved.
- **FR-014**: The system MUST include validation steps that prove customer balances and transaction history remain consistent.

### Key Entities

- **Operation**: A customer request such as renewal, balance check, signal check, installment, or activation. Important attributes include status, amount, card number, selected package, beIN account, timestamps, and review state.
- **Customer/User Balance**: The money shown in the panel for a customer or reseller user.
- **Transaction**: The ledger record explaining every balance movement, including deduction and refund.
- **beIN Payment Attempt**: The external final payment action on beIN that may charge the dealer account.
- **beIN Balance Snapshot**: Dealer balance before and after final Pay, used as evidence.
- **Manual Review Item**: An operation state where automation stops and an admin decides whether to complete, refund, or correct.
- **Cancellation Request**: Customer intent to cancel, which is safe before final payment and review-only during/after final payment.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Zero automatic refunds are created for uncertain post-payment outcomes during test scenarios.
- **SC-002**: 100% of simulated final Pay timeouts, busy responses, unreadable responses, and connection drops move to manual review instead of failed-with-refund.
- **SC-003**: 100% of simulated late cancellation requests after final Pay do not overwrite completed operations.
- **SC-004**: 100% of simulated duplicate cancellation or duplicate worker jobs produce at most one refund.
- **SC-005**: Existing active operations can continue through deployment without forced balance adjustment.
- **SC-006**: Pre-payment renewal package loading remains at least as fast as the current flow when cached session/STB data is available.
- **SC-007**: Admins can identify every review-required operation with beIN balance evidence, customer deduction evidence, and the reason automation stopped.

## Assumptions

- The current reseller panel and worker remain the only scope for these plans.
- Mobile renewal and Store flows are excluded unless a shared function directly affects reseller operations.
- The system should favor manual review over owner financial loss whenever beIN outcome is unclear.
- No existing customer balance should be rewritten as part of the rollout.
- Existing database uniqueness guards for duplicate refunds remain in place.
- Any schema addition must be backward-compatible and safe for live production.
