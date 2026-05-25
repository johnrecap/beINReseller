# Data Model: Spend-Based Points and Cash Redemptions

## Point Program Settings

Represents the admin-controlled singleton configuration for the spend-based points program.

**Fields**:

- `id`: singleton identifier.
- `pointsEnabled`: boolean flag controlling whether new completed operations can earn points.
- `pointsStartAt`: timestamp. Completed operations before this timestamp never earn spend points.
- `userPointsPerThousand`: default user earn rate.
- `agentPointsPerThousand`: default agent earn rate.
- `managerPointsPerThousand`: default manager earn rate.
- `cashConversionPoints`: positive point amount used in conversion ratio.
- `cashConversionAmountUsd`: positive balance amount credited for `cashConversionPoints`.
- `updatedByAdminId`: admin who last changed settings.
- `createdAt`, `updatedAt`: audit timestamps.

**Validation**:

- `pointsStartAt` is required before `pointsEnabled` can be true.
- Earn rates may be zero or positive.
- Conversion points and amount must be positive for conversion to be enabled.

## Point Rule

Existing role default and owner-specific point rules should be reused where possible.

**Required behavior change**:

- A zero owner-specific override is valid and must not fall back to default.
- Inactive rules remain history.
- Active uniqueness remains one active default per owner type and one active override per owner.

## Point Ledger Entry

Immutable point accounting entry.

**Existing fields reused**:

- `ownerUserId`
- `ownerRoleAtTime`
- `sourceType`
- `sourceId`
- `points`
- `status`
- `ratePerThousandSnapshot`
- `amountUsdSnapshot`
- `createdById`
- `createdAt`
- `notes`

**Required source types**:

- `OPERATION_SPEND`: positive points earned from a completed subscription operation.
- `POINT_CASH_REDEMPTION`: negative points converted into balance.
- `POINT_REVERSAL`: negative points reversing prior operation spend points.
- Legacy values such as `CREDIT_REQUEST`, `MANAGER_TOPUP`, and `REWARD_REDEMPTION` remain for existing audit data.

**Required relationships**:

- Spend entries link to the completed operation through `sourceId` and, if added, an explicit nullable `operationId`.
- Cash redemption entries link to the cash redemption record.
- Reversal entries link to the original operation and original owner context.

**Uniqueness and idempotency**:

- One `OPERATION_SPEND` entry per owner and operation.
- One cash redemption entry per conversion request.
- Reversal entries must be uniquely identifiable without colliding with the original spend entry.

## Point Cash Redemption

Represents an immediate conversion from points into account balance.

**Fields**:

- `id`: redemption id.
- `ownerUserId`: authenticated owner who converted points.
- `pointsConverted`: positive point amount requested and converted.
- `balanceAmountUsd`: positive balance amount credited.
- `conversionPointsSnapshot`: configured denominator at conversion time.
- `conversionAmountUsdSnapshot`: configured numerator at conversion time.
- `ledgerEntryId`: negative point ledger entry.
- `transactionId`: balance transaction that credits the user.
- `requestedAt`: conversion timestamp.

**State**:

- V1 conversions are atomic and final. There is no pending approval state.

## Completed Operation Point Award

Logical grouping for points generated from one completed operation.

**Inputs**:

- Operation id.
- Operation user id.
- Operation amount.
- Operation completed timestamp.
- Manager relationship at completion time.
- Active agent assignment at completion time.
- Point settings and rates.

**Recipient rules**:

- Manager relationship exists: manager recipient only.
- Else active agent assignment exists: user and agent recipients.
- Else direct user: user recipient only.

## Point Summary

Aggregated view used by wallets, admin users, manager users, and dashboards.

**Fields**:

- `availablePoints`: points that can be converted.
- `lifetimeEarnedPoints`: all positive spend-earned points.
- `convertedPoints`: absolute value of converted point deductions.
- `reversedPoints`: absolute value of reversal deductions.
- `legacyPoints`: old point entries if shown for audit.

**Calculation**:

- Available points equals spend-earned positives plus allowed adjustments minus cash redemptions and reversals.
- Legacy entries are excluded from new spend-earned totals unless a migration explicitly classifies them as convertible.

## Legacy Migration Rule

Existing `CREDIT_REQUEST`, `MANAGER_TOPUP`, `REWARD_REDEMPTION`, `ADMIN_RELEASE`, and `ADMIN_ADJUSTMENT` rows stay in `point_ledger_entries` as audit history. They are grouped into the `legacyPoints`/`legacy` summary field and are not counted as spend-earned available points for the new cash conversion flow. No migration backfills old `Operation` spend; only `OPERATION_SPEND` entries created after `pointsStartAt` are convertible in the v1 balance summary.
