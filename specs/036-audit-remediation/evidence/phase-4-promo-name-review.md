# Phase 4 promo and package-name review — 2026-09-07

## Outcome and scope

Source review completed for the reseller panel's promo/selection journey, its API, HTTP adapter, worker rematching, confirmation and connected fulfillment correlation. The panel renders names parsed from beIN HTML; a provider name change can be legitimate. The faults concern retaining the correct offer and consent across those changes.

No runtime code, tests, schema, migrations, database rows or services changed during this review. No test, build, provider request or renewal was executed. Earlier T015 red-test results are separate evidence and do not cover all cases below. T016/T017 remain unimplemented and dependency-blocked by T012/T007. Active progress remains 8/46.

## Connected path and authority

`renew/page.tsx` draft/apply -> `apply-promo` -> durable dispatch/queue -> `handleApplyPromoHttp` -> `HttpClientService.applyPromoCode` -> provider HTML package extraction -> operation package JSON -> panel selection -> `planRenewalPackageSelection` -> `COMPLETE_PURCHASE` -> fresh provider load/reapply -> package rematch -> cart preparation -> final confirmation -> deferred panel debit/fenced provider Pay -> sold-report/contract proof.

- `worker/src/http/HttpClientService.ts:619`, `:637`, `:645`, `:655`: index is a parsed row position; name comes from `lblName`; checkboxValue is a WebForms control name/id. These are not demonstrated permanent provider product identifiers.
- `src/app/api/operations/[id]/select-package/route.ts:131` chooses from the server list by index; `:175` saves the selection with amount zero. Panel deduction happens later at `confirm-purchase`. A stale selection is a consent/package risk, not evidence that a debit already occurred.
- Ownership checks exist on the apply/select APIs. Quote checks must run with existing authorization and canonical lock order. The shared API helpers remain compatible; store/app modifications are excluded.
- `worker/src/lib/renewal-fulfillment-correlation.ts:77` parses base name, duration and promotion percentage; `:147` and `:156` compare report/contract identity with the selected package. Some display wording is normalized, but an unrecognized duration or changed discount can prevent proof. Do not loosen this proof to silence a selection error.

## Findings

Line numbers refer to the inspected local working tree. Origin compares with local HEAD `7457b7028811759736faa799a8b06b43691b1218`, not the deployed server. P1 means required before accepting this journey; P2 is a conditional adapter/compatibility concern.

| ID / priority | Evidence and scenario | Effect and proposed correction | Origin / certainty |
| --- | --- | --- | --- |
| PRM-01 / P1 | `src/app/api/operations/[id]/apply-promo/route.ts:170` returns 202, processing true and the previous nonempty availablePackages after 30 seconds. `src/app/dashboard/renew/page.tsx:580` handles packages before processing; `:593` clears loading. Polling starts only for processing/completing at `:340`. | False success message with old packages and no continued promo tracking. Check processing/revision first, invalidate selection while pending, poll boundedly and enable selection only for a ready authoritative quote. T017, with T016 supplying correlated results. | Confirmed branch behavior; both branches existed in HEAD. Occurrence requires delayed completion and an existing list. |
| PRM-02 / P1 | `renew/page.tsx:540` sends the current editable promo input during selection; `select-package/route.ts:147` passes it to `src/lib/operations/lock-timeouts.ts:94`, which replaces the stored code. `worker/src/http-queue-processor.ts:2274` uses that stored value when reapplying. | Apply code A, then type B or clear the input without applying: the shown A offer and executed B/no-code offer diverge. Separate draft from applied state; selection uses the server quote's code and rejects conflicting client input. Explicit removal must refresh an ordinary quote before it becomes selectable. T016/T017. | Confirmed source behavior. Draft propagation/planner already existed in HEAD; current fresh-load/reapply/rematch path makes the resulting conflict explicit. |
| PRM-03 / P1 | `select-package/route.ts:86`, `:99`, `:131` accepts only an index against the current list, without verifying the client's offer revision or refreshing state. Promo writes at `worker/src/http-queue-processor.ts:1946` are not revision/status compare-and-set updates. | If an old screen sees A at index 3 but the latest provider list has B at index 3, selection can save B. Current final confirmation may expose B later, so silent provider purchase is not established; the first consent is still not enforced. Bind index/key to an immutable quote revision and check under lock; ignore stale worker/HTTP results. T016/T017. | Confirmed missing admission guards; stale-index scenario requires a changed list. T015 already reproduced stale/refreshing acceptance, but did not simulate full reordering or a provider purchase. |
| PRM-04 / P1 | Worker reloads packages and reapplies code at `worker/src/http-queue-processor.ts:2268`, `:2278`; rematch at `:3700` requires one whitespace/case-normalized exact name and price rounded to cents. After promo POST, saleMutationStarted is already true (`:2276`); a rematch failure returns that flag (`:2492`) and enters REVIEW_REQUIRED (`:2097`). | A later rename/reprice or duplicate name+price stops preparation and can hold the operation for review even before Add-to-cart (`:2352`). Preserve rejection of substitutions, classify a proven pre-cart quote conflict separately from uncertain sale/payment, and provide a supported restart only through safe lifecycle closure. Never clear uncertainty flags on a generic error. T016/T017. | Fresh rematch function is present in the pre-existing dirty work, absent from HEAD. Conditional on provider drift; exception/review path is confirmed. It does not prove provider debit. |
| PRM-05 / P2 | `worker/src/http/HttpClientService.ts:2161` falls back to loadPackages(cardNumber), whose default type is CISCO (`:1698`), and calls a nonempty fallback list success without proving the promo remains applied (`:2164`). | An IRDETO fallback loses the requested type; a normal-price/name list could be mislabeled promo success. Preserve card/type/session context and require evidence of the applied promo in the returned quote; otherwise expose an unverified/failed refresh. T016. | Both code branches existed in HEAD. Lost type and missing applied-code verification are confirmed. Actual loss of discount/name depends on beIN responses and was not observed live. |

The existing outbox revision/key-order replay defects remain AUD-006/T016 and are not duplicated as new audit items. PRM-01–PRM-05 are details of that same offer journey.

## Chosen repair boundary

1. Keep provider names as authoritative display text. Store a server-owned quote revision with ready/pending/failed state, applied code, card/type and package snapshot. A panel package key identifies a row only inside that quote. Keep fresh form controls/hidden state on the worker side; never expose them as a new identity contract.
2. Show a draft code separately. Apply/replace/remove starts a new offer revision, clears prior selection and consent, and tracks only that revision. A 202/processing response is never success even if it includes an old list. A failed/unknown refresh blocks confirmation until a known valid quote is restored.
3. Select and confirm compare the authoritative quote under lock. A later fresh provider mismatch cannot be substituted by index, checkbox, price alone or fuzzy name. Safely stop before cart submission; return a precise reason. A generic failure after an uncertain provider action stays reviewed.
4. Preserve immutable COMPLETE_PURCHASE and final-payment dispatch identities under the current schema. Do not implement a loop that sends another COMPLETE_PURCHASE with the same completed dispatch, deletes that dispatch, or assigns it a nonzero revision: the existing constraint permits nonzero revisions only for APPLY_PROMO. For a proven pre-sale conflict, offer a fresh operation only after canonical closure permits reservation release; when it cannot, present the review reason and existing supported resolution path. Reusing one operation for multiple cart-preparation attempts would require a separate explicit design/constraint amendment.
5. Preserve captured fulfillment package/proof identity after payment. Real provider naming variations in report/contract evidence require sanitized attributable fixtures; synthetic examples cannot establish that two provider names represent the same product.

Alternatives considered: matching by row/checkbox (unstable across provider responses); matching by similar name or price (can select a different product); snapshot/revision plus explicit renewed consent (chosen). No new UI library, provider endpoint, financial engine or database migration is planned by this amendment.

## Additional acceptance scenarios to author before runtime changes

| Case | Expected result | Owner / planned evidence |
| --- | --- | --- |
| Delayed 202 with nonempty old packages, then new names | Pending first; no selection or success; current revision later renders and requires selection | T017 / Q03 + Q07 |
| Promo failure, stale previous success, or late response from another operation/revision | No success overwrite, no old confirmation; operation identity retained | T016/T017 / Q02 + Q03 |
| Apply A, edit B or clear input without applying | A snapshot stays authoritative; draft cannot alter dispatched code; explicit removal creates a new quote | T017 / Q02 + Q03 |
| Same index now names a different package; stale quote; two competing selections | Conflict before state/dispatch/debit; no silent substitution | T016/T017 / Q02 + Q04 |
| Valid changed names or reordered rows after promo | New list displayed; old selection/consent invalidated | T017 / Q03 + Q07 |
| Worker reload returns renamed/repriced/missing or duplicate candidate | No Add-to-cart or Pay; classified conflict; no blind requeue/release | T016 / Q02 worker behavior |
| Known pre-sale conflict versus timeout/unknown provider action | Safe canonical closure/restart only for proven eligible state; uncertainty stays held | T016/T017 / Q02 + Q04 |
| Empty promo response recovers normal list; IRDETO reload | No fabricated applied result; original card/type retained | T016 / Q02 mocked HTTP responses |
| Final confirmation carries an outdated revision or draft code | Reject before deduction and dispatch | T017 / Q03 + Q04 |
| Name aliases, missing duration, changed discount, report/contract disagreement after payment | Existing exact evidence safeguards remain; no automatic refund or second Pay | T016 / existing correlation/finalization regression suites |

These cases are planned, NOT_RUN in this review. Keep T015's earlier 10 unit/7 DB results unchanged. Mocked HTTP fixtures must be explicitly synthetic; real naming compatibility remains unverified until sanitized provider evidence is available under an authorized scope.

## Independent review and artifact checks

An independent source reviewer confirmed PRM-01/02/04/05 and the proof-name dependency. The review specifically ruled out assuming stable checkbox identity, using fuzzy matching, or returning to package selection after an arbitrary uncertain provider action. Root added the existing immutable COMPLETE_PURCHASE constraint to the recovery design.

The amendment extends FR-007/US2 and the existing unfinished T016/T017 owned paths/verification; no task is appended or accepted. Requirements and safety checklists remain requirement-quality checks, not application passes. T012/T007 dependencies remain visible. Optional Spec Kit commit hooks are omitted; the current branch and customized managed scripts/templates are preserved.
