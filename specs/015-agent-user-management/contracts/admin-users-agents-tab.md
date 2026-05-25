# Contract: Admin Users Agents Tab

## GET `/api/admin/users?roleFilter=agents`

Lists agent accounts for the admin users page.

### Authorization

- Requires authenticated admin.

### Query Parameters

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `roleFilter` | string | Yes | Must be `agents` |
| `page` | integer | No | Defaults to `1`; minimum `1` |
| `limit` | integer | No | Defaults to existing users page limit |
| `search` | string | No | Matches username or email case-insensitively |

### Success Response

```json
{
  "users": [
    {
      "id": "agent_1",
      "username": "agent_one",
      "email": "agent_one@deshpanel.com",
      "role": "AGENT",
      "balance": 100,
      "isActive": true,
      "createdAt": "2026-05-25T12:00:00.000Z",
      "lastLoginAt": null,
      "assignedUsersCount": 12,
      "profile": {
        "displayName": "Agent One",
        "defaultSourceGroup": "main-group",
        "isActive": true
      },
      "points": {
        "available": 10,
        "lifetimeEarned": 15,
        "converted": 5,
        "reversed": 0,
        "legacy": 0
      }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### Error Responses

| Status | Reason |
|--------|--------|
| 401 | Not authenticated |
| 403 | Not admin |
| 429 | Rate limit exceeded |
| 500 | Server error |

## GET `/api/admin/users/counts`

### Success Response

```json
{
  "distributors": 3,
  "agents": 8,
  "users": 200
}
```

### UI Contract

- Add `agents` to tab count state.
- Add tab value `agents`.
- Display label `مندوبين` when Arabic translation exists; fallback `Agents`.
- Search, refresh, and pagination must work independently after tab switch.
