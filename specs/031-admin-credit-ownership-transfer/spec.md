# Feature Specification: Admin Credit Requests And Unified Ownership Transfer

**Feature Branch**: `codex/031-admin-credit-ownership-transfer`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Allow users under admin to request credit. Allow admin to transfer any user between admin, managers/distributors, agents, and other owners safely."

## User Scenarios & Testing

### User Story 1 - Admin-Owned Users Can Request Credit (Priority: P1)

A normal user owned directly by the admin can submit a credit request from the user dashboard, and the request reaches admin review without requiring an agent assignment.

**Why this priority**: This is the immediate blocked workflow. It is lower risk than changing all ownership transfers because credit requests already support nullable agent snapshots.

**Independent Test**: Create or identify an active normal user owned by an admin, submit a credit request, and confirm it appears in admin review with an admin-owner label and no fake agent values.

**Acceptance Scenarios**:

1. **Given** an active normal user is owned directly by an active admin, **When** the user submits a credit request, **Then** the request is accepted and shown to admin review as admin-owned.
2. **Given** an active normal user is owned by an active agent, **When** the user submits a credit request, **Then** the existing agent-owned behavior remains unchanged.
3. **Given** an active normal user is owned by a manager/distributor, **When** the user submits a credit request, **Then** the request remains blocked unless that rule is explicitly changed later.
4. **Given** a user has no clear current owner, **When** the user submits a credit request, **Then** the request is blocked with a clear reason instead of being routed by guesswork.

---

### User Story 2 - Admin-Owned Credit Notifications And WhatsApp Handoff Are Correct (Priority: P1)

When an admin-owned user requests credit, Telegram shows that the request belongs to the admin pool, and WhatsApp handoff after approval uses the global WhatsApp destination instead of looking up a later or old agent assignment.

**Why this priority**: Opening admin-owned credit requests without fixing notifications can send requests to the wrong person or make the admin believe an agent is involved when there is none.

**Independent Test**: Submit an admin-owned user credit request with Telegram enabled, approve it, and confirm Telegram plus WhatsApp handoff use admin/default labels and destinations.

**Acceptance Scenarios**:

1. **Given** Telegram alerts are enabled and configured, **When** an admin-owned user submits a credit request, **Then** the Telegram message includes the customer, amount, payment method, and owner as admin/direct without fake agent labels.
2. **Given** an admin-owned request has no agent snapshot, **When** the admin approves it, **Then** WhatsApp handoff uses the saved default WhatsApp link or phone.
3. **Given** an admin-owned request is retried from admin review, **When** notification retry runs, **Then** the message still uses admin/direct owner wording.
4. **Given** the global WhatsApp destination is missing, **When** approval is completed, **Then** the admin sees a clear handoff warning rather than a wrong agent destination.

---

### User Story 3 - Admin Can Transfer User Ownership To One Current Owner (Priority: P2)

An admin can move a user between admin, manager/distributor, and agent ownership, and the user ends up with exactly one current owner in the application view.

**Why this priority**: The current agent transfer path can leave users visible under old admin or manager ownership. A unified transfer rule prevents duplicate ownership.

**Independent Test**: Transfer the same normal user from admin to agent, agent to manager, manager to admin, and manager to another agent. After each transfer, confirm the user appears only under the new owner and no longer under the old owner.

**Acceptance Scenarios**:

1. **Given** a normal user is owned by admin, **When** admin transfers the user to an agent, **Then** the admin/manager ownership link is removed and one active agent ownership is created.
2. **Given** a normal user is owned by an agent, **When** admin transfers the user to a manager/distributor, **Then** active agent ownership is closed and one manager ownership link is created.
3. **Given** a normal user is owned by a manager/distributor, **When** admin transfers the user to admin, **Then** manager ownership is removed and admin ownership is created.
4. **Given** a normal user has dirty historical ownership data, **When** admin transfers the user, **Then** the transfer cleanup leaves one current owner and records what was cleaned up.

---

### User Story 4 - Admin UI Makes Current Owner And Transfer Target Clear (Priority: P3)

The admin users screen clearly shows who currently owns each user and gives one transfer action that supports admin, manager/distributor, and agent targets.

**Why this priority**: The backend rules must be safe first, but the admin needs a clear workflow to avoid repeating the old wrong transfer behavior.

**Independent Test**: Open the admin users page, search for a user, inspect the displayed owner, open transfer, select each target type, and confirm only the relevant fields are shown.

**Acceptance Scenarios**:

1. **Given** a user is admin-owned, **When** the admin users list loads, **Then** the current owner is shown as admin/direct.
2. **Given** a user is manager-owned or agent-owned, **When** the list loads, **Then** the current owner label shows the correct owner name/type.
3. **Given** admin opens the transfer dialog, **When** the target type is admin or manager, **Then** agent-only fields are hidden.
4. **Given** admin opens the transfer dialog, **When** the target type is agent, **Then** source group and WhatsApp group fields are available.

### Edge Cases

- A user may have both a manager/admin link and an active agent assignment from old data; current classification must prefer explicit active ownership rules and the transfer cleanup must close duplicates.
- A user may have multiple manager/admin links; transfer cleanup must remove all old current links before creating the selected owner link.
- A user may have multiple active agent assignments; transfer cleanup must close all active assignments before creating a new active one.
- A legacy admin-created user may have no manager link but was created by an admin; the plan may treat this as admin-owned only as a legacy fallback until cleanup runs.
- Deleted or inactive target owners cannot receive transferred users.
- Deleted or inactive normal users cannot submit new credit requests or be transferred as active accounts.
- Historical credit requests keep their original snapshots and are not rewritten.
- A new admin-owned credit request must not later resolve an agent just because the user receives an agent assignment after the request was created.
- Telegram tokens, beIN passwords, sessions, cookies, TOTP secrets, and provider credentials must not be exposed in logs or UI responses.

## Requirements

### Functional Requirements

- **FR-001**: System MUST classify each normal user's current owner as admin-owned, manager-owned, agent-owned, legacy admin-owned, or unowned.
- **FR-002**: System MUST allow active admin-owned and active legacy admin-owned normal users to submit credit requests.
- **FR-003**: System MUST preserve existing agent-owned credit request behavior.
- **FR-004**: System MUST continue blocking manager-owned and unowned users from requesting credit unless a later approved rule changes that behavior.
- **FR-005**: System MUST store enough ownership evidence on new credit requests to distinguish admin-owned, agent-owned, and legacy/admin fallback requests.
- **FR-006**: System MUST send Telegram credit request messages with truthful owner labels and no fake agent values.
- **FR-007**: System MUST route WhatsApp handoff for admin-owned credit requests to the configured default WhatsApp destination only.
- **FR-008**: System MUST avoid resolving a current agent assignment for a credit request that was created without an agent snapshot.
- **FR-009**: System MUST provide one admin transfer action that can target admin, manager/distributor, or agent ownership.
- **FR-010**: System MUST remove all previous current manager/admin ownership links and active agent assignments before creating the selected new current owner.
- **FR-011**: System MUST validate that transfer targets are active, not deleted, and have the expected role.
- **FR-012**: System MUST record an audit entry for every ownership transfer, including previous current owners, previous active agent assignments, new owner, actor, and timestamp.
- **FR-013**: System MUST keep `createdBy` historical and not use it as the main current-owner source except for documented legacy admin fallback.
- **FR-014**: System MUST not change customer balances, operations, points, transaction history, or historical credit request decisions during ownership transfer.
- **FR-015**: System MUST add focused tests for owner classification, admin-owned credit request creation, Telegram formatting, WhatsApp handoff, and all transfer directions.
- **FR-016**: System MUST include a pre-deployment data audit for users with multiple current owners, both manager and agent ownership, or no clear owner.

### Key Entities

- **Current owner classification**: The resolved current owner state for a normal user, including owner type, owner id, owner label, and whether the result is legacy fallback.
- **Credit request**: A user's request for balance top-up, including amount, payment method, notes, status, owner snapshot, notification status, and handoff data.
- **Ownership transfer**: The admin action that moves one user to admin, manager/distributor, or agent ownership.
- **Manager/admin ownership link**: The record connecting a normal user to an admin or manager/distributor owner.
- **Agent assignment**: The record connecting a normal user to an agent, source group, and optional WhatsApp group.
- **Audit entry**: The immutable record describing who performed a transfer and what previous ownership data was closed or replaced.
- **Notification destination**: The Telegram target and default WhatsApp handoff destination used by credit request notifications.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of active admin-owned users in focused tests can submit credit requests without an agent assignment.
- **SC-002**: 100% of manager-owned and unowned users in focused tests remain blocked from credit requests.
- **SC-003**: 100% of admin-owned credit request notification tests show admin/direct owner wording and no fake agent values.
- **SC-004**: 100% of admin-owned WhatsApp handoff tests use default WhatsApp destinations and do not resolve later agent assignments.
- **SC-005**: 100% of tested transfer directions leave exactly one current owner visible in the application result.
- **SC-006**: Every successful transfer creates one audit entry with old owner evidence and new owner evidence.
- **SC-007**: No tested ownership transfer changes balances, operation records, point ledger rows, or historical credit request decisions.
- **SC-008**: The deployment checklist includes data audit results or a documented decision to proceed without strict database ownership indexes.

## Assumptions

- "Managers/distributors" in this feature means users with the manager-style ownership role currently used by the admin users area.
- "Agents" means the existing agent assignment ownership path with source group and WhatsApp group metadata.
- Admin-owned users should use the global/default WhatsApp handoff destination after credit request approval.
- Manager-owned users remain blocked from direct credit requests in this version because the current business flow for manager-owned top-ups is not yet approved.
- Historical ownership evidence is preserved; only current ownership is changed by transfer.
- Strict database uniqueness for ownership may be deferred until existing production data is audited.
