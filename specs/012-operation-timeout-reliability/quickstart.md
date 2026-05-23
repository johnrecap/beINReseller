# Quickstart: Operation Timeout Reliability Validation

## Prerequisites

- Test or staging environment with Redis, database, web, worker, and maintenance process available.
- Test customer with enough balance for one renewal.
- Test beIN account with proxy configured.
- Admin access to operations history, active operations, financial review, and logs.
- Do not run destructive tests on production without a database backup and explicit approval.

## Scenario 1: Package Selection Abandoned

1. Start a renewal until packages are loaded.
2. Confirm operation status is `AWAITING_PACKAGE`.
3. Close the browser or stop the page heartbeat.
4. Wait longer than the package selection deadline.
5. Verify the operation becomes terminal in database, history, and active operations.
6. Verify no customer balance was deducted.
7. Verify beIN account lock was released.

Expected result: Operation is no longer active within the target timeout.

## Scenario 2: Final Confirmation Abandoned

1. Start a renewal, choose a package, and reach the final confirmation step.
2. Confirm operation status is `AWAITING_FINAL_CONFIRM`.
3. Close the browser or stop the page heartbeat.
4. Wait longer than the final confirmation deadline.
5. Verify the operation becomes terminal or review-required according to whether customer money was deducted.
6. Verify no stale active operation remains.

Expected result: No final confirmation operation remains active after deadline processing.

## Scenario 3: Dispatch Failure After Deduction

1. Prepare a final confirmation.
2. Temporarily force job dispatch failure in staging or pause the worker.
3. Confirm the route deducts customer balance only if the operation moves to `COMPLETING`.
4. Run the recovery cycle.
5. Verify the operation is retried, safely refunded, or moved to review.
6. Verify there is no silent failed operation with missing refund/review evidence.

Expected result: Customer money is never lost silently.

## Scenario 4: Provider Server Error With Balance Decrease

1. Use a controlled test where final payment returns a provider error page but provider balance decreases by the expected amount.
2. Verify outcome classification marks the operation completed or charged, not failed/refunded.
3. Verify logs mention balance evidence without leaking credentials.

Expected result: Balance delta overrides misleading Server Error page title.

## Scenario 5: Provider Server Error With No Balance Decrease

1. Use a controlled test where final payment returns Server Error and provider balance remains unchanged.
2. Verify operation is failed safely or review-required based on final Pay evidence.
3. Verify customer refund happens exactly once only when safe.

Expected result: No duplicate refund and no false completion.

## Scenario 6: Concurrent Final Confirm On Same beIN Account

1. Prepare two operations that use the same beIN account.
2. Confirm both around the same time.
3. Verify only one final confirmation critical section runs at once for that account.
4. Verify the second operation waits, retries, or receives a safe response instead of corrupting session state.

Expected result: No overlapping final Pay on the same beIN account/session.

## Scenario 7: Maintenance Runner Health

1. Start web, worker, keepalive, and maintenance process.
2. Verify maintenance logs show regular cycle summaries.
3. Stop maintenance process.
4. Verify PM2 restarts it or monitoring shows stale health.
5. Restart all services and confirm recovery resumes without duplicate outcomes.

Expected result: Admin/operator can tell whether recovery is running.

## Required Verification Commands

```bash
npm run build
cd worker && npm run build
git diff --check
```

Run a changed-file mojibake scan before commit/deploy.

## Rollout Gate Status

Local verification can confirm compilation, recovery classification, and static safety checks. The following scenarios require staging or a controlled production-like test account and must be completed before final rollout:

- Package selection abandoned after packages load.
- Final confirmation abandoned after customer reaches confirmation.
- Dispatch failure after customer deduction with worker/queue paused or mocked.
- Concurrent final confirmation on the same beIN account.

Do not mark these rollout scenarios complete from local build results alone. Each scenario must verify database status, customer balance/refund or review visibility, maintenance health, and absence of overlapping final Pay.

## Optional DB Integration Test

Run this only in staging or a disposable local database with Redis configured:

```bash
RUN_DB_INTEGRATION_TESTS=true npx tsx --test tests/integration/operation-timeout-recovery.test.ts
```

Expected result: A seeded expired `AWAITING_PACKAGE` operation is persisted as `EXPIRED` by the shared recovery service, and deadline fields are cleared.

To validate deducted-money dispatch recovery in staging:

```bash
RUN_DB_INTEGRATION_TESTS=true npx tsx --test tests/integration/operation-dispatch-watchdog.test.ts
```

Expected result: A seeded deducted `COMPLETING` operation with exhausted dispatch attempts is no longer silently active and is refunded or visible for review.

## Production Deployment Commands

Use targeted restarts. Do not delete all PM2 processes during rollout unless you are intentionally rebuilding the full process list and have a rollback window.

```bash
cd /www/wwwroot/deshpanel.com

git fetch origin
git checkout 007-credit-agent-points
git pull --ff-only origin 007-credit-agent-points

git rev-parse --short HEAD

npm run build
cd worker
npm run build
cd ..

npx prisma db push

pm2 start ecosystem.config.js --only bein-web
pm2 restart bein-web --update-env

pm2 start ecosystem.config.js --only bein-maintenance
pm2 restart bein-maintenance --update-env

pm2 restart ecosystem.config.js --only bein-keepalive --update-env
pm2 restart ecosystem.config.js --only bein-worker-1,bein-worker-2,bein-worker-3,bein-worker-4,bein-worker-5,bein-worker-6,bein-worker-7,bein-worker-8 --update-env

pm2 save
pm2 status
pm2 logs bein-maintenance --lines 50
```

Expected deployment checks:

- `pm2 status` shows `bein-web`, `bein-maintenance`, `bein-keepalive`, and all `bein-worker-*` online.
- `/dashboard/admin/recovery-health` shows a recent cycle within about two minutes.
- No process repeatedly restarts.
- No operation remains in `AWAITING_PACKAGE`, `AWAITING_FINAL_CONFIRM`, or old `COMPLETING` past its deadline without recovery/review.

If the server has not installed `tsx` dependencies, use the existing project install process before PM2 restart. Do not run package installation during peak traffic unless planned.

## Rollback

If recovery causes unexpected production behavior:

```bash
cd /www/wwwroot/deshpanel.com

pm2 stop bein-maintenance
git fetch origin
git checkout <previous-known-good-branch-or-commit>
git pull --ff-only origin <previous-known-good-branch>

npm run build
cd worker && npm run build && cd ..

pm2 restart bein-web --update-env
pm2 restart ecosystem.config.js --only bein-keepalive --update-env
pm2 restart ecosystem.config.js --only bein-worker-1,bein-worker-2,bein-worker-3,bein-worker-4,bein-worker-5,bein-worker-6,bein-worker-7,bein-worker-8 --update-env
pm2 save
pm2 status
```

Rollback rule: do not manually refund operations that reached final Pay or have uncertain beIN balance evidence. Move them to review and decide from provider balance/card evidence.

## Expected Log Examples

Healthy maintenance cycle:

```text
[Maintenance] Cycle summary: {"cycleId":"...","status":"healthy","inspected":3,"changed":2,"skipped":1,"retried":0,"reviewRequired":0,"refunded":1,"errorCount":0,"durationMs":842}
```

Idle maintenance cycle:

```text
[Maintenance] Cycle summary: {"cycleId":"...","status":"idle","inspected":0,"changed":0,"skipped":0,"retried":0,"reviewRequired":0,"refunded":0,"errorCount":0,"durationMs":55}
```

Review-required recovery:

```text
[Maintenance] Cycle summary: {"cycleId":"...","status":"healthy","inspected":1,"changed":1,"skipped":0,"retried":0,"reviewRequired":1,"refunded":0,"errorCount":0,"durationMs":410}
```

Dispatch watchdog recovery:

```text
[Dispatch Watchdog] Failed to recover operation <operation-id>: <non-sensitive-error>
```

Sensitive data rule: never paste raw proxy credentials, cookies, beIN passwords, or full customer/card data into tickets. Mask card numbers and account names when sharing logs.

## Admin And Support Runbook

When an operation looks stuck or a customer says balance was deducted:

1. Open `/dashboard/admin/recovery-health`.
2. Confirm the last maintenance cycle is recent. If stale, check `pm2 status` and `pm2 logs bein-maintenance --lines 100`.
3. Open `/dashboard/admin/financial-review`.
4. Search by operation id, username, or card number.
5. If the operation is `REVIEW_REQUIRED`, inspect the evidence before deciding:
   - customer deduction exists or not
   - refund already exists or not
   - beIN balance before/after
   - expected package amount
   - final Pay submitted or not
6. If beIN balance decreased by the expected package amount, do not refund automatically. Mark as provider executed after card verification.
7. If beIN balance did not decrease and final Pay did not start, refund can be allowed.
8. If evidence conflicts or is incomplete, keep under review and verify the card/provider state manually.
9. Avoid manual DB edits. Use the review decision UI wherever possible.
10. If maintenance cannot recover a stuck case, capture operation id, status, timestamps, recovery health summary, and masked logs, then escalate.

Escalation triggers:

- `bein-maintenance` is not running or restarts repeatedly.
- `recovery-health` is stale for more than two minutes.
- `COMPLETING` operations keep growing.
- Review queue contains uncertain final Pay cases with missing balance evidence.
- Same beIN account shows overlapping final confirmation attempts.
