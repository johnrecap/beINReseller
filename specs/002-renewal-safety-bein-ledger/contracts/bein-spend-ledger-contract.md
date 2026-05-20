# Contract: beIN Spend Ledger Write

## Purpose

Record only the final beIN account that was actually charged by beIN.

## Writer

The worker writes a ledger row only after final charge evidence exists.

Primary file:
- `worker/src/http-queue-processor.ts`

Recommended helper:
- `worker/src/lib/bein-spend-ledger.ts`

Shared app-side read helper:
- `src/lib/bein-spend-ledger.ts`

## Create Ledger Input

```json
{
  "operationId": "op_123",
  "userId": "user_123",
  "beinAccountId": "bein_123",
  "proxyId": "proxy_123",
  "operationType": "RENEW",
  "operationStatusAtRecord": "COMPLETED",
  "cardNumberSnapshot": "1234567890",
  "selectedPackageName": "Package Name",
  "selectedPackagePrice": 100,
  "currency": "USD",
  "dealerBalanceBefore": 500,
  "dealerBalanceAfter": 400,
  "spendAmount": 100,
  "evidenceSource": "BALANCE_DELTA",
  "evidenceConfidence": "CONFIRMED",
  "beinUsernameSnapshot": "dealer@example.com",
  "beinLabelSnapshot": "Main dealer account",
  "proxyLabelSnapshot": "proxy-safe-label",
  "chargedAt": "2026-05-14T10:00:00.000Z"
}
```

## Idempotency

- `operationId` is unique.
- Re-running the same successful worker path must not create a second row.
- If the row already exists with same operation id, the helper returns the existing row or no-op success.
- If the row exists with conflicting beIN account or amount, the helper must not overwrite silently. It must log an integrity issue or return a conflict for manual review.

## Exclusion Rules

Do not create confirmed ledger rows for:
- package preparation
- final confirmation before Pay
- cancellation-confirm before Pay
- failed pre-charge attempts
- unconfirmed timeout or busy responses without balance decrease
- old operations that only have assigned `Operation.beinAccountId`

## Allowed Confirmed Evidence

V1 confirmed evidence:
- beIN dealer balance before and after final Pay are both known, and the after value is lower than before.
- Manual admin reconciliation confirms the balance delta later, if that future UI is implemented.

Deferred/non-total evidence:
- Success text without balance delta may be displayed as unconfirmed but must not be counted in confirmed spend totals in v1.
