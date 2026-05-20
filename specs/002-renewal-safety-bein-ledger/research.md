# Research: Renewal Safety Corrections and beIN Spend Ledger

## Decision 1: Do not use `COMPLETING` alone as the final-payment marker

**Decision**: Add explicit operation phase evidence for final Pay submission and cancellation context. Existing status may remain `COMPLETING`, but safety decisions must inspect evidence such as job type, final-pay-submitted marker, customer deduction transaction, amount, and response/audit data.

**Rationale**: `COMPLETING` currently appears in package preparation, cancellation-confirm, final purchase confirmation, and installment paths. A status-only rule caused safe cancellation to become review-required.

**Alternatives considered**:
- Rename or split the enum immediately: clearer long-term, but more migration risk for live operations and existing UI translations.
- Continue status-only logic: rejected because it caused the reviewed bug.

## Decision 2: Centralize refund safety

**Decision**: Create a shared refund safety helper usable by app routes and worker code. Worker refund code must enforce terminal-status and post-final-Pay guards inside the same database transaction that changes user balance.

**Rationale**: The app refund helper already blocks completed/review-required operations, while worker error handling has weaker guards. Centralizing the rule reduces race risk and makes tests easier.

**Alternatives considered**:
- Leave route-specific refund checks: rejected because timeout, cleanup, cancellation, and worker catch paths can drift.
- Only add comments: rejected because this is a money-moving path.

## Decision 3: Keep `Operation.beinAccountId` as assigned/current account

**Decision**: Do not redefine the existing operation field as "charged account". Add a separate ledger for confirmed beIN spend.

**Rationale**: Existing code updates `Operation.beinAccountId` during account selection and retries. Changing its meaning could break active flows and old records.

**Alternatives considered**:
- Store charged account directly in `Operation.beinAccountId`: rejected because old and pre-charge values would pollute financial reports.
- Store only in `responseData`: rejected for reports because JSON querying is weaker and easier to misuse for totals.

## Decision 4: Confirmed spend totals come from ledger rows only

**Decision**: Admin spend totals must read from a confirmed ledger table. Operations without confirmed balance delta or confirmed charge evidence are shown separately as unconfirmed/review and are not included in confirmed totals.

**Rationale**: The admin wants real beIN account spending. Counting package price when balance evidence is missing can create false financial totals.

**Alternatives considered**:
- Use selected package price as a fallback: useful for estimates, but not acceptable for confirmed spend totals.
- Count every completed operation: rejected because completion text alone may not prove exact balance movement.

## Decision 5: One confirmed spend row per operation

**Decision**: The ledger must enforce one confirmed spend row per operation. Duplicate worker jobs should upsert or no-op rather than insert duplicates.

**Rationale**: Operations are retried and duplicate jobs can arrive. Spend reports must not double count.

**Alternatives considered**:
- Allow multiple rows for attempts: rejected by user clarification. Only the final charged beIN account should be recorded.
- Allow correction rows in v1: deferred; manual corrections can be a later feature if needed.

## Decision 6: Reports use date range over charged timestamp

**Decision**: The admin report filters by the ledger charged/confirmed timestamp, not the operation creation timestamp.

**Rationale**: The question is "how much did this beIN account spend in this period", so the charge confirmation time is the financial event.

**Alternatives considered**:
- Use operation creation date: rejected because long-running operations can cross day/month boundaries.
- Use completedAt only: insufficient for review-required-but-confirmed-charge cases.

## Decision 7: Production rollout is additive

**Decision**: Add new tables and new code paths without bulk-changing old balances or old operation statuses. Optional backfill can list candidate old operations as unconfirmed, not confirmed spend.

**Rationale**: Production has real customer balances and live operations.

**Alternatives considered**:
- Backfill spend from old `beinAccountId` and package price: rejected because it could report false spend.
- Force-review old `COMPLETING` operations during migration: rejected because it can disrupt live work.
