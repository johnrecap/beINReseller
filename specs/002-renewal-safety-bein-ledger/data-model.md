# Data Model: Renewal Safety Corrections and beIN Spend Ledger

## Existing Entities

### Operation

Existing source of customer work.

Relevant existing fields:
- `id`
- `userId`
- `type`
- `cardNumber`
- `amount`
- `status`
- `responseData`
- `selectedPackage`
- `beinAccountId`
- `createdAt`
- `updatedAt`
- `completedAt`

Planned interpretation:
- `beinAccountId` remains the assigned/current beIN account used by the worker before or during processing.
- It must not be used alone for confirmed spend totals.
- `responseData` may hold non-sensitive phase evidence such as `operationPhase`, `finalPaySubmitted`, `finalPaySubmittedAt`, `finalPayJobType`, `reviewReason`, and balance snapshots.

### Transaction

Existing source of customer wallet movement.

Relevant fields:
- `operationId`
- `userId`
- `amount`
- `type`
- `createdAt`

Planned use:
- `OPERATION_DEDUCT` proves customer panel balance was deducted.
- `REFUND` proves customer panel balance was returned.
- Transactions help refund safety helpers decide whether refund is possible and already done.

### BeinAccount

Existing source of beIN login/account identity.

Relevant fields:
- `id`
- `username`
- `label`
- `dealerBalance`
- `proxyId`

Planned use:
- The ledger stores a username/label snapshot so reports remain readable if the account label later changes.
- Secrets are never copied into ledger or report payloads.

### Proxy

Existing proxy assignment entity.

Planned use:
- Store `proxyId` and optional safe display snapshot in the ledger when available.
- Do not store proxy credentials in ledger or report payloads.

## New Entity: BeinAccountSpendLedger

One confirmed spend record for one operation.

Suggested Prisma model name:
- `BeinAccountSpendLedger`

Suggested table name:
- `bein_account_spend_ledger`

Fields:
- `id`: unique row id
- `operationId`: operation that caused the spend, unique for confirmed spend
- `userId`: panel user who requested the operation
- `beinAccountId`: final beIN account whose dealer balance was charged
- `proxyId`: proxy assigned to the beIN account at charge time, nullable
- `operationType`: renewal/check/activation/installment operation category
- `operationStatusAtRecord`: operation status when the row was created
- `cardNumberSnapshot`: card number used by the operation, stored only if existing system already treats this as allowed admin-visible data
- `selectedPackageName`: safe package display name, nullable
- `selectedPackagePrice`: selected package price from panel data, nullable
- `currency`: default `USD` unless beIN source changes
- `dealerBalanceBefore`: beIN dealer balance before final Pay, nullable
- `dealerBalanceAfter`: beIN dealer balance after final Pay, nullable
- `spendAmount`: `dealerBalanceBefore - dealerBalanceAfter` when both are known and positive
- `evidenceSource`: `BALANCE_DELTA`, `MANUAL_CONFIRMED_BALANCE`, or future safe sources
- `evidenceConfidence`: `CONFIRMED` for totals; avoid estimated rows in v1 totals
- `beinUsernameSnapshot`: beIN username/email snapshot for admin display
- `beinLabelSnapshot`: beIN label snapshot for admin display, nullable
- `proxyLabelSnapshot`: safe proxy label/host snapshot, nullable and no credentials
- `chargedAt`: timestamp used for date-range reports
- `createdAt`
- `updatedAt`

Constraints:
- Unique: `operationId`
- Index: `[beinAccountId, chargedAt]`
- Index: `[userId, chargedAt]`
- Index: `[operationType, chargedAt]`
- Index: `[chargedAt]`

Validation:
- `spendAmount` must be greater than zero for confirmed total rows.
- If balance before/after are both present, `spendAmount` must equal before minus after within a small rounding tolerance.
- Ledger creation must be idempotent.
- A ledger row must not be created for pre-charge failures.
- A ledger row must not be created for unconfirmed outcomes unless manual reconciliation explicitly confirms beIN balance was charged.

## New Helper Entity: SafeRefundDecision

This can be a TypeScript type/helper, not necessarily a database table.

Fields:
- `refundAllowed`: boolean
- `reviewRequired`: boolean
- `reason`: machine-readable reason
- `humanMessage`: admin-readable message
- `finalPayMayHaveStarted`: boolean
- `customerWasDeducted`: boolean
- `refundAlreadyExists`: boolean
- `terminalStatus`: boolean
- `evidence`: non-sensitive JSON object

Rules:
- Completed, review-required, cancelled, failed, and expired operations are terminal unless the caller is explicitly resolving review.
- If final Pay may have started and non-charge is not confirmed, refund is blocked.
- Duplicate refund returns a safe no-op result.

## New Helper Entity: OperationPhaseEvidence

This can be stored in `Operation.responseData` to avoid a risky enum migration in v1.

Fields:
- `phase`: `PACKAGE_PREPARATION`, `FINAL_CONFIRMATION`, `CANCELLATION_CONFIRM`, `FINAL_PAY_SUBMITTED`, `POST_FINAL_PAY_REVIEW`
- `jobType`: queue job type that wrote the marker
- `finalPaySubmitted`: boolean
- `finalPaySubmittedAt`: timestamp
- `cancelRequestedAt`: timestamp
- `dealerBalanceBefore`: nullable number
- `dealerBalanceAfter`: nullable number
- `outcomeCategory`: result classification

Rules:
- `COMPLETING` plus `PACKAGE_PREPARATION` is not post-final-Pay.
- `COMPLETING` plus `CANCELLATION_CONFIRM` is not post-final-Pay.
- `COMPLETING` plus `FINAL_PAY_SUBMITTED` is post-final-Pay.
- Missing phase evidence in legacy operations must be handled conservatively using amount, transactions, job type, and review evidence.

## Report Shape: beIN Spend Summary

Fields:
- `from`
- `to`
- `groupBy`
- `currency`
- `totals.confirmedSpend`
- `totals.confirmedOperationCount`
- `totals.unconfirmedReviewCount`
- `accounts[]`
  - `beinAccountId`
  - `beinUsernameSnapshot`
  - `beinLabelSnapshot`
  - `confirmedSpend`
  - `confirmedOperationCount`
  - `reviewRequiredCount`
  - `lastChargedAt`

## Report Shape: beIN Spend Detail Row

Fields:
- `ledgerId`
- `operationId`
- `chargedAt`
- `panelUserId`
- `panelUsername`
- `beinAccountId`
- `beinUsernameSnapshot`
- `operationType`
- `cardNumber`
- `selectedPackageName`
- `dealerBalanceBefore`
- `dealerBalanceAfter`
- `spendAmount`
- `evidenceSource`
- `operationStatusAtRecord`
