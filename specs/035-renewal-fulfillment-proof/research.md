# Research: Renewal Fulfillment Proof

> **Sold Report amendment**: Decisions 13–29 supersede the contract-only completion/retry/recovery portions of Decisions 2, 4, 5, 6, 8, and 9 and add atomic connected-payment settlement requirements. Earlier decisions remain historical context; automated completion now requires `ENFORCE` plus composite Sold Report and same-invoice contract proof.

## Decision 1: Separate financial payment evidence from service fulfillment evidence

**Decision**: Keep `BeinAccountSpendLedger` as provider-money evidence. Store service delivery in a new one-per-operation fulfillment-proof record and expose independent `providerPaymentState` and `fulfillmentState` in operation evidence.

**Rationale**: The incident exists because `CONFIRMED_SUCCESS` currently means the expected dealer balance decrease appeared. That fact proves a debit, not that a card contract was created. Separate records prevent recovery, admin decisions, and UI states from collapsing the two facts again.

**Alternatives considered**:

- Add an invoice field to the spend ledger: rejected because it would make a financial ledger row own an unrelated service-delivery lifecycle and would still leave legacy balance-only rows ambiguous.
- Store only in `responseData`: rejected because JSON cannot enforce one proof per operation or prevent one invoice proving two operations under concurrency.

## Decision 2: Claim proof with database uniqueness before completion

**Decision**: Add `OperationFulfillmentProof` with unique `operationId` and unique `(beinAccountId, invoiceNo)`, plus a database check that the trimmed invoice is non-empty. The worker claims proof before any completed status or completion side effect.

**Rationale**: Application pre-checks alone race. Database constraints make concurrent attempts deterministic and provide a durable boundary for recovery.

**Alternatives considered**:

- Query for invoice reuse then insert: rejected because two workers can pass the query simultaneously.
- Global invoice uniqueness: rejected because provider invoice namespaces may be account-scoped; the approved requirement scopes uniqueness to the beIN account.

## Decision 3: Preserve the final-pay outcome classifier as a payment classifier

**Decision**: Rename its successful semantic use to “charged,” expose a payment-state mapper, and stop using `CONFIRMED_SUCCESS` as completion authority. Do not add fulfillment values to the HTTP client's financial outcome enum.

**Rationale**: The client already captures provider balance evidence and retry timing. Adding contract state to the same enum would repeat the original category error.

**Alternatives considered**:

- Replace the existing final-pay category enum: rejected because it is shared by renewal and installment and would broaden scope unnecessarily.
- Treat provider success text as fulfillment: rejected because the provider response can be stale, partial, or inconsistent with the contract list.

## Decision 4: Always verify after any Pay that may have reached beIN

**Decision**: Renewal post-Pay processing always runs the bounded contract verification sequence when `result.success` is true or final-payment-started/submitted evidence exists. Verification runs before the success/review/refund terminal branch.

**Rationale**: The current `if (!result.success && finalPayMayHaveStarted)` is the direct defect. Moving verification before classification makes balance debit, provider success text, failure text, and timeout use the same fulfillment gate.

**Alternatives considered**:

- Verify only balance-success cases: rejected because explicit provider success can also be false fulfillment.
- Verify asynchronously after completing: rejected because success effects and duplicate renewal eligibility would already be wrong.

## Decision 5 (superseded): Retry verification, never Pay, after the started marker

**Decision**: Keep `FINAL_PAY_REQUEST_STARTED` as the durable no-resubmit barrier. When a duplicate worker job or recovery run sees it, it re-enters contract verification/finalization without calling the Pay method.

**Rationale**: Retrying Pay creates another debit. Contract reads are the safe idempotent external action.

**Alternatives considered**:

- Submit Pay again only when balance is unchanged: rejected because unchanged balance is eventually consistent and does not prove the first request was not accepted.

## Decision 6: Balance-only recovery moves to review

**Decision**: `hasRecoveryProviderCompletionProof` requires the normalized fulfillment proof. A spend ledger plus balance audit remains useful to classify `CHARGED`, but cannot produce `COMPLETE`.

**Rationale**: Recovery currently reintroduces the same unsafe assumption outside the primary worker path.

**Alternatives considered**:

- Grandfather existing balance-only completed operations: rejected for new recovery decisions; historical rows are instead surfaced by reconciliation without automatic mutation.

## Decision 7: Historical apply creates safety issues only

**Decision**: The reconciliation command requires `--from` and `--to`, accepts `--card`, defaults to dry-run, and requires both `--apply` and `--confirm APPLY_FULFILLMENT_SAFETY_ISSUES`. Apply upserts open integrity issues only.

**Rationale**: Live financial truth and provider delivery cannot be safely inferred from local history. Safety issues are reversible/auditable and can block another renewal without changing balances or falsely rewriting completed history.

**Alternatives considered**:

- Convert all suspects to `REVIEW_REQUIRED`: rejected because it mutates historical product state and interacts with already-awarded points.
- Automatically refund the second duplicate: rejected because a provider refund or failed delivery has not been proven.

## Decision 8: Block new renewal on live review or open fulfillment issues

**Decision**: Extend the existing start-renewal card guard. It rejects unresolved review operations and open/acknowledged fulfillment-safety issue types in both lock-contention and normal paths.

**Rationale**: Reusing the existing card-level route guard covers the user entry point without creating a second lock service. Database uniqueness remains the final concurrency backstop.

**Alternatives considered**:

- Add `REVIEW_REQUIRED` to the database active-status partial index: deferred because historical issues can belong to completed operations, and changing the index alone would not block those cards.

## Decision 9 (superseded): Admin no-refund requires fulfillment, not charge

**Decision**: Remove automatic `cardRenewed: true` synthesis. The decision guard accepts no-refund only when a stored fulfillment proof is present or the request explicitly includes `manualVerification.cardRenewed=true`; payment status alone is not fulfillment evidence.

**Rationale**: A charged-but-unfulfilled operation is exactly the conflict this feature protects. Existing no-refund defaults conflate charge and renewal.

**Alternatives considered**:

- Treat `contract-verified` response JSON as sufficient: rejected because only the normalized unique proof is concurrency-safe.

## Decision 10: Localize UI states in all existing catalogs

**Decision**: Add semantic renewal fulfillment keys to `ar.ts`, `en.ts`, and `bn.ts`; use existing translation access in renewal/active-operation UI. Worker/internal audit strings remain internal English.

**Rationale**: The repository has exactly three catalogs and Arabic RTL support. New customer/admin-visible states must not be hardcoded.

**Alternatives considered**:

- Return localized provider text from the API: rejected because clients need stable state/code values and can localize them.

## Decision 11: Additive migration and root/Worker schema parity

**Decision**: Add one ordered PostgreSQL migration, update both Prisma schemas identically, and deploy with `prisma migrate deploy` followed by `prisma generate`.

**Rationale**: Production is live, and the repository build explicitly checks root/Worker schema equality.

**Alternatives considered**:

- `prisma db push`: rejected by production rules and because it does not provide an ordered, reviewable migration.

## Decision 12: Preserve installment semantics

**Decision**: Do not require fulfillment proof for `CONFIRM_INSTALLMENT` in this feature. Add tests showing the shared payment classifier remains a financial classifier and installment completion behavior does not silently change.

**Rationale**: The approved scope targets renewal contract creation. Installments may have different fulfillment evidence and need their own source-of-truth analysis.

## Amendment Decision 13: Use Sold Report baseline/diff for causal invoice discovery

**Decision**: Under the final account lease, scan the complete account-wide Sold Packages Report before renewal preparation, persist safe invoice identities plus target-card rows, and compare a complete post-mutation scan against that exact baseline.

**Rationale**: The panel cannot know an invoice before the provider creates the sale. A pre/post set difference identifies what was created during the operation; a same-day contract lookup alone cannot distinguish an older renewal.

**Alternatives considered**:

- Search contracts by card/date/package only: rejected because a prior or concurrent same-card contract can match.
- Search the report after Pay without a baseline: rejected because date-only rows cannot prove which operation created them.

## Amendment Decision 14: Require one report invoice and the same contract invoice

**Decision**: A candidate is eligible only when exactly one new report row matches dealer/account, card, item type, package duration/promotion, Decimal amount, and date context, and one active card contract contains the same non-empty invoice.

**Rationale**: Report appearance proves a new sale record; the contract independently proves delivery. The shared invoice is the cross-page identity and database uniqueness prevents reuse.

**Alternatives considered**:

- Report-only completion: rejected because a sale row may exist before the service contract is active.
- Contract-only completion: rejected because it cannot prove the contract was created by this operation.

## Amendment Decision 15: Treat report Amount as correlation metadata

**Decision**: Compare the provider report amount with Decimal semantics, but do not create a confirmed spend-ledger debit from it. A composite proof may complete with payment `UNKNOWN` when balance is delayed; explicit `NOT_CHARGED` plus composite proof is a contradiction requiring review.

**Rationale**: This preserves feature 030's same-context balance provenance while allowing strong service proof to finish a fulfilled renewal.

## Amendment Decision 16: Isolate WebForms report state and require complete scans

**Decision**: The adapter serializes successful controls (including split ViewState), uses the known Apply control, maps columns by normalized header name, scans every pager target with cycle/cap detection, and never assigns report state to the renewal client's `currentViewState`.

**Rationale**: ASP.NET postbacks are page-local. Missing pages or a login redirect is unknown evidence, never an empty valid report.

**Alternatives considered**:

- Reuse the generic hidden-field object: rejected because it loses split ViewState and non-hidden successful controls.
- Parse fixed cell indexes: rejected because localized/reordered headers create silent false matches.

## Amendment Decision 17: Disable automatic retries for provider mutations

**Decision**: Restrict global Axios retries to safe methods. Provider-mutating POSTs get zero automatic retries on network/timeouts/5xx. A failed read-only Sold Report scan may retry once only by restarting with a fresh GET; stale Apply/pager POST bodies are never replayed.

**Rationale**: The current global retry predicate can replay POST on a 500/502/503 inside one `confirmPurchase` call, bypassing the Worker job marker.

## Amendment Decision 18: Mark before the first final provider mutation

**Decision**: Persist the no-resubmit marker before the final `OK` postback, not only before Pay. Once written, all retries are report/contract verification and local finalization only.

**Rationale**: Existing code recognizes that `OK` itself can return “Contract Created Successfully.” A lost response therefore has the same ambiguity as lost Pay response.

## Amendment Decision 19: Add card lifecycle reservation and strict account lease

**Decision**: A database card reservation is created transactionally with the renewal operation and remains through unresolved review. A second database reservation owns the provider account continuously across delayed attempts; short Redis execution leases provide exact invocation ownership and fencing. All provider consumers and fenced session-cache writes obey both layers; keepalive skips reserved accounts.

**Rationale**: Report causality is valid only when neither the card nor account can be used by another panel operation during baseline, mutation, and verification.

## Amendment Decision 20: Failover restarts the causal context

**Decision**: Before any uncertain provider mutation, changing provider account invalidates the old account reservation/baseline/session generation/package and promotion controls, captures a new baseline, reloads packages, and rematches name/promotion/amount before preparation. After an uncertain Add/Sell/STB/OK/Pay response, failover is forbidden and verification remains on the original account.

**Rationale**: A baseline or WebForms control is account/session-specific and cannot be transferred safely.

## Amendment Decision 21: Roll out fail-closed in REVIEW_ONLY

**Decision**: Default to `REVIEW_ONLY` until an authorized sanitized smoke proves that a known report invoice equals the invoice in the card contract view. A mismatch or unavailable evidence does not permit report-only or contract-only fallback.

**Rationale**: Screenshots reveal the grid and controls but do not prove authenticated pager/date contracts or cross-page invoice equality in the live provider environment.

## Amendment Decision 22: REVIEW_ONLY records candidates but never claims proof

**Decision**: The default mode permits normal provider execution and stores sanitized attempts, but every automatic post-mutation result—including `MATCHED`—ends in `REVIEW_REQUIRED`. `MATCHED` remains `UNVERIFIED`, and no automated `OperationFulfillmentProof`, points, or notification is created until an authorized smoke enables `ENFORCE`. A later explicit structured-manual completion is the separate authority defined by Decision 23.

**Rationale**: Evidence collected before the live cross-page identity assumption is validated is useful for review but cannot be treated as authoritative fulfillment.

## Amendment Decision 23: Keep manual evidence separate from automated proof

**Decision**: Manual no-refund completion uses an append-only `OperationManualFulfillmentEvidence` row with a shared unique account/invoice claim and complete account/card/package/Decimal amount/currency/source/note/actor/time context. A boolean is rejected. The guarded admin transaction labels the authority manual, sets fulfillment/completion, and captures the point run; idempotent points/notification run only after commit. It never creates `OperationFulfillmentProof` or an automated `MATCHED` result.

**Rationale**: Kind-specific nullable proof fields would let manual assertions masquerade as report/contract correlation and make SQL completeness hard to audit.

## Amendment Decision 24: Enforce dedicated-account eligibility

**Decision**: `BeinAccount.automationExclusive` defaults false and requires explicit admin attestation. Pool selection fails closed for unmarked accounts; an unexpected account-wide sale quarantines the account and the operation.

**Rationale**: A lock cannot stop a human or another external client from using SBS. Explicit eligibility makes the assumption operationally visible instead of implicit.

## Amendment Decision 25: Fix bounded defaults and stable-scan rules

**Decision**: Default report cap is 100 pages; one scan restart is allowed from fresh GET; verification runs immediately then after 5s, 15s, and 30s; account execution lease TTL/heartbeat are 120s/30s; report date must equal the Africa/Cairo final-mutation calendar date with zero-day tolerance. Scans preserve the provider-selected Dealer identity from a fresh GET, bind a safe dealer-context hash across baseline/post and every page, re-read a first-page watermark, and fail incomplete on dealer-context change, unexpected dealer group, insertion, cycle, cap, or duplicate page.

**Rationale**: Deterministic defaults make absence, timeout, lease, date, and pagination tests reproducible and keep uncertainty fail-closed.

The supplied SBS screenshot corrects an earlier fixture assumption: the visible Dealer selector contains the dealer office name, while `Alone` and `Including Sub-Dealers` are columns in Report Summary rather than demonstrated option values. Posting a fabricated `ALONE` value could invalidate the WebForms request or scan the wrong context. Causality instead comes from preserving the selected dealer, full account-wide baseline/diff, the automation-exclusive account reservation, and conflict on any unexpected new sale.

## Amendment Decision 26: Make every renewal settlement finalizer atomic

**Decision**: Use separate operation-row-first finalizers for pre-mutation safe termination and post-mutation explicit no-charge termination. Each validates its evidence boundary and commits exact refund, terminal/review state, point reversal, issue disposition, and reservation release together. Any missing, duplicated, customer-owned, amount-mismatched, charged, unknown, proof-backed, or manually completed evidence fails closed to review.

**Rationale**: Calling refund, status update, and lock release as independent helpers permits crashes and races to expose both refunded and still-runnable—or failed but still-deducted—states.

## Amendment Decision 27: Exclude the non-running application/store surface

**Decision**: Feature 035 does not implement, verify, start, or release mobile application, store-subscription, Stripe, or store-credit behavior. Its accepted safety boundary is the web reseller-panel renewal plus Worker/provider/database/admin flow. Any existing worktree changes in excluded paths require a separate specification and acceptance run before they can be claimed.

**Rationale**: The maintainer explicitly excluded the non-running application/store surface on 2026-08-24 so the financial fix can converge on the active panel path without turning unrelated application behavior into an unverified release dependency.
