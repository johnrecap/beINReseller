# Quickstart: Final Payment Guardrails

## Pre-Implementation Baseline

1. Confirm current branch:

```powershell
git branch --show-current
```

2. Run existing focused tests to establish baseline:

```powershell
cmd /c npm run test:firestore
cmd /c npm run test:admin
cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts
cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts
cmd /c npx tsx --test tests/integration/operation-dispatch-watchdog.test.ts
cmd /c npx tsx --test worker/tests/http-client-payment-classification.test.ts
cmd /c npx tsx --test worker/tests/http-client-final-pay-delay.test.ts
```

Record any pre-existing failures before implementing.

## Manual Renewal Scenario

1. Start a reseller renewal.
2. Wait for packages.
3. Select a package.
4. Let the final confirmation timer approach expiry.
5. Click final confirmation.
6. Confirm:
   - reseller balance deducted once,
   - operation is not expired by stale heartbeat/final-confirm deadlines,
   - final payment dispatch exists once,
   - operation eventually completes or moves to manual review.

## Delayed Provider Scenario

Use tests or a controlled mock seam to simulate:

1. beIN Pay submitted.
2. First post-pay balance read unchanged.
3. Later read shows expected decrease.
4. Operation completes and records balance evidence.

Repeat with no later decrease:

1. beIN Pay submitted.
2. All delayed reads inconclusive.
3. Operation moves to manual review.
4. No automatic refund is applied.

## Installment Scenario

1. Start installment flow for a card with installment due.
2. Confirm installment.
3. Confirm final-payment-started evidence exists before Pay.
4. Simulate ambiguous provider outcome.
5. Confirm operation moves to manual review and no auto-refund is applied.

## Admin Review Scenario

1. Open admin financial review.
2. Pick a review-required operation with provider charged evidence.
3. Close as charged.
4. Confirm operation leaves unresolved review and no refund occurs.
5. Pick a separate review-required operation with no-charge evidence.
6. Close as not charged/refund.
7. Confirm exactly one reseller refund and no duplicate ledger entries.

## Final Verification

```powershell
cmd /c npx tsx --test tests/unit/final-payment-guardrails.test.ts
cmd /c npx tsx --test tests/unit/operation-recovery-classifier.test.ts
cmd /c npx tsx --test tests/integration/operation-timeout-recovery.test.ts
cmd /c npx tsx --test tests/integration/operation-dispatch-watchdog.test.ts
cmd /c npx tsx --test worker/tests/http-client-payment-classification.test.ts
cmd /c npx tsx --test worker/tests/http-client-final-pay-delay.test.ts
cmd /c npm run build
git diff --check
rg -n "misencoded-text-patterns" src worker tests specs/023-final-payment-guardrails
```
