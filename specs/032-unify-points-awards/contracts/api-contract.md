# Contracts: Unified Operation Spend Points

## Internal Shared Policy Contract

### `resolveOperationSpendAwardPolicy(input)`

**Purpose**: Return one consistent eligibility and recipient decision for an operation.

**Input Requirements**:

- Operation id, type, status, amount, and completed time
- Operation user: id, role, active state, deleted state
- Current admin/manager owner evidence when present
- Current agent owner evidence when present
- Legacy creator evidence when present
- Program settings: enabled flag, start date, manager-owned user toggle

**Output Requirements**:

- `eligible`: true or false
- `skippedReason`: null when eligible, otherwise one stable reason
- `recipients`: zero or more recipients with owner id, owner role, owner kind, and rate bucket

**Required Recipient Outcomes**:

| Ownership case | Recipients |
|----------------|------------|
| Agent-owned active normal user | User + agent |
| Manager-owned user, manager-owned user points off | Manager only |
| Manager-owned user, manager-owned user points on | Manager + user |
| Admin-owned direct active normal user | User only |
| Legacy admin-created user with no current owner | User only |
| Unowned or invalid owner | None |

## Web Award Wrapper Contract

### `processCompletedOperationPoints(operationId)`

**Purpose**: Load operation, settings, and rules from the web app database context, then write idempotent point ledger entries based on the shared policy.

**Required Behavior**:

- Must call the shared policy.
- Must resolve rates from active point rules.
- Must skip duplicate entries safely.
- Must return a structured skipped reason when no entries are written.

## Worker Award Wrapper Contract

### `processCompletedOperationPoints(prisma, operationId)`

**Purpose**: Load operation, settings, and rules from the worker database context, then write idempotent point ledger entries based on the same shared policy.

**Required Behavior**:

- Must call the same shared policy as the web wrapper.
- Must load enough ownership evidence to classify admin-owned direct users and legacy admin-created users.
- Must not award unowned users by default.
- Must skip duplicate entries safely.

## Financial Review Completion Contract

### Admin charged/completed decision

**Purpose**: When admin closes an operation as charged/completed, the operation should receive the same operation-spend points as automatic completion.

**Required Behavior**:

- Only runs after a successful transition to completed.
- Calls the same web award wrapper.
- Does not create duplicate point entries if the award already ran.
- Records safe logs only when an award is skipped or fails.

## Settings Page Contract

### Points Settings UI copy

**Purpose**: Admin can understand who receives operation-spend points.

**Required Behavior**:

- Disabled program state explains no spend points are awarded.
- Normal user rate explains it applies to agent-owned users and admin-owned direct users.
- Manager-owned user toggle explains whether manager-owned users receive user points.
- No sensitive runtime data is displayed.
