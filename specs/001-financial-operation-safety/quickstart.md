# Quickstart: Validate Financial Operation Safety

## Goal

Validate the implementation without disrupting live operations or customer balances.

## Pre-Deployment Checklist

1. Create a full database backup.
2. Restore the backup into a separate database and confirm it opens.
3. Record baseline counts:
   - Total user balance sum
   - Total transactions count
   - Total operations count by status
   - Total refunds count
   - Total deductions count
4. Pause or reduce new financial operations during deployment if possible.
5. Stop workers only for the minimum time needed to deploy worker code.
6. Do not bulk-update balances.

## Live Rollout Steps

Use this sequence for production so active customer operations are not disrupted:

1. Take a database backup and confirm it restores in a separate database.
2. Record operation counts by status before deployment, especially `COMPLETING`, `AWAITING_FINAL_CONFIRM`, and `REVIEW_REQUIRED`.
3. Temporarily pause or reduce new renewal requests if possible.
4. Stop worker processes only after the web app code is ready to deploy.
5. Deploy web app code and worker code from the same branch.
6. Start workers again and watch logs for `REVIEW_REQUIRED` transitions.
7. Run one safe renewal smoke test with a test card/account.
8. Run one safe card-check smoke test.
9. Confirm no unexpected `REFUND` transaction was created for operations that became `REVIEW_REQUIRED`.
10. Resume normal traffic after the smoke tests pass.

## Test Scenarios

### Outcome category baseline

Before changing refund behavior, verify final Pay results are classified into:
- `CONFIRMED_SUCCESS`
- `CONFIRMED_NOT_CHARGED`
- `UNCERTAIN_REVIEW_REQUIRED`

The queue processor helper must treat only `CONFIRMED_NOT_CHARGED` as refund-safe. Unknown post-Pay results must be review-required.

### Scenario 1: Clear beIN success

Expected:
- Operation completes.
- No refund is created.
- Customer deduction remains.
- beIN evidence is stored.

### Scenario 2: beIN balance decreases but success text is missing

Expected:
- No refund is created.
- Operation completes or moves to review.
- Owner funds are protected.

### Scenario 3: Timeout after final Pay

Expected:
- Operation moves to review.
- No refund is created automatically.

### Scenario 4: Transaction busy after final Pay

Expected:
- Worker retries verification.
- If still unclear, operation moves to review.
- No refund is created automatically.

### Scenario 5: Customer cancels before final Pay

Expected:
- Operation cancels.
- Refund is created once if customer was deducted.

### Scenario 6: Customer cancels during final Pay

Expected:
- Operation moves to review.
- No refund is created automatically.
- Completed operation is not overwritten.

### Scenario 7: Duplicate worker or cancel job

Expected:
- Terminal status is not overwritten.
- At most one refund exists.

## Verification Commands

Run after implementation:

```powershell
cmd /c npx prisma generate
cmd /c npx tsc --noEmit --pretty false
cmd /c npx eslint src/lib/refund.ts src/app/api/operations/[id]/cancel/route.ts src/app/api/operations/[id]/confirm-purchase/route.ts
cmd /c npm --prefix worker run build
node worker/dist/http/final-pay-outcome-simulations.js
cmd /c npx tsx scripts/cancellation-safety-simulations.ts
git diff --check
```

## Post-Deployment Monitoring

For the first production window, monitor:
- New `REVIEW_REQUIRED` operations
- Refund count
- Operations completed after timeout/busy responses
- Customer balance sum
- beIN dealer balance changes
- Worker error logs

## Rollback Guidance

If a severe issue appears:
1. Stop new financial operations.
2. Stop workers.
3. Do not immediately restore the database if customers made new transactions after backup.
4. Compare production with restored backup in a separate database.
5. Reconcile affected operations manually.
