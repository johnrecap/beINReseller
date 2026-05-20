# Contract: Operation Safety and Refund Decisions

## Purpose

Define the behavior that app routes and worker code must share when deciding whether an operation can cancel, refund, review, or remain terminal.

## Shared Decision Inputs

The decision helper receives:
- `operationId`
- `operationStatus`
- `operationAmount`
- `operationResponseData`
- `operationType`
- `customerDeductTransactionExists`
- `refundTransactionExists`
- `currentJobType`
- `finalPaySubmittedEvidence`
- `confirmedNonChargeEvidence`
- `confirmedBeinChargeEvidence`

## Shared Decision Outputs

The helper returns:

```json
{
  "action": "ALLOW_CANCEL_WITH_OPTIONAL_REFUND",
  "refundAllowed": true,
  "reviewRequired": false,
  "reason": "PRE_FINAL_PAY_NO_EXTERNAL_CHARGE",
  "finalPayMayHaveStarted": false,
  "evidence": {}
}
```

Valid `action` values:
- `ALLOW_CANCEL_WITH_OPTIONAL_REFUND`
- `BLOCK_REFUND_MOVE_TO_REVIEW`
- `NOOP_TERMINAL_OPERATION`
- `ALLOW_FAILURE_WITH_REFUND`
- `ALLOW_FAILURE_NO_REFUND_NEEDED`

## Required Rules

- Terminal operations return `NOOP_TERMINAL_OPERATION`.
- Final-pay-submitted operations never return refund allowed unless confirmed non-charge evidence exists.
- Package-preparation `COMPLETING` operations do not automatically become review-required.
- Cancellation-confirm `COMPLETING` operations do not automatically become review-required.
- Duplicate refunds return no-op, not a thrown production error.

## Required Call Sites

- `src/app/api/operations/[id]/cancel/route.ts`
- `src/app/api/operations/[id]/cancel-confirm/route.ts`
- `src/app/api/operations/[id]/confirm-purchase/route.ts`
- `src/app/api/operations/[id]/heartbeat/route.ts`
- `src/app/api/cron/cleanup-stuck-operations/route.ts`
- `src/app/api/cron/timeout-operations/route.ts`
- `src/lib/refund.ts`
- `worker/src/http-queue-processor.ts`
- `worker/src/utils/error-handler.ts`
