# Research: Eid Rewards

## Decision 1: Reuse Existing Point Ledger Instead Of Creating `user_points_wallets`

**Decision**: Eid points are represented as `PointLedgerEntry` rows with a new source type `EID_REWARD`.

**Rationale**: The project already has a point ledger, point balance summary, reward redemption, and point-to-balance conversion flow. Creating a second points wallet would introduce conflicting balances and require duplicated redemption logic.

**Alternatives Considered**:

- Create `user_points_wallets`: Rejected because it duplicates existing point balance source of truth.
- Store points only on `eid_reward_claims`: Rejected because existing rewards/conversion pages would not see those points.

## Decision 2: Reuse Existing Conversion Settings

**Decision**: Eid Rewards uses `PointProgramSettings.cashConversionPoints` and `cashConversionAmountUsd`.

**Rationale**: User clarified conversion should use the same settings from the current Points Settings page.

**Alternatives Considered**:

- Add separate Eid conversion rate settings: Rejected because it conflicts with the clarification and increases admin confusion.

## Decision 3: No Automatic Conversion In V1

**Decision**: `auto_convert_to_wallet` from the original prompt is not implemented as automatic behavior in v1. Users must explicitly click convert.

**Rationale**: User clarified the customer/user should perform conversion manually from points to balance.

**Alternatives Considered**:

- Keep auto-convert as a setting but ignore it: Rejected because hidden/no-op settings are operationally dangerous.
- Implement auto-convert despite clarification: Rejected because it would surprise users and admins.

## Decision 4: Add A Settings-Owned Event Key

**Decision**: Add `eventKey` to Eid settings and use it to generate claim scope keys.

**Rationale**: `once_per_event` needs a stable event identity. Without an event key, a future Eid event could accidentally block users who claimed in a previous event.

**Alternatives Considered**:

- Derive event key from start/end dates only: Rejected because small date edits after claims can change uniqueness behavior.
- Hard-code one event key: Rejected because future campaigns need a safe reset.

## Decision 5: Claim Date Uses Africa/Cairo

**Decision**: `once_per_day` uses Africa/Cairo calendar date.

**Rationale**: The deployment/user context is Egypt/Cairo and existing user messages are Arabic-first.

**Alternatives Considered**:

- UTC date: Rejected because a user could see "today" differ from operational day.
- Browser local date: Rejected because eligibility must come from the server.

## Decision 6: Secure Random In Node

**Decision**: Use `crypto.randomInt` for tier selection and min/max fallback.

**Rationale**: The reward value has monetary impact, so `Math.random` is not appropriate.

**Alternatives Considered**:

- `Math.random`: Rejected due to predictability concerns.

## Decision 7: Lottie Library

**Decision**: Use `lottie-react` for React/Next and CSS fallback when JSON assets fail.

**Rationale**: The project is React/Next and currently has no Lottie dependency. `lottie-react` is small and fits client components.

**Alternatives Considered**:

- Load `lottie-web` directly: Works but produces more custom lifecycle code.
- Use remote/CDN player: Rejected for deployment reliability and CSP/privacy.

## Decision 8: Admin Page Is Standalone

**Decision**: Create `/dashboard/admin/eid-rewards`.

**Rationale**: User explicitly requested an independent admin page. The feature has settings, tiers, claims, and transaction audit views; mixing it into generic rewards/points would make it harder to operate.

## Decision 9: All Roles Can Claim

**Decision**: Claim eligibility includes `USER`, `AGENT`, `MANAGER`, and `ADMIN`.

**Rationale**: User clarified all roles. Existing conversion service may need a safe Eid path for admin conversion.

**Alternatives Considered**:

- Reuse existing `/api/points/cash-redemptions` unchanged: Rejected because it currently denies `ADMIN`.
