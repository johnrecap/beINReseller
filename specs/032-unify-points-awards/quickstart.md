# Quickstart: Unified Operation Spend Points

## Scenario 1: Admin-Owned Direct User Receives Points

1. Enable the points program.
2. Set normal user points per 1000 USD to a visible value, for example `4`.
3. Use an active normal user directly under admin.
4. Complete a renewal operation for `1000 USD`.
5. Confirm the point ledger has one operation-spend entry for the user.
6. Confirm admin has no operation-spend entry for that operation.

Expected result: the user receives `4` points and admin receives `0` for that operation.

## Scenario 2: Agent-Owned User Behavior Is Preserved

1. Enable the points program.
2. Set normal user points to `4` and agent points to `2`.
3. Use an active normal user under an active agent.
4. Complete a renewal operation for `1000 USD`.
5. Confirm the user receives `4` points and the agent receives `2` points.

Expected result: existing agent-owned behavior remains unchanged.

## Scenario 3: Manager-Owned User Toggle Works

1. Enable the points program.
2. Use an active normal user under an active manager.
3. Turn off manager-owned user points.
4. Complete a renewal and confirm only the manager receives points.
5. Turn on manager-owned user points.
6. Complete another renewal and confirm manager plus user receive points with their dedicated rates.

Expected result: manager-owned user behavior follows the toggle.

## Scenario 4: Manual Financial Review Completion Awards Once

1. Use an operation that was charged but needs manual financial review closure.
2. Mark it as charged/completed from financial review.
3. Confirm operation-spend points are created according to the same ownership rule.
4. Press the same closure action again or trigger recovery again if possible.
5. Confirm no duplicate point entries are created.

Expected result: manual completion does not miss points and does not duplicate them.

## Scenario 5: Program Disabled Blocks All Spend Points

1. Disable the points program.
2. Complete renewals for admin-owned, agent-owned, and manager-owned users.
3. Confirm no operation-spend point entries are created.

Expected result: disabled program overrides all ownership and rate settings.

## Scenario 6: Transfer After Completion Cannot Redirect Points

1. Complete a renewal while the user belongs to Agent A and pause/fail finalization after capture.
2. Transfer the user to Agent B.
3. Retry finalization from web, Worker, and maintenance paths.

Expected result: the run contains Agent A's completion-time recipients/rates and no operation-spend entry is created for Agent B.

## Scenario 7: Settings Changes Cannot Rewrite A Captured Decision

1. Capture a positive run and a disabled/zero/skipped run.
2. Change global toggles, start date, defaults, and owner overrides.
3. Finalize/re-observe both operations.

Expected result: the positive run uses its captured values and the skipped run remains skipped.

## Scenario 8: Concurrent And Faulted Finalization

1. Run web and Worker finalizers concurrently for one two-recipient captured run.
2. Confirm one complete recipient set and one `AWARDED` state.
3. Repeat with an injected failure on the second recipient.

Expected result: concurrency creates no duplicates; fault injection commits zero recipient rows and leaves the run retryable.

## Scenario 9: Legacy And Cutover Safety

1. Leave cutover null and verify pre-existing completed operations/ledger rows are unchanged.
2. Deploy compatible app/Worker code, then set cutover.
3. Create an audited post-cutover completed-operation fixture without a run.
4. Re-observe/finalize it.

Expected result: the missing run is reported `LEGACY_REVIEW_REQUIRED`, safe ids/counts are emitted, and no current owner receives an inferred award.

## Scenario 10: Signal Check Then Activation Reuses One Decision

1. Complete a signal-check operation until it is ready for activation.
2. Record its `completedAt` and skipped award-run id.
3. Activate the signal using the same operation.
4. Confirm activation succeeds, the original `completedAt` is unchanged, and no second award run is created.

Expected result: activation only re-observes/finalizes the signal-check run and cannot redirect points using later ownership.

## Scenario 11: Customer-Only Completion Is Never Blocked

1. Create safe test fixtures for customer renewal, signal refresh, and signal check with `customerId` and no panel `userId`.
2. Complete each fixture through its real Writer path.
3. Verify completion commits and each operation has exactly one `SKIPPED/CUSTOMER_OPERATION_NOT_ELIGIBLE` run with null owner/rate/recipient evidence.

## Scenario 12: Financial Review And Retry Races

1. On an isolated PostgreSQL database, race charged versus refund and charged versus follow-up decisions for one `REVIEW_REQUIRED` operation.
2. Verify one guarded decision wins and no refund-plus-award state exists.
3. Inject finalization failures through the configured attempt limit, then verify bounded backoff, review-required exhaustion, and that a later valid captured run is still processed.

## Verification Commands

```powershell
npx tsx --test tests/unit/points-operation-spend-policy.test.ts tests/unit/points-operation-awards.test.ts tests/unit/worker-points-awards.test.ts tests/unit/financial-review-points-awards.test.ts
npx tsx --test tests/integration/operation-points-completion-parity.test.ts
npx tsx --test tests/integration/operation-spend-award-run.test.ts tests/integration/operation-spend-completion-writers.test.ts
npx prisma validate
npm run check:schema-sync
npm run build
npm --prefix worker run build
git diff --check
```

Run DB-backed migration/concurrency/fault/customer/race/retry tests only when a safe PostgreSQL test database is configured. Deployment order is migration, compatible web and all Workers, shared count-complete verification preflight, then activation of `operationSpendSnapshotCutoverAt`; never activate cutover during mixed-version rollout or while preflight has unresolved invariants.

## Production Audit And Cutover

After the migration and compatible web/Worker code are deployed, run the bounded read-only audit and the cutover dry run:

```bash
npx tsx scripts/audit-operation-spend-award-runs.ts --limit=100
npx tsx scripts/activate-operation-spend-snapshot-cutover.ts
```

Only after verifying the web process and every Worker use the compatible release, activate once with the reviewed release id:

```bash
npx tsx scripts/activate-operation-spend-snapshot-cutover.ts --activate --confirmed-release=<release-id>
```

The activation command is idempotent. Rollback keeps the additive schema and captured evidence in place; use a forward fix rather than deleting or rewriting historical rows.
