# Data Model: Agent User Management

## Agent Account

Represents a `User` row with role `AGENT`.

**Key fields used**:

- `id`
- `username`
- `email`
- `role`
- `balance`
- `isActive`
- `deletedAt`
- `createdAt`
- `lastLoginAt`

**Relationships**:

- Optional `AgentProfile`
- Many active or historical `AgentAssignment` rows as agent
- Point ledger entries as point owner

**Validation rules**:

- Must have `role=AGENT`.
- Must not be soft-deleted.
- Must be active for new transfers.
- If an `AgentProfile` exists with `isActive=false`, the transfer must be rejected.

## Managed User

Represents a `User` row with role `USER`.

**Key fields used**:

- `id`
- `username`
- `email`
- `role`
- `balance`
- `isActive`
- `deletedAt`
- `createdAt`
- `lastLoginAt`
- `createdById`

**Relationships**:

- Zero or more legacy `ManagerUser` rows.
- Zero or more historical `AgentAssignment` rows.
- At most one intended active `AgentAssignment` after this feature.

**Validation rules**:

- Must have `role=USER`.
- Must not be soft-deleted.
- Can be inactive as an account only if the admin intentionally transfers ownership for bookkeeping; MVP rejects inactive users for transfer to avoid assigning unusable accounts.

## Manager/Admin Ownership Link

Represents existing `ManagerUser` rows.

**Key fields used**:

- `id`
- `managerId`
- `userId`
- `createdAt`

**State transitions**:

- Existing: row is present.
- Transfer to agent: rows for the user are deleted from `manager_users`.

**Reasoning**:

`ManagerUser` has no `isActive` or `endedAt` fields, so ending ownership means deleting the relationship row. The transfer activity log preserves the previous ownership evidence.

## Agent Assignment

Represents `AgentAssignment` rows.

**Key fields used**:

- `id`
- `agentId`
- `userId`
- `sourceGroup` (`string | null`)
- `isActive`
- `assignedByAdminId`
- `createdAt`
- `updatedAt`
- `endedAt`

**State transitions**:

- New assignment: `isActive=true`, `endedAt=null`.
- Replaced assignment: `isActive=false`, `endedAt=<transfer time>`.
- Same-agent metadata change updates the existing active row in place; an exact match is a no-op.

**Validation rules**:

- Target agent must be a valid active agent.
- Target user must be a valid active user.
- Source Group may be null; non-empty values are trimmed and limited to 120 characters. Omitted uses same-agent preserve or new-agent default/null, while explicit blank/null clears.
- After transfer, the user must have exactly one active assignment.

## Transfer Result

Logical result returned by the transfer service.

**Fields**:

- `assignmentId`
- `userId`
- `agentId`
- `sourceGroup` (`string | null`)
- `previousManagerOwnerIds`
- `previousAgentAssignmentIds`
- `replacedOwnership`
- `mode`: `created`, `transferred`, or `refreshed`

**Relationships**:

- Written to `ActivityLog.details`.
- Returned by admin APIs for UI refresh.

## Agent Tab Row

Read model returned by the admin users endpoint for `roleFilter=agents`.

**Fields**:

- Agent account identity and status.
- `assignedUsersCount`
- `points` summary.
- `profile.displayName`
- `profile.defaultSourceGroup`
- `profile.isActive`

**Performance rule**:

Counts and point summaries must be batched for the current page. Do not query counts or points one agent at a time.

## Legacy Data Handling

- Historical `AgentAssignment` rows stay in the database.
- Historical `ManagerUser` relationship rows are removed only for users transferred to an agent.
- Existing operations, credit requests, point ledger entries, redemptions, and transactions are not recalculated.
- Operations completed after transfer capture the then-current assignment; operations completed before transfer retain their immutable completion-time point owner and are never re-routed at award/finalization time.
