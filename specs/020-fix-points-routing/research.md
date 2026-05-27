# Research: Fix Points Recipient Routing

## Decision 1: Fix routing at recipient resolution

**Decision**: Update `resolveOperationPointRecipients` and the operation fetch feeding it.

**Rationale**: This is the root cause. Ledger creation and point calculation already use the recipients returned by this function. Fixing later would only mask bad recipients.

**Alternatives considered**:

- Filter user ledger entries after creation: rejected because wrong ledger entries would still be created.
- Hide user points in UI: rejected because balances/conversions would still be wrong.

## Decision 2: Treat direct admin creator as admin-as-manager

**Decision**: If a user has no active agent assignment and no manager link, and `createdBy` is an active ADMIN, the admin is the recipient.

**Rationale**: The user explicitly confirmed direct admin-created users should award points to admin.

**Alternatives considered**:

- Award no one: rejected by user clarification.
- Award the operation user: rejected because users only get operation spend points when under an AGENT.

## Decision 3: Separate actual role from rate bucket

**Decision**: Store `ownerRoleAtTime = ADMIN` for admin-owned ledger entries, but use `ownerKind = MANAGER` for rate lookup.

**Rationale**: `PointLedgerEntry.ownerRoleAtTime` supports `ADMIN`, but `PointRuleOwnerType` has manager and agent/user rate buckets, not admin. Admin is acting as top-level manager for this rule.

**Alternatives considered**:

- Add admin rate settings: rejected because it expands scope and UI.
- Store admin entries as MANAGER: rejected because audit would be inaccurate.

## Decision 4: Do not auto-debit converted historical mistakes

**Decision**: Historical audit flags converted wrong points as review-required. Automated remediation can only reverse unconverted ledger points safely.

**Rationale**: Converted points may have already changed real balance. Silent balance debits could create financial disputes.

**Alternatives considered**:

- Always debit user balance: rejected as unsafe.
- Ignore historical mistakes: rejected because it hides known ledger errors.

## Decision 5: Preserve manager-over-agent precedence

**Decision**: If a user has both a manager link and an agent assignment, manager/admin ownership wins.

**Rationale**: Current code already uses manager first, and transfer flows are expected to remove manager ownership when moving users to agents.

**Alternatives considered**:

- Agent wins whenever active: rejected because it can duplicate points during partial transfers or stale assignment states.
