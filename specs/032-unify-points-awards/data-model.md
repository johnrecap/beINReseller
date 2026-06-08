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
- Current manager/admin owner evidence
- Current agent owner evidence
- Legacy creator evidence
- Program settings

**Outputs**:

- Eligibility status
- Skipped reason when ineligible
- Recipient list with owner id, owner role, owner kind, and rate bucket

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

- Resolved from operation user and ownership evidence.
- Converted into one point ledger entry when the rate produces positive points.

## Point Program Settings

**Purpose**: Global switches that control whether operation-spend points are active.

**Fields Used**:

- Enabled flag
- Start date
- Manager-owned user points enabled flag

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

**Validation Rules**:

- One entry per owner and source operation.
- Duplicate award attempts must not create duplicates.

## State Transitions

```text
Operation completes
  -> load program settings and ownership evidence
  -> shared award policy resolves recipients
  -> rates are resolved for each recipient
  -> positive point entries are inserted with duplicate protection
  -> existing entries remain unchanged on repeat attempts
```
