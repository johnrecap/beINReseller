# Contract: Admin Points Settings

## Purpose

Allow admins to control spend-based point earning and point-to-balance conversion.

## Authorization

- Exact `ADMIN` role required.
- Mobile bearer auth and web session auth may be accepted only if they resolve to an active admin.

## GET `/api/admin/points/settings`

Returns current settings, role default rates, owner overrides, and editable owner lists.

### Response 200

```json
{
  "settings": {
    "pointsEnabled": true,
    "pointsStartAt": "2026-05-25T10:00:00.000Z",
    "cashConversionPoints": 100,
    "cashConversionAmountUsd": 10
  },
  "defaults": {
    "userPointsPerThousand": 5,
    "agentPointsPerThousand": 2,
    "managerPointsPerThousand": 3
  },
  "agents": [
    {
      "id": "agent_1",
      "username": "agent1",
      "name": "Agent 1",
      "isActive": true,
      "overridePointsPerThousand": 0
    }
  ],
  "managers": [
    {
      "id": "manager_1",
      "username": "manager1",
      "isActive": true,
      "overridePointsPerThousand": null
    }
  ]
}
```

## PUT `/api/admin/points/settings`

Updates the complete active settings set.

### Request

```json
{
  "pointsEnabled": true,
  "pointsStartAt": "2026-05-25T10:00:00.000Z",
  "userPointsPerThousand": 5,
  "agentPointsPerThousand": 2,
  "managerPointsPerThousand": 3,
  "cashConversionPoints": 100,
  "cashConversionAmountUsd": 10,
  "agentOverrides": [
    { "agentId": "agent_1", "pointsPerThousand": 0 }
  ],
  "managerOverrides": [
    { "managerId": "manager_1", "pointsPerThousand": 4 }
  ]
}
```

### Response 200

```json
{
  "success": true
}
```

## Validation

- Earn rates must be finite numbers greater than or equal to zero.
- A zero override is valid and must be persisted as an active override.
- Conversion points and conversion amount must be positive numbers.
- `pointsStartAt` is required when `pointsEnabled=true`.
- Override owners must exist, be active or non-deleted, and match the expected role.

## Error Responses

- 400: invalid settings, invalid date, invalid conversion ratio, invalid override owner.
- 401: unauthenticated.
- 403: not admin.
- 500: server error.
