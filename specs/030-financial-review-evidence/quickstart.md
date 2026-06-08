# Quickstart: Financial Review Evidence Provenance

## Goal

Verify that financial review no longer treats stale beIN package-load balances as confirmed provider spend, while preserving safe admin decisions and legacy audit history.

## Prerequisites

- Local dependencies installed.
- Test database configured.
- Admin user available for API/UI checks.

## Focused Test Commands

```bash
npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts
npx tsx --test tests/unit/financial-review-decision-safety.test.ts
npx tsx --test tests/unit/worker-final-pay-evidence.test.ts
npx tsx --test tests/integration/admin-financial-review-decisions.test.ts
npx prisma validate
npm run build
npm --prefix worker run build
```

## Manual UI Checks

1. Open admin financial review.
2. Find or seed a review operation with customer deduction and only package-load beIN balance.
3. Confirm the card shows `لا توجد أدلة كافية لتأكيد خصم beIN`.
4. Confirm the old stored value, if present, is labeled as old/untrusted.
5. Enter an optional note and click "Renewed / no refund".
6. Confirm the saved decision includes `تم تأكيد الدفع` and preserves the note.
7. Repeat with "Refund customer" and confirm `لم يتم تأكيد الدفع`.
8. Click "Keep under review" and confirm no payment status is forced.
9. Confirm the old "check card now" label is replaced by stored-evidence wording unless live checking is implemented.

## Implemented Scope Notes

- Renewal final-payment evidence no longer promotes package-load balances to confirmed beIN debit.
- Installment final-payment evidence uses the same source-label treatment and no longer promotes pre-payment reload balances to confirmed debit.
- The admin card check remains a stored-evidence review only; no live beIN provider check is implemented in this release.
- Manual no-refund/refund decisions store the default Arabic payment conclusion and optional note as admin metadata, not as system-captured provider evidence.

## Data Checks

For a test operation:

```sql
select id, amount, status, response_data
from operations
where id = '<operationId>';

select type, amount, balance_after
from transactions
where operation_id = '<operationId>'
order by created_at;

select spend_amount, dealer_balance_before, dealer_balance_after, evidence_source, evidence_confidence
from bein_account_spend_ledger
where operation_id = '<operationId>';
```

Expected:

- No confirmed ledger row is created from package-load fallback alone.
- Manual decisions append under financial review metadata.
- Legacy stored values remain visible but are not treated as trusted evidence.
