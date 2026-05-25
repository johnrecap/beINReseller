# Contract: Admin Create User Under Agent

## POST `/api/admin/users`

Creates an admin-managed account. This feature extends the existing request with optional agent ownership for new `USER` accounts.

### Authorization

- Requires authenticated admin.

### Request Body For Agent-Owned User

```json
{
  "username": "new_user",
  "email": "new_user@deshpanel.com",
  "password": "secret123",
  "role": "USER",
  "balance": 0,
  "agentId": "agent_1",
  "sourceGroup": "main-group"
}
```

### Request Rules

- `agentId` and `sourceGroup` are only valid when `role=USER`.
- If `agentId` is provided, the new user is created with one active agent assignment and no manager/admin owner link.
- If `agentId` is omitted and `role=USER`, the existing admin-created user behavior remains unless changed by implementation tasks.
- If `sourceGroup` is blank and the agent has `defaultSourceGroup`, the default is used.
- Duplicate username or email rejects the whole transaction.

### Success Response

```json
{
  "success": true,
  "user": {
    "id": "user_1",
    "username": "new_user",
    "email": "new_user@deshpanel.com",
    "role": "USER",
    "balance": 0,
    "isActive": true
  },
  "assignment": {
    "id": "assignment_1",
    "agentId": "agent_1",
    "sourceGroup": "main-group"
  }
}
```

### Error Responses

| Status | Reason |
|--------|--------|
| 400 | Invalid username, email, password, role, balance, agent, or source group |
| 400 | Username or email already exists |
| 401 | Not authenticated |
| 403 | Not admin |
| 500 | Server error |

### UI Contract

- From the agents tab, the add-user action passes the selected agent id.
- Source group is prefilled from agent default when available.
- On success, agents count, assigned-user count, and users list refresh.
