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
  "sourceGroup": "main-group",
  "replaceExisting": true
}
```

### Request Rules

- `userId` must identify a non-deleted active `USER`.
- `agentId` must identify a non-deleted active `AGENT`.
- `sourceGroup` may be omitted or blank only when the target agent has a non-empty default source group.
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
    "sourceGroup": "main-group",
    "createdAt": "2026-05-25T12:00:00.000Z"
  },
  "transfer": {
    "mode": "transferred",
    "previousManagerOwnerIds": ["manager_1"],
    "previousAgentAssignmentIds": ["old_assignment_1"],
    "replacedOwnership": true
  }
}
```

### Error Responses

| Status | Code/Reason | Notes |
|--------|-------------|-------|
| 400 | `INVALID_TARGET_USER` | User missing, deleted, inactive, or not role `USER` |
| 400 | `INVALID_TARGET_AGENT` | Agent missing, deleted, inactive, or not role `AGENT` |
| 400 | `SOURCE_GROUP_REQUIRED` | No source group supplied and no agent default |
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
  "assignmentId": "assignment_1"
}
```

### Postconditions

- The assignment is inactive with `endedAt`.
- The user is not automatically reattached to a manager/admin owner.
- Activity log records the ended assignment.
