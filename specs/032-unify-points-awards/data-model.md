# Data Model: Unified Operation Spend Points

## Operation Spend Award Policy

**Purpose**: Pure decision object that determines whether an operation should create point entries and which owners should receive them.

**Inputs**:

- Operation id
- Operation type
- Operation status
- Operation amount in USD
- Operation completed time
- Operation user evidence
- Completion-time manager/admin owner evidence
- Completion-time agent owner evidence
- Legacy creator evidence
- Program settings

**Outputs**:

- Eligibility status
- Skipped reason when ineligible
- Recipient list with owner id, owner role, owner kind, rate bucket/rule source, rate snapshot, calculated points, and any zero reason

**Validation Rules**:

- Operation must be completed and renewal-style.
- Amount must be positive.
- Completion time must exist.
- Program must be enabled.
- Completion time must not be before start date.
- Recipient users must be active, not deleted, and have the expected role.

## Operation Spend Recipient

**Purpose**: Represents one owner who can receive a point ledger entry for an operation.

**Fields**:

- Owner user id
- Owner role at time
- Owner kind: normal user, manager-owned user, agent, or manager
- Rate bucket
- Optional skipped reason

**Relationships**:

- Resolved from operation user and locked ownership evidence at the completion transition.
- Serialized into the immutable award run before any later transfer or settings change can occur.
- Converted into one run-linked point ledger entry when the captured rate produces positive points.

## Point Program Settings

**Purpose**: Global switches that control whether operation-spend points are active.

**Fields Used**:

- Enabled flag
- Start date
- Manager-owned user points enabled flag
- Operation-spend snapshot cutover timestamp (nullable during migration and mixed-version rollout)

**Validation Rules**:

- If disabled, no operation-spend entries are produced.
- If start date exists and operation completed before it, no operation-spend entries are produced.

## Point Rule

**Purpose**: Stores per-1000 USD point rates.

**Rate Buckets Used**:

- Normal user global
- Manager-owned user default
- Agent default
- Agent override
- Manager default
- Manager override

**Validation Rules**:

- Negative rates are treated as zero.
- Explicit zero overrides remain valid zero overrides.
- Missing override falls back to default.

## Point Ledger Entry

**Purpose**: Persisted point record for a recipient and source operation.

**Fields Used**:

- Owner user id
- Owner role at time
- Source type: operation spend
- Source id: operation id
- Operation id
- Points
- Rate snapshot
- Amount snapshot
- Notes
- Nullable operation-spend award run id

**Validation Rules**:

- One entry per owner and source operation.
- One entry per run and owner when linked to an award run.
- Duplicate award attempts must not create duplicates.

## OperationSpendAwardRun

**Purpose**: Unique immutable decision evidence and state machine for one operation's spend-point outcome.

**Fields**:

- `id`
- `operationId` (unique, foreign key with restrictive delete behavior)
- `policyVersion`
- `completionSource`
- `completedAtSnapshot` (nullable only for a legacy review sentinel whose historical operation lacks it), `operationTypeSnapshot`, `amountUsdSnapshot`, `operationUserIdSnapshot`
- Nullable `ownershipKindSnapshot`: `ADMIN_DIRECT`, `LEGACY_ADMIN`, `AGENT`, `MANAGER`, `UNOWNED`, or `INVALID`
- Nullable `ownershipOwnerIdSnapshot`
- Nullable `pointsEnabledSnapshot`, `pointsStartAtSnapshot`, `managerOwnedUserPointsEnabledSnapshot`
- Nullable `ownershipEvidenceSnapshot`: safe JSON ids/roles/active/deleted flags and selected relation ids only
- Nullable `recipientsSnapshot`: immutable JSON entries containing owner id/role/kind, rate bucket, rule/default source, rate, calculated points, and zero reason
- `status`: `CAPTURED`, `AWARDED`, `SKIPPED`, or `LEGACY_REVIEW_REQUIRED`
- `reasonCode`, `ledgerEntryCount`, `finalizationAttemptCount`, `lastFinalizationAttemptAt`, `nextFinalizationAttemptAt`, `lastFinalizationErrorCode`, `capturedAt`, `finalizedAt`, `createdAt`, `updatedAt`

**Indexes and constraints**:

- Unique `operationId` prevents two capture records.
- `(status, nextFinalizationAttemptAt, capturedAt)` supports bounded backoff-aware finalization/review without poisoned-run starvation.
- `(completionSource, capturedAt)` supports release audits.
- Capture locks the operation and subject user and occurs in the same transaction as `COMPLETED`.
- Finalization locks the run and writes the complete positive recipient set plus `AWARDED` state in one transaction.
- `CAPTURED` requires at least one positive recipient; zero recipients may coexist in its immutable snapshot. `SKIPPED` requires zero positive recipients.
- New `CAPTURED`/`SKIPPED` runs require complete operation, ownership, program, and recipient/skip evidence. Only a minimal `LEGACY_REVIEW_REQUIRED` sentinel may have null decision evidence.

**Legacy rules**:

- Pre-cutover completed operations and existing ledger rows are not rewritten.
- Post-cutover missing runs are represented by a unique minimal `LEGACY_REVIEW_REQUIRED` sentinel. It stores operation id plus available completedAt/type/amount/user identity, `completionSource=LEGACY_DETECTED`, reason/origin, and null ownership/program/rate/recipient evidence.
- Concurrent detectors insert-or-read the same unique sentinel; any immutable identity mismatch becomes a safe review conflict.
- If no run exists, existing unlinked `OPERATION_SPEND` rows create/read the minimal sentinel with an unlinked-ledger reason. If a `CAPTURED` run already exists, finalization changes that locked run to `LEGACY_REVIEW_REQUIRED` while preserving its snapshot and creates no new ledger entry.
- Pre-cutover missing runs return `NOT_FOUND` and create no sentinel.
- Customer-only operations store `operationUserIdSnapshot=null`, null ownership/program/rate/recipient evidence, `status=SKIPPED`, and `reasonCode=CUSTOMER_OPERATION_NOT_ELIGIBLE`; the operation relation and completion identity remain durable.
- Retry metadata contains counters, timestamps, and allowlisted safe codes only. Raw exception messages are never persisted.

## State Transitions

```text
Completion transaction locks operation + subject user
  -> verifies expected previous state and writes COMPLETED + exact completedAt
  -> reads completion-time ownership, settings, and rules
  -> shared snapshot policy resolves recipients, rates, points, or skipped reason
  -> inserts one CAPTURED or SKIPPED OperationSpendAwardRun
  -> commits operation and decision evidence atomically

CAPTURED run finalization
  -> locks the unique run
  -> verifies no legacy/unlinked conflicting entries
  -> inserts the complete positive recipient ledger set
  -> marks AWARDED with count in the same transaction
  -> repeat/concurrent attempts return already-finalized without changes

Missing post-cutover run
  -> report/record LEGACY_REVIEW_REQUIRED
  -> never infer recipients from current ownership/settings/rates

CAPTURED run with pre-existing unlinked operation-spend rows
  -> preserve snapshot
  -> transition locked run to LEGACY_REVIEW_REQUIRED with reason
  -> create no new ledger entries
```
