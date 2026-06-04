# API Contract: Admin Points Settings And Point Award Behavior

## GET /api/admin/points/settings

**Authorization**: Exact admin only.

**Purpose**: Load the admin-visible points settings screen.

**Response 200**:

```json
{
  "settings": {
    "pointsEnabled": true,
    "pointsStartAt": "2026-05-27T22:01:00.000Z",
    "cashConversionPoints": 100,
    "cashConversionAmountUsd": 10,
    "managerOwnedUserPointsEnabled": false
  },
  "defaults": {
    "userGlobalPointsPerThousand": 5,
    "managerOwnedUserPointsPerThousand": 0,
    "agentDefaultPointsPerThousand": 5,
    "managerDefaultPointsPerThousand": 10
  },
  "agents": [
    {
      "id": "agent-id",
      "username": "agent",
      "name": "Agent",
      "isActive": true,
      "overridePointsPerThousand": null
    }
  ],
  "managers": [
    {
      "id": "manager-id",
      "username": "manager",
      "isActive": true,
      "overridePointsPerThousand": null
    }
  ]
}
```

**Rules**:

- Response uses current field names.
- Legacy alias fields are not required in the response.
- Deleted users are excluded from override lists.

## PUT /api/admin/points/settings

**Authorization**: Exact admin only.

**Purpose**: Save point program settings, default rates, and overrides atomically.

**Request body**:

```json
{
  "pointsEnabled": true,
  "pointsStartAt": "2026-05-27T22:01:00.000Z",
  "cashConversionPoints": 100,
  "cashConversionAmountUsd": 10,
  "managerOwnedUserPointsEnabled": true,
  "userGlobalPointsPerThousand": 5,
  "managerOwnedUserPointsPerThousand": 2,
  "agentDefaultPointsPerThousand": 5,
  "managerDefaultPointsPerThousand": 10,
  "agentOverrides": [
    { "agentId": "agent-id", "pointsPerThousand": 3 }
  ],
  "managerOverrides": [
    { "managerId": "manager-id", "pointsPerThousand": 4 }
  ]
}
```

**Compatibility rule**:

- If legacy names such as `userPointsPerThousand`, `agentPointsPerThousand`, or `managerPointsPerThousand` are present with current names, current names win.

**Response 200**:

```json
{
  "success": true,
  "settings": {
    "pointsEnabled": true,
    "pointsStartAt": "2026-05-27T22:01:00.000Z",
    "cashConversionPoints": 100,
    "cashConversionAmountUsd": 10,
    "managerOwnedUserPointsEnabled": true
  },
  "defaults": {
    "userGlobalPointsPerThousand": 5,
    "managerOwnedUserPointsPerThousand": 2,
    "agentDefaultPointsPerThousand": 5,
    "managerDefaultPointsPerThousand": 10
  }
}
```

**Response 400 examples**:

```json
{
  "error": "Invalid points settings data",
  "details": {
    "fieldErrors": {
      "managerOwnedUserPointsPerThousand": ["Rate must be 0 or greater"]
    }
  }
}
```

```json
{
  "error": "Duplicate override owners",
  "duplicateAgentIds": ["agent-id"],
  "duplicateManagerIds": []
}
```

## Internal Operation Award Behavior

**Purpose**: Define recipient behavior for completed renewal operations.

**Manager-owned user disabled**:

```json
{
  "operationOwner": "user-under-manager",
  "managerOwnedUserPointsEnabled": false,
  "recipients": [
    { "role": "MANAGER", "rateKind": "MANAGER" }
  ]
}
```

**Manager-owned user enabled**:

```json
{
  "operationOwner": "user-under-manager",
  "managerOwnedUserPointsEnabled": true,
  "recipients": [
    { "role": "MANAGER", "rateKind": "MANAGER" },
    { "role": "USER", "rateKind": "MANAGER_OWNED_USER" }
  ]
}
```

**Rules**:

- Manager recipient behavior remains unchanged.
- User recipient is added only when enabled, the operation user is active, and the dedicated rate produces positive points.
- Worker and web award paths must produce the same recipient list for the same input state.
