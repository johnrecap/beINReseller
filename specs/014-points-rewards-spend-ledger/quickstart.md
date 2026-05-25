# Quickstart: Spend-Based Points and Cash Redemptions

## Preconditions

1. Apply the feature migrations.
2. Seed or create:
   - one admin,
   - one manager with one managed user,
   - one agent with one active assigned user,
   - one direct user.
3. In admin points settings, set:
   - `pointsEnabled=true`,
   - `pointsStartAt` to the current time,
   - user, agent, and manager earn rates to non-zero values,
   - conversion ratio such as `100 points = 10 USD`.

## Scenario 1: Manager-owned user spend

1. Complete a paid subscription operation for the manager-owned user after `pointsStartAt`.
2. Verify the manager receives one positive `OPERATION_SPEND` point entry.
3. Verify the user receives zero point entries for that operation.
4. Re-run the completion point processor for the same operation.
5. Verify no duplicate point entries are created.

## Scenario 2: Agent-owned user spend

1. Complete a paid subscription operation for the agent-owned user after `pointsStartAt`.
2. Verify the user receives one positive `OPERATION_SPEND` point entry.
3. Verify the agent receives one positive `OPERATION_SPEND` point entry.
4. Verify both entries use `operation.amount` and store rate snapshots.

## Scenario 3: No backfill

1. Create or find an operation completed before `pointsStartAt`.
2. Run the point processor.
3. Verify no spend-based point entries are created.

## Scenario 4: Instant conversion

1. Log in as an account with available points.
2. Request conversion for a valid point amount.
3. Verify the response reports converted points and credited balance.
4. Verify the point ledger has a negative `POINT_CASH_REDEMPTION` entry.
5. Verify the transaction ledger has a matching balance credit.

## Scenario 5: Users list visibility

1. Open the admin users page.
2. Verify each row shows balance and point summary.
3. Open the manager users page as a manager.
4. Verify only managed users are shown and each row includes that user's point summary.

## Verification Commands

```powershell
node scripts/check-prisma-schema-sync.js
npx tsc --noEmit
npx tsx --test tests/unit/*.test.ts
npx tsx --test tests/integration/*.test.ts
npm --prefix worker run build
```

`npm run lint -- --max-warnings=0` should be run if the pre-existing unrelated lint baseline is cleaned up or accepted separately.

## Implementation Evidence 2026-05-25

- Schema sync passed after adding point program settings, operation spend sources, cash redemption audit rows, and worker schema parity.
- `npx tsc --noEmit` passed.
- `npx tsx --test tests/unit/*.test.ts` passed with 45 tests.
- `npx tsx --test tests/integration/*.test.ts` passed with 2 active tests and 7 pre-existing skipped tests.
- `npm --prefix worker run build` passed.
