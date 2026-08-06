# Contract: Admin Agent User Transfer

## POST `/api/admin/agent-assignments`

Creates or transfers a user's active ownership to an agent.

### Authorization

- Requires exact admin role.

### Request Body

```json
{
  "userId": "user_1",
  "agentId": "agent_1",
  "expectedOwnershipToken": "ow1.example",
  "sourceGroup": null,
  "replaceExisting": true
}
```

### Request Rules

- `userId` must identify a non-deleted active `USER`.
- `agentId` must identify a non-deleted active `AGENT`.
- `expectedOwnershipToken` is required for public mutations.
- `sourceGroup` may be omitted, null, blank, or non-empty: omitted preserves for the same agent or uses the new-agent default/null; null/blank clears; non-empty sets a trimmed value up to 120 characters.
- `replaceExisting` defaults to `true`.
- If `replaceExisting=false` and the user has active manager/admin ownership or an active agent assignment, the API returns `409`.
- If `replaceExisting=true`, the API ends old active agent assignments and removes manager/admin owner links before creating the new assignment.

### Success Response

```json
{
  "success": true,
  "assignment": {
    "id": "assignment_1",
    "userId": "user_1",
    "agentId": "agent_1",
    "sourceGroup": null,
    "createdAt": "2026-05-25T12:00:00.000Z"
  },
  "ownershipToken": "ow1.committed",
  "auditLogId": "activity_1",
  "sourceGroupResolution": "CLEARED",
  "transfer": {
    "mode": "transferred",
    "previousManagerOwnerIds": ["manager_1"],
    "previousAgentAssignmentIds": ["old_assignment_1"],
    "replacedOwnership": true
  }
}
```

`auditLogId` is `null` for an exact `NO_OP`. GET assignment/user rows expose the current `ownershipToken`. Additive response fields are backward-compatible; `sourceGroup` remains nullable.

### Error Responses

| Status | Code/Reason | Notes |
|--------|-------------|-------|
| 400 | `INVALID_TARGET_USER` | User missing, deleted, inactive, or not role `USER` |
| 400 | `INVALID_TARGET_AGENT` | Agent missing, deleted, inactive, or not role `AGENT` |
| 428 | `OWNERSHIP_PRECONDITION_REQUIRED` | Missing ownership token |
| 409 | `OWNERSHIP_CHANGED` | Ownership changed since the client loaded it |
| 409 | `OWNERSHIP_EXISTS` | Existing ownership exists and `replaceExisting=false` |
| 401 | Unauthorized | No valid session |
| 403 | Forbidden | Actor is not exact admin |
| 500 | Server error | Unexpected failure |

### Postconditions

- The user has exactly one active agent assignment for `agentId`.
- The user has no `ManagerUser` rows.
- All other active agent assignments for the user are inactive with `endedAt`.
- One activity log records the transfer details.

## DELETE `/api/admin/agent-assignments`

Existing endpoint remains, but state refresh must stay consistent with the users page.

### Request Body

```json
{
  "assignmentId": "assignment_1",
  "expectedOwnershipToken": "ow1.example"
}
```

### Postconditions

- The assignment is inactive with `endedAt`.
- The user is not automatically reattached to a manager/admin owner.
- Activity log records the ended assignment.
