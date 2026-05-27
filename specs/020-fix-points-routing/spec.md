# Feature Specification: Fix Points Recipient Routing

**Feature Branch**: `020-fix-points-routing`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Fix the points bug where users under admin or managers are getting points. Users should get operation spend points only when they are under an AGENT. If the user is under an AGENT, both the user and the agent get points. If the user is under a MANAGER, only the manager gets points. If the user has no agentAssignment and no managerLink but was created by admin, the points go to that admin. Also plan safe handling of previously wrong awarded points."

## User Scenarios & Testing

### User Story 1 - Route New Operation Points To The Correct Owner (Priority: P1)

When a completed subscription operation spends money, the system awards points to the correct owner according to the user's current ownership path.

**Why this priority**: This prevents new wrong point balances and stops users under admin/managers from gaining points they should not receive.

**Independent Test**: Run unit tests for operation point recipient routing and complete a test operation for each ownership case.

**Acceptance Scenarios**:

1. **Given** a user has an active agent assignment and no manager ownership, **When** a subscription operation completes, **Then** the user and the agent both receive operation spend points.
2. **Given** a user has a manager ownership link, **When** a subscription operation completes, **Then** only the linked manager receives operation spend points.
3. **Given** a user has no agent assignment and no manager ownership but was created by an active admin, **When** a subscription operation completes, **Then** only that admin receives operation spend points using the manager/admin rate bucket.
4. **Given** a user has no valid agent, manager, or admin ownership path, **When** a subscription operation completes, **Then** no user-owned fallback points are created.

---

### User Story 2 - Keep Point Rates And Ledger Roles Accurate (Priority: P2)

The ledger records the actual owner role while using the correct rate bucket for calculation.

**Why this priority**: Admin-owned awards must show as ADMIN in the ledger, but use the same manager/admin rate rules that the admin controls from the points settings page.

**Independent Test**: Build award entries for admin-as-manager recipients and confirm `ownerRoleAtTime` is `ADMIN`, while rate lookup uses the manager rate bucket.

**Acceptance Scenarios**:

1. **Given** an admin receives points because they created the direct user, **When** the ledger entry is created, **Then** `ownerRoleAtTime` is `ADMIN`.
2. **Given** an admin receives manager-style points, **When** the rate is resolved, **Then** the system uses manager default/override rules, not user or agent rules.
3. **Given** a manager receives points, **When** the ledger entry is created, **Then** existing manager behavior stays unchanged.

---

### User Story 3 - Audit And Remediate Existing Wrong Awards Safely (Priority: P3)

Admins can identify points that were previously awarded to users under admin/manager ownership and fix them without silently taking money from users.

**Why this priority**: Existing wrong points may have already been converted to balance. A safe audit prevents hidden financial changes.

**Independent Test**: Run a dry-run audit against sample ledger rows and confirm it identifies candidate wrong user-owned operation spend entries and reports conversion risk.

**Acceptance Scenarios**:

1. **Given** historical `OPERATION_SPEND` rows owned by a USER who is not agent-owned, **When** the audit runs, **Then** those rows appear as remediation candidates.
2. **Given** a candidate user already converted some points to balance, **When** the audit runs, **Then** the candidate is marked as "converted review required" and is not auto-debited.
3. **Given** a candidate has unconverted available points, **When** remediation is applied after review, **Then** the system creates reversal entries for the wrong user award and creates the correct owner award where safe.

---

### Edge Cases

- User has both manager link and active agent assignment: manager/admin ownership wins, matching current precedence and transfer expectations.
- Manager link points to inactive/deleted manager: skip that manager and continue to the next valid ownership path.
- Admin creator is inactive/deleted: do not award to that admin; do not fall back to the user.
- User was created by another user/manager but has no current ownership links: do not infer ownership unless there is an explicit manager link or agent assignment.
- Operation is not completed, not a renewal/subscription operation, amount is non-positive, or completed before points feature start date: no points are awarded.
- Existing duplicate ledger entries: preserve idempotency through existing unique constraints.
- Converted historical wrong points: do not automatically debit user balance in this feature.

## Requirements

### Functional Requirements

- **FR-001**: System MUST award operation spend points to both the USER and AGENT only when the operation user has a valid active AGENT assignment and no valid manager/admin ownership path.
- **FR-002**: System MUST award operation spend points only to the linked MANAGER when the operation user has a valid manager ownership link.
- **FR-003**: System MUST award operation spend points only to the ADMIN creator when the operation user has no active agent assignment, no manager ownership link, and `createdBy` is a valid active ADMIN.
- **FR-004**: System MUST NOT award operation spend points to the operation USER when that user is owned by a MANAGER or ADMIN.
- **FR-005**: System MUST NOT fall back to awarding the operation USER when no valid ownership path exists.
- **FR-006**: System MUST record admin-owned operation points with actual ledger role `ADMIN`.
- **FR-007**: System MUST calculate admin-as-manager points using the manager/admin rate bucket.
- **FR-008**: System MUST preserve existing behavior for agent-owned users: USER + AGENT both receive points.
- **FR-009**: System MUST preserve existing eligibility rules for completed subscription spend, feature start date, and positive amount.
- **FR-010**: System MUST add tests covering admin-created direct users, manager-owned users, agent-owned users, invalid ownership, and role/rate bucket mapping.
- **FR-011**: System MUST include a read-only audit plan for historical wrong awards before any remediation is applied.
- **FR-012**: System MUST NOT automatically debit user balances for points that were already converted to money.
- **FR-013**: System SHOULD use `POINT_REVERSAL` ledger entries for safe historical correction instead of deleting ledger rows.

### Key Entities

- **Operation point recipient**: The resolved account that should receive points for one completed operation.
- **Actual owner role**: The ledger role stored at award time, including `ADMIN`, `MANAGER`, `AGENT`, or `USER`.
- **Rate bucket / owner kind**: The rate category used for calculation: `USER`, `AGENT`, or `MANAGER`. Admin-as-manager uses `MANAGER`.
- **Ownership path**: The evidence used to decide routing: manager link, active agent assignment, or direct admin creator fallback.
- **Historical mis-award candidate**: A user-owned `OPERATION_SPEND` ledger entry that likely should have gone to admin/manager instead.
- **Remediation action**: A reviewed correction that creates reversal entries and correct owner award entries without deleting source ledger data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: New completed operations for admin-created direct users create zero USER point entries and one ADMIN point entry.
- **SC-002**: New completed operations for manager-owned users create zero USER point entries and one MANAGER point entry.
- **SC-003**: New completed operations for agent-owned users continue to create one USER point entry and one AGENT point entry.
- **SC-004**: Unit tests cover all routing branches and fail if the user fallback returns.
- **SC-005**: Historical audit output separates safe-to-reverse candidates from converted review-required candidates.

## Assumptions

- "Under admin" means the operation user has no active agent assignment, no manager ownership link, and `createdBy` is an active ADMIN.
- Admin-as-manager uses manager point rate rules because there is no separate admin point rate in the current settings UI.
- Historical remediation will be reviewed before applying balance-affecting changes.
- This feature only fixes operation spend points. Eid reward claim rules are separate.
