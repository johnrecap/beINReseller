# Feature Specification: Operation Lock Timeouts

**Feature Branch**: `024-operation-lock-timeouts`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "Lock a selected beIN account to one active renewal operation, shorten customer decision windows to 30 seconds for package selection and 10 seconds for each payment confirmation, validate reseller balance at package selection and final confirmation, cancel immediately when the customer leaves before Pay, keep Pay/review safe after final payment starts, unlock accounts when operations finish or enter review, and provide admin unlock for stuck locks. Mobile subscription flows are not active and remain out of scope."

## User Scenarios & Testing

### User Story 1 - Reserve One beIN Account Per Active Operation (Priority: P1)

A reseller starts a card renewal and the system assigns one beIN account to that operation. That beIN account cannot be used by any other operation while the current operation is active before completion, cancellation, failure, or review handoff.

**Why this priority**: This protects beIN dealer balance attribution. If two operations share one beIN account at the same time, the system can no longer reliably decide which operation caused a dealer balance decrease.

**Independent Test**: Start two renewal operations while only one eligible beIN account is available. The second operation must wait or fail gracefully until the first operation releases the account, and no two active operations may use the same locked account.

**Acceptance Scenarios**:

1. **Given** a beIN account is assigned to an active renewal, **When** another renewal requests an account, **Then** the assigned account is not available to the second renewal.
2. **Given** an operation completes, fails before Pay, or is cancelled before Pay, **When** the terminal state is recorded, **Then** its beIN account lock is released.
3. **Given** an operation enters manual review after Pay may have started, **When** provider evidence and review status are recorded, **Then** its beIN account lock is released while the operation remains review-only for money decisions.
4. **Given** a lock is stuck after a crash or unexpected stop, **When** an authorized admin unlocks it manually, **Then** the account becomes available and the unlock action is audited.

---

### User Story 2 - Short Decision Windows With Balance Checks (Priority: P2)

A reseller receives a short, clear decision window: 30 seconds to choose a package, 10 seconds to confirm package details, and 10 seconds to confirm final payment. The system checks the reseller balance before allowing package selection to continue and checks again at final confirmation before deducting money.

**Why this priority**: Short windows reduce how long beIN accounts stay reserved, while the two balance checks prevent users from continuing into a payment they cannot afford.

**Independent Test**: Load packages, wait past 30 seconds without selecting a package, and confirm the operation is cancelled with no deduction and the account unlocked. Repeat with insufficient reseller balance at package selection and final confirmation.

**Acceptance Scenarios**:

1. **Given** packages are shown, **When** 30 seconds pass without selecting a package, **Then** the operation is cancelled, no customer money is deducted, and the beIN account is released.
2. **Given** the reseller balance is below the selected package price, **When** the reseller selects the package, **Then** the operation stops before the next step and no payment is started.
3. **Given** the reseller balance was sufficient at package selection but becomes insufficient before final confirmation, **When** final confirmation is submitted, **Then** no deduction or Pay is performed.
4. **Given** the reseller confirms final payment twice, **When** both requests reach the system, **Then** at most one deduction and one final Pay dispatch exist.
5. **Given** a 10 second confirmation window is active, **When** only 3 seconds remain, **Then** the UI displays the warning state once.

---

### User Story 3 - Cancel On Customer Exit Before Pay (Priority: P3)

If the reseller leaves the renewal screen before Pay starts, the operation is cancelled quickly and the beIN account is released. If final Pay has started or may have reached beIN, leaving the screen does not cancel the operation; the worker completes verification or moves the operation to manual review.

**Why this priority**: This balances fast cleanup with money safety. Before Pay, cancellation is safe. After Pay, cancellation could create a debt if beIN charged while the panel refunded.

**Independent Test**: Leave the renewal page during package selection or confirmation and confirm cancellation within the configured heartbeat window. Then leave during final Pay and confirm the operation continues to completion or review without automatic refund.

**Acceptance Scenarios**:

1. **Given** the operation is before final Pay, **When** the customer closes the tab or leaves the page and the immediate cancel signal arrives, **Then** the operation is cancelled and the beIN account is released.
2. **Given** the immediate cancel signal does not arrive, **When** heartbeat is missing for 5 seconds, **Then** the operation is cancelled if final Pay has not started.
3. **Given** final Pay has started or may have reached beIN, **When** the customer leaves the page or heartbeat stops, **Then** the operation is not auto-cancelled or auto-refunded.
4. **Given** final Pay has started and the outcome is unclear, **When** delayed provider checks cannot prove success or no-charge, **Then** the operation moves to manual review and the beIN account lock is released after evidence is saved.

---

### User Story 4 - Admin Visibility And Stuck Lock Recovery (Priority: P4)

Admins can see which beIN accounts are locked, why they are locked, which operation owns the lock, and can force unlock a stuck account without changing the financial outcome of the operation.

**Why this priority**: Manual unlock is the operational escape hatch. It must exist, but it must not be used as a hidden refund or completion action.

**Independent Test**: Create a stale lock record, view it in the admin area, force unlock it, and confirm the lock is gone while the related operation status and money evidence remain unchanged.

**Acceptance Scenarios**:

1. **Given** a beIN account is locked, **When** an admin views beIN account status, **Then** the admin can see the lock owner operation, age, and whether it is stale.
2. **Given** an admin force unlocks a stuck lock, **When** the action completes, **Then** the account becomes available and an audit event records who unlocked it and why.
3. **Given** the locked operation is already in final Pay or review, **When** the admin force unlocks the account, **Then** the operation's financial decision remains unchanged.

### Edge Cases

- Customer balance changes between package display, package selection, and final confirmation.
- Two browser tabs submit package selection or final confirmation for the same operation.
- Browser close does not deliver the immediate cancel signal.
- Customer has a short network stall longer than one heartbeat but shorter than the cancellation threshold.
- Operation reaches Pay just as a leave/cancel signal arrives.
- Worker crashes while holding a beIN account lock.
- Provider evidence is saved but the lock release fails.
- Admin force unlocks an account while another worker is about to use it.
- Existing legacy locks have no operation owner metadata.
- Active mobile subscription endpoints still exist in the codebase but are out of scope.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST reserve one beIN account for one active renewal operation at a time.
- **FR-002**: The system MUST prevent any other operation from using a beIN account while it is locked by an active operation.
- **FR-003**: The system MUST release the beIN account lock when the operation completes, fails before Pay, is cancelled before Pay, or enters manual review after provider evidence is saved.
- **FR-004**: The system MUST provide an authorized admin-only force unlock action for stuck beIN account locks.
- **FR-005**: Admin force unlock MUST NOT complete, fail, refund, or otherwise change the financial result of the related operation.
- **FR-006**: Package selection MUST expire after 30 seconds from the time packages become available to the reseller.
- **FR-007**: The first payment review/confirmation step MUST expire after 10 seconds.
- **FR-008**: The final payment confirmation step MUST expire after 10 seconds.
- **FR-009**: Countdown warning UI MUST use a 3 second warning threshold for 10 second confirmation windows.
- **FR-010**: The system MUST check reseller balance at package selection and block continuation when balance is below the package price.
- **FR-011**: The system MUST check reseller balance again at final confirmation and only deduct when the balance is still sufficient.
- **FR-012**: The final confirmation deduction MUST remain idempotent: repeated submits create at most one deduction and one final Pay dispatch.
- **FR-013**: The page MUST attempt immediate cancellation when the customer leaves before final Pay starts.
- **FR-014**: Heartbeat must be frequent enough to detect a missing customer within 5 seconds before final Pay starts.
- **FR-015**: Missing heartbeat before final Pay MUST cancel the operation, avoid deduction when none occurred, and release the beIN account.
- **FR-016**: Missing heartbeat after final Pay starts or may have reached beIN MUST NOT auto-cancel or auto-refund the operation.
- **FR-017**: After final Pay starts, unclear provider outcomes MUST continue through delayed verification or manual review according to the existing final-payment safety rules.
- **FR-018**: Operations moved to manual review after Pay MUST release the beIN account lock after all available evidence is saved.
- **FR-019**: All lock acquisition, release, force unlock, timeout, and cancellation decisions MUST preserve evidence suitable for admin review.
- **FR-020**: The implementation MUST not expose beIN passwords, TOTP secrets, sessions, cookies, ViewState, raw provider tokens, or secret runtime data in logs, UI, or API responses.
- **FR-021**: Inactive mobile subscription flows are out of scope and MUST NOT be expanded by this feature.

### Key Entities

- **Operation**: The reseller renewal request, including card number, status, selected package, final confirmation deadline, heartbeat evidence, and financial phase evidence.
- **beIN Account Lock**: A reservation proving which operation currently owns a beIN account, when it was acquired, when it expires, and whether it is stale.
- **Decision Window**: A customer-facing timer for package selection or confirmation, with a deadline and expiration behavior.
- **Heartbeat Evidence**: The latest signal that the customer is still present in a pre-Pay operation screen.
- **Final Pay Evidence**: The recorded proof that Pay has not started, is starting, was submitted, was verified, or needs review.
- **Admin Unlock Decision**: An auditable admin action that releases a stuck beIN account lock without deciding money movement.

## Success Criteria

### Measurable Outcomes

- **SC-001**: No two active renewal operations can use the same beIN account at the same time in controlled concurrency tests.
- **SC-002**: Package selection expires within 30 seconds plus one polling interval when the customer does not choose a package.
- **SC-003**: Payment confirmation windows expire within 10 seconds plus one polling interval when the customer does not confirm.
- **SC-004**: Pre-Pay customer exit cancels and releases the beIN account within 5 seconds of the last heartbeat in controlled tests.
- **SC-005**: After final Pay starts, 100% of customer exits continue to completion or manual review without automatic refund unless confirmed no-charge evidence exists.
- **SC-006**: Repeated final confirmation attempts produce at most one customer deduction and one final Pay dispatch.
- **SC-007**: Admin force unlock releases the account while leaving the operation's financial status unchanged.

## Assumptions

- The active scope is the web renewal flow; inactive mobile subscription flows remain unchanged.
- A heartbeat every 2 seconds is the preferred default because it supports 5 second cancellation without writing too frequently.
- A one second heartbeat is acceptable only if the implementation keeps it lightweight and avoids heavy database writes for every signal.
- Manual review after Pay no longer needs to keep the beIN account locked; saved balance evidence is the source of truth for review.
- Existing final-payment guardrails from `023-final-payment-guardrails` remain in place and are reused.
- Existing admin authentication and permission patterns are reused for force unlock.
