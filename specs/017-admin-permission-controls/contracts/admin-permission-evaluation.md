# Contract: Permission Evaluation

## Purpose

Provide a consistent response shape for UI checks and direct API failures.

## UI Effective Permissions

`GET /api/admin/permissions/effective?userId={userId}`

**Success response**:

```json
{
  "userId": "user-id",
  "role": "MANAGER",
  "permissions": [
    {
      "key": "manager.users.create",
      "allowed": false,
      "source": "role_setting",
      "globalBlock": null
    },
    {
      "key": "balance.add",
      "allowed": true,
      "source": "default",
      "globalBlock": null
    }
  ]
}
```

## Mutation Failure Shape

Any protected mutation that fails due to permissions returns:

```json
{
  "error": "You do not have permission to perform this action.",
  "code": "PERMISSION_DENIED",
  "permissionKey": "balance.withdraw"
}
```

HTTP status: `403`.

## Rules

- API routes must check permissions before writes.
- UI effective permissions are advisory only.
- Direct API calls must use the same evaluator as the UI.
- Global blocks return their own code when more specific than a generic permission failure.
