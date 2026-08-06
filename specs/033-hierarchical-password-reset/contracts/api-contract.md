# API Contract: Hierarchical Password Reset

## Endpoints

- POST /api/admin/users/:id/reset-password
- POST /api/manager/users/:id/reset-password
- POST /api/agent/users/:id/reset-password

## Request

Content-Type: application/json

    {
      "newPassword": "new final password"
    }

Rules:

- newPassword is required.
- Minimum length is six characters.
- Unknown fields do not grant additional behavior.

## Success

HTTP 200

    {
      "success": true,
      "code": "PASSWORD_RESET_SUCCESS"
    }

The response never includes a plaintext password or password hash.

## Errors

All errors include a stable code and no credential data.

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | INVALID_PASSWORD | Missing, malformed, or shorter than six characters |
| 401 | PERMISSION_DENIED | No valid current panel session/token |
| 403 | PERMISSION_DENIED | Effective permission or adapter role denied |
| 403 | PASSWORD_RESET_NOT_ALLOWED | Actor/target role combination is forbidden |
| 404 | TARGET_USER_NOT_FOUND | Target is absent, inactive, or deleted |
| 409 | OWNERSHIP_CONFLICT | Direct ownership is missing, conflicting, or changed |
| 429 | RATE_LIMITED | More than three attempts for this actor-target pair in one hour |

## Authorization Matrix

| Actor | Allowed target | Required current relationship |
|-------|----------------|-------------------------------|
| ADMIN | MANAGER, AGENT, USER | None |
| MANAGER | USER | Exactly one direct ManagerUser link to actor; no active agent assignment |
| AGENT | USER | Exactly one active AgentAssignment to actor; no manager link |
| USER | None | Not applicable |

Admin cannot reset itself or another ADMIN.

## Atomicity

The target lock, ownership re-read, password update, passwordChangedAt update, and audit insert form one transaction. A failed transaction changes none of them.
