# Feature Specification: Spend-Based Points and Cash Redemptions

**Feature Branch**: `014-points-rewards-spend-ledger`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "Fix points and rewards so points are earned only after completed subscription spend. Manager-owned users award manager only. Agent-owned users award both user and agent. Admin controls earn rates and cash conversion rate. Users, agents, and managers can instantly convert points to balance. User lists show points. No historical spend backfill."

## Clarifications

### Session 2026-05-25

- Q: When should points be counted for subscription spend? -> A: Only after the operation becomes COMPLETED.
- Q: How should point-to-balance conversion work? -> A: Immediate conversion without admin approval.
- Q: Who earns points for each ownership model? -> A: Manager-owned user spend awards manager only; agent-owned user spend awards both user and agent.
- Q: What amount should points be based on? -> A: The operation amount deducted from the user balance.
- Q: How should the feature start without old spend? -> A: Admin-controlled `pointsEnabled` and `pointsStartAt`; only completed operations after that start can earn points.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Award Points From Completed Spend (Priority: P1)

Admins need points to reflect real subscription spend, not top-ups or credit approvals. When a qualifying subscription operation completes, the system awards points once to the correct beneficiary set using admin-configured rates.

**Why this priority**: This fixes the core accounting bug. All redemption and reporting work depends on points being earned from the right source of truth.

**Independent Test**: Configure points as enabled with a start date, complete one operation for a manager-owned user and one operation for an agent-owned user, and verify the resulting point ledger entries match the ownership rules and operation amounts.

**Acceptance Scenarios**:

1. **Given** points are enabled and a manager-owned user's subscription operation completes after `pointsStartAt`, **When** the completed operation is processed for points, **Then** one point entry is created for the manager and no point entry is created for the user.
2. **Given** points are enabled and an agent-owned user's subscription operation completes after `pointsStartAt`, **When** the completed operation is processed for points, **Then** one point entry is created for the user and one point entry is created for the agent.
3. **Given** a qualifying completed operation is processed twice, **When** the second processing attempt runs, **Then** no duplicate point entries are created.
4. **Given** a completed operation is before `pointsStartAt`, **When** point processing runs, **Then** no points are created and no historical spend is backfilled.
5. **Given** a credit request approval or manager top-up occurs, **When** no subscription operation has completed, **Then** no points are created.

---

### User Story 2 - Convert Points To Balance Immediately (Priority: P2)

Users, agents, and managers need to convert available points into real balance at any time using an admin-defined conversion rate.

**Why this priority**: Earned points have business value only when they can be converted into spendable balance according to the configured rate.

**Independent Test**: Give an account available points, configure the conversion rate, submit a conversion request, and verify points decrease and balance increases in the same accounting transaction.

**Acceptance Scenarios**:

1. **Given** a user has enough available points and a valid conversion rate exists, **When** the user converts points to balance, **Then** the points are deducted and the user's balance is increased immediately.
2. **Given** an agent has enough available points, **When** the agent converts points to balance, **Then** the agent's own balance increases and no other account changes.
3. **Given** a manager has enough available points, **When** the manager converts points to balance, **Then** the manager's own balance increases and no managed user's balance changes.
4. **Given** an account requests more points than it has available, **When** conversion is requested, **Then** the request is rejected and neither points nor balance change.
5. **Given** conversion settings are disabled or invalid, **When** conversion is requested, **Then** the request is rejected with a clear reason and no accounting entries are created.

---

### User Story 3 - Admin Controls Earning And Conversion Rules (Priority: P3)

Admins need a single configuration surface for enabling spend-based points, setting the start date, setting earn rates, and setting the point-to-balance conversion rate.

**Why this priority**: Operational control is required before the feature can be safely enabled and changed without deployments.

**Independent Test**: Save points settings from the admin panel, then run point earning and conversion scenarios and verify the saved settings control the results.

**Acceptance Scenarios**:

1. **Given** an admin sets `pointsEnabled=false`, **When** operations complete, **Then** no spend-based points are awarded.
2. **Given** an admin sets a future `pointsStartAt`, **When** operations complete before that time, **Then** no points are awarded.
3. **Given** an admin sets role earn rates, **When** qualifying operations complete, **Then** user, agent, and manager point amounts use those rates.
4. **Given** an admin sets a zero override for an owner, **When** that owner would otherwise earn points, **Then** the zero override is honored and no default fallback applies.
5. **Given** an admin sets conversion points and conversion balance amount, **When** a conversion runs, **Then** the credited balance uses that exact ratio.

---

### User Story 4 - Display Points Beside User Balances (Priority: P4)

Admins and managers need to see each user's point summary beside balance in user management views so support and accounting can review value without opening a separate screen.

**Why this priority**: This is visibility and support workflow. It depends on the earning and conversion calculations being correct first.

**Independent Test**: Open the admin users page and manager users page after earning and converting points, and verify each row shows balance plus available, earned, and redeemed point summaries for that account.

**Acceptance Scenarios**:

1. **Given** an admin opens the users page, **When** users are listed, **Then** each row includes current balance and point summary.
2. **Given** a manager opens managed users, **When** users are listed, **Then** each row includes each user's point summary without exposing other managers' users.
3. **Given** an account has no point activity, **When** it appears in the users list, **Then** the point summary shows zero values without errors.

### Edge Cases

- A user has both a manager link and an active agent assignment: manager ownership takes precedence and only the manager earns points.
- A direct user has no manager link and no active agent assignment: the user earns user-rate points for their own qualifying completed spend.
- A completed operation has `amount <= 0`: no points are awarded.
- A completed operation is refunded or corrected after points were awarded: a negative point adjustment is created for the original point recipients.
- A conversion request would produce a zero or negative balance credit: it is rejected.
- Existing legacy point ledger entries created by credit approvals or top-ups remain audit records but do not cause old spend to be backfilled.
- Deleted or inactive owners do not receive new spend-based points; the operation is logged for admin review instead of silently assigning points.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST stop creating new points from credit request approval and manager balance top-up events.
- **FR-002**: The system MUST create points only from subscription operations that are `COMPLETED`, have a positive `operation.amount`, and completed at or after `pointsStartAt` while points are enabled.
- **FR-003**: The system MUST use `operation.amount` as the source amount for point calculation.
- **FR-004**: The system MUST create at most one spend-based point entry per owner per completed operation.
- **FR-005**: The system MUST award manager-owned user spend to the manager only and MUST NOT award those spend points to the user.
- **FR-006**: The system MUST award agent-owned user spend to both the user and the agent.
- **FR-007**: The system MUST award direct user spend to the user when no manager ownership and no active agent assignment applies.
- **FR-008**: The system MUST let admins configure `pointsEnabled`, `pointsStartAt`, user earn rate, agent earn rate, manager earn rate, owner-specific overrides, and point-to-balance conversion rate.
- **FR-009**: The system MUST treat a zero owner-specific earn-rate override as a valid override, not as a missing value.
- **FR-010**: The system MUST record the rate snapshot, source amount snapshot, source operation, recipient role, and ownership context for each spend-based point entry.
- **FR-011**: The system MUST support immediate point-to-balance conversion for authenticated users, agents, and managers when they have enough available points.
- **FR-012**: The system MUST deduct converted points and credit balance atomically so partial conversion cannot occur.
- **FR-013**: The system MUST record an auditable balance transaction for each successful point-to-balance conversion.
- **FR-014**: The system MUST reject conversions when points are insufficient, settings are disabled or invalid, the requested amount is invalid, or the account is inactive.
- **FR-015**: The system MUST expose point summaries in admin users and manager users list responses without broadening existing authorization boundaries.
- **FR-016**: The system MUST avoid backfilling historical spend before `pointsStartAt`.
- **FR-017**: The system MUST create negative point adjustments for refunds or corrections that reverse a completed operation after points were awarded.
- **FR-018**: The system MUST preserve existing point ledger audit history and mark or classify legacy entries so new cash conversion and spend reporting are not confused with old top-up-based points.

### Key Entities *(include if feature involves data)*

- **Point Program Settings**: Singleton configuration for enablement, start date, earn rates, conversion ratio, and admin update audit.
- **Point Rule**: Role default or owner-specific earn-rate rule. Existing point rules are reused, with zero override semantics fixed.
- **Point Ledger Entry**: Immutable accounting entry for earned points, converted points, legacy entries, or reversal adjustments.
- **Point Cash Redemption**: A completed immediate conversion from points to balance, linked to the negative point ledger entry and the balance transaction.
- **Completed Operation Point Award**: The relationship between a completed subscription operation, its eligible point recipients, and generated ledger entries.
- **Point Summary**: Aggregated pending, available, converted, reversed, and lifetime earned totals shown in wallet and user-management views.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of newly awarded spend points are traceable to a completed operation and `operation.amount`.
- **SC-002**: Reprocessing the same completed operation creates zero duplicate point entries in repeated test runs.
- **SC-003**: Manager-owned user spend creates zero user point entries and exactly one manager point entry when the manager rate is positive.
- **SC-004**: Agent-owned user spend creates exactly one user point entry and one agent point entry when both rates are positive.
- **SC-005**: Point-to-balance conversion updates point balance and account balance atomically in every successful conversion test.
- **SC-006**: Admin and manager user lists show point summaries for 100% of returned users without exposing users outside the viewer's allowed scope.
- **SC-007**: No operation completed before `pointsStartAt` earns spend-based points in automated and manual verification.

## Assumptions

- Existing authentication and role boundaries remain in force.
- Existing subscription operation status and `operation.amount` are the source of truth for completed spend.
- Manager ownership is represented by the existing manager-user relationship; agent ownership is represented by the active agent assignment.
- If both manager and agent relationships exist for a user, manager ownership wins for point earning.
- The legacy reward catalog can remain for audit or future catalog rewards, but cash conversion is a separate immediate points-to-balance flow.
- Existing legacy point entries created before this feature are not backfilled from old spend and are classified separately from new spend-earned entries.
