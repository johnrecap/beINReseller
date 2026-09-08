# Planned data model and compatibility

**Local backlog design (2026-09-08):** Reuse OperationReviewAdjudication, OperationCompletionEffect, OperationDispatch, existing invoice claims and canonical reservations. Capabilities/readiness are derived views, not new sources of financial truth. No historical migration rewrite or business-data backfill. If integration reveals a necessary additive schema change, document it before editing and exercise only synthetic migration checks.

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

**Status**: Phase 2 accepted after isolated local application of its three unchanged migrations and focused tests of all six model families. Financial adapters/activation and full production migration readiness remain later tasks. See [runtime evidence](evidence/phase-2-runtime-verification.md). Historical source-authoring notes below are superseded only for this verified local scope.
**Owners**: foundation T003-T005; financial T006-T008/T011-T012; panel offers T015-T017; panel review T024-T026; recovery T030-T034.

## Review repair compatibility (2026-09-08)

No model/migration change. Redis lock JSON adds optional `handoffReady: true`; absence is not permission to transfer another worker's ownership. Preserve remaining TTL and compare exact previous bytes. Operation response data records `quoteConflictResolution: VERIFIED_PRE_SALE_NO_DEBIT` and `safeToRestart: true` only during fenced atomic closure; it is not a legacy backfill flag. Reuse existing FAILED/REVIEW_REQUIRED operation and dispatch states, quote revisions and reservation release fields. Mixed-version rollout and old quote snapshots require the [release gates](../../docs/deployment/audit-remediation-release.md).

## Existing authoritative entities

| Entity | Authority | Preserve |
| --- | --- | --- |
| Operation | owner, lifecycle, purpose, provider mutation and fulfillment evidence | id, canonical card, existing status history and reservations |
| Transaction | reseller OPERATION_DEDUCT and REFUND | original deduction amount/owner; refund uniqueness |
| BeinAccountSpendLedger | actual provider spend | unique operation, account/balance evidence; not fulfillment proof |
| Fulfillment baseline/attempt/proof/invoice claim | causal completion authority | latest context, complete scan, exact invoice, account/card, uniqueness |
| Card/ProviderAccount reservations | durable work ownership | release only after safe terminal closure |
| OperationDispatch | durable queued action | evidence of uncertain delivery and stable job identity |
| OperationSpendAwardRun | immutable points recipients/rates | reuse its current repair; never recalculate from current ownership |

## Planned additive changes

### Operation purpose and installment evidence

- NEW optional purpose discriminator: RENEWAL, INSTALLMENT, LEGACY_UNKNOWN. New producers must set purpose; old rows are classified from trustworthy recorded job metadata, otherwise LEGACY_UNKNOWN.
- Extend provider mutation kind/stage with INSTALLMENT_PAY; preserve FINAL_OK semantics for renewal. A mutation marker is durable before the single provider submission.
- NEW OperationInstallmentEvidence: operationId unique, provider account/card/installment identity, mutationStartedAt, observation time, normalized outcome (CHARGED / NOT_CHARGED / UNKNOWN), amount/currency, request correlation, evidence version and safe reason code.
- A balance snapshot alone is not proof of non-charge. Rejection evidence must identify the exact attempted installment and provider response context. Ambiguous or contradictory evidence holds for review.
- Record installmentSettlementState separately: SETTLED / NOT_SETTLED / UNKNOWN, with a normalized provider receipt/reference or authenticated before/after due-item evidence identifying the same installment. A dealer balance decrease alone cannot set SETTLED. If exact installment identity or settlement evidence is unavailable, use UNKNOWN and review without repayment/refund.
- New installment evidence never masquerades as a sold-report renewal proof.

### Historical customer provider-spend attribution (excluded)

Existing Phase 2/3 schema and source changes are preserved. T009/T010 and FR-004 are retired from active panel delivery; no further customer spend/report expansion is required.

### Panel preparation revisions

- Extend OperationDispatch with actionRevision default 0; unique (operationId, jobType, actionRevision), replacing the narrower unique key only in a new migration.
- Revision 0 remains immutable for final financial mutation. Only explicitly repeatable preparation jobs receive increasing revisions.
- A claimed immutable quote records server-derived package/price/currency. An old revision is rejected before charging.
- T016/T017 extend the existing Operation JSON snapshot with quote revision/state, applied promo, card/type context and package keys scoped to that quote. SelectedPackage retains the accepted revision/name/price/currency/code snapshot; the mutable UI draft is not financial authority. Store provider form controls only in internal context tied to the matching provider response/session. No new schema/migration is planned for the promo-name amendment; missing legacy metadata requires explicit compatible refresh, never fabricated provider identity.
- The existing constraint allows nonzero actionRevision only for APPLY_PROMO. COMPLETE_PURCHASE is not implicitly made repeatable by quote refresh: a proven pre-sale conflict uses safe canonical closure before a fresh operation, or remains a supported review hold. Never delete/reset its dispatch or payment evidence to permit reselection.

### Historical refund persistence (excluded from new orchestration)

Phase 2 refund settlement/request/event schema remains intact. New external refund services, Stripe orchestration, webhooks and store-credit handling are excluded (T020-T023 retired). Preserve existing shared financial guards; panel review uses existing canonical local deduction/refund finalizers.

### NEW review classification/adjudication

- Classification is computed from durable evidence: MODERN_RENEWAL, PRE_MUTATION, INSTALLMENT, LEGACY_RECONCILABLE, LEGACY_EVIDENCE_HOLD, CONFLICT.
- Modern rows use existing strict finalizers. Pre-mutation rows use existing safe pre-mutation finalization after dispatch/canonical-funding checks.
- Installments use the purpose-specific finalizer. Legacy rows may import verified original evidence or use a NEW immutable adjudication record (operation, actor, decision kind, normalized original evidence/source/time, reason/note).
- No fake FINAL_OK timestamp or automated-proof authority is written. An unresolved conflict retains a hold and lists exact missing evidence.
- Existing completed/refunded records are idempotent and never reopened merely to satisfy new field requirements.
- Latest negative settlement accepts an expected verification ID, active baseline, and attempt number, revalidated under lock. Timestamp ordering alone cannot supersede positive proof, provider spend, or a pending remaining check.

### NEW OperationCompletionEffect

- Unique (operationId, effectKind); immutable completion snapshot/version, state, nextAttemptAt, attempts, lease owner/expiry, safe lastError.
- Effect kinds initially cover completion notification and activity/counters; use existing points run as a referenced effect, not a second awarding engine.
- Create required rows with the authoritative completion transaction in both manual and automated paths.
- Counter update and delivered marker share a transaction; notifications carry a unique origin key. Crash retries cannot increment totalOperations twice.
- Cache cleanup is best-effort unless explicitly needed for correctness; do not make transient cleanup a money-release prerequisite.

## Planned migration sequence

Foundation directories (now applied locally; production application remains unverified):
1. `prisma/migrations/20260907090000_audit_financial_context/migration.sql`: purpose/installment evidence and nullable customer spend attribution.
2. `prisma/migrations/20260907100000_audit_dispatch_claim_identity/migration.sql`: revision key and fixed claim timestamps.
3. `prisma/migrations/20260907110000_audit_refund_review_effects/migration.sql`: refund/adjudication/effect persistence and uniqueness.

These directories already exist; preserve them. If already applied prior migrations need correction, use a new forward repair; never rewrite deployment history. Root and worker Prisma schemas remain byte-equivalent.

### Historical Phase 2 source implementation boundary

The following records describe completed work before the panel-only amendment. References to retired tasks are historical, not remaining obligations. Do not revert existing schema, triggers, tests or runtime code.

- `OperationPurpose` and `INSTALLMENT_PAY` are additive; no runtime producer sets them yet. The pure `shared/operations/audit-financial-context.ts` seam consumes normalized evidence and never queries services or authorizes payment by itself.
- Spend XOR uses `NOT VALID`: future inserted/updated rows are checked; historical validation and cross-row operation-owner agreement remain T010/T040/T052. Existing user foreign-key deletion remains RESTRICT. Report DTOs permit null panelUserId without changing rendering.
- Dispatch identity is now `(operationId, jobType, actionRevision)`. All three existing production compound lookups (shared dispatch and two mobile finalizer sites), plus two integration lookups, explicitly use revision 0. Only APPLY_PROMO may have a nonzero revision at the schema level; T016 must coordinate queue identities, stale writeback and old-reader/worker drain before enabling it.
- Claim columns allow all-null historical state; populated claims have a fixed two-minute interval. A database trigger prevents altering timestamps under the same claim key. T019 owns safe replacement/reconciliation and runtime use; new key admission is not enforced by this trigger alone.
- Refund request/origin, observation, adjudication and effect snapshot identity is preserved on UPDATE by SQL triggers. Monies use integer minor units; new installment amounts use Decimal(18,4). Pending/cancelled state checks are local constraints, not authorization. Request totals, owner/payment links, event authenticity and financial vetoes across writers remain transaction/service duties in T021/T023; immutable JSON must contain normalized non-sensitive evidence only.
- Cancelled settlements require zero confirmed/reserved amounts from every funding leg and a nonblank cancellation evidence reference. The pure veto also fails closed when those amounts are absent. This does not authenticate the cancellation evidence.
- New table relations use RESTRICT to retain financial evidence. Disposable fixture cleanup explicitly deletes its own dependent rows in order; production history is never cleared by these migrations.
- Existing migration directories are untouched. One pre-existing directory has no SQL locally (`20260616120000_unique_refund_transaction_per_operation`); its deployed history is UNKNOWN and must be resolved in T040/T052. Schema byte equality is not proof of applied migration parity.

## Historical compatibility matrix

| Historical case | Planned handling | Prohibited shortcut |
| --- | --- | --- |
| Existing reseller ledger | retain userId and amounts | changing recipient/amount using current ownership |
| Null mutation/evidence | classify legacy, recover original durable facts or explicit adjudication | assigning now as historical mutation time |
| Account alias collision | report groups for authorized consolidation before uniqueness | silent account merge/deletion |
| Old queued jobs / in-flight operations | drain or version-compatible handling | mixing incompatible financial writers |
| Completed/refunded operation | replay-safe preserve terminal authority | automatic reopening or duplicate effects |

## Locking order

For panel financial edits, inspect the current canonical card advisory lock, operation row, deduction/evidence/dispatch and reservation/effect acquisition order before changing a shared writer. Preserve existing exclusion and lock semantics; no T021 store settlement rollout or webhook adaptation remains in scope. Revalidate reads under the lock, bound transaction conflict retries and keep beIN network calls outside financial transactions. Existing Phase 2 lock-race evidence remains historical.
