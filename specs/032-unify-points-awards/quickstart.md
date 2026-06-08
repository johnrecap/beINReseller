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

## Verification Commands

```powershell
npx tsx --test tests/unit/points-operation-spend-policy.test.ts tests/unit/points-operation-awards.test.ts tests/unit/worker-points-awards.test.ts tests/unit/financial-review-points-awards.test.ts
npx tsx --test tests/integration/operation-points-completion-parity.test.ts
npm run build
npm --prefix worker run build
git diff --check
```

Run DB-backed integration tests only when a safe test database is configured.
