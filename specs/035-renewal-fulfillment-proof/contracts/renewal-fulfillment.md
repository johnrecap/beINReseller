# Contract: Renewal Payment And Fulfillment

## Purpose

This contract separates provider money movement from package fulfillment for `RENEW` / `CONFIRM_PURCHASE`.

## Post-Pay Evidence Contract

Operation evidence exposes stable machine values:

```text
providerPaymentState:
  NOT_SUBMITTED | CHARGED | NOT_CHARGED | UNKNOWN

fulfillmentState:
  UNVERIFIED | VERIFYING | VERIFIED | NOT_FOUND | CHECK_FAILED | PROOF_CONFLICT
```

Optional proof metadata:

```text
fulfillmentProofId: string
fulfillmentInvoiceNo: string
fulfillmentVerifiedAt: ISO-8601 string
fulfillmentReasonCode: string
verificationOutcome: MATCHED | VALID_NO_MATCH | REPORT_ONLY | CONTRACT_ONLY | INCOMPLETE_SCAN | CHECK_FAILED | PROOF_CONFLICT
nextVerificationAt: ISO-8601 string | null
proofKind: LEGACY_CONTRACT_ONLY | SOLD_REPORT_CONTRACT_CORRELATION
fulfillmentAuthority: NONE | AUTOMATED_COMPOSITE | MANUAL_PROVIDER_CONFIRMATION
manualEvidenceId: string | null
manualConfirmedAt: ISO-8601 string | null
```

All operation clients receive `fulfillmentAuthority` and the safe confirmation timestamp so manual completion is never mistaken for automatic correlation. `manualEvidenceId`, provider invoice, amount, source/note, and actor details are admin-only; reseller clients receive them as null/omitted. Clients localize authority/state values. Provider responses, credentials, sessions, cookies, ViewState, and raw errors are not returned.

## Terminal Decision Matrix

| Payment | Fulfillment | Operation | Refund | Completion effects |
|---|---|---|---|---|
| `CHARGED` | `ENFORCE` composite `VERIFIED` | `COMPLETED` | No | Once, after proof |
| `UNKNOWN` | `ENFORCE` composite `VERIFIED` | `COMPLETED` | No | Once, after proof |
| `NOT_CHARGED` | composite `VERIFIED` | `REVIEW_REQUIRED` contradiction | Blocked | None |
| `CHARGED` | `NOT_FOUND` | `REVIEW_REQUIRED` | Blocked | None |
| `CHARGED` | `CHECK_FAILED` | `REVIEW_REQUIRED` | Blocked | None |
| any | `PROOF_CONFLICT` | `REVIEW_REQUIRED` | Blocked | None |
| `UNKNOWN` | not verified | `REVIEW_REQUIRED` | Blocked | None |
| explicit deterministic `NOT_CHARGED` | complete `VALID_NO_MATCH` | `FAILED` | Once if deducted | None |
| `NOT_SUBMITTED` | `UNVERIFIED` | Guarded pre-mutation terminal or `REVIEW_REQUIRED` | One exact atomic refund only when canonical deduction is proven | None |
| `CHARGED` / `UNKNOWN` | unique complete structured manual evidence | labeled manual `COMPLETED` in either mode | No | Once, after manual transaction |
| `NOT_CHARGED` | structured manual fulfillment evidence | `REVIEW_REQUIRED` contradiction | Blocked | None |

In `REVIEW_ONLY`, every automatic post-mutation row—including a `MATCHED` report/contract candidate—becomes `REVIEW_REQUIRED`; the attempt is stored but no automated proof is claimed. A later explicit structured-manual transaction is the only mode-independent completion authority.

## Proof Claim Contract

Input is the operation, assigned provider account, active baseline/session generation, exactly one new matching Sold Report row, same-invoice active contract safe fields, source, and provider check time.

Output:

```text
CLAIMED
ALREADY_CLAIMED
INVALID_INVOICE
OPERATION_PROOF_CONFLICT
INVOICE_ALREADY_USED
```

Only `CLAIMED` and `ALREADY_CLAIMED` with `proofKind=SOLD_REPORT_CONTRACT_CORRELATION` in `ENFORCE` permit automated completion. `ALREADY_CLAIMED` requires exact operation/account/invoice/card/baseline/report-fingerprint/amount/contract context equality. `REVIEW_ONLY` never calls this automated claim path; legacy contract-only proof does not permit new or recovery completion.

## Sold Report Correlation Contract

1. Assert the active card reservation, acquire the durable provider-account causal reservation, then acquire/assert the short fenced execution lease.
2. Preserve the dealer office selected by the provider fresh GET, bind its safe context hash across every page, capture a complete stable account-wide invoice baseline before sale preparation, re-read its first-page watermark, and persist only safe normalized identities and target-card rows. Do not fabricate an `ALONE` selector value; observed `Alone`/`Including Sub-Dealers` labels are report-summary counts.
3. Reload the renewal page and prepare/rematch the selected package under the same account/session generation.
4. Atomically persist `FINAL_PROVIDER_MUTATION_STARTED` before the first final `OK`; interpret legacy `FINAL_PAY_REQUEST_STARTED` only as the same no-resubmit barrier.
5. Scan every Sold Report page after mutation, re-read the first-page watermark, and compute rows new to that exact baseline. A failed scan may restart once from fresh GET, never by replaying stale postbacks.
6. Require exactly one new row matching dealer/account, exact card, item type, package duration/promotion, Decimal amount, and exact Africa/Cairo final-mutation date.
7. Read card contracts and require one active contract with the exact discovered invoice.
8. Claim and finalize in one operation-row-first transaction.

Missing baseline, incomplete scan, login redirect, pager cycle/cap, zero/multiple candidates, unexpected account-wide activity, blank/reused invoice, report-only, and contract-only outcomes cannot complete.

## Start Renewal Conflict Response

When a card has unresolved live review or an open fulfillment-safety issue:

- HTTP status: `409`
- Stable error code: `RENEWAL_FULFILLMENT_REVIEW_PENDING`
- Safe fields: `operationId` when available, otherwise `integrityIssueId`
- Display text: localized by clients from the code.

## Retry Contract

- Before `FINAL_PROVIDER_MUTATION_STARTED`, dispatch may retry only if no earlier provider mutation has an uncertain outcome; uncertain Add/Sell/STB responses prohibit failover/replay and enter same-account verification/review.
- At or after `FINAL_PROVIDER_MUTATION_STARTED` (including legacy `FINAL_PAY_REQUEST_STARTED`), no code path may invoke final `OK`, Pay, or sale mutation again; the legacy phase is not proof that Pay was submitted.
- The marker compare-and-set is persisted before the final `OK` postback because that postback can directly create a contract.
- Axios/transport retries are zero for every provider mutation, regardless of network, timeout, or 5xx outcome.
- Allowed retries: a complete Sold Report scan restarted from fresh GET, contract list read, proof claim in `ENFORCE`, guarded local completion, account/session cleanup, and idempotent completion-side-effect finalization.

## Completion Side-Effect Contract

The order is:

1. Lock the operation row and revalidate card/account/baseline/session/no-refund context.
2. Claim unique composite fulfillment proof.
3. Persist payment/fulfillment evidence, guarded `COMPLETED`, and completion snapshot in the same transaction.
4. Finalize points once.
5. Emit successful analytics/notification once.

If steps 1–3 fail, steps 4–5 do not run.

## Atomic Local Settlement Contract

- Post-mutation no-charge finalization requires `RENEW`, durable `FINAL_OK`, stored `NOT_CHARGED`, terminal complete `VALID_NO_MATCH`, and absence of provider charge, automated/manual proof, completion, or conflicting refund. Exact canonical refund, `FAILED/NOT_FOUND/VALID_NO_MATCH`, point reversal, issue resolution, and reservation release commit together.
- Pre-mutation cancellation/timeout/error requires `RENEW`, no provider-mutation/charge/fulfillment ambiguity, and exactly one canonical reseller deduction (or one exact idempotent prior refund). Refund, terminal status, point reversal, and reservation release commit together.
- Missing, duplicate, customer-owned, wrong-amount, or otherwise ambiguous local settlement moves to `REVIEW_REQUIRED` and retains reservations; route-local refund/status/release sequences are prohibited.

## Explicitly Excluded Surface

- Mobile application, store-subscription, Stripe, and store-credit contracts are outside feature 035 and receive no implementation, verification, startup, or release claim from this contract.

## Exclusivity Contract

- The card reservation is database-unique while unreleased and remains held during `REVIEW_REQUIRED`.
- The durable provider-account causal reservation remains unique across delayed attempts and unresolved review; a short Redis execution lease requires exact operation/reservation-generation/invocation/fencing ownership for each job.
- Renewal, installment, signal, balance, report, keepalive, and fenced session-cache consumers honor both reservation and execution-lease boundaries.
- Only `automationExclusive=true` accounts are eligible; unexpected account-wide activity quarantines the account.
- Account failover is forbidden after any uncertain provider mutation; safe pre-mutation failover supersedes the prior reservation/baseline/session/package/promotion controls and restarts capture/preparation.
- Unexpected account-wide sales during the exclusive window produce `PROOF_CONFLICT` and account quarantine/review.
