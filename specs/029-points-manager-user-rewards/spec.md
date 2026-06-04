# Feature Specification: Points Settings Save And Manager-Owned User Points

**Feature Branch**: `029-points-manager-user-rewards`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Review the points system for points per 1000 USD. Saving point settings shows success but the changed numbers do not persist. Add an option so users under managers can earn points at an admin-defined rate."

## User Scenarios & Testing

### User Story 1 - Save Point Settings Reliably (Priority: P1)

An admin changes point rates from the Points Settings page, saves, and immediately sees the same saved values after the page refreshes.

**Why this priority**: The current screen reports success while some values can stay unchanged, which makes reward configuration unreliable.

**Independent Test**: Change user, agent, manager, and override values, save them, reload the settings, and confirm the displayed values match the submitted values.

**Acceptance Scenarios**:

1. **Given** the admin edits the default user points per 1000 USD, **When** they save and the page refreshes, **Then** the changed value remains visible and is used for future point calculations.
2. **Given** the admin edits default agent and default manager rates, **When** they save and reload, **Then** both changed values remain visible.
3. **Given** the admin enters an override for one agent or manager, **When** they save and reload, **Then** that override remains visible and blank override rows continue to mean "use default".
4. **Given** the admin sends both old and new names for the same setting during a save, **When** the save is processed, **Then** the value currently shown in the new screen wins.
5. **Given** the settings cannot be saved or reloaded, **When** the admin submits the form, **Then** the screen shows an error instead of a misleading success message.

---

### User Story 2 - Enable Points For Users Under Managers (Priority: P2)

An admin can enable a separate points rate for users who are linked under managers.

**Why this priority**: The current completed-operation rule gives manager-owned user spend points to the manager only. The admin needs a controlled way to also let those users earn points.

**Independent Test**: Complete a test operation for a user under a manager with the new option disabled, then enabled, and compare the created point entries.

**Acceptance Scenarios**:

1. **Given** the manager-owned user option is disabled, **When** a user under a manager completes a qualifying operation, **Then** only the manager receives operation spend points, matching current behavior.
2. **Given** the manager-owned user option is enabled with a positive rate, **When** a user under a manager completes a qualifying operation, **Then** the manager receives manager points and the user receives user points at the dedicated manager-owned-user rate.
3. **Given** the manager-owned user option is enabled with zero points per 1000 USD, **When** a qualifying operation completes, **Then** no user points are created for that extra user portion.
4. **Given** the user is not under a manager, **When** a qualifying operation completes, **Then** existing agent-owned and admin-owned point routing remains unchanged.

---

### User Story 3 - Keep All Completion Paths Consistent (Priority: P2)

The same point rules apply whether an operation is finalized through the web app or by the background worker.

**Why this priority**: The project has separate web and worker point-award paths. If only one path changes, point balances can differ depending on how the operation finished.

**Independent Test**: Run focused tests or equivalent checks for both web-side point award logic and worker-side point award logic using the same manager-owned user examples.

**Acceptance Scenarios**:

1. **Given** a manager-owned user operation is completed by any supported completion path, **When** point awards are created, **Then** the same recipients and rates are used.
2. **Given** the admin disables manager-owned user points, **When** any completion path awards points, **Then** the old manager-only behavior is preserved.
3. **Given** the admin enables manager-owned user points, **When** any completion path awards points, **Then** the user extra points are calculated from the dedicated rate, not from the normal user-global rate.

---

### User Story 4 - Make The Screen Understandable To Admins (Priority: P3)

The Points Settings screen labels make it clear which rate affects normal users, users under managers, agents, and managers.

**Why this priority**: The current screen is easy to misread because it mixes general rules and per-owner overrides without explaining the manager-owned user case.

**Independent Test**: Open the Points Settings screen and confirm the admin can identify the rate for each owner group before saving.

**Acceptance Scenarios**:

1. **Given** the admin opens Points Settings, **When** they review default rules, **Then** the screen clearly separates normal user points from manager-owned user points.
2. **Given** the admin edits an override row, **When** the row is blank, **Then** the row remains understood as using the relevant default.
3. **Given** the admin saves successfully, **When** the success message appears, **Then** the displayed values already match the saved values.

### Edge Cases

- Existing saves may contain legacy field names and current field names together; the current field names must win.
- Blank override inputs mean "use default"; zero override inputs mean an explicit zero rate.
- Duplicate override owners in one save must be rejected with a clear validation error.
- Deleted or inactive agents/managers must not receive new override rows from the API.
- A user with both a valid manager link and an active agent assignment keeps manager precedence; agent-owned behavior applies only when no valid manager link wins.
- If the manager link points to an inactive or deleted manager, existing fallback routing behavior remains unchanged.
- Non-completed operations, non-renewal operations, non-positive amounts, and operations before the points start date do not receive operation spend points.
- Existing point ledger rows are not changed automatically by this feature.

## Requirements

### Functional Requirements

- **FR-001**: System MUST save the values currently visible on the Points Settings screen for user, agent, manager, and override rates.
- **FR-002**: System MUST treat current setting field names as the source of truth when current and legacy field names are both present in one save request.
- **FR-003**: System MUST reload or return the saved settings before showing a success message.
- **FR-004**: System MUST preserve blank override behavior as "use default".
- **FR-005**: System MUST preserve zero override behavior as an explicit zero rate.
- **FR-006**: System MUST reject duplicate agent or manager override entries in one save request.
- **FR-007**: System MUST add an admin-controlled on/off setting for manager-owned user points.
- **FR-008**: System MUST add a dedicated manager-owned user points-per-1000-USD rate separate from the normal user-global rate.
- **FR-009**: System MUST preserve current manager-only behavior for manager-owned users when the new option is disabled.
- **FR-010**: System MUST award extra points to the manager-owned user when the new option is enabled and the dedicated rate produces positive points.
- **FR-011**: System MUST keep manager points for manager-owned user operations unchanged.
- **FR-012**: System MUST apply the same manager-owned user point rule in all supported operation completion paths.
- **FR-013**: System MUST NOT change historical point ledger rows automatically.
- **FR-014**: System MUST add focused tests for save precedence, saved-value readback, manager-owned user disabled/enabled routing, and web/worker consistency.
- **FR-015**: System MUST avoid exposing secrets, sessions, provider tokens, beIN passwords, or raw runtime credentials in API responses or logs.

### Key Entities

- **Point program settings**: Global switches and dates that control whether spend-based points are active.
- **Point rule**: A rate expressed as points per 1000 USD for one owner category or override.
- **Manager-owned user rule**: The dedicated rate and enabled state that allow users under managers to receive their own extra points.
- **Override row**: An agent or manager-specific rate that replaces the relevant default rate.
- **Operation point recipient**: A user, agent, manager, or admin account that receives a point ledger entry for one completed operation.
- **Point ledger entry**: The immutable record of awarded, converted, reversed, or reward-related points.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of changed default point settings remain visible after save and reload in the admin page.
- **SC-002**: A save request containing both legacy and current setting names stores the current setting values in automated tests.
- **SC-003**: With manager-owned user points disabled, existing manager-owned operation tests continue to produce manager-only points.
- **SC-004**: With manager-owned user points enabled, a qualifying manager-owned user operation creates one manager point entry and one user point entry when both configured rates are positive.
- **SC-005**: Focused tests cover web-side and worker-side point routing for the manager-owned user cases.
- **SC-006**: No existing point ledger rows are modified during feature rollout.

## Assumptions

- "Profit" in this request means points that can later be converted through the existing points-to-balance system, not an immediate cash balance commission.
- The manager-owned user rate is a global default for all users under managers in this version.
- Individual end-user point overrides are out of scope for this feature unless requested later.
- Existing credit request point previews remain unchanged unless they already depend on the same shared point rules.
- Production deployment will use migrations, not direct schema push.
