# Feature Specification: Renewal Safety Corrections and beIN Spend Ledger

**Feature Branch**: `002-renewal-safety-bein-ledger`  
**Created**: 2026-05-14  
**Status**: Draft  
**Input**: User description: "Create detailed Spec Kit plans and tasks for the previously reviewed renewal/cancellation safety fixes and for tracking the final beIN account whose real dealer balance was charged, including date-range reports for how much each beIN account spent by week/month/custom period."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fix Renewal and Cancellation Step Order (Priority: P1)

As the site owner, I need the renewal and cancellation flow to know the real stage of an operation, so a pre-payment step is not treated as final beIN payment and a late cancellation cannot refund money after beIN may have charged.

**Why this priority**: The current state name `COMPLETING` is used for multiple meanings. It can mean package preparation, cancellation preparation, or final payment. Treating all `COMPLETING` operations as final-payment-started can put safe cancellations into review and can confuse active customer operations.

**Independent Test**: Simulate package selection, final confirmation cancellation, final payment, late cancellation, and terminal operations. Verify each flow lands in the expected status without wrong refund or wrong review.

**Acceptance Scenarios**:

1. **Given** an operation is preparing a package before final Pay, **When** the customer cancels, **Then** the operation is cancelled safely and is not moved to manual review only because its status is `COMPLETING`.
2. **Given** an operation is on the final confirmation screen and final Pay has not been submitted, **When** the customer confirms cancellation, **Then** the operation is cancelled safely without being mistaken for a post-Pay operation.
3. **Given** final beIN Pay has been submitted or may have been submitted, **When** cancellation arrives, **Then** the operation moves to review or remains terminal and no automatic refund is created.
4. **Given** an operation is already completed, cancelled, failed, expired, or review-required, **When** any late worker or cancellation job arrives, **Then** the terminal status is not overwritten.

---

### User Story 2 - Harden Refund and Timeout Safety (Priority: P1)

As the site owner, I need every refund path, timeout path, and cleanup path to use the same safe decision rule, so customer balances cannot be refunded after a possible beIN charge.

**Why this priority**: The app refund helper is safer than the worker refund helper. Timeout and cleanup routes can still make broad decisions that do not know the exact payment phase. A single safe rule is needed before production rollout.

**Independent Test**: Simulate worker errors, insufficient customer balance, expired final confirmation, stuck operations, duplicate jobs, and duplicate refunds. Verify refunds happen once and only before final beIN Pay can have charged.

**Acceptance Scenarios**:

1. **Given** a worker error happens after final Pay may have started, **When** refund handling runs, **Then** it refuses automatic refund and records the operation for review.
2. **Given** customer balance is insufficient before any beIN final Pay, **When** confirm purchase fails, **Then** the operation returns to final confirmation only if no newer state has taken over.
3. **Given** an old or live operation expires while waiting for final confirmation, **When** timeout cleanup runs, **Then** amount-zero operations can expire safely and amount-positive legacy operations use guarded refund or review.
4. **Given** a duplicate refund request arrives, **When** a prior refund exists, **Then** no second refund is created and the user balance is not incremented again.

---

### User Story 3 - Record the Final Charged beIN Account (Priority: P1)

As an admin, I need each charged renewal, activation, or check operation to record the exact beIN account whose real dealer balance was charged, so I can reconcile panel activity with actual beIN account spending.

**Why this priority**: `Operation.beinAccountId` can represent the currently assigned worker account before charge. The admin needs the account that actually spent balance, not failed attempts and not pre-payment account trials.

**Independent Test**: Run successful payment, retry-before-charge, uncertain post-payment, and no-charge failure scenarios. Verify only the final charged beIN account creates a spend ledger record.

**Acceptance Scenarios**:

1. **Given** a renewal succeeds and dealer balance decreases on beIN, **When** the worker stores the result, **Then** one spend ledger row is created for the final charged beIN account.
2. **Given** the worker tries one beIN account but changes to another before final charge, **When** the second account is charged, **Then** only the second account appears in spend totals.
3. **Given** a beIN response is unclear and there is no confirmed balance decrease, **When** the operation moves to review, **Then** no confirmed spend is counted yet.
4. **Given** beIN balance decrease is confirmed but the user-facing operation still needs review, **When** evidence is stored, **Then** the charged account and spend evidence are visible to admins.
5. **Given** the same operation is processed twice by a duplicate worker job, **When** spend logging runs again, **Then** the ledger remains one row for that operation.

---

### User Story 4 - Admin Calendar Spend Reports (Priority: P2)

As an admin, I need reports that show how much each beIN account spent during a selected date range, so I can inspect weekly, monthly, and custom-period real balance usage.

**Why this priority**: Tracking the charged account is only useful if it can be filtered and totaled by period, account, operation type, and panel user.

**Independent Test**: Seed ledger rows across several days, beIN accounts, panel users, and operation types. Verify totals, counts, date filters, and excluded unconfirmed items.

**Acceptance Scenarios**:

1. **Given** confirmed spend rows exist for multiple beIN accounts, **When** the admin chooses a week, **Then** the report shows total spend per beIN account for that week.
2. **Given** the admin chooses a month or custom date range, **When** the report loads, **Then** totals and operation counts match the rows in that period.
3. **Given** the admin filters by panel user, **When** the report loads, **Then** it shows only operations requested by that panel user.
4. **Given** some operations are review-required without confirmed balance decrease, **When** totals are calculated, **Then** they are excluded from confirmed spend totals and shown separately as unconfirmed/review items.

---

### User Story 5 - Production Rollout Without Breaking Live Balances (Priority: P1)

As the site owner, I need the fixes and reporting to roll out without changing old balances or disrupting active production operations.

**Why this priority**: The site is live, customers have money on the panel, and active operations may exist during deployment.

**Independent Test**: Deploy to staging with copied status cases and ledger seed data. Verify no bulk balance changes, no forced status rewrite, no duplicate ledger rows, and no unexpected refund.

**Acceptance Scenarios**:

1. **Given** existing operations have no ledger rows, **When** the migration is deployed, **Then** old balances and statuses remain unchanged.
2. **Given** old operations have `beinAccountId` but no balance evidence, **When** reports run, **Then** they are not counted as confirmed spend.
3. **Given** a new operation completes after deployment, **When** evidence is available, **Then** it is logged in the new spend ledger.
4. **Given** rollout detects unexpected ledger or refund behavior, **When** the admin follows rollback steps, **Then** workers can pause and the old branch can be restored without data loss.

---

### Edge Cases

- Operation status is `COMPLETING` while package preparation is running, not final Pay.
- Operation status is `COMPLETING` because a cancellation-confirm job was queued.
- Final Pay is submitted but beIN times out, redirects to login, returns busy, or returns no readable result.
- beIN dealer balance before or after final Pay is missing.
- beIN balance decrease is larger or smaller than selected package price because of fees, currency display, previous pending action, or page rounding.
- Duplicate worker jobs process the same operation.
- Admin re-runs integrity scans after ledger rows already exist.
- Legacy operations were created before this feature and have incomplete payment evidence.
- Mobile renewal and Store flows are excluded unless shared code directly affects reseller operations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST distinguish pre-payment package preparation, final confirmation cancellation, and final beIN Pay submission without relying on `status === COMPLETING` alone.
- **FR-002**: The system MUST treat cancellation before final beIN Pay as safe when no evidence shows final Pay started.
- **FR-003**: The system MUST treat cancellation during or after possible final Pay as review-required and MUST NOT create an automatic refund.
- **FR-004**: The system MUST prevent terminal operations from being overwritten by late worker, cancellation, timeout, or cleanup jobs.
- **FR-005**: The system MUST use one shared safe-refund decision rule across app routes and worker error handling.
- **FR-006**: The worker refund helper MUST refuse refund when an operation is completed, review-required, terminal, or possibly post-final-Pay.
- **FR-007**: Insufficient customer balance handling MUST revert an operation only if the operation is still in the exact expected pre-charge state.
- **FR-008**: Timeout and cleanup jobs MUST handle amount-positive legacy final-confirmation operations without silent cancellation that loses customer balance history.
- **FR-009**: The system MUST create a confirmed beIN spend ledger record only for the beIN account that was actually charged.
- **FR-010**: Failed pre-charge beIN account attempts MUST NOT appear in confirmed spend totals.
- **FR-011**: Each operation MUST have at most one confirmed spend ledger row unless a future manual correction feature explicitly records an adjustment row.
- **FR-012**: The ledger MUST store the panel user, operation, beIN account, beIN username snapshot, proxy snapshot when available, operation type, timestamps, balance before, balance after, spend amount, and evidence source.
- **FR-013**: Confirmed spend totals MUST be calculated from confirmed ledger rows only.
- **FR-014**: Operations without confirmed charge evidence MUST be excluded from confirmed spend totals and visible as unconfirmed/review items.
- **FR-015**: Admin reports MUST support day, week, month, and custom date ranges.
- **FR-016**: Admin reports MUST support filtering by beIN account, panel user, operation type, and operation status/evidence category.
- **FR-017**: Admin operation details MUST show the charged beIN account separately from any currently assigned or attempted beIN account.
- **FR-018**: The rollout MUST be additive and MUST NOT bulk-edit old customer balances.
- **FR-019**: The implementation MUST not store beIN passwords, cookies, TOTP secrets, or proxy secrets in report payloads or ledger snapshots.
- **FR-020**: The implementation MUST preserve Mobile renewal and Store exclusions unless a shared function is directly affected and covered by tests.

### Key Entities *(include if feature involves data)*

- **Operation**: Customer-requested work such as renewal, check, activation, or installment. Existing fields remain the source for status, user, card, selected package, response data, and assigned beIN account.
- **Operation Phase Evidence**: A small persisted marker, likely inside operation response/audit data, that identifies whether the operation is pre-payment, cancellation-confirm, final-pay-submitted, or post-final-pay review.
- **Safe Refund Decision**: A shared decision result that says whether refund is allowed, blocked, or requires review, with reason and evidence.
- **beIN Spend Ledger Row**: A confirmed financial record that ties one operation to the final beIN account whose dealer balance was charged.
- **beIN Spend Report**: Admin-facing grouped totals and detailed rows by date range, beIN account, panel user, and operation type.
- **Unconfirmed Review Item**: An operation that may have external activity but lacks enough confirmed evidence to count in spend totals.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of simulated pre-payment cancellations cancel safely and do not move to review solely because the operation status is `COMPLETING`.
- **SC-002**: 100% of simulated post-final-Pay cancellation or error cases create no automatic refund unless non-charge evidence is confirmed.
- **SC-003**: 100% of duplicate worker/refund/ledger simulations create at most one refund and at most one confirmed ledger row per operation.
- **SC-004**: Admin spend totals for seeded weekly, monthly, and custom date ranges match confirmed ledger rows exactly.
- **SC-005**: No old customer balance changes during migration or first deployment.
- **SC-006**: Reports expose charged beIN account, panel user, spend amount, and evidence source for every confirmed ledger row.
- **SC-007**: Operations lacking confirmed balance evidence are visible as unconfirmed/review items and are not included in confirmed spend totals.

## Assumptions

- The project continues to use Prisma and PostgreSQL as the durable source of financial truth.
- `Operation.beinAccountId` remains an assigned/current account field and is not redefined as "charged account" to avoid breaking old behavior.
- A new ledger table is safer than overloading operation JSON for financial reports.
- Confirmed spend totals prefer dealer balance delta. If a success page exists but balance evidence is missing, the operation is shown as unconfirmed until reconciliation rather than counted as a precise spend total.
- The first version records only the final charged beIN account, not every failed pre-charge attempt.
- The first version adds planning for admin reports and backend API contracts; visual UI details can be refined during implementation.
