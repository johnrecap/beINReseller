# Data Model: Operation beIN Account Card Search

## Operation

**Purpose**: Represents a panel or customer action against a smart card.

**Relevant fields**:
- `id`: unique operation id.
- `userId`: panel user owner when the operation is panel-initiated.
- `customerId`: store/mobile customer owner when applicable.
- `type`: renewal, balance check, signal refresh, or related operation type.
- `cardNumber`: normalized card number used for the operation.
- `status`: lifecycle state such as pending, processing, completed, failed, cancelled, expired, or review required.
- `amount`: customer-facing amount.
- `beinAccountId`: the beIN account selected by the worker.
- `responseData`: redacted operational evidence and audit snapshots.
- `completedAt`, `createdAt`, `updatedAt`: audit timestamps.

**Relationships**:
- Optional relation to `BeinAccount`.
- Optional one-to-one relation to confirmed spend ledger.
- One-to-many relation to transactions and integrity issues.

**Validation rules**:
- Card number search input should be normalized to digits before filtering.
- `beinAccountId` should be set once an account is selected for an operation.
- A confirmed spend ledger conflict must not silently rewrite a terminal operation.

## BeinAccount

**Purpose**: Represents a configured dealer account used to interact with beIN.

**Relevant fields**:
- `id`: unique beIN account id.
- `username`: audit-safe account identifier.
- `label`: optional admin-friendly display label.
- `dealerBalance`: last observed dealer balance.
- `balanceUpdatedAt`: timestamp for the observed balance.
- `isActive`, `customerOnly`, `priority`: pool selection controls.

**Relationships**:
- One-to-many with operations.
- One-to-many with confirmed spend ledger rows.
- Optional proxy relation.

**Security rules**:
- Password, TOTP secret, cookies, session state, ViewState, and provider tokens must not be returned by report APIs.

## BeinAccountSpendLedger

**Purpose**: Immutable confirmed spend evidence for financial reporting.

**Relevant fields**:
- `id`: unique ledger row id.
- `operationId`: unique operation reference.
- `userId`: panel user associated with the charged operation.
- `beinAccountId`: beIN account that was charged.
- `cardNumberSnapshot`: card number at the time spend evidence was recorded.
- `selectedPackageName`, `selectedPackagePrice`: package snapshot.
- `dealerBalanceBefore`, `dealerBalanceAfter`, `spendAmount`: confirmed balance delta.
- `evidenceSource`, `evidenceConfidence`: evidence classification.
- `beinUsernameSnapshot`, `beinLabelSnapshot`: audit-safe account display snapshots.
- `chargedAt`: spend evidence timestamp.

**New index requirement**:
- Add an index that supports filtering confirmed spend by `cardNumberSnapshot` and `chargedAt`.

**Validation rules**:
- One ledger row per operation.
- Spend amount must be a positive balance decrease.
- Existing duplicate ledger rows must match account and amount evidence to be treated as idempotent.
- Conflicting duplicate evidence must move the operation into review.

## Report Filter

**Purpose**: Admin criteria for beIN Spend Report queries.

**Fields**:
- `from`, `to`: required ISO date range.
- `groupBy`: none, day, week, or month.
- `beinAccountId`: optional beIN account id.
- `userId`: optional panel user id.
- `operationType`: optional operation type.
- `cardNumber`: optional normalized card digits.
- `page`, `pageSize`: pagination controls for detail rows.

**Validation rules**:
- Date range must be valid and not exceed the existing maximum range.
- Card number is optional; empty or non-digit-only input after normalization is ignored or rejected based on API contract.

## Operation History Filter

**Purpose**: User-facing criteria for filtering operation history.

**Fields**:
- `page`, `limit`: pagination controls.
- `type`, `status`: optional operation filters.
- `from`, `to`: optional created-at range.
- `cardNumber`: optional normalized card digits.

**Authorization rules**:
- Non-admin history remains scoped to the authenticated user.
- Admin global audit search is handled by admin reporting endpoints.
