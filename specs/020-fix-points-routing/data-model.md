# Data Model: Fix Points Recipient Routing

## Existing Data Used

### User

Relevant fields and relations:

- `id`
- `role`
- `isActive`
- `deletedAt`
- `createdById`
- `createdBy`
- `managerLink`
- `agentAssignmentAsUser`

Use:

- Determines who owns a user's operation spend points.
- `createdBy` is used only as admin fallback when no manager link and no active agent assignment exist.

### ManagerUser

Use:

- Explicit manager ownership evidence.
- Valid manager owner means role `MANAGER`, active, not deleted.

### AgentAssignment

Use:

- Explicit agent ownership evidence.
- Valid agent owner means active assignment to an active `AGENT`.

### Operation

Use:

- Completed subscription operation that triggers point award.
- Provides operation user, amount, type, status, completed time.

### PointLedgerEntry

Use:

- Stores resulting operation spend point entries.
- Historical corrections use reversal entries, not deletes.

## Updated Internal Types

### AwardOwnerRole

Allowed actual ledger roles:

- `USER`
- `AGENT`
- `MANAGER`
- `ADMIN`

### AwardRateKind

Allowed calculation rate buckets:

- `USER`
- `AGENT`
- `MANAGER`

Rules:

- USER recipient uses USER rate.
- AGENT recipient uses AGENT rate.
- MANAGER recipient uses MANAGER rate.
- ADMIN recipient uses MANAGER rate.

### OperationPointRecipient

Fields:

- `ownerUserId`
- `ownerRole`
- `ownerKind`
- `ownershipReason`

Rules:

- `ownerRole` is actual ledger role.
- `ownerKind` controls rate lookup.
- `ownershipReason` may be used for tests/logging/audit and can be `AGENT_ASSIGNMENT`, `MANAGER_LINK`, or `ADMIN_CREATOR`.

## Routing State Transitions

1. Manager link valid -> manager recipient only.
2. Else active agent assignment valid -> user + agent recipients.
3. Else admin creator valid -> admin recipient only.
4. Else -> no recipients.

## Historical Candidate Model

### MisAwardCandidate

Fields:

- `ledgerEntryId`
- `operationId`
- `wrongOwnerUserId`
- `wrongOwnerUsername`
- `points`
- `availableRisk`
- `convertedRisk`
- `expectedOwnerUserId`
- `expectedOwnerRole`
- `reason`
- `reviewRequired`

Rules:

- Candidate source type must be `OPERATION_SPEND`.
- Candidate owner role must be `USER`.
- Converted risk is true if the user has point cash redemption history that could include the candidate points.
- Review-required candidates are not automatically remediated.
