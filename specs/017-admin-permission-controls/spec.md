# Feature Specification: Admin Permission Controls

**Feature Branch**: `017-admin-permission-controls`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: "Review admin and manager roles. Admin must be able to restrict admins, managers, agents, or users from doing specific actions such as creating users, adding balance, withdrawing balance, resetting passwords, managing announcements, points, rewards, and similar actions. Also add a global control that can stop new user creation in the panel for all admins and managers."

## User Scenarios & Testing

### User Story 1 - Global User Creation Freeze (Priority: P1)

The owner admin needs one clear switch that prevents creating new panel users everywhere, including admin-created users and manager-created users.

**Why this priority**: This is the fastest safety control when user creation must be paused immediately.

**Independent Test**: Turn on the freeze from the admin panel, then attempt user creation from admin users page and manager dashboard. Both attempts must be blocked by the server and the UI must show that creation is disabled.

**Acceptance Scenarios**:

1. **Given** the global creation freeze is enabled, **When** any admin submits a new panel user form, **Then** the server rejects the request and no user is created.
2. **Given** the global creation freeze is enabled, **When** any manager submits a new managed user form, **Then** the server rejects the request and no user is created.
3. **Given** the global creation freeze is disabled, **When** a user with the create-user permission submits valid data, **Then** creation works normally.
4. **Given** the global creation freeze is enabled, **When** an admin opens the users page, **Then** create buttons are hidden or disabled with a clear message.

---

### User Story 2 - Role-Level Permission Control (Priority: P2)

The owner admin needs to disable or enable actions for an entire role, such as preventing all managers from creating users, adding balance, withdrawing balance, deleting users, or resetting passwords.

**Why this priority**: Most control needs are role-wide and should not require editing every individual account.

**Independent Test**: Disable a manager permission in the admin panel, log in as a manager, and verify both UI and API block that action while other allowed actions continue to work.

**Acceptance Scenarios**:

1. **Given** the manager create-user permission is disabled, **When** any manager opens the manager dashboard, **Then** the create-user action is not available.
2. **Given** the manager add-balance permission is disabled, **When** a manager calls the balance endpoint directly, **Then** the server returns a permission error.
3. **Given** the manager withdraw-balance permission remains enabled, **When** the manager withdraws from an owned user, **Then** the action still works if all existing balance rules pass.
4. **Given** an admin disables a permission for a role, **When** the change is saved, **Then** the change is recorded in the audit log.

---

### User Story 3 - Individual User Permission Overrides (Priority: P3)

The owner admin needs to restrict a specific admin, manager, agent, or user without changing the entire role.

**Why this priority**: Some accounts need exceptions, such as one manager being blocked from balance actions while other managers continue normally.

**Independent Test**: Disable create-user for one manager account only. That manager must be blocked, while another manager still can create users if the role permission and global freeze allow it.

**Acceptance Scenarios**:

1. **Given** a specific manager has create-user denied, **When** that manager submits the create-user form, **Then** the server rejects the action.
2. **Given** another manager has no deny override, **When** that manager submits the create-user form, **Then** the action follows the role setting.
3. **Given** a specific admin has an action denied, **When** that admin attempts the action directly through the API, **Then** the server blocks it.
4. **Given** a user-specific override is removed, **When** the user tries the action again, **Then** the role setting applies again.

---

### User Story 4 - Permission Management Safety And Audit (Priority: P4)

The owner admin needs permission changes to be safe, traceable, and protected from accidental lockout.

**Why this priority**: Permission control can lock critical staff out of money and user-management workflows if not guarded.

**Independent Test**: Attempt to remove the final protected admin's permission-management ability. The system must reject the change and log the attempt.

**Acceptance Scenarios**:

1. **Given** there is only one protected admin, **When** an admin attempts to remove that account's permission-management access, **Then** the system rejects the change.
2. **Given** an admin changes any role or user permission, **When** the save succeeds, **Then** the audit log records actor, target, old value, new value, and reason if provided.
3. **Given** a permission change is saved, **When** the target account refreshes the page, **Then** blocked UI actions reflect the new permission state.
4. **Given** a permission check fails, **When** the user sees the message, **Then** the message does not expose internal route names or stack traces.

### Edge Cases

- A user has a permission allowed by role but denied by user override: the deny override wins.
- A user has a permission denied by role but allowed by user override: the allow override wins only when the global freeze does not block the action.
- Global user creation freeze is enabled: it overrides role and user allows for all panel user creation.
- A disabled or deleted account must not regain access through cached permissions.
- Permission changes must not require the target user to log out and log back in to be enforced by APIs.
- Existing sessions may still show stale UI until refresh, but server-side checks must block immediately.
- The system must not rely on hidden buttons for security; direct API calls must be blocked.
- Mobile/store customer registration is out of scope unless explicitly added later; this feature targets panel user creation.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide an admin-only permission management page.
- **FR-002**: The system MUST define permission keys for sensitive actions, including panel user creation, user edit, user activation toggle, user deletion, password reset, balance add, balance withdraw, agent transfer, announcement management, points settings, rewards management, credit request approval, financial review decisions, and admin settings.
- **FR-003**: The system MUST support role-level permission settings for `ADMIN`, `MANAGER`, `AGENT`, and `USER`.
- **FR-004**: The system MUST support user-specific permission overrides that can allow or deny a permission for one account.
- **FR-005**: Permission evaluation MUST use this order: inactive/deleted account blocked, global hard blocks, user override, role setting, default role permissions.
- **FR-006**: A global panel user creation freeze MUST block all panel user creation from admin and manager flows.
- **FR-007**: The global creation freeze MUST NOT block login, viewing existing users, or editing unrelated settings.
- **FR-008**: UI controls for blocked actions MUST be hidden or disabled with a clear non-technical message.
- **FR-009**: Every protected API route MUST enforce permission checks on the server before mutation.
- **FR-010**: Direct API calls MUST fail with a consistent 403 response when permission is missing.
- **FR-011**: The system MUST prevent removing the last protected admin's ability to manage permissions.
- **FR-012**: Permission changes MUST be auditable with actor, target type, target id, permission key, previous value, new value, timestamp, and optional reason.
- **FR-013**: Existing role behavior MUST remain unchanged until a setting or override is explicitly configured.
- **FR-014**: The permission management page MUST show current effective permissions and whether each value comes from default, role setting, user override, or global block.
- **FR-015**: The implementation MUST include tests for manager create-user, manager balance add/withdraw, admin create-user, and protected-admin lockout prevention.

### Key Entities

- **Permission Key**: Named action that can be checked by UI and API, such as `users.create` or `balance.withdraw`.
- **Role Permission Setting**: Configured allow/deny value for a role and permission key.
- **User Permission Override**: Account-specific allow/deny value for a permission key.
- **Global Permission Setting**: System-wide hard block such as panel user creation freeze.
- **Protected Admin**: Admin account that must retain permission-management access to avoid lockout.
- **Permission Audit Event**: Log entry for permission configuration changes and rejected unsafe changes.

## Success Criteria

### Measurable Outcomes

- **SC-001**: When global panel user creation freeze is enabled, 100% of admin and manager user creation attempts are blocked by the server.
- **SC-002**: When a manager permission is disabled at role level, direct API calls for that action return 403 while unrelated manager actions still work.
- **SC-003**: A user-specific deny override blocks exactly that account and does not affect other accounts with the same role.
- **SC-004**: Permission changes are visible in audit logs with actor, target, permission key, old value, and new value.
- **SC-005**: The system refuses any change that would leave no protected admin able to manage permissions.
- **SC-006**: Existing behavior remains unchanged for permissions that have no configured role setting, no user override, and no global block.

## Assumptions

- Existing authentication and role fields remain the base identity model.
- Existing `settings` and `activity_logs` patterns can be reused, but a dedicated permission table may be safer for structured queries.
- Panel user creation means creating `User` records from admin or manager panel workflows.
- Mobile/store customer registration is not part of this feature unless requested separately.
- The initial protected admin can be determined by an existing admin account selected during rollout or by a migration/seed step.
