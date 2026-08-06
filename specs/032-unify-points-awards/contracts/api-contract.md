# Contracts: Unified Operation Spend Points

## Internal Shared Policy Contract

### `buildOperationSpendAwardSnapshot(input)`

**Purpose**: Return one consistent, serializable completion-time eligibility/recipient/rate decision for an operation.

**Input Requirements**:

- Operation id, type, status, amount, and completed time
- Operation user: id, role, active state, deleted state
- Locked completion-time admin/manager owner evidence when present
- Locked completion-time agent owner evidence when present
- Legacy creator evidence when present
- Program settings: enabled flag, start date, manager-owned user toggle
- Resolved active default/override rules and their safe ids/sources

**Output Requirements**:

- `eligible`: true or false
- `skippedReason`: null when eligible, otherwise one stable reason
- safe ownership classification/evidence snapshot
- program/rule snapshots
- `recipients`: zero or more recipients with owner id/role/kind, rate bucket/source, exact rate, calculated points, and zero reason

**Required Recipient Outcomes**:

| Ownership case | Recipients |
|----------------|------------|
| Agent-owned active normal user | User + agent |
| Manager-owned user, manager-owned user points off | Manager only |
| Manager-owned user, manager-owned user points on | Manager + user |
| Admin-owned direct active normal user | User only |
| Legacy admin-created user with no current owner | User only |
| Unowned or invalid owner | None |

## Transactional Capture Contract

### `captureOperationSpendAwardRunInTransaction(tx, operationId, completionSource, completedAt)`

**Purpose**: Persist the immutable decision in the exact transaction that changes the operation to `COMPLETED`.

**Required Behavior**:

- Requires the operation transition and exact `completedAt` to already exist in the supplied transaction.
- Locks the operation and subject-user rows and follows the same subject lock discipline as ownership transfer.
- Loads completion-time ownership, settings, and rules, then calls the shared snapshot policy.
- Creates exactly one `CAPTURED` or `SKIPPED` run per operation.
- Treats a concurrent pre-existing run as the authoritative idempotent result.
- Accepts a pre-existing run as idempotent only when operation id, user id, exact `completedAt`, operation type, amount, and completion source equal the attempted immutable identity; any mismatch returns a safe `AWARD_RUN_CONFLICT`/review result and never overwrites the run.
- Never writes point ledger entries itself.

### Shared lock contract

- `shared/db/ownership-evidence-lock.ts` exports a generic transaction-safe subject/owner lock helper used by web, Worker, and ownership transfer.
- Completion order is operation row, subject `users` row, then current/target owner `users` rows in lexical id order. Transfer starts at subject user and uses the same lexical owner order because it never locks an operation.
- SQL uses `SELECT ... FOR UPDATE`; relation evidence is re-read only after the subject lock. Settings/rule rows are read and snapshotted inside the same transaction.

## Finalization Contract

### `finalizeOperationSpendAwardRun(operationId)`

**Purpose**: Consume a captured run without consulting live ownership/settings/rates.

**Required Behavior**:

- Locks the unique run row.
- Returns `SKIPPED` for a skipped run and `ALREADY_FINALIZED` for an awarded run.
- For a captured run, inserts every positive recipient ledger entry and marks `AWARDED` with the inserted count in one transaction.
- On any recipient failure, commits neither ledger rows nor final status.
- If unlinked operation-spend rows already exist and no run exists, atomically creates/reads the minimal review sentinel. If a captured run exists, finalization preserves its snapshot and transitions that locked run to review-required. Both cases return `REVIEW_REQUIRED` and create no new ledger entry.
- Returns `AWARDED | ALREADY_FINALIZED | SKIPPED | REVIEW_REQUIRED | NOT_FOUND`.

## Runtime Adapter Contract

Web and Worker adapters expose the same finalizer semantics. Confirmation/re-observation routes may finalize an existing run but MUST NOT synthesize a missing run from current ownership. A bounded maintenance worker selects stale `CAPTURED` runs by index and invokes the same finalizer.

## Financial Review Completion Contract

### Admin charged/completed decision

**Purpose**: When admin closes an operation as charged/completed, the operation should receive the same operation-spend points as automatic completion.

**Required Behavior**:

- Captures the run in the same transaction as the successful transition to completed.
- Locks and re-reads the operation before validating the decision or applying refund/completion effects, and performs a guarded transition from `REVIEW_REQUIRED` so concurrent decisions cannot both commit.
- Calls the common finalizer only after the completion transaction commits.
- Does not create duplicate or partial point entries if capture/finalization already ran.
- Records safe logs only when an award is skipped or fails.

## Completion Writer Contract

Every canonical first-completion writer that transitions an `Operation` to `COMPLETED`—Worker renewal/contract verification/live review/installment, web recovery, admin charged decision, and non-spend signal/zero-amount paths—must:

- lock/validate the operation and subject user;
- set one exact `completedAt` value;
- capture one `CAPTURED` or `SKIPPED` run before committing;
- finalize only after commit when status is `CAPTURED`.

When the locked operation has `customerId` but no panel `userId`, capture must create one `SKIPPED` run with `CUSTOMER_OPERATION_NOT_ELIGIBLE`, preserve the exact completion identity, leave ownership/program/rate/recipient evidence null, and allow completion to commit.

The existing signal-activation job is a re-observation exception because it reuses an operation already completed and captured by signal check. It must preserve the original `completedAt`, must not call capture with a second completion source, and may only call the common finalizer for the existing skipped run. If activation is later changed to create a distinct operation id, that distinct operation follows the normal writer contract.

## Legacy And Cutover Contract

- `operationSpendSnapshotCutoverAt` remains null until migration plus compatible web/all Worker deployment completes.
- `scripts/activate-operation-spend-snapshot-cutover.ts` is dry-run by default. Mutation requires `--activate --confirmed-release=<release-id>`, invokes the shared safe preflight, refuses unresolved invariants, locks and rechecks the singleton settings row, refuses an already-set/conflicting state, then stores database time. Operators must verify the named web/all-Worker release in PM2 before supplying the attestation.
- Pre-cutover completed operations and existing ledger rows are left unchanged.
- At/after cutover, a completed operation without a run atomically creates/reads the minimal unique `LEGACY_REVIEW_REQUIRED` sentinel and is never assigned from current state. Required identity fields use available operation data; ownership/program/rate/recipient fields are null.
- Before cutover, a missing run returns `NOT_FOUND` and creates no sentinel.
- Release audit and activation preflight return total counts plus bounded safe operation/run ids only for every invariant category.

## Maintenance Retry Contract

- Eligible `CAPTURED` runs are selected by indexed status/next-attempt time in bounded batches.
- A failed finalization persists an incremented attempt count, a safe code, and a bounded next-attempt time; it never stores the raw exception.
- A run at the maximum attempt count transitions to `LEGACY_REVIEW_REQUIRED` with reason `FINALIZATION_RETRIES_EXHAUSTED` so it cannot starve newer runs.

## Settings Page Contract

### Points Settings UI copy

**Purpose**: Admin can understand who receives operation-spend points.

**Required Behavior**:

- Disabled program state explains no spend points are awarded.
- Normal user rate explains it applies to agent-owned users and admin-owned direct users.
- Manager-owned user toggle explains whether manager-owned users receive user points.
- No sensitive runtime data is displayed.
