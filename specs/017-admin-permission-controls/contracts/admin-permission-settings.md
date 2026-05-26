# Contract: Admin Permission Settings

## Purpose

Allow protected admins to configure role permissions and user-specific overrides.

## List Permission Catalog

`GET /api/admin/permissions/catalog`

**Success response**:

```json
{
  "permissions": [
    {
      "key": "users.create",
      "category": "users",
      "label": "Create users",
      "description": "Create panel user accounts",
      "riskLevel": "high"
    }
  ]
}
```

## Read Role Settings

`GET /api/admin/permissions/roles`

**Success response**:

```json
{
  "roles": [
    {
      "role": "MANAGER",
      "permissions": [
        {
          "key": "manager.users.create",
          "defaultEffect": "allow",
          "configuredEffect": "deny",
          "effectiveEffect": "deny"
        }
      ]
    }
  ]
}
```

## Save Role Setting

`PATCH /api/admin/permissions/roles/MANAGER`

**Request**:

```json
{
  "permissionKey": "manager.users.create",
  "effect": "deny",
  "reason": "Temporarily stop manager-created users"
}
```

**Success response**:

```json
{
  "success": true,
  "role": "MANAGER",
  "permissionKey": "manager.users.create",
  "effect": "deny"
}
```

## Save User Override

`PATCH /api/admin/permissions/users/{userId}`

**Request**:

```json
{
  "permissionKey": "balance.withdraw",
  "effect": "deny",
  "reason": "Manual review"
}
```

**Success response**:

```json
{
  "success": true,
  "userId": "user-id",
  "permissionKey": "balance.withdraw",
  "effect": "deny"
}
```

## Delete User Override

`DELETE /api/admin/permissions/users/{userId}?permissionKey=balance.withdraw`

**Success response**:

```json
{
  "success": true
}
```

## Errors

- `403 PERMISSION_DENIED`: actor cannot manage permissions.
- `400 UNKNOWN_PERMISSION`: permission key is not in catalog.
- `409 PROTECTED_ADMIN_LOCKOUT`: requested change would leave no protected admin with permission-management access.
