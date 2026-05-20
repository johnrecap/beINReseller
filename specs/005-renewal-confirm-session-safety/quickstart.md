# Quickstart: Renewal Confirmation Session Safety

## Baseline Checks

1. Confirm branch:

```bash
git branch --show-current
```

Expected: `codex/fix-renewal-confirm-session-safety`

2. Build web app:

```bash
npm run build
```

3. Build worker:

```bash
cd worker && npm run build
```

## Manual Verification Scenarios

### Scenario 1: Object responseData

1. Start a renewal to the package preparation stage.
2. Confirm the operation has database JSON object response data.
3. Click final confirmation.
4. Verify worker logs do not contain `"[object Object]" is not valid JSON`.
5. Verify final confirmation either succeeds or fails with a clear session/Pay phase decision.

### Scenario 2: Missing operation session before final Pay

1. Prepare a package.
2. Delete the operation-scoped Redis session for that operation.
3. Run final confirmation.
4. Verify the operation is not marked completed.
5. Verify the operation does not claim final Pay was submitted unless real evidence exists.

### Scenario 3: Successful final Pay

1. Complete a normal renewal.
2. Verify `FINAL_PAY_SUBMITTED` is written only during the worker confirm job.
3. Verify completed status is supported by beIN success or balance-change evidence.

### Scenario 4: Logs

1. Run COMPLETE_PURCHASE.
2. Verify logs say the package is prepared for final confirmation.
3. Verify only CONFIRM_PURCHASE can log final payment submission or completion.

## Production Rollout Notes

- No database migration is required.
- Do not restore the database for this fix.
- Restart web and worker processes after build.
- Watch worker logs for session restore failures and Review Required outcomes.
