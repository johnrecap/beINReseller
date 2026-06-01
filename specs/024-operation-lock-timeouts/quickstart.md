# Quickstart: Operation Lock Timeouts

## Pre-Implementation Baseline

1. Confirm current branch:

```powershell
git branch --show-current
```

2. Run focused baseline tests:

```powershell
cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts
cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts
cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts
cmd /c npx tsx --test tests/integration/operation-dispatch-watchdog.test.ts
cmd /c npx tsx --test worker/tests/http-client-payment-classification.test.ts
cmd /c npx tsx --test worker/tests/http-client-final-pay-delay.test.ts
```

Record any pre-existing failures before implementation.

## Scenario 1: Account Lock Isolation

1. Configure one eligible beIN account.
2. Start a renewal and wait until packages are available.
3. Start a second renewal.
4. Confirm the second renewal cannot use the locked account while the first is active.
5. Cancel the first renewal before Pay.
6. Confirm the beIN account becomes available again.

## Scenario 2: Package Selection Timer

1. Start a renewal.
2. Wait for packages.
3. Do not choose a package for 30 seconds.
4. Confirm the operation cancels/expires before Pay.
5. Confirm no customer deduction exists.
6. Confirm the beIN account lock is released.

## Scenario 3: Balance Gates

1. Start a renewal with customer balance below the selected package price.
2. Attempt package selection.
3. Confirm selection is blocked with no deduction and no Pay.
4. Repeat with sufficient balance at selection, then reduce balance before final confirmation.
5. Confirm final confirmation is blocked with no deduction and no Pay.

## Scenario 4: Confirmation Timers

1. Select a package with sufficient balance.
2. Confirm the first confirmation window is 10 seconds.
3. Confirm warning state appears at 3 seconds remaining.
4. Let it expire and confirm safe cancellation before Pay.
5. Repeat for final confirmation.

## Scenario 5: Customer Exit Before Pay

1. Start a renewal and reach package selection or final confirmation before Pay.
2. Close the page or navigate away.
3. Confirm immediate cancellation if the leave signal arrives.
4. If the leave signal is blocked, confirm heartbeat timeout cancels within 5 seconds after the last heartbeat.
5. Confirm beIN account lock is released.

## Scenario 6: Customer Exit After Pay

1. Confirm final payment so Pay may start.
2. Close the page.
3. Confirm the operation is not cancelled or auto-refunded.
4. Confirm the operation completes if beIN charge is verified, or moves to manual review if unclear.
5. Confirm the beIN account lock is released after completion or review handoff.

## Scenario 7: Admin Force Unlock

1. Create or simulate a stale beIN account lock.
2. Open admin beIN account status.
3. Confirm lock owner and age are visible without secrets.
4. Force unlock with a reason.
5. Confirm the account is available.
6. Confirm operation status and money evidence are unchanged.

## Final Verification

```powershell
cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts
cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts
cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts
cmd /c npx tsx --test tests/integration/operation-dispatch-watchdog.test.ts
cmd /c npx tsc --noEmit --pretty false
cmd /c npx tsc -p worker/tsconfig.json --noEmit --pretty false
cmd /c npm --prefix worker run build
cmd /c npm run build
git diff --check
git diff -U0 -- . ':!AGENTS.md' | rg -n "^\+.*(<mojibake-patterns-from-AGENTS>)"
```

## Validation Results

- Automated safety tests passed for timing constants, package expiry, balance gates, final confirmation expiry/idempotency, heartbeat timeout decisions, account lock ownership, and admin unlock helper behavior.
- Root TypeScript check, worker TypeScript check, worker build, and Next.js production build passed.
- Manual browser scenarios that require controlled beIN credentials, a test card, and a real admin session were not executed locally. Run the seven scenarios above against staging before production deploy.
