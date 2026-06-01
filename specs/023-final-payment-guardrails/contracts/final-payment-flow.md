# Contract: Final Payment Flow

## Reseller Renewal Confirmation

**Endpoint**: `POST /api/operations/{operationId}/confirm-purchase`

**Actors**: Operation owner or authorized admin.

**Preconditions**:

- Operation exists.
- Operation belongs to the caller unless caller is admin.
- Operation is waiting for final confirmation.
- Operation has a selected package with a positive price.
- Caller has sufficient reseller balance at final confirmation.

**Required behavior**:

1. Prevent duplicate final confirmation for the same operation.
2. Deduct reseller balance once.
3. Record the deduction transaction once.
4. Clear or replace stale waiting deadlines.
5. Persist final confirmation dispatch.
6. Return a response that means "final payment execution started", not "provider payment succeeded".

**Failure behavior**:

- Insufficient reseller balance: no deduction, operation remains confirmable or returns to a safe waiting state.
- Duplicate confirm: no deduction, no new dispatch.
- Dispatch unavailable: operation remains recoverable through dispatch watchdog and must not be lost.

## Worker Final Pay Execution

**Entrypoint**: `CONFIRM_PURCHASE` worker job.

**Preconditions**:

- Operation is not terminal.
- Operation has a beIN account.
- Operation has a selected package and amount.
- Operation still permits final Pay.

**Required behavior**:

1. Restore operation-scoped beIN session.
2. Re-read operation immediately before Pay.
3. Persist final-payment-started evidence.
4. If persist fails, do not press beIN Pay.
5. Press beIN Pay.
6. Verify provider outcome using success text and before/after balance evidence.
7. Use delayed verification for ambiguous outcomes.
8. Complete, fail with safe refund, or move to manual review based on evidence.

**Forbidden behavior**:

- Do not press beIN Pay after operation is terminal, cancelled, expired, refunded, or blocked.
- Do not auto-refund after Pay may have reached beIN unless confirmed no-charge evidence exists.
- Do not expose beIN session, ViewState, cookies, or credentials in logs or responses.

## Installment Final Pay Execution

**Entrypoint**: `CONFIRM_INSTALLMENT` worker job.

**Required behavior**:

- Match renewal final Pay safety rules.
- Persist final-payment-started evidence before installment Pay.
- Re-check operation state before installment Pay.
- Move ambiguous after-Pay outcomes to manual review.
