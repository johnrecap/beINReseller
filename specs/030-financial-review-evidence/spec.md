# Feature Specification: Financial Review Evidence Provenance

**Feature Branch**: `030-financial-review-evidence`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Fix financial review so stale beIN balance readings are not displayed as confirmed beIN deductions. Separate customer deduction, confirmed beIN deduction, and manual admin decision. Add optional notes and automatic payment-status labels for no-refund/refund decisions."

## User Scenarios & Testing

### User Story 1 - Show Only Trusted beIN Debit Evidence (Priority: P1)

An admin reviews a renewal operation and sees whether the beIN debit amount is confirmed, incomplete, legacy-unverified, or manually verified.

**Why this priority**: The current review screen can display an inflated beIN debit when an old package-load balance is used as if it were the final payment balance. This can cause wrong refund/no-refund decisions.

**Independent Test**: Create or simulate a renewal where the final payment page balance-before is missing but an older package-load balance exists. The review screen must not show that older balance delta as a confirmed beIN debit.

**Acceptance Scenarios**:

1. **Given** a renewal has final-payment before and after balances captured from the final payment flow, **When** the admin opens financial review, **Then** the beIN debit is shown as confirmed from final payment evidence.
2. **Given** a renewal has a package-load balance and a final after-balance but no final before-balance, **When** the admin opens financial review, **Then** the beIN debit amount is shown as incomplete and not as a confirmed value.
3. **Given** a legacy review row has a beIN debit greater than the customer deduction and lacks final-payment evidence provenance, **When** the admin opens financial review, **Then** it is marked as legacy-unverified while preserving the old stored value for audit.
4. **Given** evidence is incomplete or legacy-unverified, **When** the admin views action buttons, **Then** the screen warns that a manual check is needed before refund/no-refund decisions.

---

### User Story 2 - Record Manual Admin Decisions Safely (Priority: P1)

An admin can decide no-refund, refund, or keep-under-review while the system records the admin conclusion separately from provider evidence.

**Why this priority**: Admin decisions are sometimes based on manual beIN account checks. Those decisions must be traceable and must not overwrite system evidence.

**Independent Test**: Submit each financial review decision with and without an optional note, then reload the review item and confirm the decision history preserves who decided, when, the conclusion, payment status, renewal status, amount if supplied, and the note.

**Acceptance Scenarios**:

1. **Given** the admin clicks "Renewed / no refund", **When** the decision is saved, **Then** the decision records the admin conclusion with payment status `تم تأكيد الدفع`.
2. **Given** the admin clicks "Refund customer", **When** the decision is saved, **Then** the decision records the admin conclusion with payment status `لم يتم تأكيد الدفع`.
3. **Given** the admin clicks "Keep under review", **When** the decision is saved, **Then** no forced payment status is recorded and the optional note is appended if provided.
4. **Given** the admin enters an optional note, **When** any decision is saved, **Then** the note is stored beside the decision without replacing older decisions.
5. **Given** the admin manually verifies the card renewal or actual beIN debit amount, **When** they save the decision, **Then** those manual facts are stored as manual evidence and not as system-captured final-payment evidence.

---

### User Story 3 - Enforce Safe Refund And No-Refund Decisions (Priority: P1)

The decision API accepts only financially safe decisions based on trusted evidence or explicit manual verification.

**Why this priority**: Missing evidence is not proof of no provider charge, and stale evidence is not proof of provider charge. Unsafe decisions can either refund incorrectly or deny a valid refund.

**Independent Test**: Attempt refund and no-refund actions against confirmed, incomplete, legacy-unverified, and conflicting evidence states, then verify the API accepts only safe actions or requires manual verification.

**Acceptance Scenarios**:

1. **Given** trusted evidence confirms final-payment debit and the customer received renewal, **When** the admin chooses no-refund, **Then** the operation can be closed without refund.
2. **Given** no trusted provider charge exists and the admin or live evidence confirms no renewal/payment, **When** the admin chooses refund, **Then** the customer refund can be applied.
3. **Given** provider charge evidence exists but the card is not renewed, **When** the admin chooses an automatic outcome, **Then** the system blocks the outcome and keeps the operation in a conflict review state.
4. **Given** evidence is missing, old, fallback-based, or conflicting, **When** no manual verification is supplied, **Then** refund and no-refund actions remain blocked and the operation stays under review.

---

### User Story 4 - Preserve And Reclassify Legacy Review Rows (Priority: P2)

An admin can identify old suspicious rows without deleting or rewriting their historical ledger/audit values.

**Why this priority**: Existing rows may already contain inflated beIN debit values. They must remain auditable while no longer being treated as trusted proof.

**Independent Test**: Run the legacy classification flow on a suspect operation and confirm original values remain visible as old stored values while the trusted evidence state becomes legacy-unverified.

**Acceptance Scenarios**:

1. **Given** an old row has no final-payment provenance and its beIN debit exceeds the customer deduction, **When** the reclassification runs, **Then** the row is marked legacy-unverified.
2. **Given** an old row is marked legacy-unverified, **When** the admin views it, **Then** the old amount is visible with a warning that it is not trusted evidence.
3. **Given** a legacy row has already been reclassified, **When** the repair action runs again, **Then** it does not duplicate or erase metadata.

---

### User Story 5 - Keep Related Flows Explicitly Bounded (Priority: P3)

The implementation makes the renewal fix complete while clearly documenting whether installment and account-switching hardening are included.

**Why this priority**: Installment has similar evidence risk, and account switching can affect diagnostic context. These should not be silently ignored.

**Independent Test**: Review the release notes/quickstart and tests to verify installment source labels are either covered or explicitly deferred, and diagnostic balances are tied to account/card/package context.

**Acceptance Scenarios**:

1. **Given** diagnostic package-load balance is retained, **When** account, card, or package context changes, **Then** that diagnostic value is not used as trusted evidence.
2. **Given** installment evidence uses the same review display path, **When** final before-balance is missing, **Then** installment also avoids showing a confirmed provider debit from fallback evidence, or the release notes state the risk is deferred.
3. **Given** account switching after package load remains enabled, **When** the account changes, **Then** any package-load diagnostic balance is discarded or marked as belonging to the previous context.

### Edge Cases

- Final payment is submitted but final before-balance cannot be read.
- Final payment is submitted and after-balance cannot be read.
- beIN charge appears confirmed but the card did not renew.
- The card renews but the actual beIN debit amount is not manually supplied.
- A legacy ledger row already says confirmed but lacks provenance that the before-balance came from final payment.
- A package-load diagnostic balance belongs to a different beIN account after account retry.
- An admin saves a note without a refund/no-refund decision.
- Multiple admins append decisions to the same operation.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST distinguish customer deduction, confirmed beIN debit, diagnostic beIN balances, legacy stored values, and manual admin decisions.
- **FR-002**: The system MUST NOT use a package-load or pre-final diagnostic balance as a confirmed beIN balance before payment.
- **FR-003**: The system MUST create confirmed beIN spend evidence only when both before and after balances are captured from the final payment flow for the same operation context.
- **FR-004**: If the final payment before-balance is missing, the provider debit amount MUST be classified as incomplete or unknown, not zero and not confirmed.
- **FR-005**: The review screen MUST show the source/confidence of the beIN debit evidence.
- **FR-006**: The review screen MUST show the customer deduction separately from the confirmed beIN debit.
- **FR-007**: The review screen MUST show a customer-vs-beIN difference only when the beIN debit is confirmed by final-payment evidence or manually verified with an amount.
- **FR-008**: The review screen MUST label old suspicious fallback-based values as legacy-unverified while preserving the original stored value for audit.
- **FR-009**: The "check card now" action MUST be renamed to a stored-evidence review label unless it performs a live beIN provider check.
- **FR-010**: The admin decision flow MUST include an optional note field.
- **FR-011**: A no-refund decision MUST automatically record payment status `تم تأكيد الدفع` as the admin conclusion.
- **FR-012**: A refund decision MUST automatically record payment status `لم يتم تأكيد الدفع` as the admin conclusion.
- **FR-013**: A keep-under-review decision MUST NOT force a payment status.
- **FR-014**: Manual decisions MUST be append-only and preserve previous decision history.
- **FR-015**: Manual verification MUST record who verified, when, source, decision, payment status, card renewal status when supplied, actual beIN debit amount when supplied, and note when supplied.
- **FR-016**: No-refund MUST be allowed only when renewal/service outcome is confirmed by trusted system evidence or explicit manual verification.
- **FR-017**: Refund MUST be allowed only when no trusted provider charge exists and live/manual verification confirms no renewal/payment.
- **FR-018**: Missing, fallback, legacy-unverified, or conflicting evidence MUST stay under review unless an admin records explicit manual verification.
- **FR-019**: Confirmed provider charge with no renewal MUST be represented as a conflict state, not as automatic refund or automatic no-refund.
- **FR-020**: Legacy reclassification MUST be non-destructive and idempotent.
- **FR-021**: Diagnostic balances MUST be tied to account, card, package, operation, and capture stage so they cannot be reused across changed context as trusted evidence.
- **FR-022**: Installment evidence MUST receive the same source/confidence treatment where practical, or the implementation MUST document the remaining deferred risk.

### Key Entities

- **ProviderEvidenceState**: The trust classification for provider evidence: confirmed-final-pay, incomplete-evidence, legacy-unverified, manual-verified-paid, manual-verified-not-paid, or conflict.
- **ProviderBalanceEvidence**: Captured beIN balance data, including before/after values, source stage, account, card, package, operation, and capture time.
- **ManualReviewDecision**: An append-only admin decision record with action, payment status, card renewal status, optional actual beIN debit amount, optional note, source, decidedBy, and decidedAt.
- **LegacyEvidenceClassification**: A non-destructive marker that tells the review screen an old stored value is preserved but not trusted as confirmed provider debit evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of review rows with missing final-payment before-balance show provider debit as incomplete/unverified rather than confirmed.
- **SC-002**: 100% of no-refund/refund decisions record the correct default Arabic payment-status conclusion and preserve optional notes.
- **SC-003**: Legacy suspicious rows are reclassified without deleting original stored values and without duplicate reclassification metadata when processed more than once.
- **SC-004**: Decision API rejects refund/no-refund actions for incomplete, fallback, legacy, or conflicting evidence unless explicit manual verification is provided.
- **SC-005**: Focused renewal tests cover confirmed evidence, missing before-balance, legacy-unverified rows, manual verification, and decision blocking before release.

## Assumptions

- Existing admin authentication and authorization remain the security boundary for review decisions.
- Manual verification can initially be stored in operation response metadata as append-only history; a normalized database table can be added later if reporting needs grow.
- The first release does not implement a true live beIN card check unless explicitly approved as a larger follow-up.
- Production deployment uses Prisma migrations when schema changes are required and does not use `db push`.
- Historical ledger/audit values are preserved for audit and are not silently deleted or overwritten.
