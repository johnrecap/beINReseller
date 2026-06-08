# Feature Specification: Unified Operation Spend Points

**Feature Branch**: `codex/032-unify-points-awards`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Unify the points logic in one place. The user directly under admin must receive spend points, not the admin."

## User Scenarios & Testing

### User Story 1 - One Points Decision For Every Completion Path (Priority: P1)

When a renewal or installment operation is completed, every completion path uses the same award rules so the same operation cannot produce different point owners depending on whether it finished through web, worker, recovery, or manual review.

**Why this priority**: The current code has separate web and worker award logic. That makes production behavior inconsistent and can award the wrong owner.

**Independent Test**: Complete the same operation fixture through each supported completion path and confirm the produced point recipients are identical.

**Acceptance Scenarios**:

1. **Given** a completed renewal operation, **When** the award logic is triggered from web completion, **Then** it uses the shared award policy and writes the same recipients as worker completion.
2. **Given** a completed installment operation stored as a renewal operation, **When** worker completion awards points, **Then** it uses the same shared award policy as web completion.
3. **Given** recovery marks an operation completed, **When** points are awarded, **Then** the same eligibility and owner rules apply.
4. **Given** manual financial review closes an operation as charged/completed, **When** the operation becomes completed, **Then** operation spend points are awarded once using the same shared policy.

---

### User Story 2 - Admin-Owned Direct Users Receive Their Own Spend Points (Priority: P1)

A normal user who is directly owned by admin receives their own spend points when their paid renewal operation completes. The admin does not receive points on that user's behalf.

**Why this priority**: The business decision is explicit: users under admin should earn their own points. Existing code disagrees between web and worker for this case.

**Independent Test**: Run an active admin-owned normal user through a completed renewal and confirm the user receives normal-user spend points and admin receives no operation-spend point entry for that operation.

**Acceptance Scenarios**:

1. **Given** an active normal user has an active admin/direct owner, **When** a renewal completes, **Then** the user receives points using the normal user per-1000 USD rate.
2. **Given** a legacy admin-created normal user has no active manager owner and no active agent owner, **When** a renewal completes, **Then** the user receives points using the normal user rate.
3. **Given** an admin-owned direct user has a completed operation, **When** the award runs more than once, **Then** only one point entry is recorded for that user and operation.
4. **Given** an inactive, deleted, or non-user account is involved, **When** the award policy runs, **Then** no direct user spend points are awarded.

---

### User Story 3 - Existing Agent And Manager Rules Stay Intact (Priority: P2)

Existing point behavior for users under agents and managers remains unchanged while the admin-owned user case is corrected.

**Why this priority**: Fixing admin-owned users must not break current agent and manager reward rules.

**Independent Test**: Run existing agent-owned and manager-owned fixtures and confirm recipients and rates match current approved behavior.

**Acceptance Scenarios**:

1. **Given** an active user under an active agent, **When** a renewal completes, **Then** both the user and agent receive spend points.
2. **Given** an active user under an active manager and manager-owned user points are disabled, **When** a renewal completes, **Then** only the manager receives spend points.
3. **Given** an active user under an active manager and manager-owned user points are enabled, **When** a renewal completes, **Then** the manager receives manager points and the user receives manager-owned-user points.
4. **Given** an owner-specific agent or manager override is set to zero, **When** a renewal completes, **Then** the override is respected as an explicit zero rate.

---

### User Story 4 - Admin Settings Page Explains The Rules Clearly (Priority: P3)

The points settings page makes it clear which people receive spend points under each ownership type, including admin-owned direct users.

**Why this priority**: The current labels can make admins think every role always receives points. The page should match the actual award policy.

**Independent Test**: Open the points settings page and confirm the displayed labels or helper text explain admin-owned, agent-owned, manager-owned, and disabled-program behavior.

**Acceptance Scenarios**:

1. **Given** the points program is disabled, **When** an admin views the settings page, **Then** the page makes clear that no operation-spend points are awarded.
2. **Given** normal user points are configured, **When** an admin views the default rules, **Then** the page indicates this rate applies to agent-owned users and admin-owned direct users.
3. **Given** manager-owned user points are disabled, **When** an admin views the manager-owned user setting, **Then** the page indicates manager-owned users do not receive user points while disabled.
4. **Given** manager-owned user points are enabled, **When** an admin views the manager-owned user setting, **Then** the page indicates manager-owned users receive the dedicated manager-owned-user rate.

### Edge Cases

- Points program is disabled: no recipients receive operation-spend points, regardless of ownership or rates.
- Operation is not completed, has no completion time, is not a renewal-style operation, or has a non-positive amount: no points are awarded.
- Operation completed before the configured points start date: no points are awarded.
- User has both current manager/admin ownership and an active agent assignment from dirty historical data: current owner precedence must be deterministic and tested.
- User has no valid current owner and no legacy admin-created fallback: no points are awarded.
- Award logic is triggered repeatedly for the same operation: duplicate ledger entries are not created.
- Admin-owned direct user has a later agent assignment after the operation: award uses the ownership evidence at operation completion time, not a later guess.
- Sensitive credentials, sessions, Telegram tokens, beIN passwords, cookies, TOTP secrets, and provider data must not appear in logs or point audit output.

## Requirements

### Functional Requirements

- **FR-001**: System MUST use one shared operation-spend award policy for web, worker, recovery, and manual completion paths.
- **FR-002**: System MUST award operation-spend points only when the points program is enabled, the operation is completed, the operation is renewal-style, the amount is positive, completion time exists, and completion time is not before the configured points start date.
- **FR-003**: System MUST award admin-owned direct normal users their own operation-spend points using the normal user per-1000 USD rate.
- **FR-004**: System MUST NOT award admin users operation-spend points on behalf of admin-owned direct users.
- **FR-005**: System MUST preserve the existing agent-owned rule: active normal user receives normal user points and active agent receives agent points.
- **FR-006**: System MUST preserve the existing manager-owned rule: active manager receives manager points, and the normal user receives manager-owned-user points only when that setting is enabled.
- **FR-007**: System MUST treat owner-specific zero overrides as explicit zero rates, not as missing overrides.
- **FR-008**: System MUST avoid awarding points to inactive, deleted, non-user, or unclear owners.
- **FR-009**: System MUST keep point ledger writes idempotent per owner, source type, and operation id.
- **FR-010**: System MUST make manual financial-review charged/completed closure eligible for the same point award process.
- **FR-011**: System MUST expose clear settings-page wording so admins understand which rates apply to each ownership type.
- **FR-012**: System MUST add focused tests for admin-owned direct users, worker/web parity, manual completion, manager toggle behavior, zero overrides, idempotency, and disabled-program behavior.
- **FR-013**: System MUST not recalculate or rewrite historical point ledger rows automatically in this feature.
- **FR-014**: System MUST include a release verification step that can identify completed operations after the feature date that have missing operation-spend point entries.

### Key Entities

- **Operation spend award policy**: The single decision source that evaluates eligibility, resolves recipients, resolves rate buckets, and returns awardable entries.
- **Operation**: A completed renewal-style customer operation with amount, completion time, user, and ownership evidence.
- **Owner classification**: The current or legacy ownership decision for an operation user: admin-owned direct, agent-owned, manager-owned, or unowned.
- **Point program settings**: The global enabled flag, start date, conversion ratio, and manager-owned user toggle.
- **Point rule**: The active per-1000 USD rate for normal users, manager-owned users, agents, managers, or owner-specific overrides.
- **Point ledger entry**: The persisted point record tied to an owner and operation-spend source.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of focused tests show identical recipient decisions for web, worker, recovery, and manual charged completion paths.
- **SC-002**: 100% of admin-owned direct user tests award points to the user and zero operation-spend points to admin for that operation.
- **SC-003**: Existing agent-owned and manager-owned point tests continue to pass without changed expected recipients.
- **SC-004**: Re-running the same award path at least three times creates no duplicate point ledger rows.
- **SC-005**: The points settings page states the disabled-program and admin-owned direct user behavior clearly enough for an admin to predict who receives points.
- **SC-006**: Build verification passes for both web and worker after the shared policy is introduced.

## Assumptions

- "User under admin" means an active normal user directly owned by admin, either through current admin/direct ownership evidence or a legacy admin-created fallback when no current owner rows exist.
- Admin-owned direct users use the same rate as normal users.
- Existing manager-owned user toggle behavior remains unchanged.
- Historical point ledger rows are not changed by this feature; any historical cleanup or correction is a separate reviewed task.
- The shared policy is pure and credential-free; database reads and writes stay in the web and worker wrappers.
