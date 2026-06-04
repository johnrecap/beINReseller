# Data Model: Eid Reward Audience And Copy

## EidRewardSettings

Existing singleton settings record for the Eid event.

### Added Fields

- `audienceRoles`: list of existing roles allowed by default.
  - Default: `ADMIN`, `MANAGER`, `AGENT`, `USER`.
  - Validation: every value must be one of the existing roles.
- `popupTexts`: structured text bundle for the reward popup/card.
  - Nullable for legacy rows.
  - Normalized by application code before use.

### Existing Fields Kept

- `beforeText`
- `afterText`

These remain for backward compatibility. Admin save keeps them aligned with the matching fields in `popupTexts`.

## EidRewardAudienceOverride

Per-user exception for Eid reward visibility.

### Fields

- `id`: unique identifier.
- `settingsId`: owning Eid settings record.
- `userId`: user affected by the override.
- `effect`: `ALLOW` or `DENY`.
- `createdAt`: creation timestamp.
- `updatedAt`: last update timestamp.

### Relationships

- Belongs to one `EidRewardSettings`.
- Belongs to one `User`.

### Constraints And Indexes

- Unique `[settingsId, userId]` so a user cannot have both allow and deny rows.
- Index `[settingsId, effect]` for admin filtering.
- Index `[userId]` for status/claim lookup.

## Popup Text Bundle

Structured copy used by the dashboard popup/card.

### Fields

- `title`
- `beforeText`
- `openButtonText`
- `openingText`
- `successTitle`
- `pointsText`
- `moneyPreviewText`
- `afterText`
- `redeemButtonText`
- `redeemingText`
- `redeemedSuccessText`
- `laterButtonText`
- `alreadyClaimedText`
- `claimedTodayText`
- `inactiveEventText`
- `genericErrorText`

### Placeholder Rules

- `pointsText` may use `{points}`.
- `moneyPreviewText` may use `{amount}` and `{currency}`.
- Other fields must not contain unsupported placeholders.

### Validation Rules

- Required fields: all fields listed above.
- Trimmed non-empty text.
- Recommended maximum: 160 characters for button/heading fields, 600 characters for paragraph fields.
- Unknown placeholders are rejected.

## User

Existing account record used for audience decisions.

### Used Fields

- `id`
- `username`
- `email`
- `role`
- `isActive`
- `deletedAt`

### Audience Rules

- Inactive users are always denied.
- Deleted users are always denied.
- Deny override wins.
- Allow override wins over role exclusion.
- Otherwise `audienceRoles` decides.

## EidRewardClaim

Existing immutable claim record.

### Rule Change

Claims are only created after the user passes the audience check. No schema change is required for claim history.
