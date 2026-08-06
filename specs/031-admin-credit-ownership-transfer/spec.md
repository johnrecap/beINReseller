# Feature Specification: Admin Credit Requests And Unified Ownership Transfer

**Feature Branch**: `codex/031-admin-credit-ownership-transfer`

**Created**: 2026-06-08

**Status**: Approved for implementation

**Input**: User description: "Allow users under admin to request credit. Allow admin to transfer any user between admin, managers/distributors, agents, and other owners safely. Source Group is an optional classification and must not affect balance or transfer eligibility."

## Clarifications

### Session 2026-08-06

- Q: Is Source Group a real ownership group? A: No. It is optional assignment metadata used for display, filtering, reports, and Telegram wording only.
- Q: What happens to financial data during transfer? A: Only current ownership changes; balance, debt, limits, operations, transactions, credit-request history, and points remain unchanged.
- Q: How are omitted, cleared, and supplied assignment fields interpreted? A: Omitted preserves metadata for the same agent or uses the new agent default; `null`, blank, or whitespace clears it; non-empty text explicitly sets it. Source Group and WhatsApp URL are resolved independently.
- Q: How are concurrent transfers handled? A: The client supplies `expectedOwnershipToken`; a stale token returns `409 OWNERSHIP_CHANGED` with refresh guidance and is never retried automatically.
- Q: Does removing an agent assignment automatically attach the user to admin? A: No. The compatibility delete keeps its existing unowned/legacy behavior while delegating locking, validation, and audit to the canonical ownership service.

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
5. **Given** an active non-deleted `USER` has a non-zero balance, debt, limits, operations, transactions, or points, **When** admin transfers the user to an agent, **Then** only current ownership and assignment metadata change.
6. **Given** an agent target has no default Source Group and admin leaves Source Group empty, **When** the transfer is confirmed, **Then** it succeeds and stores `null`.
7. **Given** another transfer changes ownership after the dialog was loaded, **When** admin submits the stale ownership token, **Then** the request returns `409 OWNERSHIP_CHANGED` without partial changes.
8. **Given** the selected owner and metadata already match the durable state, **When** the same request is submitted again, **Then** it succeeds as a no-op without recreating assignment rows or audit noise.

---

### User Story 4 - Admin UI Makes Current Owner And Transfer Target Clear (Priority: P3)

The admin users screen clearly shows who currently owns each user and gives one transfer action that supports admin, manager/distributor, and agent targets.

**Why this priority**: The backend rules must be safe first, but the admin needs a clear workflow to avoid repeating the old wrong transfer behavior.

**Independent Test**: Open the admin users page, search for a user, inspect the displayed owner, open transfer, select each target type, and confirm only the relevant fields are shown.

**Acceptance Scenarios**:

1. **Given** a user is admin-owned, **When** the admin users list loads, **Then** the current owner is shown as admin/direct.
2. **Given** a user is manager-owned or agent-owned, **When** the list loads, **Then** the current owner label shows the correct owner name/type.
3. **Given** admin opens the transfer dialog, **When** the target type is admin or manager, **Then** agent-only fields are hidden.
4. **Given** admin opens the transfer dialog, **When** the target type is agent, **Then** optional Source Group and WhatsApp group fields are available and their omitted/cleared states are distinguishable.
5. **Given** an assignment or request has no Source Group, **When** it appears in a supported table or filter, **Then** the localized `No group` label is shown and an explicit no-group filter can select it.

### Edge Cases

- A user may have both a manager/admin link and an active agent assignment from old data; current classification must prefer explicit active ownership rules and the transfer cleanup must close duplicates.
- A user may have multiple manager/admin links; transfer cleanup must remove all old current links before creating the selected owner link.
- A user may have multiple active agent assignments; transfer cleanup must close all active assignments before creating a new active one.
- A legacy admin-created user may have no manager link but was created by an admin; the plan may treat this as admin-owned only as a legacy fallback until cleanup runs.
- Deleted or inactive target owners cannot receive transferred users.
- Deleted or inactive normal users cannot submit new credit requests or be transferred as active accounts.
- Historical credit requests keep their original snapshots and are not rewritten.
- A new admin-owned credit request must not later resolve an agent just because the user receives an agent assignment after the request was created.
- An agent-owned credit request whose `sourceGroupSnapshot` is null must remain ungrouped even if the current assignment later receives a Source Group.
- Changing agents must never copy the old assignment's Source Group or WhatsApp URL to the new assignment.
- Changing assignment metadata for the same agent updates the existing active assignment in place; omitting either field preserves only that field.
- A Source Group longer than 120 characters is rejected; an absent or explicitly cleared Source Group is valid.
- The WhatsApp destination remains independent from Source Group and follows assignment URL, agent setting, then global setting fallback.
- Exact duplicate transfer requests may race; user and owner locking plus the expected token must prevent mixed ownership and partial cleanup.
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
- **FR-010**: When the selected owner changes, system MUST remove/close all conflicting current manager/admin ownership links and active agent assignments before creating the selected new current owner; exact matches and same-agent metadata edits follow FR-024.
- **FR-011**: System MUST validate that transfer targets are active, not deleted, and have the expected role.
- **FR-012**: System MUST record one audit entry for every ownership mutation, including previous current owners, previous active agent assignments, new owner, actor, and timestamp; exact no-ops record none.
- **FR-013**: System MUST keep `createdBy` historical and not use it as the main current-owner source except for documented legacy admin fallback.
- **FR-014**: System MUST not change customer balances, operations, points, transaction history, or historical credit request decisions during ownership transfer.
- **FR-015**: System MUST add focused tests for owner classification, admin-owned credit request creation, Telegram formatting, WhatsApp handoff, and all transfer directions.
- **FR-016**: System MUST include a pre-deployment data audit for users with multiple current owners, both manager and agent ownership, or no clear owner.
- **FR-017**: System MUST allow an admin to transfer any active, non-deleted account whose role is exactly `USER`, whether its current owner is admin, manager/distributor, another agent, legacy admin, or unowned.
- **FR-018**: `AgentAssignment.sourceGroup` MUST be nullable in the web and Worker schemas, accept at most 120 characters when supplied, and require no historical backfill.
- **FR-019**: For an agent target, an omitted Source Group MUST preserve it for the same agent or resolve the new agent default; explicit `null`, blank, or whitespace MUST clear it; non-empty text MUST set its trimmed value.
- **FR-020**: WhatsApp assignment URL MUST use the same presence semantics independently from Source Group, and a different-agent transfer MUST NOT inherit either value from the previous assignment.
- **FR-021**: System MUST route unified transfer, legacy agent-assignment transfer, same-agent edit, and assignment deletion through one canonical transaction service while retaining documented compatibility response and deletion semantics.
- **FR-022**: The canonical service MUST lock the subject user and relevant owner rows, re-read and validate state inside the transaction, and require `expectedOwnershipToken` on public mutation routes.
- **FR-023**: After locking/re-reading, a stale ownership precondition whose requested durable state differs from current state MUST return `409 OWNERSHIP_CHANGED`; a missing precondition MUST return `428 OWNERSHIP_PRECONDITION_REQUIRED`; neither case may partially mutate ownership or be retried automatically.
- **FR-024**: After locking/re-reading, an exact desired-state transfer MUST return an idempotent no-op before stale-token rejection, and a same-agent metadata change MUST update the existing assignment rather than close and recreate it. Thus an identical concurrent duplicate succeeds as `NO_OP`, while a stale request for a different state returns `409`.
- **FR-025**: Transfer auditing MUST record Source Group resolution as `EXPLICIT`, `CLEARED`, `PRESERVED`, `AGENT_DEFAULT`, or `NONE`, record safe ownership identifiers, and MUST NOT store a full WhatsApp invite URL.
- **FR-026**: New/current request filters and supported tables MUST expose a localized no-group state in Arabic, English, and Bengali, including an explicit query mode for null Source Group snapshots.
- **FR-027**: Telegram MUST omit its Group line when the request snapshot has no Source Group, and historical null snapshots MUST NOT inherit a later assignment group.
- **FR-028**: The selected WhatsApp URL MUST continue using assignment URL, agent configuration, then global configuration fallback even when Source Group is null.
- **FR-029**: A transfer MUST preserve user balance, debt, credit limit, remaining limit, operations, transactions, point ledger rows, and historical credit request snapshots byte-for-byte/value-for-value.
- **FR-030**: A production ownership audit MUST precede a unique one-manager-owner-per-user constraint; the transaction lock remains required because database constraints cannot prevent manager-versus-agent cross-table ownership by themselves.
- **FR-031**: After an agent-to-agent transfer, the previous agent MUST lose live user/balance/operation access, the new agent MUST gain live access, the previous agent MUST retain read-only credit requests captured with its own `agentIdSnapshot`, and the new agent MUST NOT inherit those historical requests.

### Key Entities

- **Current owner classification**: The resolved current owner state for a normal user, including owner type, owner id, owner label, and whether the result is legacy fallback.
- **Credit request**: A user's request for balance top-up, including amount, payment method, notes, status, owner snapshot, notification status, and handoff data.
- **Ownership transfer**: The admin action that moves one user to admin, manager/distributor, or agent ownership.
- **Manager/admin ownership link**: The record connecting a normal user to an admin or manager/distributor owner.
- **Agent assignment**: The record connecting a normal user to an agent, nullable Source Group classification, and optional WhatsApp group URL.
- **Ownership token**: A versioned digest of current manager/admin links and active assignment identity/metadata used only as an optimistic concurrency precondition.
- **Audit entry**: The immutable record describing who performed a transfer and what previous ownership data was closed or replaced.
- **Notification destination**: The Telegram target and default WhatsApp handoff destination used by credit request notifications.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of active admin-owned users in focused tests can submit credit requests without an agent assignment.
- **SC-002**: 100% of manager-owned and unowned users in focused tests remain blocked from credit requests.
- **SC-003**: 100% of admin-owned credit request notification tests show admin/direct owner wording and no fake agent values.
- **SC-004**: 100% of admin-owned WhatsApp handoff tests use default WhatsApp destinations and do not resolve later agent assignments.
- **SC-005**: 100% of tested transfer directions leave exactly one current owner visible in the application result.
- **SC-006**: Every successful mutating transfer creates one audit entry with old/new owner evidence, while exact no-ops create zero audit entries.
- **SC-007**: No tested ownership transfer changes balances, operation records, point ledger rows, or historical credit request decisions.
- **SC-008**: The deployment checklist includes data audit results or a documented decision to proceed without strict database ownership indexes.
- **SC-009**: All Source Group resolution tests pass for explicit, cleared, preserved, agent-default, and none outcomes, including a different-agent transfer that leaks no prior metadata.
- **SC-010**: Concurrent transfer tests prove that exactly one mutation commits, an identical stale duplicate returns `NO_OP`, and a stale different-state request returns `409`, all with no partial ownership or financial changes.
- **SC-011**: Database and API tests transfer a user with non-zero financial values and prove those values and all related historical row counts are unchanged.
- **SC-012**: Report, UI, Telegram, and WhatsApp tests cover null Source Group without hiding requests or breaking handoff.
- **SC-013**: Agent access tests prove live data moves exclusively to the new agent while credit-request history remains scoped to the request-time agent snapshot.

## Assumptions

- "Managers/distributors" in this feature means users with the manager-style ownership role currently used by the admin users area.
- "Agents" means the existing agent assignment ownership path with optional Source Group classification and optional WhatsApp group metadata.
- Admin-owned users should use the global/default WhatsApp handoff destination after credit request approval.
- Manager-owned users remain blocked from direct credit requests in this version because the current business flow for manager-owned top-ups is not yet approved.
- Historical ownership evidence is preserved; only current ownership is changed by transfer.
- Strict `ManagerUser.userId` uniqueness is added only after existing production data is audited and cleaned; cross-table transaction locking is never deferred.
