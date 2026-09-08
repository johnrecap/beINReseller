# Financial lifecycle and review contract

**Status**: planned for panel and its worker only; store/phone-app changes and new external refund workflows are excluded. Existing strict guards remain until replaced by an equally evidenced path.

## Decision matrix

| Purpose/evidence | Permitted result | Funding rule |
| --- | --- | --- |
| Renewal CHARGED + valid latest composite proof | COMPLETED with provider ledger | no refund; capture completion effects |
| Renewal UNKNOWN + uniquely valid fulfillment proof | proof-authorized completion under current policy | do not invent a provider debit amount |
| Renewal NOT_CHARGED + final complete no-match | FAILED + canonical refund | latest locked evidence; no contradictory ledger/proof |
| Installment CHARGED with exact identity AND authoritative installment-settled evidence | completed installment | no renewal sold-report proof fabrication |
| Installment CHARGED with unknown settlement evidence | REVIEW_REQUIRED | no refund or second payment from charge evidence alone |
| Installment NOT_CHARGED with exact rejected mutation | failed installment + refund atomically | original reseller deduction only |
| Either purpose ambiguous/contradictory | REVIEW_REQUIRED | no payment replay or automatic refund |
| Pre-mutation, unsent or safely fenced dispatch | safe cancellation/refund | prove original funding and no provider mutation |
| Legacy reconstructable | explicit evidenced legacy/manual resolution | no fabricated modern proof fields |
| Legacy unresolved/conflicting | evidence hold with allowed next action | zero guessed money movements |

## Atomic completion and refund

- Lock and reread operation, current evidence, owner/funding, relevant dispatch, and reservations.
- Capture the selected price revision before deduction. Replays return the same canonical outcome.
- A false/blocked refund result cannot be followed by ordinary FAILED closure. Surface settlement review or roll back the attempted transition.
- Panel CHARGED completion requires canonical provider spend with matching operation/account/card/owner/amount; fulfillment proof remains mandatory under current policy.
- Latest-attempt finalization validates persisted attempt identity/order/completeness, then updates derived state and money/status in the same transaction.
- Release card/account claims only in a safe terminal closure. Existing refund conflicts or uncertain dispatch holds remain visible.
- Preserve existing shared refund/completion exclusions. Panel finalizers revalidate applicable guards under the operation lock; no new store refund authorization is introduced.
- Latest-attempt input carries expected verification ID, baseline, and attempt number. Positive proof/spend, incompatible baselines, remaining scheduled checks, or a committed incompatible result still veto no-charge settlement.
- Canonical panel deduction and refund identity bound the refundable amount; duplicate decisions replay without another credit and contradictory outcomes remain held.

## Legacy outcome evidence matrix

All rows require an active ADMIN, current operation/owner, immutable decision key, trimmed note, normalized source reference and observation time, and transactional capability revalidation. The exact original payment/deduction and existing decisions are preserved.

| Proposed outcome | Mandatory evidence | Additional exclusion | Unsupported result |
| --- | --- | --- | --- |
| Legacy renewal completed manually | Attributable provider execution record/receipt with provider account, card, selected package, amount/currency and nonblank invoice; normalized source reference and observation time; unique shared provider-account/invoice claim | No active refund, contradictory proof, or reused invoice; original operation context must agree | LEGACY_EVIDENCE_HOLD; no synthetic FINAL_OK/baseline/time |
| Legacy installment completed manually | Exact installment identity and attributable provider settlement receipt/reference, or authenticated before/after due-item evidence showing that same item PAID; provider/account/card/amount context | No active refund, conflicting payment/settlement, or reused provider reference | INSTALLMENT_EVIDENCE_HOLD; charge alone is insufficient |
| Legacy pre-mutation cancelled/refunded | Canonical original funding plus affirmative durable non-submission evidence and fenced unsent dispatch across all applicable writers | No external request of unknown status, provider mutation/spend/execution proof, or outstanding refund | LEGACY_EVIDENCE_HOLD; absence of a timestamp is not affirmative evidence |
| Legacy post-attempt failed/refunded | Canonical original funding; attributable provider rejection/non-charge record for the exact attempt; independently established non-execution for the same target; safe dispatch/reservations | No positive spend/execution proof or ambiguous outstanding provider result; unsupported non-panel funding remains held; this feature adds no external refund path | LEGACY_EVIDENCE_HOLD; a missing report row alone is insufficient |
| Legacy conflicting/unattributable evidence | Explicit list of missing/conflicting facts and permitted evidence collection action | No terminal financial mutation | Keep review with precise reason |

Legacy completion records manual authority with its separate adjudication provenance; never AUTOMATED_COMPOSITE. Eligible completion effects/points reference original captured policy and purpose. If provider evidence cannot express a required row, that row stays unsupported/held until genuine evidence is supplied, not guessed by implementation.

## Administrative actions

Existing endpoint: `POST /api/admin/financial-review/:operationId/decision`.
Existing actions remain compatible; the planned server capability response adds classification, allowedActions, requiredEvidenceFields, requiredNote, and blockedReasonCodes.

Current local routing (2026-09-08) reuses existing actions where possible:
- RESOLVE_PRE_MUTATION: no provider mutation and safe dispatch proof, using existing pre-mutation finalizer.
- BEIN_EXECUTED_NO_REFUND: modern receipt flow or the legacy wrapper selected by the server classification. Legacy receipt completion additionally requires an immutable decisionKey/sourceReference and adjudication record. No separate RESOLVE_LEGACY wire action is introduced.
- KEEP_UNDER_REVIEW: recorded note/reason with no financial mutation.

Affirmative pre-mutation closure retains the existing operation/canonical-refund replay identity and persisted submission/dispatch evidence. It does not reinterpret an unknown legacy attempt as unsent. Legacy installment and post-attempt refund outcomes whose evidence adapter remains deferred stay unsupported/held under the matrix above.

BEIN_EXECUTED_NO_REFUND continues to require the evidence family appropriate to the operation. REFUND_CUSTOMER delegates to the relevant canonical settlement service, not a blanket balance increment.

Decision note: required, trimmed 1..2000 characters for financial closure/refund/adjudication; evidenceNote remains a distinct evidence explanation. Retain replay acceptance for already completed identical decisions.

## Negative cases required

Wrong panel owner, negative/nonfinite amount, mismatched currency, duplicate refund, refund racing final dispatch, crash after local settlement, provider ambiguity, multiple deductions, absent ledger, duplicate invoice, stale attempt and concurrent admin decisions.
