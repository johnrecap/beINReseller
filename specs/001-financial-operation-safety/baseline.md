# Phase 1 Baseline: Financial Operation Safety

Date: 2026-05-13
Branch used: `codex-auth-phase-1-hardening`

## Scope

Phase 1 is documentation and baseline verification only. No runtime behavior was changed.

## Speckit Check

- Requirements checklist: passed, 16/16 complete.
- Speckit prerequisite script could not complete because the current branch name is `codex-auth-phase-1-hardening`, while the Speckit script expects a branch name like `001-financial-operation-safety`.
- Work continued on the existing safe branch requested for this production hardening work.

## Current Risky Branches Recorded

### `worker/src/http-queue-processor.ts`

- Generic worker catch path can still call `refundUser` and then mark an operation failed for unknown errors when the status is not terminal.
- `CONFIRM_PURCHASE` confirmation timeout path can refund before the final outcome is reclassified.
- `CONFIRM_PURCHASE` non-ambiguous failure path can refund when `confirmPurchase` returns a plain failure.
- `CANCEL_CONFIRM` currently refunds and then updates the operation to `CANCELLED`; this is risky during or after final payment.
- `CONFIRM_INSTALLMENT` load failure and payment failure paths can refund when the payment outcome is not yet classified with the same final Pay safety rules.

### `worker/src/http/HttpClientService.ts`

- `confirmPurchase` returns plain failure for Pay errors, busy retry exhaustion, no success confirmation, unreadable/unknown balance, and caught confirm errors.
- Some failure messages include evidence fields, but the return shape does not yet force callers to distinguish confirmed non-charge from uncertain post-Pay outcome.
- `payInstallment` has similar uncertain result messages after a submitted payment.

### `src/app/api/operations/[id]/cancel/route.ts`

- Cancellation is allowed for any non-terminal state except `COMPLETED`, `CANCELLED`, and `REVIEW_REQUIRED`.
- It removes queue jobs, marks `CANCELLED`, then refunds based on the latest amount/deduction data.
- It does not yet convert `COMPLETING` or final-payment-started operations into review-only cancellation.

### `src/app/api/operations/[id]/confirm-installment/route.ts`

- The route deducts balance and then directly enqueues the worker job.
- If queue dispatch fails, it refunds in the route; this should be reviewed against the durable dispatch pattern used by confirm-purchase.

## Existing Guards Confirmed

Migration `prisma/migrations/20260216193000_add_review_required_and_financial_guards/migration.sql` includes:

- `REVIEW_REQUIRED` operation status.
- Unique refund transaction guard per operation.
- Unique operation deduction transaction guard per operation.
- Unique customer wallet refund guard per operation reference.

## Baseline Verification

- `cmd /c npx tsc --noEmit --pretty false`: passed.
- `cmd /c npm --prefix worker run build`: passed.

## Phase 2 Entry Point

Start with the shared final Pay outcome model before changing refund behavior:

- `worker/src/http/HttpClientService.ts`
- `worker/src/http-queue-processor.ts`
