# Feature Specification: Eid Rewards

**Feature Branch**: `codex/016-eid-rewards`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: Build "Eid Rewards / عيدية العيد" inside the current site. Authenticated users see an animated Eid envelope on the main dashboard, claim server-generated random points during the configured Eid period, and can convert points to the existing site balance using the existing points conversion settings. The system must support all roles, Arabic RTL UI, admin settings, weighted rewards, secure backend-only point selection, ledger records, and Lottie assets under `public/assets/eid-rewards/`.

## Clarifications

### Session 2026-05-26

- Q: Who can see Eid Rewards? -> A: All roles: `USER`, `AGENT`, `MANAGER`, and `ADMIN`.
- Q: Which currency should be displayed? -> A: Use the site's current currency display, not a new hard-coded currency.
- Q: Which conversion settings should be used? -> A: Use the existing points conversion settings from the current Points Settings page.
- Q: What if auto-convert is requested? -> A: No automatic conversion in v1. The user must manually convert points to balance.
- Q: New users only? -> A: No. The feature is available for old and new users.
- Q: Where should admin controls live? -> A: A standalone admin page.
- Q: What about existing Lottie files? -> A: Add the files under `public/assets/eid-rewards/` to Git and deploy them.
- Q: Where should the popup appear? -> A: The main dashboard page only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Claim Eid Points From Main Dashboard (Priority: P1)

Any authenticated user opens the main dashboard during the active Eid event and sees a premium Arabic RTL popup/card with an animated envelope. The user clicks "افتح العيدية الآن"; the frontend plays animation only, while the backend chooses the reward points, records the claim, credits the existing point ledger, and returns the result.

**Why this priority**: This is the core user value. Without a secure claim flow, the feature is only visual and can be abused.

**Independent Test**: Log in as each role, open `/dashboard`, claim once during an active event, and verify the UI shows server-returned points while `point_ledger_entries` and `eid_reward_claims` contain one claim for that user.

**Acceptance Scenarios**:

1. **Given** the Eid event is enabled and active, **When** an eligible authenticated user opens `/dashboard`, **Then** the Eid popup appears with Arabic RTL copy and the envelope animation.
2. **Given** the popup is visible, **When** the user clicks "افتح العيدية الآن", **Then** the button becomes disabled, the opening animation plays, and the frontend sends no point amount.
3. **Given** the claim request succeeds, **When** the API returns points, **Then** the UI displays "مبروك!" and "حصلت على {points} نقطة" plus the conversion preview.
4. **Given** the user tries to double-click or send two claim requests quickly, **When** both requests reach the backend, **Then** only one claim and one point ledger credit are created.
5. **Given** the user already claimed under the configured policy, **When** the status endpoint is requested, **Then** the UI shows the already-claimed message or does not show the popup again.

---

### User Story 2 - Convert Eid Points To Existing Balance (Priority: P2)

After a successful claim, the user can convert available points to site balance using the existing points conversion settings. The conversion is still a backend-only money operation and must update `User.balance`, `Transaction`, and point redemption ledger entries.

**Why this priority**: The reward has monetary value only when it can be converted through the existing balance workflow.

**Independent Test**: Claim points, click "تحويل النقاط إلى رصيد", verify the backend checks available points and current conversion settings, deducts points, adds balance, and records both point and balance ledger records.

**Acceptance Scenarios**:

1. **Given** the user has enough available points and valid conversion settings exist, **When** the user clicks convert, **Then** points are deducted and `User.balance` increases by the server-calculated amount.
2. **Given** conversion settings are invalid or disabled, **When** the popup requests status, **Then** the UI hides/disables conversion and shows a clear message.
3. **Given** the user has fewer available points than the minimum conversion threshold, **When** they try to convert, **Then** no balance changes and the UI shows a friendly error.
4. **Given** the user is an admin, manager, agent, or user, **When** they convert eligible points from the Eid flow, **Then** role boundaries are respected and no role is excluded from the Eid reward conversion path.

---

### User Story 3 - Configure Eid Rewards From Admin Page (Priority: P3)

Admins need a standalone Eid Rewards settings page to enable/disable the event, configure active dates, claim policy, random point range, optional weighted tiers, minimum redeem points, popup behavior, and Arabic text.

**Why this priority**: Operations staff must be able to control the event without code changes or database edits.

**Independent Test**: Log in as admin, open `/dashboard/admin/eid-rewards`, save settings and tiers, then verify the public status and claim APIs use the saved settings without exposing probability weights to users.

**Acceptance Scenarios**:

1. **Given** an admin opens the Eid Rewards settings page, **When** settings load, **Then** current event configuration and weighted tiers are visible.
2. **Given** an admin saves invalid dates, negative points, or invalid tier weights, **When** they submit, **Then** validation errors appear and no partial settings are saved.
3. **Given** weighted tiers are active, **When** a user claims, **Then** the backend chooses only from active tiers using secure weighted random logic.
4. **Given** weighted tiers are disabled or empty, **When** a user claims, **Then** the backend chooses a secure random integer between min and max points.
5. **Given** the event is disabled or outside its date range, **When** a user opens the dashboard, **Then** no claimable popup appears.

---

### User Story 4 - Audit Claims And Conversions (Priority: P4)

Admins need to review claims and conversion activity related to Eid Rewards, including user identity, role, points, claim date, event key, IP, user agent, and linked ledger references.

**Why this priority**: The feature touches points and balance, so support and accounting need auditability.

**Independent Test**: After several users claim and convert, open the admin page and verify claims and related transactions are listed with filters and no sensitive runtime data.

**Acceptance Scenarios**:

1. **Given** Eid claims exist, **When** an admin opens the claims tab, **Then** claims are paginated and include user, role, points, money preview, event key, claim date, and created time.
2. **Given** a claim was created, **When** an admin searches by username or event key, **Then** matching claims are returned without leaking passwords, sessions, tokens, or provider secrets.
3. **Given** conversions exist after claims, **When** an admin opens the transactions tab, **Then** linked point redemption and balance transaction data can be reviewed.

---

### Edge Cases

- Lottie files are missing or invalid: use CSS fallback envelope, shake/open animation, confetti, and count-up.
- Event has `startsAt` or `endsAt` missing: status returns inactive until both are valid.
- `minPoints > maxPoints`: admin save is rejected.
- Tier weights sum to zero or all tiers inactive: fallback to min/max random only if min/max are valid.
- Same user claims from two tabs/devices at the same time: unique claim scope and transaction handling allow only one success.
- `once_per_day` across timezones: claim date is based on Africa/Cairo calendar day.
- User clicks "لاحقا": hide only in `sessionStorage`; server eligibility remains the source of truth.
- Existing points conversion settings are disabled: claim still works, conversion button is disabled with clear copy.
- Admin role currently cannot use the existing generic point redemption endpoint: Eid redeem path must support all roles or the shared service must be safely broadened.
- Pre-existing point summaries currently count only spend-earned points as available; Eid points must be included as available in the summary.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show the Eid Rewards popup only on the main dashboard page for authenticated users when settings are enabled, active, and the user is eligible.
- **FR-002**: The feature MUST support `USER`, `AGENT`, `MANAGER`, and `ADMIN` roles for claim eligibility.
- **FR-003**: The frontend MUST NOT send or choose point values during claim.
- **FR-004**: The backend MUST choose points using secure server-side randomness.
- **FR-005**: The backend MUST support weighted tiers when active tiers exist and MUST not expose tier weights to public status/claim responses.
- **FR-006**: The backend MUST fallback to secure random points between min and max when no active weighted tiers exist.
- **FR-007**: The claim endpoint MUST create exactly one `EidRewardClaim` and one positive `PointLedgerEntry` with source type `EID_REWARD` for each successful claim.
- **FR-008**: Claim uniqueness MUST be enforced for once-per-event and once-per-day policies using a stable claim scope key.
- **FR-009**: The feature MUST use the existing `PointLedgerEntry` system as the point balance source of truth, not a separate points wallet table.
- **FR-010**: The feature MUST use existing `PointProgramSettings` conversion settings from the Points Settings page.
- **FR-011**: The feature MUST use existing `User.balance`, `Transaction`, `PointCashRedemption`, and point ledger redemption behavior for conversion to balance.
- **FR-012**: The Eid-specific redeem endpoint or shared redemption service MUST allow all roles included in Eid Rewards.
- **FR-013**: Conversion MUST be done by explicit user action; v1 MUST NOT auto-convert points to balance.
- **FR-014**: The status API MUST return eligibility, claim state, points balance, conversion readiness, conversion preview, minimum redeem points, popup copy, and user-facing message.
- **FR-015**: The status API MUST NOT return weighted probability rules, internal validation rules, or sensitive security details.
- **FR-016**: Admin settings MUST include enabled, starts/ends dates, event key, claim policy, min/max points, min redeem points, popup controls, text fields, and weighted tiers.
- **FR-017**: Admin settings save MUST validate dates, points, tier weights, text lengths, and event key format server-side.
- **FR-018**: Admin claims and transactions APIs MUST be protected by exact admin authorization.
- **FR-019**: Claim and redeem endpoints MUST require authentication and apply rate limiting.
- **FR-020**: Claim records MUST store IP address and user agent.
- **FR-021**: The UI MUST be RTL, Arabic-first, responsive, and visually consistent with the current dark Desh Panel design.
- **FR-022**: The UI MUST use the three Lottie assets when available and CSS fallback when unavailable.
- **FR-023**: The UI MUST implement loading, eligible, claiming, success, already claimed, redeeming, redeemed, inactive, and error states.
- **FR-024**: The admin page MUST include loading, saved, validation error, empty tiers, empty claims, and API error states.
- **FR-025**: The Lottie files under `public/assets/eid-rewards/` MUST be tracked in Git for deployment.

### Key Entities

- **Eid Reward Settings**: Singleton event configuration, active dates, claim policy, min/max points, minimum redeem points, popup copy, event key, and behavior toggles.
- **Eid Reward Tier**: Optional weighted point award tier owned by settings, with points, probability weight, label, active flag, and timestamps.
- **Eid Reward Claim**: Immutable audit row for a user claim, including user id, points, money preview, claim date, event key, claim scope key, IP, user agent, and point ledger reference.
- **Point Ledger Entry**: Existing point source of truth. Eid claims add positive `EID_REWARD` entries; conversions add negative `POINT_CASH_REDEMPTION` entries.
- **Point Cash Redemption**: Existing conversion audit table used when points are converted into balance.
- **Transaction**: Existing balance movement ledger used to credit `User.balance` after conversion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of authenticated roles can see and claim Eid Rewards when eligible.
- **SC-002**: Repeated fast claim attempts produce exactly one successful claim per configured policy scope.
- **SC-003**: No public API response includes weighted tier probabilities.
- **SC-004**: Every successful claim has matching `eid_reward_claims` and `point_ledger_entries` rows.
- **SC-005**: Every successful conversion has matching negative point ledger, `point_cash_redemptions`, `transactions`, and updated `users.balance`.
- **SC-006**: The dashboard popup works on mobile and desktop without text overflow.
- **SC-007**: Missing Lottie assets still produce a functional CSS envelope and result UI.
- **SC-008**: Focused unit/integration tests, `npm run build`, and `npm --prefix worker run build` pass before deployment.

## Assumptions

- The current site balance for reseller users is `users.balance`.
- The current currency label is already exposed through existing dashboard translations/components and should be reused where available.
- Eid Rewards v1 does not target the separate B2C mobile `Customer.walletBalance` system.
- Existing Lottie JSON files are suitable for the requested envelope/open/celebration states.
- Claim date should use Africa/Cairo calendar day for daily policy.
- Admins can manually adjust settings before enabling the event.
