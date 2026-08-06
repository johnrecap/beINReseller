# Feature Specification: Agent User Management

**Feature Branch**: `codex/015-agent-user-management`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "Admin users page currently has two tabs for distributors/managers and users. Add a third AGENT tab named Mandobeen. Also allow admins to add users under each agent and transfer existing users from any manager, admin-owned account, or another agent to any other agent."

## Clarifications

### Session 2026-05-25

- Q: What should happen when a user is moved from a manager or admin owner to an agent? -> A: The previous manager/admin ownership must be ended before the new active agent assignment is created, so the user has one active owner path for future workflows.
- Q: What should happen when a user already belongs to another agent? -> A: The old active agent assignment must be ended and replaced with the new agent assignment in the same admin action.
- Q: Should historical points or old spend be recalculated after transfer? -> A: No. An operation completed after transfer captures the new owner at completion; an operation completed before transfer retains its captured prior owner even if ledger finalization happens later.
- Q: What should the new admin users tab be called? -> A: `مندوبين` in Arabic UI, with `Agents` as English fallback.
- Q: Is Source Group required? -> A: No as of the 2026-08-06 amendment. It is nullable assignment metadata; omitted, explicitly cleared, and explicitly supplied values have distinct semantics defined by Spec 031.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Agents In Users Page (Priority: P1)

Admins need the users management page to show agents as a first-class tab beside distributors and users. Each agent row must expose the same operational controls as other accounts plus assigned-user count, balance, and point summary.

**Why this priority**: Admins cannot manage agent ownership from the users page until agents are visible in the same workflow.

**Independent Test**: Open the admin users page, select `مندوبين`, search for an agent, and verify returned rows include agent account identity, balance, point summary, active status, assigned-user count, created date, and actions.

**Acceptance Scenarios**:

1. **Given** there are active and inactive agent accounts, **When** an admin opens the users page, **Then** the tab list shows `مندوبين` with the correct agent count.
2. **Given** an admin selects the agents tab, **When** the table loads, **Then** only `AGENT` role accounts appear.
3. **Given** an agent has active assigned users, **When** the row is rendered, **Then** the assigned-user count matches active `AgentAssignment` rows for that agent.
4. **Given** an agent has no point activity, **When** the row is rendered, **Then** point summary values display as zero without errors.

---

### User Story 2 - Add A User Under An Agent (Priority: P2)

Admins need to create a new user directly under a selected agent, so the user immediately participates in the agent account model without being attached to admin or manager ownership first.

**Why this priority**: New agent workflows should not require creating a normal user and then fixing ownership manually.

**Independent Test**: From the agents tab, create a new user for a selected agent, then verify the user has one active agent assignment, no active manager/admin owner link, and appears in the agent dashboard.

**Acceptance Scenarios**:

1. **Given** an admin is viewing an agent row, **When** the admin chooses to add a user under that agent and submits valid user data, **Then** the system creates the user and an active assignment to that agent in one transaction.
2. **Given** the selected agent has a default source group, **When** the admin opens the add-user flow for that agent, **Then** the default source group is prefilled but can be changed before submit.
3. **Given** the target username or email already exists, **When** the admin submits the form, **Then** no user or assignment is created and the admin sees a clear duplicate error.
4. **Given** the selected agent is deleted or not an `AGENT`, **When** creation is attempted, **Then** the request is rejected and no user is created.

---

### User Story 3 - Transfer Existing Users To Any Agent (Priority: P3)

Admins need to move existing users from any manager, admin-owned relationship, or another agent to a target agent. The transfer must cleanly end old ownership so future permissions, credit requests, and points use the new agent.

**Why this priority**: This fixes the current blocker where manager-owned users cannot be assigned to agents and prevents mixed ownership after manual changes.

**Independent Test**: Transfer one manager-owned user, one admin-owned user, and one agent-owned user to a target agent, then verify each has no active manager/admin owner link, exactly one active agent assignment, an activity log, and correct future point recipient routing.

**Acceptance Scenarios**:

1. **Given** a user is owned by a manager, **When** an admin transfers the user to an agent, **Then** the manager ownership row is removed or ended and one active agent assignment is created.
2. **Given** a user is owned by admin through the legacy manager-user link, **When** an admin transfers the user to an agent, **Then** the admin ownership link is removed or ended and one active agent assignment is created.
3. **Given** a user already has an active agent assignment, **When** an admin transfers the user to another agent, **Then** the old assignment is ended with `endedAt` and the new assignment becomes the only active assignment.
4. **Given** the target user is deleted, not a `USER`, or the target agent is deleted/inactive, **When** transfer is attempted, **Then** the request is rejected without partial ownership changes.
5. **Given** a transfer succeeds, **When** future completed subscription spend is processed, **Then** the points engine treats the user as agent-owned and awards future points to both the user and the assigned agent.

---

### User Story 4 - Manage Agent Assignments From A Unified Admin Flow (Priority: P4)

Admins need the existing admin agents page and the users page to use the same transfer rules and show consistent assignment state, so support staff do not get different behavior depending on entry point.

**Why this priority**: The current agents page rejects manager-owned users. Updating both entry points avoids one page reintroducing the same bug.

**Independent Test**: Perform the same transfer from the users page and from the agents page, then verify both call the same ownership behavior and show consistent success/error states after refresh.

**Acceptance Scenarios**:

1. **Given** a manager-owned user appears in the existing agents page, **When** an admin assigns the user to an agent, **Then** the page no longer rejects with `MANAGER_OWNED` and uses the transfer behavior.
2. **Given** an assignment is ended from the agents page, **When** the users page is refreshed, **Then** counts and ownership labels reflect the ended assignment.
3. **Given** a transfer fails validation, **When** either admin page receives the response, **Then** the UI shows a clear error and keeps local state unchanged.

### Edge Cases

- A user has multiple legacy manager/admin links: all active manager/admin links for that user are removed during transfer to agent.
- A user has multiple active agent assignments due to old data: transfer ends all active assignments before creating the new one.
- A target agent is inactive through `users.isActive=false` or `agentProfile.isActive=false`: transfer is rejected.
- A transfer is requested from an agent to the same agent: unchanged durable state is a no-op; metadata changes update the existing active assignment in place.
- Source Group is omitted: same-agent transfer preserves it; new-agent transfer uses the target default or stores `null`. Explicit `null`, blank, or whitespace clears it.
- Existing historical assignments remain audit history through inactive rows and `endedAt`; they are not deleted.
- Existing historical points, operations, and credit requests are not rewritten when ownership is transferred.
- Search and pagination must remain stable when switching between distributors, users, and agents tabs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The admin users page MUST include a third tab for `AGENT` accounts labeled `مندوبين` in Arabic and `Agents` as fallback.
- **FR-002**: The admin users counts endpoint MUST return `agents` count alongside `distributors` and `users`.
- **FR-003**: The admin users list endpoint MUST support `roleFilter=agents` and return only non-deleted `AGENT` accounts.
- **FR-004**: Agent list rows MUST include id, username, email, role, balance, active status, created date, last login, point summary, assigned-user count, and profile/default source group data needed by the UI.
- **FR-005**: The agents tab MUST preserve search, pagination, refresh, create, edit, reset-password, balance, enable/disable, delete, and stats actions where they apply to agent accounts.
- **FR-006**: Admins MUST be able to create a new `USER` under a selected `AGENT` in a single transaction.
- **FR-007**: Creating a user under an agent MUST create exactly one active `AgentAssignment` and MUST NOT create a manager/admin ownership link for that user.
- **FR-008**: Admins MUST be able to transfer an existing `USER` from manager ownership, admin ownership, direct ownership, or another agent to any valid target agent.
- **FR-009**: Transfer to agent MUST end or remove all active manager/admin ownership links for the user before creating or refreshing the target active agent assignment.
- **FR-010**: Transfer to agent MUST end all other active agent assignments for the user before creating or refreshing the target active assignment.
- **FR-011**: The system MUST reject transfer when the target user is not a non-deleted `USER` account.
- **FR-012**: The system MUST reject transfer when the target agent is not a non-deleted, active `AGENT` account with an active agent profile if profile data exists.
- **FR-013**: The system MUST treat Source Group as optional nullable metadata with the omitted/default/preserve versus explicit-clear semantics defined by Spec 031 and a 120-character maximum when supplied.
- **FR-014**: Every mutating create-under-agent or transfer action MUST create a redacted activity log containing admin id, user id, target agent id, previous current ownership ids, Source Group resolution mode, and transfer mode; exact no-ops create no audit noise.
- **FR-015**: Existing historical operations, credit requests, point ledger entries, and assignments MUST NOT be mutated except ending active ownership rows needed for the transfer.
- **FR-016**: An operation that completes after a successful transfer MUST capture the new active agent assignment; an operation completed before transfer MUST retain its completion-time owner and MUST NOT be reattributed during later point finalization.
- **FR-017**: The existing admin agents assignment page MUST use the same transfer rules as the new users-page flow and MUST no longer reject manager-owned users solely because they are manager-owned.
- **FR-018**: API responses for assignment creation/transfer MUST return enough state for UI refresh: assignment id, user id, agent id, nullable Source Group, previous ownership summary, ownership token, and transfer mode.
- **FR-019**: The UI MUST show loading, empty, success, and error states for the agents tab and transfer dialogs.
- **FR-020**: The implementation MUST avoid N+1 point-summary or assignment-count queries on paginated admin users lists.

### Key Entities *(include if feature involves data)*

- **Agent Account**: A `User` with role `AGENT`, optional `AgentProfile`, own balance and point summary, and active assigned users.
- **Managed User**: A `User` with role `USER` that can be owned by manager/admin legacy links or by an active agent assignment.
- **Manager/Admin Ownership Link**: Existing `ManagerUser` row that represents legacy ownership by a manager or admin account.
- **Agent Assignment**: Existing `AgentAssignment` row that represents assignment of a user to an agent, with nullable Source Group metadata, optional WhatsApp URL, active flag, admin actor, and ended timestamp.
- **Transfer Result**: Auditable outcome of moving a user to an agent, including previous ownership and new active assignment.
- **Agent Tab Row**: Admin-facing row combining agent account fields, point summary, profile defaults, and active assigned-user count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The admin users page shows three tabs and the `مندوبين` tab displays 100% of non-deleted agent accounts matching search and pagination.
- **SC-002**: Creating a user under an agent produces one user and exactly one active agent assignment in every successful test run.
- **SC-003**: Transferring a manager-owned, admin-owned, or agent-owned user to a target agent leaves exactly zero manager/admin ownership links and exactly one active agent assignment for the user.
- **SC-004**: Reassigning an agent-owned user ends the old assignment and creates or refreshes the new assignment without duplicate active assignments.
- **SC-005**: Future point-recipient resolution after transfer returns the user and target agent, not the previous manager/admin owner.
- **SC-006**: The admin agents page and admin users page produce the same ownership result for the same transfer scenario.
- **SC-007**: Focused TypeScript and test verification pass before deployment commands are given.

## Assumptions

- Admin users can already create `AGENT` accounts through the existing create user dialog.
- The existing `AgentAssignment` table remains the source of truth for agent ownership.
- The existing `ManagerUser` table remains the legacy source for manager/admin ownership and can be removed for a user during transfer to agent.
- Agent profiles may not exist for old agent accounts; an active user account with no profile is treated as valid unless a profile exists with `isActive=false`.
- No historical spend, points, credit requests, or operations are recalculated when ownership changes.
- This feature changes admin management flows only; it does not give agents permission to create or transfer users themselves.
