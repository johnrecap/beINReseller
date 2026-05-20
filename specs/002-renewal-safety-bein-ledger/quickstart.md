# Quickstart: Renewal Safety Corrections and beIN Spend Ledger

## Purpose

Validate the feature without disrupting live operations, customer balances, or beIN account balances.

## Pre-Implementation Checklist

1. Confirm current branch and dirty files.
2. Read `specs/002-renewal-safety-bein-ledger/spec.md`.
3. Read `specs/002-renewal-safety-bein-ledger/plan.md`.
4. Read all files under `specs/002-renewal-safety-bein-ledger/contracts/`.
5. Re-read `AGENTS.md` encoding safety rules before editing.
6. Do not rewrite `worker/src/http-queue-processor.ts` or `worker/src/http/HttpClientService.ts`; use small patches only.

## Local Verification Commands

Run after each implementation chunk:

```powershell
cmd /c npx prisma generate
cmd /c npx tsc --noEmit --pretty false
cmd /c npm --prefix worker run build
cmd /c npx eslint src/lib/refund.ts src/lib/cancellation-safety.ts
```

Add targeted command(s) for any new simulations:

```powershell
cmd /c npx tsx scripts/cancellation-phase-safety-simulations.ts
cmd /c npx tsx scripts/bein-spend-ledger-simulations.ts
```

## Scenario 1: Package Preparation Cancellation

Expected:
- Operation is `COMPLETING`.
- Phase evidence says package preparation, not final Pay.
- Customer cancellation does not become review-required solely because of `COMPLETING`.
- Refund occurs only if customer was actually deducted and refund is safe.

## Scenario 2: Final Confirmation Cancellation

Expected:
- Operation starts `AWAITING_FINAL_CONFIRM`.
- User requests cancel before final Pay.
- Cancellation-confirm worker path can cancel safely.
- No false `REVIEW_REQUIRED` caused by the cancel job setting `COMPLETING`.

## Scenario 3: Post-Final-Pay Unknown Result

Expected:
- Final Pay submitted marker exists.
- beIN response is timeout, busy, login redirect, unreadable, or no confirmation.
- Operation becomes `REVIEW_REQUIRED`.
- No automatic refund is created.
- If balance decrease is confirmed, charged beIN account evidence is visible.

## Scenario 4: Worker Refund Guard Race

Expected:
- Worker tries to refund after operation became `COMPLETED` or `REVIEW_REQUIRED`.
- Refund helper refuses inside transaction.
- User balance does not increase.
- Duplicate refund transaction is not created.

## Scenario 5: Insufficient Customer Balance

Expected:
- Confirm purchase attempts customer deduction.
- If balance is insufficient before final Pay, operation returns to final confirmation only if it is still the expected operation state.
- No newer terminal/review state is overwritten.

## Scenario 6: Legacy Timeout with Amount

Expected:
- `AWAITING_FINAL_CONFIRM` with amount zero may expire safely.
- `AWAITING_FINAL_CONFIRM` with amount greater than zero must use guarded refund or review.
- No silent cancellation leaves unclear customer money state.

## Scenario 7: Confirmed beIN Spend Ledger

Expected:
- Final charged beIN account is recorded.
- Failed pre-charge account attempts are not recorded in confirmed spend.
- Ledger row includes user, operation, beIN account snapshot, proxy snapshot if safe, balance before, balance after, spend amount, and charged time.
- Reprocessing the same operation creates no duplicate row.

## Scenario 8: Spend Report Date Range

Seed confirmed ledger rows across:
- Two beIN accounts
- Two panel users
- Different operation types
- Several dates

Expected:
- Weekly total equals sum of confirmed rows in the week.
- Monthly total equals sum of confirmed rows in the month.
- Custom range total equals sum of rows between `from` and `to`.
- Unconfirmed review items are listed separately and excluded from confirmed totals.

## Production Gate

Do not deploy production until this gate is completed on staging with recorded evidence.

### 1. Backup

1. Take a full database backup before the migration.
2. Store the backup path, timestamp, database name, and operator name in the release notes.
3. Confirm the backup restore command has been tested recently on a non-production database.

### 2. Pause Worker Risk

1. Pause or drain the worker queue if the deployment process allows it.
2. If full pause is not possible, reduce concurrency to the lowest safe value during migration and smoke tests.
3. Confirm no long-running `COMPLETING` jobs are actively clicking final Pay before migration.

### 3. Read-Only Pre-Migration Snapshot

Run these read-only SQL checks and save the results in the release notes:

```sql
SELECT COALESCE(SUM(balance), 0) AS total_user_balance
FROM users
WHERE deleted_at IS NULL;
```

```sql
SELECT type, COUNT(*) AS transaction_count, COALESCE(SUM(amount), 0) AS total_amount
FROM transactions
GROUP BY type
ORDER BY type;
```

```sql
SELECT status, COUNT(*) AS operation_count
FROM operations
GROUP BY status
ORDER BY status;
```

```sql
SELECT COUNT(*) AS active_financial_operations
FROM operations
WHERE status IN ('PROCESSING', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING');
```

### 4. Apply Migration

1. Apply only the additive migration that creates `bein_account_spend_ledger`.
2. Confirm no migration step updates `users`, `transactions`, or existing `operations` rows.
3. Confirm table and indexes exist:

```sql
SELECT to_regclass('public.bein_account_spend_ledger') AS ledger_table;
```

```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'bein_account_spend_ledger'
ORDER BY indexname;
```

### 5. Staging Smoke Tests

Run these on staging before production:

1. Safe renewal with a test card/account.
   - Expected: operation completes or moves to review according to beIN evidence.
   - Expected: if beIN balance decreased, exactly one ledger row exists.
2. Cancellation before final Pay.
   - Expected: cancellation completes safely without false review.
   - Expected: refund only happens if the customer was deducted and final Pay was not submitted.
3. Controlled uncertain result after final Pay.
   - Expected: operation becomes `REVIEW_REQUIRED`.
   - Expected: no automatic refund.
4. Open the beIN spend report.
   - Expected: today, week, month, and custom totals match confirmed ledger rows.

### 6. Read-Only Post-Test Snapshot

Run the same user balance and transaction count SQL again.

Expected:
- Total user balance changes only by the exact test transaction deltas.
- Transaction counts change only by expected test deductions/refunds.
- No unexpected `REFUND` transaction appears for uncertain post-final-Pay outcomes.

### 7. Resume Workers

1. Resume normal worker concurrency.
2. Watch worker logs for final Pay review, ledger creation, and refund-block messages.
3. Keep the admin spend report open for the smoke-test date range until the first live operations are verified.

### 8. Production No-Go Conditions

Do not deploy or continue production rollout if any of these happen on staging:

- User balance total changes without a matching transaction reason.
- A post-final-Pay uncertain outcome creates an automatic refund.
- A confirmed beIN balance decrease creates zero ledger rows.
- A duplicate worker job creates more than one ledger row for the same operation.
- The spend report includes review-required/unconfirmed rows in confirmed totals.
- The worker cannot build or starts with Prisma client errors.

## Rollback Notes

- If code must roll back, keep the ledger table. It is additive and should not break old code.
- Do not delete ledger rows unless a migration rollback has been tested on staging.
- If reports are wrong, disable/hide the report UI first; do not change balances.
- If refund behavior is wrong, pause workers and investigate before continuing financial operations.
- If the migration itself must be rolled back, roll back only after workers are paused and no code path references `bein_account_spend_ledger`.
- If production has already created ledger rows, export them before any rollback attempt.
