# Data Model: Points Analysis Report

## Existing Tables Used

### PointLedgerEntry

Source table: `point_ledger_entries`

Key fields:

- `id`
- `ownerUserId`
- `ownerRoleAtTime`
- `sourceType`
- `sourceId`
- `creditRequestId`
- `operationId`
- `points`
- `status`
- `ratePerThousandSnapshot`
- `amountUsdSnapshot`
- `createdById`
- `createdAt`
- `releasedAt`
- `releasedByAdminId`
- `notes`

Report use:

- One row per point movement.
- Positive `OPERATION_SPEND` and `EID_REWARD` rows are earnings.
- Negative `POINT_CASH_REDEMPTION` rows are conversions to balance.
- Negative `POINT_REVERSAL` rows are deductions due to reversals.
- Legacy/manual sources are shown separately.

### User

Source table: `users`

Report use:

- Shows owner username, email, role, active state, deleted state, balance, manager/agent context where already available.
- Shows created-by user or related manager/agent names when enough relation data is available.

### PointCashRedemption

Source table: `point_cash_redemptions`

Report use:

- Explains which points were converted to money.
- Links a negative ledger entry to balance amount and transaction id.
- Shows conversion ratio snapshots.

### Transaction

Source table: `transactions`

Report use:

- Shows the balance credit created by a points conversion.
- Provides balance after conversion where available.

### Operation

Source table: `operations`

Report use:

- Shows operation/card/reference details for spend-based point awards when linked by `operationId`.

## New View Models

### PointsAnalysisSummary

Fields:

- `earnedPoints`
- `availablePoints`
- `convertedPoints`
- `convertedBalanceAmount`
- `reversedPoints`
- `pendingPoints`
- `cancelledPoints`
- `legacyPoints`
- `ownersCount`
- `ledgerEntriesCount`

Rules:

- Use the same balance semantics as `summarizePointBalance`.
- Exclude cancelled rows from available totals.
- Count conversion amount from `point_cash_redemptions.balanceAmountUsd`.

### PointsAnalysisRow

Fields:

- `ledgerEntryId`
- `createdAt`
- `createdAtDisplay`
- `owner`
- `sourceType`
- `sourceLabel`
- `status`
- `points`
- `direction`
- `amountUsdSnapshot`
- `ratePerThousandSnapshot`
- `moneyValue`
- `operationRef`
- `redemptionRef`
- `transactionRef`
- `notes`

Rules:

- `direction` is `earn`, `convert`, `reverse`, `legacy`, or `neutral`.
- Missing related references are allowed and rendered as unavailable.
- No secrets or sensitive account credentials appear in the row.

### OwnerPointTimeline

Fields:

- `owner`
- `summary`
- `rows`
- `pagination`

Rules:

- Owner detail rows use the same row mapping as the global ledger table.
- The owner summary is calculated from all owner ledger rows, not only the current page.

## Validation Rules

- `from` and `to` date filters must parse as Egypt-local dates or ISO values and become safe UTC bounds server-side.
- `role` filter must be one of `ADMIN`, `MANAGER`, `AGENT`, `USER`.
- `sourceType` filter must be one of existing `PointLedgerSourceType` values.
- `status` filter must be one of existing `PointLedgerStatus` values.
- `page` must be at least 1.
- `limit` must be bounded, default 25, max 100.
- `ownerSearch` must be trimmed and capped to avoid expensive uncontrolled searches.
