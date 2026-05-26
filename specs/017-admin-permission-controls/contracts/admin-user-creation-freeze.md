# Contract: Global Panel User Creation Freeze

## Purpose

Allow a protected admin to stop new panel user creation everywhere without disabling login or viewing existing accounts.

## Admin Reads Current State

`GET /api/admin/permissions/global`

**Success response**:

```json
{
  "settings": {
    "panel_user_creation_freeze": {
      "enabled": false,
      "reason": null,
      "updatedAt": null,
      "updatedBy": null
    }
  }
}
```

## Admin Updates Current State

`PATCH /api/admin/permissions/global/panel-user-creation-freeze`

**Request**:

```json
{
  "enabled": true,
  "reason": "Pause user creation during audit"
}
```

**Success response**:

```json
{
  "success": true,
  "setting": {
    "key": "panel_user_creation_freeze",
    "enabled": true,
    "reason": "Pause user creation during audit"
  }
}
```

## Enforcement

Blocked endpoints return:

```json
{
  "error": "User creation is currently disabled by the administrator.",
  "code": "PANEL_USER_CREATION_DISABLED"
}
```

HTTP status: `403`.

## Affected Flows

- Admin create panel user.
- Manager create managed user.
- Admin create user under agent.

## Out Of Scope

- Mobile/store customer registration.
- Login.
- Editing existing users.
