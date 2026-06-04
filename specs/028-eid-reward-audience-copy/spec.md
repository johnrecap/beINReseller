# Feature Specification: Eid Reward Audience And Copy

**Feature Branch**: `028-eid-reward-audience-copy`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: Add admin control over who can see Eid rewards, and make every visible word on the Eid reward card/popup editable from the same Eid Rewards admin page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Controls Who Sees Eid Rewards (Priority: P1)

An admin opens the Eid Rewards settings page and chooses which roles can see the reward feature. The admin can also add user-specific exceptions so one user can be allowed or denied without changing the entire role.

**Why this priority**: Visibility is the core business control. If this is wrong, the reward can be shown to the wrong users or hidden from intended users.

**Independent Test**: Save allowed roles and user exceptions from the admin page, then log in as users from each role and verify the popup appears only for the intended accounts.

**Acceptance Scenarios**:

1. **Given** no custom audience has been saved, **When** Eid Rewards is active, **Then** the same roles that could see rewards before this feature can still see them.
2. **Given** the admin removes a role from the allowed list, **When** a user with that role opens the dashboard, **Then** the Eid popup does not appear.
3. **Given** a specific user has a deny exception, **When** that user opens the dashboard, **Then** the Eid popup does not appear even if their role is allowed.
4. **Given** a specific user has an allow exception, **When** that user opens the dashboard, **Then** the Eid popup appears even if their role is not allowed.
5. **Given** an inactive or deleted user is listed as allowed, **When** that user tries to access rewards, **Then** the system still blocks the reward.

---

### User Story 2 - Reward Claim Is Protected By The Same Audience Rules (Priority: P1)

If a user is not allowed to see Eid Rewards, the same user must not be able to claim points by manually calling the reward action.

**Why this priority**: Hiding the popup alone is not secure. The claim action affects points and can become balance, so the server must enforce the same rule.

**Independent Test**: Deny a user, then call reward status and claim as that user. Status must not show a claimable popup, and claim must fail without creating points or claim records.

**Acceptance Scenarios**:

1. **Given** a user is outside the allowed audience, **When** status is requested, **Then** the response says the user is not eligible and the popup is hidden.
2. **Given** a user is outside the allowed audience, **When** the user tries to claim, **Then** the claim is rejected and no reward points are created.
3. **Given** a user is allowed and has not claimed before, **When** the user claims, **Then** the existing reward claim behavior still works.
4. **Given** a deny exception and an allow role both match the same user, **When** the user requests status or claim, **Then** the deny exception wins.

---

### User Story 3 - Admin Edits All Eid Reward Popup Text (Priority: P2)

An admin edits every visible phrase on the Eid reward popup/card from the Eid Rewards settings page, including headings, button labels, loading text, success text, points text, conversion preview, later button, already-claimed text, inactive event text, and error fallback text.

**Why this priority**: The current screen only exposes two copy fields, while many visible strings are fixed in the interface. Admins need campaign copy control without code changes.

**Independent Test**: Change each text field in admin settings, then open the dashboard and go through loading, eligible, claiming, success, redeem, already-claimed, and error states to verify the saved text appears.

**Acceptance Scenarios**:

1. **Given** the admin saves custom popup text, **When** an eligible user opens the dashboard, **Then** the popup uses the saved text instead of fixed default copy.
2. **Given** a saved text field contains `{points}`, **When** a user claims points, **Then** the displayed text replaces `{points}` with the actual point value.
3. **Given** a saved text field contains `{amount}` and `{currency}`, **When** the conversion preview is shown, **Then** the displayed text uses the actual amount and currency label.
4. **Given** an admin clears a required text field, **When** the admin saves settings, **Then** validation prevents saving and explains the problem.
5. **Given** old settings exist with only the current before/after text fields, **When** the popup loads, **Then** safe default text is used for all newly editable fields.

---

### User Story 4 - Admin Can Review A Clear Settings State (Priority: P3)

The admin page shows enough information to understand whether the reward is active, who can see it, which users have exceptions, and what text will be displayed.

**Why this priority**: This reduces support confusion and prevents accidental reward exposure during campaigns.

**Independent Test**: Open the admin page with no overrides, with several overrides, and with invalid saved data corrected by defaults; verify the page remains understandable and usable.

**Acceptance Scenarios**:

1. **Given** no user exceptions exist, **When** the admin opens the page, **Then** an empty state explains that only role rules are being used.
2. **Given** exceptions exist, **When** the admin opens the page, **Then** allowed and denied users are listed clearly.
3. **Given** a user is searched by username or email, **When** the admin adds an exception, **Then** the user appears once with the chosen effect.
4. **Given** settings fail to save, **When** the admin stays on the page, **Then** previous saved settings remain unchanged.

### Edge Cases

- Deny and allow both exist for the same user: this must not be allowed to save; if legacy data creates a conflict, deny wins.
- A user is allowed by exception but inactive or deleted: the reward remains blocked.
- The event is disabled or outside its time range: audience settings do not make the popup visible.
- The user already claimed: audience settings do not reset claim history.
- A role list is empty: only users explicitly allowed by exception can see and claim.
- Text fields are missing from old rows: defaults are used without breaking the popup.
- A text template uses an unsupported placeholder: validation rejects it.
- Public responses must not expose the full audience list or user exception list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Admins MUST be able to select which existing roles are allowed to see Eid Rewards.
- **FR-002**: The default audience MUST preserve current behavior by allowing `ADMIN`, `MANAGER`, `AGENT`, and `USER`.
- **FR-003**: Admins MUST be able to add per-user allow and deny exceptions.
- **FR-004**: A deny exception MUST override role allowance and allow exceptions.
- **FR-005**: An allow exception MUST allow a user whose role is not selected, unless the user is inactive or deleted.
- **FR-006**: The system MUST prevent duplicate or conflicting exceptions for the same user in the same Eid settings record.
- **FR-007**: Reward status MUST hide the popup and mark the user ineligible when the user is outside the audience.
- **FR-008**: Reward claim MUST reject users outside the audience before creating any claim or point records.
- **FR-009**: Existing claim, point ledger, conversion, and audit behavior MUST remain unchanged for users inside the audience.
- **FR-010**: Admin settings MUST validate audience roles against the existing role list.
- **FR-011**: Admin settings MUST validate user exceptions against existing users.
- **FR-012**: Public reward status responses MUST NOT expose the full role audience or user exception list.
- **FR-013**: The admin settings page MUST show role controls, user exception controls, loading state, empty state, validation errors, and save success.
- **FR-014**: Admins MUST be able to edit all visible popup/card text from the Eid Rewards settings page.
- **FR-015**: Editable text MUST include title, intro text, open button, opening/loading text, success heading, points text, conversion preview text, after-claim text, redeem button, redeeming text, redeemed success text, later button, already-claimed text, claimed-today text, inactive event text, and generic error text.
- **FR-016**: Text fields MUST have server-side length limits and required-field validation.
- **FR-017**: Text templates MUST only allow supported placeholders: `{points}`, `{amount}`, and `{currency}` in fields where those values are available.
- **FR-018**: Old settings rows without the new text bundle MUST receive safe default text without manual database edits.
- **FR-019**: Existing `beforeText` and `afterText` behavior MUST be preserved for backward compatibility.
- **FR-020**: Admin settings save MUST update audience and text in one complete save, or leave the previous settings unchanged if validation fails.
- **FR-021**: Tests MUST cover audience helper behavior, status behavior, claim rejection, text validation, and text rendering defaults.
- **FR-022**: The feature MUST avoid exposing passwords, sessions, provider tokens, or sensitive runtime details in any UI, API response, or log.

### Key Entities *(include if feature involves data)*

- **Eid Reward Settings**: Existing event configuration expanded with allowed roles and a structured popup text bundle.
- **Eid Reward Audience Override**: A per-user allow or deny exception linked to the Eid reward settings.
- **Popup Text Bundle**: Editable text values and template strings used by the dashboard popup/card.
- **User**: Existing account record with role, active state, and deleted state used for audience decisions.
- **Eid Reward Claim**: Existing immutable claim audit row that must only be created after the audience check passes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can save role audience settings and see the saved state reflected after a page refresh.
- **SC-002**: 100% of denied users cannot see the popup and cannot create a reward claim.
- **SC-003**: 100% of users allowed by role or allow exception keep the current successful claim behavior.
- **SC-004**: Public reward status and claim responses expose zero audience rule lists or user exception lists.
- **SC-005**: Admin can edit at least 15 popup/card text fields from the same Eid Rewards settings page.
- **SC-006**: Old Eid reward settings continue to render a complete popup using defaults for missing new text fields.
- **SC-007**: Focused tests and production build checks pass before deployment.

## Assumptions

- The active roles are the existing `ADMIN`, `MANAGER`, `AGENT`, and `USER` roles.
- Eid Rewards remain a web dashboard feature only; no mobile app scope is included.
- The current Eid Rewards admin page remains the single place for these settings.
- Existing claim history is not reset by audience changes.
- Existing rewards points and balance ledgers remain the source of truth for money-relevant behavior.
