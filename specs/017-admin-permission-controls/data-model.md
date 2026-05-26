# Data Model: Admin Permission Controls

## Permission Catalog

Represents a known action the system can guard.

**Fields**:
- `key`: Stable permission key, for example `users.create`, `balance.add`, `balance.withdraw`.
- `label`: Human-readable admin label.
- `category`: Group shown in admin UI, for example users, balance, settings, rewards.
- `description`: What the permission allows.
- `riskLevel`: Low, medium, high, or critical.

**Rules**:
- Permission keys are code-defined to avoid invalid keys.
- Unknown keys must be rejected by admin APIs.

## Role Permission Setting

Represents an admin-configured value for a role.

**Fields**:
- `role`: ADMIN, MANAGER, AGENT, or USER.
- `permissionKey`: Known permission key.
- `effect`: allow or deny.
- `updatedByUserId`: Admin actor.
- `updatedAt`: Timestamp.

**Rules**:
- One setting per role and permission key.
- Missing setting means use existing default role permissions.

## User Permission Override

Represents an exception for one account.

**Fields**:
- `userId`: Target account.
- `permissionKey`: Known permission key.
- `effect`: allow or deny.
- `reason`: Optional admin note.
- `updatedByUserId`: Admin actor.
- `updatedAt`: Timestamp.

**Rules**:
- One override per user and permission key.
- User override wins over role setting unless a global hard block applies.
- Overrides for deleted users remain visible in audit/history but are not effective.

## Global Permission Setting

Represents hard system-wide switches.

**Fields**:
- `key`: Example `panel_user_creation_freeze`.
- `enabled`: Boolean.
- `reason`: Optional admin note.
- `updatedByUserId`: Admin actor.
- `updatedAt`: Timestamp.

**Rules**:
- Global freeze blocks panel user creation for admins and managers.
- Global freeze does not block login, viewing users, or existing account operations unrelated to creating users.

## Protected Admin

Represents an admin account that must retain permission-management access.

**Fields**:
- `userId`: Admin account id.
- `protected`: Boolean.
- `createdByUserId`: Admin actor.
- `createdAt`: Timestamp.

**Rules**:
- At least one active protected admin must remain.
- Permission changes cannot remove all permission-management access from protected admins.

## Permission Audit Event

Represents traceability for all permission changes and rejected unsafe changes.

**Fields**:
- `actorUserId`: Admin who attempted the change.
- `targetType`: role, user, global, or protected_admin.
- `targetId`: Role name, user id, or setting key.
- `permissionKey`: Permission key when applicable.
- `oldValue`: Previous value.
- `newValue`: New value.
- `result`: success or rejected.
- `reason`: Optional admin note or rejection reason.
- `createdAt`: Timestamp.

**Rules**:
- Every successful permission change creates an audit event.
- Unsafe rejected changes also create an audit event when possible.
