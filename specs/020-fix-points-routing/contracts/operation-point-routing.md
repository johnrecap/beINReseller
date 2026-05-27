# Contract: Operation Point Routing

## Internal Function Contract

### `resolveOperationPointRecipients(input)`

Returns the list of accounts that should receive operation spend points.

### Input Shape

```ts
{
  operationUser: {
    id: string
    role: string
    isActive: boolean
    deletedAt: Date | string | null
    createdBy?: AwardableUser | null
  }
  managerOwnership: { manager: AwardableUser } | null
  agentAssignment: { agent: AwardableUser } | null
}
```

### Output Shape

```ts
Array<{
  ownerUserId: string
  ownerRole: 'USER' | 'AGENT' | 'MANAGER' | 'ADMIN'
  ownerKind: 'USER' | 'AGENT' | 'MANAGER'
  ownershipReason: 'AGENT_ASSIGNMENT' | 'MANAGER_LINK' | 'ADMIN_CREATOR'
}>
```

### Required Cases

| Case | Expected Recipients |
|------|---------------------|
| Active manager link | Manager only |
| Active agent assignment and no manager link | User + agent |
| No manager link, no agent assignment, active admin creator | Admin only |
| Invalid/deleted manager, no agent, no active admin creator | None |
| Both manager link and agent assignment | Manager only |

## Ledger Contract

### Admin-as-manager award

```ts
{
  ownerUserId: 'admin-id',
  ownerRoleAtTime: 'ADMIN',
  sourceType: 'OPERATION_SPEND',
  ownerKindUsedForRate: 'MANAGER'
}
```

### User under admin/manager

No `OPERATION_SPEND` ledger entry should be created for the operation user.

## Historical Remediation Contract

### Dry-run audit output

```json
{
  "candidates": [
    {
      "ledgerEntryId": "ledger_1",
      "operationId": "operation_1",
      "wrongOwnerUserId": "user_1",
      "points": 4.37,
      "expectedOwnerUserId": "admin_1",
      "expectedOwnerRole": "ADMIN",
      "convertedRisk": true,
      "reviewRequired": true
    }
  ],
  "summary": {
    "candidateCount": 1,
    "pointsAtRisk": 4.37,
    "convertedReviewRequired": 1
  }
}
```

### Safety Rule

Remediation MUST NOT delete ledger entries and MUST NOT automatically debit balances for converted points.
