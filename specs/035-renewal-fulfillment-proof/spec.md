# Feature Specification: Renewal Fulfillment Proof

**Feature Branch**: `035-renewal-fulfillment-proof`

**Created**: 2026-08-24

**Status**: Reopened amendment approved for implementation (Sold Report correlation)

**Input**: Prevent a provider balance debit or a same-day contract from completing a renewal unless one new Sold Packages Report invoice, discovered from a complete pre/post baseline diff, is correlated to the same active contract and uniquely claimed; safely review ambiguous renewals, serialize provider-account/card use, block transport replay, and reconcile historical suspects without automatic financial mutation.

**Related Features**: Extends `023-final-payment-guardrails` and `030-financial-review-evidence`; preserves their final-payment and evidence-provenance rules while correcting the assumption that a provider debit proves service fulfillment.

## Clarifications

### Session 2026-08-24

- Q: Does an expected beIN balance decrease prove renewal success? A: No. It proves provider payment only; a unique composite new-report-invoice plus same-invoice active-contract proof is required for automated completion.
- Q: When must fulfillment verification run? A: After every final renewal mutation that may have reached beIN, including explicit success, balance-debit success, provider failure, and uncertain results; it always includes complete Sold Report diff plus same-invoice contract verification.
- Q: What happens when a provider debit is confirmed but no unique composite proof exists? A: Move the operation to financial review, block refund automation, and block another renewal for the same card.
- Q: May retries submit provider mutations again after the first final provider mutation started? A: No. `FINAL_PROVIDER_MUTATION_STARTED` is persisted before final `OK`; retries may repeat complete Sold Report and contract verification only. Legacy `FINAL_PAY_REQUEST_STARTED` is treated as this stronger barrier but never as proof that Pay was actually submitted.
- Q: May one provider invoice prove two operations? A: No. A proof belongs to one operation and one beIN account/invoice pair; conflicts remain under review.
- Q: How are historical suspect operations handled? A: A dry-run report finds them; explicit idempotent apply only creates financial-safety issues and never submits Pay, refunds money, or changes balances automatically.
- Q: How may an admin close a no-refund review? A: A unique stored composite proof or separate append-only manual provider evidence containing a unique invoice, account, card, package, amount/currency, source, note, actor, and observation time is required; a `cardRenewed` boolean is never sufficient.
- Q: Does installment behavior change? A: No. Installment receives regression coverage for current safety behavior and requires a separate specification for fulfillment-proof semantics.
- Q: How is the invoice obtained when the panel does not know it before Pay? A: Capture a complete Sold Packages Report baseline under the final account causal reservation and fenced execution lease, then discover exactly one new matching invoice from a complete post-mutation report diff.
- Q: Is a new report row enough by itself? A: No. The same non-empty invoice must appear on one matching active card contract and win the database uniqueness claim.
- Q: What if another sale appears on the reserved account during the causal window? A: Treat the account as externally contaminated, quarantine automated attribution, and move the operation to proof-conflict review.
- Q: What if the balance is delayed but report and contract correlate? A: A unique composite proof may complete from `UNKNOWN`; an explicit `NOT_CHARGED` contradiction remains review-required.
- Q: May the HTTP transport retry provider mutations? A: No. The durable started marker is written before the first final provider mutation, and every provider-mutating POST has one transport attempt.
- Q: What happens when report pagination, session, parsing, or baseline capture is incomplete? A: The scan is not valid absence evidence; Pay is blocked before baseline, and post-mutation uncertainty moves to review without refund.
- Q: How does account failover behave? A: The old baseline, session generation, and package control are invalidated; the replacement account takes a fresh baseline and reloads/rematches the package from the beginning.
- Q: What does rollout mode `REVIEW_ONLY` do? A: It permits the provider flow and records sanitized verification attempts, but never claims an authoritative automated proof or completes from the candidate; every post-mutation outcome is held in `REVIEW_REQUIRED`, and legacy contract-only completion remains forbidden.
- Q: How can delayed verification preserve account exclusivity? A: A durable database account reservation spans baseline through the bounded verification window/review hold, while each active job also needs a short Redis execution lease with fencing; pool selection, keepalive, and every provider consumer honor both layers.
- Q: Can the same provider login be registered twice with different whitespace or letter case? A: No. beIN email identity is canonicalized with trim plus lowercase on every write and protected by a database expression-unique index; migration preflight must stop on existing canonical aliases because two local account IDs for one dealer invalidate both account exclusivity and invoice uniqueness.
- Q: May a generic Worker exception handler refund a renewal after final provider mutation? A: No. Every post-mutation renewal no-charge decision must go through the single atomic no-charge finalizer, which revalidates the durable marker and terminal verification evidence and commits refund, failure state, point reversal, issue resolution, and reservation release together.
- Q: May a pre-mutation cancellation or failure refund a wallet deduction and release the card in separate writes? A: No. It must lock the operation and exact canonical deduction, then atomically refund, terminate, reverse points, and release reservations; ambiguous or missing settlement evidence remains under review with reservations held.
- Q: Are the mobile application, store subscriptions, Stripe entry points, or store-credit flows part of this delivery? A: No. The maintainer explicitly excluded the non-running application/store surface on 2026-08-24. This feature's implementation, verification, release decision, and handoff cover only the web reseller panel `RENEW / CONFIRM_PURCHASE` path, its Worker, shared provider-account/card safety, database proof model, admin review, and reconciliation. No app/store/mobile behavior is claimed, tested, started, or released by feature 035.

## User Scenarios & Testing

### User Story 1 - Complete Only Fulfilled Renewals (Priority: P1)

A reseller renewal reaches the provider final-payment step. The system treats a provider balance debit as payment evidence, discovers one invoice created after the operation's Sold Report baseline, and verifies the card's active contract has that same invoice. `ENFORCE` completes only after storing a unique composite proof; `REVIEW_ONLY` records the candidate and holds review.

**Why this priority**: This closes the production defect that can charge both balances and announce success without creating the package.

**Independent Test**: Simulate a matching provider debit, one exact new Sold Report invoice, and one matching active contract with that invoice. The operation stores one composite proof and reaches completed exactly once; success notification and points occur only after that proof exists.

**Acceptance Scenarios**:

1. **Given** a final provider mutation may have reached beIN, **When** the expected balance decrease appears, **Then** payment is classified as charged and the complete Sold Report diff plus same-invoice contract verification still runs.
2. **Given** exactly one new matching report row and a matching active contract share a non-empty invoice not used by another operation, **When** verification succeeds in `ENFORCE`, **Then** one immutable composite fulfillment proof is stored before completion.
3. **Given** completion is retried for the same operation and same proof, **When** the retry runs, **Then** it is idempotent and no duplicate notification, point award, or proof is created.
4. **Given** a direct provider success message without a unique composite report/contract proof, **When** post-mutation handling runs, **Then** the operation does not complete.
5. **Given** proof mode is `REVIEW_ONLY`, **When** report and contract produce a matched candidate, **Then** the attempt is stored without claiming proof and the operation remains review-required.

---

### User Story 2 - Review Charged But Unfulfilled Renewals (Priority: P1)

A provider debit is confirmed but composite report/contract evidence is absent, incomplete, ambiguous, or conflicts with another operation. The reseller sees an accurate pending-review state and cannot start a second renewal for the same card; the provider account remains durably reserved throughout the bounded automatic window and, if review is entered, until explicit review resolution.

**Why this priority**: It prevents the repeated USD 174 debit shown in the incident and protects both customer and provider balances.

**Independent Test**: Simulate a confirmed provider debit with complete `VALID_NO_MATCH`, report-only, contract-only, incomplete scan, and conflict outcomes. Every non-composite outcome moves to review, refund is blocked, no success effects occur, and another renewal for the card is rejected.

**Acceptance Scenarios**:

1. **Given** payment is charged and no composite proof is found, **When** verification attempts finish, **Then** the operation becomes review-required without an automatic refund.
2. **Given** the report/contract check fails or provider payment remains unknown without a unique composite proof, **When** final classification runs, **Then** the operation becomes review-required.
3. **Given** one invoice is already bound to another operation on the same beIN account, **When** a second operation tries to claim it, **Then** the second operation remains in proof-conflict review.
4. **Given** a card has an unresolved charged-without-proof operation or an open fulfillment-safety issue, **When** a new renewal is requested, **Then** the request is blocked before a new provider Pay can be queued.
5. **Given** the first final provider mutation started, **When** a worker retry occurs, **Then** it never submits `OK`, Pay, or any sale mutation again and only repeats complete report/contract verification.

---

### User Story 3 - Fail And Refund Only Proven No-Charge Cases (Priority: P1)

If an explicit deterministic provider rejection proves no charge and complete report/contract verification yields `VALID_NO_MATCH`, the operation may fail and the reseller deduction may be refunded once.

**Why this priority**: Review must not become a blanket fallback that hides safe refunds, while a provider charge must never be auto-refunded.

**Independent Test**: Simulate explicit no-charge evidence plus complete `VALID_NO_MATCH`, then retry the failure path. The operation fails, exactly one reseller refund exists, and no provider charge ledger or success effects are created.

**Acceptance Scenarios**:

1. **Given** explicit no-charge evidence is confirmed and complete verification returns `VALID_NO_MATCH`, **When** verification completes, **Then** the atomic no-charge finalizer may commit one exact idempotent refund and terminal transition.
2. **Given** any confirmed provider debit exists, **When** no contract is found, **Then** automatic refund remains blocked.
3. **Given** complete report/contract verification fails rather than proving absence, **When** final classification runs, **Then** missing verification is not treated as no-charge proof.

---

### User Story 4 - Recover From Durable Fulfillment Evidence (Priority: P2)

Maintenance and recovery processes distinguish financial debit evidence from service-fulfillment evidence and restore a safe final state after crashes.

**Why this priority**: A worker can crash after final provider mutation, report/contract verification, proof creation, or status completion; recovery must never recreate the original false-success condition.

**Independent Test**: Run recovery in both modes against operations with balance proof only, legacy contract-only proof, unique composite proof, conflicting proof, and no-charge/valid-no-match evidence. Only the unique composite-proof case in `ENFORCE` completes; `REVIEW_ONLY` remains review.

**Acceptance Scenarios**:

1. **Given** only a provider spend ledger exists, **When** recovery runs, **Then** the operation moves to or remains under review.
2. **Given** a unique stored composite fulfillment proof exists, mode is `ENFORCE`, and no guarded terminal/refund conflict exists, **When** recovery runs, **Then** the operation may complete without resubmitting provider mutation.
3. **Given** proof exists but its invoice conflicts or context does not match, **When** recovery runs, **Then** the operation remains under review.
4. **Given** a crash occurs after proof creation but before completion, **When** recovery retries, **Then** it reuses the same proof and completes idempotently.

---

### User Story 5 - Make Admin Decisions Auditable (Priority: P2)

An admin can see whether payment was charged and whether fulfillment is verified, can rerun complete Sold Report plus same-invoice contract verification, and cannot choose no-refund merely because provider payment was charged.

**Why this priority**: Payment and fulfillment are separate facts; manual closure must not collapse them into one boolean.

**Independent Test**: Submit no-refund decisions with provider charge only, unique composite proof, a boolean-only renewal claim, and complete structured manual provider evidence. Charge-only and boolean-only decisions are rejected; composite proof and uniquely claimed structured evidence are accepted and remain attributable.

**Acceptance Scenarios**:

1. **Given** provider payment is charged but fulfillment is unverified, **When** an admin chooses no-refund without composite proof or complete structured manual provider evidence, **Then** the decision is rejected and review remains open.
2. **Given** a unique composite fulfillment proof exists, **When** no-refund is chosen, **Then** the operation may close without inventing manual card-renewed evidence.
3. **Given** an admin supplies manual provider confirmation, **When** no-refund is chosen, **Then** a unique non-empty invoice plus account, card, package, amount/currency, source, note, actor, and observation time are atomically validated and appended for audit; a boolean alone is rejected.
4. **Given** a live check finds one new report invoice and the same active-contract invoice against a valid baseline in `ENFORCE`, **When** the review handler claims the composite proof, **Then** the operation can complete only after the claim succeeds; `REVIEW_ONLY` stores only the attempt.

---

### User Story 6 - Reconcile Historical Suspect Renewals (Priority: P2)

An operator can identify completed renewals that have provider debit evidence but no fulfillment proof, duplicate-debit bursts, and invoice reuse without mutating money automatically.

**Why this priority**: Existing operations may already contain the defect and need a safe, repeatable investigation workflow.

**Independent Test**: Run dry-run and repeated explicit apply against isolated fixtures, including card `7517687161` in the incident window. Reports remain stable; apply creates one safety issue per suspect condition and never changes balances, submits Pay, or refunds.

**Acceptance Scenarios**:

1. **Given** a bounded date/card filter, **When** dry-run runs, **Then** it reports completed charged renewals without proof, short-window duplicates, and invoice conflicts with stable operation identifiers.
2. **Given** apply is requested without the exact explicit confirmation, **When** the tool starts, **Then** it refuses to mutate data.
3. **Given** confirmed apply runs repeatedly, **When** the same suspects are found, **Then** open safety issues are upserted without duplicates.
4. **Given** apply runs, **When** suspects are recorded, **Then** operation status, customer balance, provider balance, refunds, Pay, notifications, and points remain unchanged.

---

### User Story 7 - Correlate A New Sold Invoice To Its Contract (Priority: P1)

A renewal owns one card reservation and one durable provider-account causal reservation; each active job owns a fenced execution lease. Before sale preparation the Worker captures every Sold Report page without storing subscriber data, reloads the renewal page, and later attributes fulfillment only when the complete post-mutation diff contains exactly one matching new invoice that also appears on one active contract.

**Why this priority**: A contract-only check cannot distinguish an older same-card renewal or two near-simultaneous sales. Baseline/diff supplies temporal causality, while the shared invoice supplies cross-page identity.

**Independent Test**: Start with an account-wide baseline containing an old invoice for the target card, add exactly one report row with the expected card/package/promotion/decimal amount, and return one active contract with the same invoice. In `ENFORCE`, exactly one composite proof is claimed and the operation completes; in `REVIEW_ONLY`, the same match is attempt-only and remains under review. Every incomplete, ambiguous, report-only, contract-only, reused, or externally contaminated variant remains non-successful.

**Acceptance Scenarios**:

1. **Given** the final provider account and card are exclusively reserved, **When** a complete baseline is captured, **Then** it is durable before renewal page preparation and contains only safe normalized fields/fingerprints.
2. **Given** final confirmation may mutate provider state, **When** the first final mutation begins, **Then** its durable marker exists before the request and no transport layer can replay that request.
3. **Given** the post-mutation report scan is complete, **When** exactly one new row matches dealer, card, item type, package duration, promotion, decimal amount, and operation date, **Then** its non-empty invoice becomes the only contract lookup key.
4. **Given** an active matching card contract has the same invoice and mode is `ENFORCE`, **When** the unique composite claim succeeds, **Then** proof is persisted before completion effects; `REVIEW_ONLY` records only the candidate attempt.
5. **Given** no row, multiple rows, mismatched rows, an incomplete scan, report-only evidence, contract-only evidence, or an invoice conflict, **When** verification concludes, **Then** the operation does not complete automatically.
6. **Given** a safe pre-mutation account failover, **When** the replacement account is selected, **Then** the old reservation/baseline/session/package/promotion control cannot be reused and preparation restarts under a new causal reservation and fenced lease; uncertain mutation forbids failover.

### Edge Cases

- Pay returns success text while balance is unchanged and the contract appears later.
- Balance decreases by the expected amount but the matching contract appears after the first contract read.
- A contract is active and package-matched but has a blank invoice number.
- Two workers race to claim the same invoice for different operations.
- The same operation retries proof creation with identical evidence.
- A matching contract belongs to a different package, card context, provider account, or predates final payment.
- A user retries from two browser tabs while the first operation is under review.
- A historical operation is completed and has points but lacks fulfillment proof.
- Exactly one contract exists for two provider debits on the same card.
- Two different contracts with different invoices exist for two separate debits.
- Contract verification cannot log in or parse the provider response.
- Recovery sees a fulfillment proof after an operation was manually refunded or cancelled.
- An invoice number contains leading or trailing whitespace.
- Existing installment operations share provider evidence helpers but are outside renewal proof semantics.
- The baseline contains an old same-card invoice created earlier on the same Cairo day.
- A post scan contains two new rows for the same card, only one of which matches the expected amount.
- A post scan contains one exact row plus an unrelated new row on another card, indicating external account use.
- The Sold Report grid is missing, reordered, empty with a valid empty-state marker, split across ViewState fields, or redirected to login.
- A GridView pager repeats a page, exceeds the configured cap, or loses a row between pages.
- The report amount uses decimal fractions or thousands separators.
- The final `OK` mutation creates the contract before the Pay control appears, then its response is lost.
- A stale Worker still holds an expired account lease and attempts a provider POST.
- A legacy in-flight operation reaches verification without a pre-mutation baseline.
- A delayed verification job runs after its Redis lease expired while the database account reservation is still owned by the operation.
- The selected dealer identity changes between baseline/post scans or pages, an unexpected dealer group appears, or the first-page watermark changes during pagination.
- A cancellation races a pre-mutation reseller-wallet refund while the Worker is preparing the provider operation.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST represent provider payment state separately from renewal fulfillment state.
- **FR-002**: Provider payment state MUST distinguish not submitted, charged, not charged, and unknown.
- **FR-003**: Fulfillment state MUST distinguish unverified, verifying, verified, not found, check failed, and proof conflict.
- **FR-004**: An expected provider balance decrease MUST establish payment evidence only and MUST NOT complete a renewal.
- **FR-005**: Every final renewal mutation, including `OK` or Pay, that may have reached the provider MUST be followed by complete Sold Report/contract verification, regardless of provider success/failure text or balance outcome.
- **FR-006**: Automated renewal completion MUST be in `ENFORCE` and require one new matching Sold Report row, a matching active contract with that same non-empty invoice, and a successfully claimed unique composite fulfillment proof.
- **FR-007**: A fulfillment proof MUST be unique per operation and per provider-account/invoice pair.
- **FR-008**: Empty or whitespace-only invoice numbers MUST NOT qualify as automated fulfillment proof.
- **FR-009**: A repeated claim by the same operation for the same evidence MUST be idempotent.
- **FR-010**: A claim by a different operation for an already-used provider-account/invoice pair MUST produce proof conflict and MUST NOT complete either new claim path.
- **FR-011**: Confirmed provider charge without a unique `ENFORCE` composite fulfillment proof MUST move the operation to review-required and MUST block automatic refund.
- **FR-012**: Unknown provider payment without a unique `ENFORCE` composite proof, failed or incomplete Sold Report/contract checking, or proof conflict MUST move the operation to review-required; `UNKNOWN` with a valid uniquely claimed composite proof follows FR-053.
- **FR-013**: Confirmed no-charge plus complete `VALID_NO_MATCH` from both the post-baseline Sold Report scan and contract read MAY fail only through the atomic no-charge finalizer and commit one exact idempotent refund and terminal transition.
- **FR-014**: No retry after `FINAL_PROVIDER_MUTATION_STARTED` (or the legacy `FINAL_PAY_REQUEST_STARTED` compatibility barrier) MAY submit final `OK`, Pay, or any sale mutation again; the legacy marker MUST NOT be interpreted as evidence that Pay itself was submitted.
- **FR-015**: Retrying an operation after the first final provider mutation started MAY repeat only complete Sold Report diff, same-invoice contract verification, proof claim when enforcement permits, and safe local finalization. Maintenance MUST re-enqueue any due read-only verification recorded in `nextCheckAt` when a Worker crashes after committing the due state but before adding the BullMQ job; the stable attempt job ID MUST make this repair idempotent. It MUST also enqueue a new logical read-only attempt when the latest `MATCHED` attempt remains `VERIFYING` with no `nextCheckAt`, so a crash between attempt commit and proof finalization cannot strand enforcement.
- **FR-016**: Recovery MUST NOT complete a renewal from provider balance/spend evidence alone.
- **FR-017**: Recovery MAY complete only in `ENFORCE` mode from a valid unique `SOLD_REPORT_CONTRACT_CORRELATION` proof and MUST preserve guarded terminal, refund, structured-manual-evidence, and rollout-mode conflicts.
- **FR-018**: Success notifications, successful analytics, completed-operation points, and other completion side effects MUST occur only after authoritative fulfillment evidence is durable: an `ENFORCE` composite proof for automated completion or complete structured manual evidence for an explicit admin completion.
- **FR-019**: The provider spend ledger MUST remain payment evidence and MUST NOT be reinterpreted as service-fulfillment proof.
- **FR-020**: Provider spend recording MUST use captured financial evidence; expected package price alone MUST NOT masquerade as a read provider debit.
- **FR-021**: Starting a renewal MUST reject the same card when an unresolved charged-without-proof operation, proof conflict, or open fulfillment-safety issue exists.
- **FR-022**: APIs and user interfaces MUST expose payment state and fulfillment state without presenting provider charge as completed renewal.
- **FR-023**: User-facing renewal states MUST include localized equivalents of “provider charged; verifying fulfillment” and “provider charged but fulfillment unconfirmed; under admin review.”
- **FR-024**: All new user-facing text MUST use the existing localization catalog and support Arabic, English, Bengali, and RTL behavior where applicable.
- **FR-025**: Admin no-refund/completion decisions MUST require either a unique `ENFORCE` composite fulfillment proof or explicit structured manual provider confirmation attributable to an admin and containing a uniquely claimed non-empty invoice plus account/card/package/Decimal amount/currency/source/note/observation-time context; a boolean alone is insufficient. Manual evidence MAY resolve `REVIEW_ONLY`, but it MUST remain distinguishable from automated correlation.
- **FR-026**: Selecting no-refund MUST NOT synthesize card-renewed=true when the admin did not explicitly supply that fact.
- **FR-027**: Live admin verification MUST have a valid baseline, complete report diff, same-invoice active contract, and unique composite proof claim before completing a review operation.
- **FR-028**: Historical reconciliation MUST default to dry-run and require bounded date inputs; card filtering MUST be supported.
- **FR-029**: Historical reconciliation MUST identify completed charged renewals without proof, duplicate same-card/package/amount bursts, and attempted invoice reuse.
- **FR-030**: Historical apply MUST require an exact explicit confirmation and MUST be idempotent.
- **FR-031**: Historical apply MUST NOT submit Pay, call refund logic, change wallet balances, change provider balances, change operation status, award/reverse points, or send notifications.
- **FR-032**: Applied historical suspects MUST create durable open financial-safety issues that block another renewal for the affected card until resolved.
- **FR-033**: The incident workflow MUST support card `7517687161` for `2026-08-23 18:35–18:45` Africa/Cairo without assuming production data is locally available.
- **FR-034**: The system MUST preserve existing installment behavior and add regression coverage; fulfillment-proof changes for installments require a separate accepted specification.
- **FR-035**: All payment, proof, review, reconciliation, and manual-decision records MUST avoid provider credentials, sessions, cookies, ViewState, TOTP secrets, and raw provider responses.
- **FR-036**: The database migration MUST be additive, production-safe, deployable through ordered migrations, and enforce proof uniqueness at the database boundary.
- **FR-037**: Root and Worker data schemas MUST remain byte-synchronized where the repository requires schema parity.
- **FR-038**: All financial state transitions and proof claims MUST be race-safe and idempotent.
- **FR-039**: Automated renewal proof MUST be the composite sequence `complete pre-mutation Sold Report baseline -> exactly one new matching Sold Report invoice -> active contract with the same invoice -> unique database claim`; contract-only, report-only, balance-only, and date-only evidence MUST NOT complete automatically.
- **FR-040**: The final provider account MUST have a durable database causal reservation owned by the operation before baseline capture and remain unavailable to every other panel operation, manual-automation task, or session task through the bounded automatic verification window and unresolved review; each active job MUST additionally hold a short fenced Redis execution lease bound to that reservation.
- **FR-041**: A durable card lifecycle reservation MUST prevent any second renewal for the normalized card from operation creation through success/safe failure, and MUST remain held throughout unresolved review.
- **FR-042**: Baseline capture MUST scan every Sold Report page, use a first-page watermark re-read to detect concurrent insertion, fail closed on login/session/parser/pager cycle/page-cap/duplicate-page uncertainty, and complete before any renewal preparation POST on the final provider account. The default full-scan cap is 100 pages and a failed read retry MUST restart from a fresh report GET rather than replay stale postback state.
- **FR-043**: Baseline and report evidence MUST retain only invoice, card, item type, package, amount, contract dates, safe hashes/fingerprints, scan counts, and timestamps; subscriber, country, HTML, cookies, ViewState, credentials, and raw provider responses MUST NOT be persisted or logged.
- **FR-044**: Sold Report WebForms state MUST be local to the report adapter and MUST NOT overwrite renewal/check/installment page state.
- **FR-045**: A post-mutation report scan MUST be compared with the durable baseline for the same operation, provider account, selected dealer context, and session generation. The adapter MUST preserve the provider-selected Dealer control exactly as returned by the fresh GET, hash its stable value/label context without persisting the raw label, and require the same dealer context across baseline, post-scan, and every page. It MUST NOT synthesize an `Alone` Dealer option: the observed SBS page uses the Dealer selector for dealer identity while `Alone` and `Including Sub-Dealers` are report-summary counts. A dealer-context change or unexpected dealer group is incomplete/conflicting evidence, and unexpected account-wide new rows remain `PROOF_CONFLICT` under the automation-exclusive account boundary.
- **FR-046**: A report candidate MUST match the reserved dealer/account, exact normalized card, item type, package family and duration, promotion such as `Save 25%`, decimal amount, and exact Africa/Cairo calendar date of the final provider mutation. The default date tolerance is zero days; a midnight ambiguity is review-required rather than widened silently.
- **FR-047**: Monetary report matching MUST use decimal-safe comparison and MUST NOT use binary floating-point equality.
- **FR-048**: Exactly one new matching non-empty invoice is required. Zero candidates, multiple candidates, blank invoices, mismatched new rows, unexpected account-wide new sales, or a reused invoice MUST NOT produce automated success.
- **FR-049**: Contract verification MUST search by the discovered invoice and require the same invoice on an active contract for the same card/package context; fuzzy same-day package matching alone is prohibited.
- **FR-050**: Each verification attempt MUST durably record exactly one of `MATCHED`, `VALID_NO_MATCH`, `REPORT_ONLY`, `CONTRACT_ONLY`, `INCOMPLETE_SCAN`, `CHECK_FAILED`, or `PROOF_CONFLICT` with safe reason codes and timestamps.
- **FR-051**: `VALID_NO_MATCH` MUST require a successful complete post report scan and complete contract read; missing grid, login redirect, pager loop/cap, parse failure, request failure, or absent baseline MUST never be classified as valid absence.
- **FR-052**: `REPORT_ONLY`, `CONTRACT_ONLY`, `INCOMPLETE_SCAN`, `CHECK_FAILED`, `PROOF_CONFLICT`, and legacy/no-baseline evidence MUST move or keep the operation in review-required after a final provider mutation.
- **FR-053**: In `ENFORCE`, a unique Sold Report plus same-invoice active-contract proof MAY complete when provider payment state is `UNKNOWN`; in `REVIEW_ONLY` it remains an unclaimed review candidate, and a simultaneous explicit `NOT_CHARGED` classification is contradictory and MUST move to review.
- **FR-054**: Unchanged provider balance alone MUST NOT establish `NOT_CHARGED`; that state requires an explicit deterministic provider rejection plus complete `VALID_NO_MATCH` verification.
- **FR-055**: The durable no-resubmit marker MUST be persisted before the first final provider mutation, including the `OK` postback that can directly create a contract, and not only before the visible Pay control.
- **FR-056**: Every provider-mutating HTTP request MUST have zero automatic transport retries for network errors, timeouts, and HTTP 5xx responses. A read-only report scan MAY retry once by restarting from a fresh GET; stale Apply/pager POST bodies MUST never be replayed.
- **FR-057**: Provider-account reservation and execution-lease acquisition, renewal, assertion, fencing, session-cache compare-and-set, and release MUST be atomic and owner-scoped; same-worker identity, same-operation identity without the exact invocation/lease token, or a missing owner MUST NOT acquire, extend, mutate, cache, release, or replace another execution lease.
- **FR-058**: A lost, expired, superseded, or mismatched account lease MUST prevent all provider mutations and force safe review when a final mutation may already have started. Every `VERIFY_RENEWAL_FULFILLMENT` and `VERIFY_REVIEW_CARD` failure MUST bypass generic mutation/refund error handling; read-only retry failures MAY be retried by BullMQ, but a verification job MUST never invoke payment, refund, or pre-mutation terminal settlement from its catch path.
- **FR-059**: Renewal, installment, signal, balance, report, and session/keepalive flows MUST respect the same account serialization boundary; this cross-cutting rule MUST NOT change installment fulfillment semantics.
- **FR-060**: Account failover is allowed only before any provider mutation with an uncertain outcome. It MUST invalidate the old reservation/baseline/session generation, reserve the replacement account, capture a fresh baseline, reload package and promotion controls, and exactly rematch the selected package before preparation. After uncertain Add/Sell/STB/final `OK`/Pay, failover is forbidden and verification remains on the same reserved account.
- **FR-061**: Provider accounts used for causal attribution MUST be explicitly marked automation-exclusive by an admin and selected fail-closed from the pool; unmarked accounts are ineligible. Unexpected account-wide sales during an exclusive window MUST produce proof conflict, account quarantine, and review rather than guessed attribution.
- **FR-062**: `OperationFulfillmentProof` MUST store composite proof kind, canonical discovered invoice, baseline/report/contract timestamps, report row fingerprint, decimal provider amount, report package/item metadata, and dealer-context hash.
- **FR-063**: Composite proof creation, terminal completion, refund exclusion, and completion-side-effect capture MUST be transactionally ordered so concurrent proof/refund/status races cannot produce both success and refund.
- **FR-064**: Enforcement MUST default to `REVIEW_ONLY` until an authorized sanitized smoke proves that a known Sold Report invoice equals the card-contract invoice. In `REVIEW_ONLY`, provider mutation may run and sanitized attempts may be stored, but no automated composite proof is claimed and every post-mutation result remains `REVIEW_REQUIRED`; legacy/report-only/contract-only/balance-only completion is forbidden. Only `ENFORCE` may claim a matched composite proof and complete automatically.
- **FR-065**: Provider-account username/email identity MUST be stored as `trim().toLowerCase()` on every create, update, import, or seed path and protected by a database unique constraint over `lower(btrim(username))`. Migration MUST fail closed with actionable preflight output when existing canonical aliases would collide; account reservations and invoice claims MUST never be scoped to two local IDs representing one provider login.
- **FR-066**: After a renewal final-provider-mutation marker exists, no generic catch, cleanup, recovery, or admin path MAY call refund and failure transitions separately. The single atomic no-charge finalizer MUST lock and revalidate `RENEW + FINAL_OK + stored NOT_CHARGED + terminal complete VALID_NO_MATCH + no charge/proof/manual evidence`, then commit the exact canonical refund, `FAILED/NOT_FOUND/VALID_NO_MATCH`, point reversal, issue resolution, and reservation release in one transaction; every contradiction fails closed to review.
- **FR-067**: Every pre-final-mutation renewal cancellation, timeout, or safe failure that refunds a local wallet deduction MUST use one operation-row-first transaction that proves the operation is `RENEW`, proves no provider mutation or fulfillment/charge ambiguity exists, reconciles exactly one canonical deduction and any exact prior refund, and atomically commits at most one refund, terminal state, point reversal, and card/account reservation release. Missing, customer-owned, duplicated, or amount-mismatched settlement evidence MUST move the operation to `REVIEW_REQUIRED` and keep its reservations held.

### Key Entities

- **Provider Payment State**: Financial classification of whether the provider Pay request was not submitted, charged, not charged, or unknown.
- **Fulfillment State**: Service-delivery classification of whether the renewal contract is unverified, being checked, verified, not found, failed to check, or conflicts with an existing proof.
- **Operation Fulfillment Proof**: Durable one-operation evidence containing provider account, card snapshot, non-empty invoice, matching contract/package details, verification source, and timestamps.
- **Financial Safety Issue**: Open or resolved audit issue that blocks a new renewal when historical or live fulfillment evidence is unsafe.
- **Reconciliation Candidate**: A read-only projection of a suspect operation, duplicate burst, or proof conflict found within a bounded filter.
- **Manual Fulfillment Evidence**: Separate append-only admin evidence with a uniquely claimed non-empty provider invoice and required account/card/package/Decimal amount/currency/source/note/observation-time/actor context; it can authorize labeled manual completion but never masquerades as automated correlation.
- **Sold Report Baseline**: Durable, account/session-generation-bound snapshot of safe invoice identities and target-card rows captured before provider sale preparation.
- **Fulfillment Verification Attempt**: Append-only safe outcome for one complete or failed report/contract correlation attempt.
- **Card Lifecycle Reservation**: Database-backed exclusive ownership of a normalized card through the full renewal/review lifecycle.
- **Provider Account Causal Reservation And Execution Lease**: A durable operation-scoped database reservation spans baseline through delayed verification/review, while a short exact-owner Redis lease fences each active provider job.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Zero automated renewal operations reach completed outside `ENFORCE` or without exactly one valid unique composite proof, and zero manual completions occur without exactly one complete uniquely claimed structured manual evidence row.
- **SC-002**: Zero automatic refunds occur when provider charge is confirmed.
- **SC-003**: One provider-account/invoice pair can prove at most one operation under concurrent automated-versus-manual claims.
- **SC-004**: A charged renewal without proof blocks a second renewal for the same card in 100% of tested route and race scenarios.
- **SC-005**: Retries after `FINAL_PROVIDER_MUTATION_STARTED` or its legacy compatibility barrier produce zero additional final `OK`, Pay, or sale-mutation submissions.
- **SC-006**: Success notification and points side effects occur zero times before authoritative composite/manual evidence and at most once after its guarded transaction commits.
- **SC-007**: Recovery completes 100% of proof-backed eligible crash cases and completes 0% of balance-only cases.
- **SC-008**: Reconciliation dry-run and repeated apply produce stable candidate counts and no duplicate safety issues or financial mutations.
- **SC-009**: The incident card/time filter can be represented exactly and returns an auditable operation/evidence correlation when corresponding data is present.
- **SC-010**: Root and Worker schema validation, ordered migration checks, focused financial tests, web tests, Worker tests, and both production builds pass before release.
- **SC-011**: Arabic, English, and Bengali catalogs contain every new message key, and Arabic renewal/review states remain readable in RTL layouts.
- **SC-012**: Zero automated completions occur from an invoice that was already present in the operation baseline.
- **SC-013**: Zero incomplete report scans are classified as valid no-match or refund eligibility.
- **SC-014**: Network errors, timeouts, and 500/502/503 responses cause exactly one transport submission for every provider mutation, including `OK` and Pay.
- **SC-015**: Exactly one concurrent operation can reserve a card, exactly one can hold a provider-account causal reservation across delayed attempts, and exactly one invocation can hold its fenced execution lease.
- **SC-016**: Account failover tests reuse zero old baselines, session generations, or package checkbox values.
- **SC-017**: Every composite proof has one new report invoice, one same-invoice active contract, and one unique database claim with matching safe fingerprints.
- **SC-018**: A known authorized successful renewal shows identical invoice values in Sold Report and contract views before enforcement leaves `REVIEW_ONLY`.
- **SC-019**: Concurrent pre-mutation cancellation/failure paths produce at most one exact wallet refund and never release the card when settlement evidence is ambiguous.

## Assumptions

- Renewal uses the existing `RENEW` / `CONFIRM_PURCHASE` path; Sold Packages Report supplies the new-invoice identity and the card contract list independently confirms fulfillment with that same invoice.
- The provider invoice number is stable enough to serve as an account-scoped uniqueness key when non-empty.
- Provider payment evidence and service fulfillment evidence are separate durable facts even when captured during one worker job.
- Existing refund, points, notification, operation dispatch, and financial review primitives are extended instead of replaced.
- Existing open review and integrity-report permissions remain admin-only.
- Production data inspection and any external provider escalation require separate explicit authorization; this implementation ships safe local tooling and does not claim live incident reconciliation.
- The current uncommitted `034-web-project-memory`, `.specify/feature.json`, `AGENTS.md`, `.gitignore`, project memory, and personal-skill files are preserved except for the required final additive memory/documentation synchronization performed without overwriting unrelated records.

## Non-Goals

- Automatically refunding or compensating the incident operations.
- Submitting a new provider Pay request during reconciliation or recovery.
- Inferring fulfillment from price, balance delta, success text, notification history, or points history.
- Rewriting installment fulfillment semantics.
- Deleting historical ledger, audit, transaction, manual-decision, or provider evidence.
- Inspecting production databases, provider accounts, or private logs without separate authorization.
- Falling back to report-only, contract-only, balance-only, or same-day matching when composite evidence is unavailable.
- Starting, repairing, verifying, or releasing the mobile application, store-subscription routes, Stripe payment entry points, or store-credit lifecycle.
