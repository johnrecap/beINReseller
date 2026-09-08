# Contract: Admin Review And Historical Reconciliation

## Admin No-Refund Decision

`BEIN_EXECUTED_NO_REFUND` is accepted only when either:

- `Operation.fulfillmentProof` is a matching `SOLD_REPORT_CONTRACT_CORRELATION` proof claimed in `ENFORCE`; or
- the request creates a separate append-only `OperationManualFulfillmentEvidence` row from the authenticated admin with a non-empty uniquely claimed provider invoice, exact account/card/package, Decimal amount/currency, source, note, provider observation time, and actor context.

Provider charge state, provider spend ledger, legacy contract-only proof, payment-status text, `cardRenewed` alone, or action selection is insufficient. The server never inserts renewal, invoice, amount, or no-charge evidence implicitly. Complete manual evidence may perform a labeled guarded completion in any rollout mode; it never creates automated fulfillment proof, and its idempotent points/notification side effects run only after the manual evidence/completion transaction commits.

## Admin Live Verification

The existing admin verification action may complete a review only when:

1. Current operation is still reviewable and final Pay may have started.
2. A valid non-superseded pre-mutation Sold Report baseline exists for the same account/session generation.
3. A complete post scan finds exactly one matching new invoice and an active provider contract has that same invoice.
4. Proof mode is `ENFORCE`, and the composite unique proof claim returns `CLAIMED` or `ALREADY_CLAIMED` for the same operation/context.
5. A guarded status transition wins and no refund exists.

In `REVIEW_ONLY`, even a matched candidate appends a safe attempt and remains review-required without claiming proof. Missing baseline, legacy proof, incomplete scans, report-only/contract-only evidence, and invoice conflicts do the same. Repeated verify clicks enqueue one deterministic verification-only job and cannot invoke `OK`, Pay, or any sale mutation.

Admin evidence may expose the safe invoice, proof kind, report amount/currency, report/contract timestamps, attempt outcome, and reason code. It must not expose subscriber, country, raw HTML, cookies, ViewState, credentials, or raw provider errors.

## Reconciliation Command

```text
npx tsx scripts/reconcile-renewal-fulfillment.ts \
  --from <ISO timestamp> \
  --to <ISO timestamp> \
  [--card <digits>] \
  [--duplicate-window-minutes <positive integer>] \
  [--apply --confirm APPLY_FULFILLMENT_SAFETY_ISSUES]
```

### Validation

- `--from` and `--to` are required, valid, and `from < to`.
- `--card` contains digits only when supplied.
- Duplicate window defaults to 10 minutes and must be bounded to a safe positive value.
- `--apply` without the exact confirmation exits non-zero before any write.

### Dry-Run Output

The command returns JSON-safe summary data:

- effective filters and timezone note;
- suspect completed charged operations without proof;
- duplicate same-card/package/amount bursts;
- proof/invoice conflicts detectable from stored data;
- stable operation ids and bounded safe evidence ids;
- counts by candidate type;
- `mutated: false`.

No credential, session, provider payload, user balance, or private log content is emitted.

### Apply Effects

Apply upserts `OperationIntegrityIssue` rows using the existing `(operationId, issueType)` uniqueness. Repeated apply updates `lastSeenAt` and bounded safe details without duplicating issues.

Forbidden effects:

- provider Pay or contract mutation;
- customer/reseller/provider balance mutation;
- refund or transaction creation;
- operation status/completedAt mutation;
- point award or reversal;
- notification creation;
- automatic fulfillment proof creation.

## Incident Invocation

The Cairo window `2026-08-23 18:35–18:45` is represented with explicit offsets:

```text
--from 2026-08-23T18:35:00+03:00
--to 2026-08-23T18:45:00+03:00
--card 7517687161
```

This local contract does not authorize or claim access to production data.
