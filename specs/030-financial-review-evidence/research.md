# Research: Financial Review Evidence Provenance

## Decision 1: Treat missing final before-balance as unknown, not no-charge

**Decision**: If the final payment before-balance cannot be read, provider debit evidence is incomplete. The system must not calculate provider spend from package-load fallback values.

**Rationale**: The user manually verified that actual beIN debit matched the customer deduction while the panel displayed a higher value. The likely cause is stale package-load balance being promoted to confirmed final-payment evidence.

**Alternatives considered**:

- Treat missing before-balance as zero provider charge: rejected because missing evidence is not proof of no charge.
- Keep using package-load fallback: rejected because it caused inflated displayed beIN debit.
- Force manual review for all missing before-balance rows: accepted as the safe default.

## Decision 2: Evidence confidence drives UI and API decisions

**Decision**: Financial review must carry explicit evidence state: confirmed-final-pay, incomplete-evidence, legacy-unverified, manual-verified-paid, manual-verified-not-paid, or conflict.

**Rationale**: The same numerical value can have very different trust levels depending on where it came from. Admins need the source before making money-moving decisions.

**Alternatives considered**:

- Show only numbers and hide source: rejected because it caused wrong interpretation.
- Add a generic warning only: rejected because API decision rules also need the evidence state.
- Normalize evidence to a new table now: deferred to reduce release risk; response metadata is acceptable short-term if append-only.

## Decision 3: Manual decisions are conclusions, not provider evidence

**Decision**: Button defaults such as `تم تأكيد الدفع` and `لم يتم تأكيد الدفع` record the admin conclusion. They do not overwrite system-captured provider evidence.

**Rationale**: Admin manual checks are real operational facts, but they have different provenance from system-captured final-payment balances.

**Alternatives considered**:

- Store manual result in the same fields as provider spend: rejected because it would erase provenance.
- Require a note for every action: rejected because user requested optional note.
- Store append-only metadata in response data: accepted for v1 with later table deferred.

## Decision 4: Legacy repair is non-destructive

**Decision**: Mark suspect old records as legacy-unverified without deleting ledger/audit values.

**Rationale**: Existing production history must remain auditable. The system should stop trusting bad provenance without rewriting history.

**Alternatives considered**:

- Delete bad ledger rows: rejected due audit and risk.
- Automatically recalculate all old rows: rejected because some operations may not have enough evidence to recalculate safely.
- Presentation-layer classification plus optional repair metadata: accepted.

## Decision 5: Rename stored-evidence check unless live provider check is implemented

**Decision**: Rename "check card now" to `فحص الأدلة المسجلة` unless it becomes a true live provider check.

**Rationale**: Current behavior reads stored evidence heuristics. The label must not imply a real-time beIN check.

**Alternatives considered**:

- Keep label unchanged: rejected because it can mislead admins.
- Implement full live check now: deferred because it is larger and requires provider interaction design.

## Decision 6: Minimal account context binding now

**Decision**: Diagnostic package-load balances must carry account/card/package context and must be discarded or marked diagnostic if that context changes.

**Rationale**: Even though account-switching is not the root of the latest inflated-display bug, changed account context can produce future misleading diagnostic values.

**Alternatives considered**:

- Full account-switching redesign now: deferred as related but larger.
- No account context binding: rejected because diagnostics can become stale after retry.
