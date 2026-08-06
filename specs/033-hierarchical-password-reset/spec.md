# Feature Specification: Hierarchical Password Reset

**Feature Branch**: 033-hierarchical-password-reset

**Created**: 2026-08-07

**Status**: Approved for implementation

**Input**: Allow each account to change its own password, while allowing an authorized direct owner to set a forgotten password for accounts immediately below it.

## Clarifications

### Session 2026-08-07

- Q: Who may reset another account? A: Admin may reset active manager, agent, and user accounts except itself or another admin; managers and agents may reset only their currently direct active users.
- Q: How are old sessions handled? A: Every successful reset invalidates all existing sessions immediately.
- Q: Is a public forgot-password form allowed? A: No; the login page only tells the person to contact the account supervisor.
- Q: Is a temporary password or forced next-login change required? A: No; the supervisor enters the final password, and the user can use it immediately.
- Q: Does this affect the database schema or Worker? A: No; the existing password-change timestamp is sufficient and the Worker is out of scope.

## User Scenarios & Testing

### User Story 1 - Direct Owner Restores User Access (Priority: P1)

An authorized admin, manager, or agent can set a new password for an active account directly below it when the account holder cannot sign in.

**Why this priority**: This is the recovery path that is currently missing.

**Independent Test**: Reset a directly owned active user, then confirm the new password works, old sessions stop working, and no unrelated account can be changed.

**Acceptance Scenarios**:

1. **Given** an admin and an active manager, agent, or user, **When** the admin enters and confirms a valid new password, **Then** the target password changes and all target sessions become invalid.
2. **Given** a manager and a directly managed active user, **When** the manager resets the password, **Then** the reset succeeds.
3. **Given** an agent and a currently assigned active user, **When** the agent resets the password, **Then** the reset succeeds.
4. **Given** ownership changed before the reset commits, **When** the former owner attempts the reset, **Then** no password data changes.

---

### User Story 2 - Self-Service Password Change Remains Safe (Priority: P1)

Every panel account can continue changing its own password by proving knowledge of the current password.

**Why this priority**: Adding supervisor recovery must not weaken or remove the existing self-service flow.

**Independent Test**: Each panel role changes only its own password after entering the current password, and an old session is rejected afterward.

**Acceptance Scenarios**:

1. **Given** any active panel account, **When** it supplies the correct current password and a valid new password, **Then** only that account changes.
2. **Given** an incorrect current password, **When** self-change is attempted, **Then** the password remains unchanged.
3. **Given** an old web or mobile session, **When** the password has changed, **Then** protected panel requests reject that session.

---

### User Story 3 - Reset Controls Are Clear And Localized (Priority: P2)

Authorized supervisors can find one consistent reset dialog in their user lists, while unauthorized users do not see the action.

**Why this priority**: A sensitive action must be understandable and difficult to trigger accidentally.

**Independent Test**: Review admin, manager, and agent user lists in Arabic, English, and Bengali and confirm the same fields, warning, loading, success, and error states are present only for authorized actors.

**Acceptance Scenarios**:

1. **Given** reset permission is allowed, **When** a supervisor opens a supported user list, **Then** a reset action opens fields for new password and confirmation plus a session-closure warning.
2. **Given** reset permission is denied, **When** the user list is shown, **Then** the reset action is absent.
3. **Given** mismatched or weak input, **When** submission is attempted, **Then** the dialog explains the issue without sending a reset request.
4. **Given** a person selects forgot password on login, **When** guidance appears, **Then** it directs them to their account supervisor and exposes no username-based reset form.

### Edge Cases

- Admin attempts to reset itself or another admin.
- Manager or agent targets a manager, agent, admin, unowned user, or a user owned by someone else.
- Target is inactive, soft-deleted, missing, or not a normal user where direct ownership is required.
- User has conflicting manager and agent ownership evidence.
- Ownership is transferred concurrently with reset.
- Actor-specific reset permission is disabled or explicitly denied.
- More than three attempts are made for the same supervisor and target within one hour.
- Request body is missing, malformed, contains an empty password, or contains fewer than six characters.
- Audit data must never contain the password or password hash.

## Requirements

### Functional Requirements

- **FR-001**: Every active panel account MUST continue changing only its own password after providing its current password.
- **FR-002**: Admin MUST be allowed to reset active manager, agent, and user accounts, and MUST NOT reset itself or another admin.
- **FR-003**: Manager MUST be allowed to reset only active normal users with one current direct manager link to that manager.
- **FR-004**: Agent MUST be allowed to reset only active normal users with one current active assignment to that agent.
- **FR-005**: Normal users MUST NOT reset another account.
- **FR-006**: Every supervisor reset MUST require the users.reset_password permission after default role, configured role, per-account override, and any applicable global-block evaluation.
- **FR-007**: The reset request MUST accept one new password of at least six characters and MUST never return it.
- **FR-008**: The interface MUST require matching password confirmation before submission and provide show/hide and strength feedback.
- **FR-009**: A successful password change or reset MUST invalidate all existing web and mobile panel sessions for the target.
- **FR-010**: Ownership, actor status, target status, and target role MUST be revalidated while the target is locked before changing credentials.
- **FR-011**: Conflicting, missing, expired, transferred, or indirect ownership MUST fail closed without credential changes.
- **FR-012**: The system MUST limit supervisor reset attempts to three per supervisor-target pair per rolling hour.
- **FR-013**: Reset outcomes MUST use stable codes: PASSWORD_RESET_SUCCESS, INVALID_PASSWORD, PERMISSION_DENIED, PASSWORD_RESET_NOT_ALLOWED, TARGET_USER_NOT_FOUND, OWNERSHIP_CONFLICT, and RATE_LIMITED.
- **FR-014**: Successful resets MUST record actor, target, actor role, target role, ownership kind, IP address, and user agent without recording the password or hash.
- **FR-015**: Admin, manager, and agent user lists MUST use one shared localized reset dialog and hide its action when effective permission is denied.
- **FR-016**: The login forgot-password guidance MUST direct panel users to their account supervisor without exposing a public username-based reset form.
- **FR-017**: Existing inactive or deleted accounts MUST be activated/restored before their password can be reset.
- **FR-018**: The feature MUST NOT alter balances, ownership, operations, points, transactions, database schema, or Worker behavior.

### Key Entities

- **Reset actor**: The authenticated admin, manager, or agent requesting a supervisor reset.
- **Target account**: The active account whose password will be changed.
- **Current ownership evidence**: The direct manager link or active agent assignment locked and rechecked during reset.
- **Effective reset permission**: The existing permission decision after default role settings and configured overrides are applied.
- **Password-change timestamp**: Existing account evidence used to reject sessions created before the latest credential change.
- **Audit record**: A privacy-safe record of who reset which account and under which ownership relationship.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All accepted admin, manager, and agent ownership scenarios complete with one password change and one audit record.
- **SC-002**: All forbidden role, ownership, status, and conflict scenarios produce zero password changes.
- **SC-003**: 100% of previously issued panel web and mobile sessions are rejected after a successful reset or self-change.
- **SC-004**: The fourth reset attempt for the same supervisor-target pair within one hour is rejected, while a different target retains its own allowance.
- **SC-005**: No reset response, application log, or audit record contains the new password or its hash.
- **SC-006**: Arabic, English, and Bengali interfaces expose equivalent reset meanings and support RTL where applicable.
- **SC-007**: Existing password self-service behavior remains available to all four panel roles.

## Assumptions

- Manager and agent ownership are parallel; there is no manager-to-agent ownership chain.
- Six characters remains the existing minimum password rule for compatibility.
- A supervisor enters the final password; there is no temporary-password lifecycle.
- The current account permission system remains the source of truth for action visibility and server authorization.
- Production, its live database, and running processes are not used during implementation or verification.
