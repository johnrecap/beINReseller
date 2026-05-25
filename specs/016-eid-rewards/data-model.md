# Data Model: Eid Rewards

## Existing Entities Reused

### User

- Existing table: `users`
- Used fields: `id`, `username`, `role`, `balance`, `isActive`, `deletedAt`, `createdAt`
- Relationship added: `eidRewardClaims`

### PointLedgerEntry

- Existing table: `point_ledger_entries`
- New source type: `EID_REWARD`
- Claim entry:
  - `ownerUserId`: claimant user id
  - `ownerRoleAtTime`: claimant role
  - `sourceType`: `EID_REWARD`
  - `sourceId`: `EidRewardClaim.id`
  - `points`: positive integer points
  - `status`: `AVAILABLE`
  - `amountUsdSnapshot`: conversion preview using current settings when valid
  - `notes`: human-readable Eid claim note

### PointCashRedemption

- Existing table: `point_cash_redemptions`
- Used for manual conversion from points to balance.
- Eid conversion should reuse this audit table where possible.

### Transaction

- Existing table: `transactions`
- Used to credit `users.balance` after point conversion.

### PointProgramSettings

- Existing table: `point_program_settings`
- Source of conversion ratio:
  - `cashConversionPoints`
  - `cashConversionAmountUsd`

## New Entity: EidRewardSettings

Singleton settings row.

Fields:

- `id`: string, default `default`
- `enabled`: boolean
- `eventKey`: string, stable campaign key such as `eid-2026`
- `startsAt`: datetime nullable
- `endsAt`: datetime nullable
- `claimPolicy`: enum `ONCE_PER_EVENT | ONCE_PER_DAY`
- `minPoints`: integer
- `maxPoints`: integer
- `minRedeemPoints`: integer
- `showPopupAfterLogin`: boolean
- `allowLaterDismiss`: boolean
- `closeDelaySeconds`: integer
- `beforeText`: text
- `afterText`: text
- `updatedByAdminId`: string nullable
- `createdAt`: datetime
- `updatedAt`: datetime

Validation:

- `eventKey` required, stable, max 80 chars, URL/identifier-safe.
- `startsAt` and `endsAt` required before enabling.
- `startsAt < endsAt`.
- `minPoints >= 1`.
- `maxPoints >= minPoints`.
- `minRedeemPoints >= 1`.
- `closeDelaySeconds >= 0`.
- Text fields have safe length limits.

## New Entity: EidRewardTier

Optional weighted reward tier.

Fields:

- `id`
- `settingsId`
- `points`
- `probabilityWeight`
- `label` nullable
- `isActive`
- `createdAt`
- `updatedAt`

Validation:

- `points >= 1`.
- `probabilityWeight >= 1` for active tiers.
- Active tier points do not need to be inside min/max; tiers are explicit overrides.
- Public APIs must never expose `probabilityWeight`.

## New Entity: EidRewardClaim

Immutable claim audit.

Fields:

- `id`
- `userId`
- `points`
- `moneyValue` nullable
- `claimDate` date
- `eventKey`
- `claimScopeKey`
- `ipAddress` nullable
- `userAgent` nullable
- `pointLedgerEntryId` nullable
- `createdAt`

Claim scope:

- Once per event: `claimScopeKey = eventKey`
- Once per day: `claimScopeKey = eventKey + ":" + yyyy-mm-dd`

Constraints:

- Unique `(userId, claimScopeKey)`
- Index `(eventKey, claimDate)`
- Index `(userId, createdAt)`

## Claim State Machine

1. `inactive`: settings disabled or current server time outside configured range.
2. `eligible`: active event and no claim in current scope.
3. `claiming`: client-only transient state.
4. `claimed`: claim and point ledger rows exist.
5. `redeemable`: claimed/has available points and conversion settings are valid.
6. `redeemed`: conversion created negative point ledger, point cash redemption, transaction, and balance update.

## Relationship Notes

- `EidRewardClaim.pointLedgerEntryId` may be nullable during creation planning, but implementation should set it in the same transaction.
- `PointLedgerEntry.sourceId` should equal `EidRewardClaim.id` to keep existing unique ledger guarantees.
- Admin transaction audit can find claims through claim rows and conversion records through `PointCashRedemption`.
