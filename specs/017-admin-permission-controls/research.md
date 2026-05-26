# Research: Admin Permission Controls

## Decision: Add dynamic permissions on top of current static roles

**Rationale**: The current app has static roles in `src/lib/permissions.ts` and many APIs call `requireRoleAPIWithMobile()` directly. This is not enough for "admin can restrict a manager from creating users or moving balance" because role checks allow the whole role.

**Alternatives considered**:
- Keep static roles only: rejected because admins cannot change behavior from the panel.
- Hide buttons only: rejected because direct API calls would still work.
- Replace roles completely: rejected because it is high risk and would touch too much of the system at once.

## Decision: Permission deny/allow must be enforced server-side

**Rationale**: UI hiding improves user experience, but the security boundary is the API route or shared service. Sensitive mutations include creating users, changing balances, deleting users, password reset, settings, announcements, points, rewards, credit requests, and financial review.

**Alternatives considered**:
- Client-only permission gating: rejected because it is not secure.
- Middleware route prefixes only: rejected because some routes contain multiple actions with different permissions.

## Decision: Add a global panel user creation freeze

**Rationale**: The user explicitly requested the ability to stop new user creation for all admins and managers. This must be a hard global block that overrides role and user-specific allows.

**Alternatives considered**:
- Disable create permission for admin and manager roles separately: rejected because it is slower and easier to misconfigure during an emergency.
- Keep only per-user restrictions: rejected because the requested behavior is global.

## Decision: Preserve default behavior until configured

**Rationale**: Existing production behavior must not change merely because the feature is deployed. If no permission row or setting exists, current role defaults continue to decide access.

**Alternatives considered**:
- Start with all permissions denied until configured: rejected because it can break production immediately.
- Require a migration backfill for every role/permission: useful for UI visibility but should not be required for safe runtime behavior.

## Decision: Protect at least one admin from lockout

**Rationale**: Permission management can accidentally remove access to permission management itself. The system must preserve at least one protected admin with the ability to manage permissions and disable the global freeze.

**Alternatives considered**:
- Trust operators not to remove their own access: rejected because a bad click can lock the panel.
- Require direct database repair after lockout: rejected for production safety.
