# Feature Specification: Renewal Confirmation Session Safety

**Feature Branch**: `codex/fix-renewal-confirm-session-safety`  
**Created**: 2026-05-20  
**Status**: Draft  
**Input**: User description: "Fix renewal operations where the panel charges the customer or treats the flow as processed while the final beIN renewal is not confirmed, especially when operation response data is returned as an object instead of a JSON string and operation-scoped session restore fails."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore Confirmation Session Reliably (Priority: P1)

As the site owner, I need the final confirmation job to restore the exact operation session that prepared the package so the worker can press the real final beIN payment step instead of failing because saved data shape changed.

**Why this priority**: Without this, customers can be charged in the panel while beIN is not renewed.

**Independent Test**: Run a renewal flow where operation data is stored as a database JSON object, then confirm purchase and verify the worker restores the operation-scoped Redis session and reaches final confirmation logic without a JSON parse failure.

**Acceptance Scenarios**:

1. **Given** an operation has `responseData` as an object, **When** COMPLETE_PURCHASE or CONFIRM_PURCHASE reads it, **Then** the flow does not call unsafe string-only parsing.
2. **Given** an operation-scoped Redis session exists, **When** CONFIRM_PURCHASE starts, **Then** the worker restores cookies and ViewState before final beIN submission.
3. **Given** the operation-scoped session is missing before final beIN submission, **When** confirmation starts, **Then** the operation fails or moves to review according to payment-start evidence instead of being marked completed.

---

### User Story 2 - Mark Final Payment Only When It Really Starts (Priority: P1)

As the site owner, I need the system to distinguish "customer clicked confirm" from "worker submitted final Pay on beIN" so refunds and manual review decisions are accurate.

**Why this priority**: Premature final-payment markers block safe refunds and create confusing Review Required operations.

**Independent Test**: Confirm a prepared operation and force a session-restore failure before beIN Pay; verify the operation is not marked as final payment submitted.

**Acceptance Scenarios**:

1. **Given** the user clicks final confirmation, **When** the API queues the worker job, **Then** the operation phase shows confirmation requested, not final Pay submitted.
2. **Given** the worker reaches the real beIN final Pay submission, **When** it has evidence that Pay was submitted, **Then** the operation records final payment started.
3. **Given** failure happens before final Pay evidence, **When** refund safety runs, **Then** the system may allow refund or failure handling without assuming beIN charged.

---

### User Story 3 - Report Outcomes Without Misleading Success (Priority: P1)

As an admin, I need logs and operation status to say whether the package is only prepared for confirmation or truly completed on beIN.

**Why this priority**: Misleading "completed successfully" logs make production incidents harder to understand.

**Independent Test**: Run COMPLETE_PURCHASE and verify logs say the purchase is prepared for final confirmation; only CONFIRM_PURCHASE can complete the operation.

**Acceptance Scenarios**:

1. **Given** COMPLETE_PURCHASE finishes, **When** the worker pauses for final user confirmation, **Then** logs describe preparation, not successful renewal.
2. **Given** CONFIRM_PURCHASE fails before final beIN Pay, **When** admins review logs, **Then** logs show session restore failure and no final Pay evidence.
3. **Given** CONFIRM_PURCHASE succeeds, **When** admins review the operation, **Then** completed status is supported by beIN success or balance-change evidence.

---

### User Story 4 - Keep Production Rollout Safe (Priority: P2)

As the site owner, I need these fixes to deploy without destructive database changes and without changing old balances directly.

**Why this priority**: The site is live and has customer money and active operations.

**Independent Test**: Build and run the worker with existing schema; verify no migration is required and old operations keep their existing data.

**Acceptance Scenarios**:

1. **Given** existing operations have string response data, **When** the new code reads them, **Then** behavior remains compatible.
2. **Given** existing operations have object response data, **When** the new code reads them, **Then** behavior remains compatible.
3. **Given** active operations exist during deploy, **When** workers restart, **Then** only new processing logic changes and balances are not rewritten.

### Edge Cases

- Operation `responseData` can be null, a JSON string, a database JSON object, or malformed legacy text.
- Operation-scoped Redis session can expire between package preparation and final confirmation.
- The user can click final confirmation while the old flow already deducted balance earlier.
- beIN can time out after final Pay submission, requiring manual review rather than automatic refund.
- The worker can retry with another beIN account after the original account loses operation-specific ViewState.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST read operation response data safely whether it is stored as a string or JSON object.
- **FR-002**: The worker MUST attempt operation-scoped Redis session restore without requiring response data to be a JSON string first.
- **FR-003**: The API MUST NOT mark an operation as final Pay submitted merely because the customer clicked confirm.
- **FR-004**: The worker MUST mark final Pay submitted only when there is direct evidence that final beIN Pay has started or has been submitted.
- **FR-005**: The refund safety decision MUST treat pre-final-payment failures differently from post-final-payment unknown outcomes.
- **FR-006**: COMPLETE_PURCHASE logs MUST describe package preparation and final-confirmation readiness, not final renewal success.
- **FR-007**: CONFIRM_PURCHASE failure before final Pay MUST not mark the operation completed.
- **FR-008**: The implementation MUST preserve compatibility with existing string and object response data.
- **FR-009**: The implementation MUST avoid destructive database migrations and must not edit historical customer balances.

### Key Entities

- **Operation Response Data**: Existing JSON evidence stored on an operation, including phase, job type, dealer balance, smartcard type, and final Pay evidence.
- **Operation-Scoped Session**: Redis record containing cookies and ViewState for one prepared renewal flow.
- **Final Pay Evidence**: Data proving the worker reached beIN final payment submission, such as `finalPaySubmitted: true` and timestamp.
- **Refund Safety Decision**: The system decision to refund, fail, or require manual review based on whether final beIN Pay may have started.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No CONFIRM_PURCHASE path fails with `"[object Object]" is not valid JSON` when `responseData` is a JSON object.
- **SC-002**: A pre-final-payment session restore failure does not create false final Pay evidence.
- **SC-003**: COMPLETE_PURCHASE no longer logs a final purchase success message before user final confirmation.
- **SC-004**: Existing production operations with string or object response data still process without schema changes.
- **SC-005**: Build succeeds for both the Next.js app and worker after implementation.

## Assumptions

- PostgreSQL and Prisma continue storing `responseData` as a JSON-capable field.
- Redis operation-scoped session storage remains the source of truth for final confirmation ViewState.
- Manual review remains required when final beIN Pay may have started but the outcome is uncertain.
- Existing UI wording can remain unchanged unless required to stop misleading success states.
