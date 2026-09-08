# Data Model: Renewal Fulfillment Proof

## Existing Sources Of Truth

- `Operation`: workflow status, card, selected package, assigned beIN account, timestamps, and JSON phase/evidence metadata.
- `BeinAccountSpendLedger`: confirmed provider-side money movement for one operation; it remains financial evidence only.
- `Transaction`: reseller/customer deduction and refund truth.
- `OperationSpendAwardRun` and point ledger: completion-linked point decision and posting.
- `OperationIntegrityIssue`: durable open/resolved safety findings and administrative investigation state.

## Operation Evidence State

The operation retains backward-compatible JSON mirrors, but nullable typed columns are authoritative for new decisions. In addition to payment and fulfillment state, it stores `fulfillmentVerificationOutcome`, `fulfillmentAuthority` (`NONE`, `AUTOMATED_COMPOSITE`, or `MANUAL_PROVIDER_CONFIRMATION`), `providerMutationStartedAt`, and `providerMutationStage` (`FINAL_OK` initially). The first Worker uses a compare-and-set from null before final `OK`; a zero-row update means another invocation already crossed the barrier and this invocation may verify only. A legacy `FINAL_PAY_REQUEST_STARTED` JSON phase is parsed as `providerMutationStartedAt != null`, never as proof that Pay itself ran.

### `providerPaymentState`

| Value | Meaning |
|---|---|
| `NOT_SUBMITTED` | No provider Pay request may have been submitted. |
| `CHARGED` | Captured provider financial evidence proves a debit. |
| `NOT_CHARGED` | Defined final checks prove no provider debit. |
| `UNKNOWN` | Pay may have been submitted but financial outcome is not reliable. |

### `fulfillmentState`

| Value | Meaning |
|---|---|
| `UNVERIFIED` | Fulfillment has not been checked. |
| `VERIFYING` | A bounded provider contract check is running. |
| `VERIFIED` | A unique durable proof was claimed. |
| `NOT_FOUND` | Defined contract checks found no matching active contract. |
| `CHECK_FAILED` | Provider login/read/parse prevented a reliable check. |
| `PROOF_CONFLICT` | Candidate invoice is blank, mismatched, or already proves another operation. |

Additional safe fields may include `fulfillmentProofId`, `fulfillmentInvoiceNo`, `fulfillmentVerifiedAt`, and a safe reason code. Raw provider HTML, cookies, sessions, ViewState, and credentials are prohibited.

The follow-up migration also adds nullable typed columns on `Operation` for `providerPaymentState`, `fulfillmentState`, `fulfillmentVerificationOutcome`, `fulfillmentAuthority`, `providerMutationStartedAt`, and `providerMutationStage`. New renewals initialize state/authority explicitly; legacy rows continue to parse compatible `responseData` until touched. Durable columns are authoritative for new finalization/refund decisions, and the marker transition is a compare-and-set guarded by operation status/account/card context.

## New Entity: OperationFulfillmentProof

| Field | Type | Rules |
|---|---|---|
| `id` | String | Primary key. |
| `operationId` | String | Required, one-to-one with `Operation`, unique, cascade delete. |
| `beinAccountId` | String | Required relation to the account used for verification. |
| `cardNumberSnapshot` | String | Required audit snapshot of the operation card. |
| `invoiceNo` | String | Required, trimmed, non-empty, account-scoped unique. |
| `proofKind` | Enum | `LEGACY_CONTRACT_ONLY` or `SOLD_REPORT_CONTRACT_CORRELATION`; existing rows default to legacy. Manual provider evidence is deliberately separate. |
| `selectedPackageName` | String? | Safe selected-package snapshot. |
| `contractPackageName` | String? | Safe provider contract package label. |
| `contractStatus` | String | Required provider status used by the matcher. |
| `contractType` | String? | Optional safe provider contract type. |
| `contractStartDate` | String? | Optional provider-format date snapshot. |
| `contractExpiryDate` | String? | Optional provider-format date snapshot. |
| `verificationSource` | String | `POST_FINAL_PAY`, `WORKER_RETRY`, `RECOVERY`, or `ADMIN_LIVE_CHECK`. |
| `providerCheckedAt` | DateTime | Timestamp of the provider contract read. |
| `baselineId` | String? | Required relation to the exact baseline for composite proof. |
| `sessionGeneration` | String? | Required final provider session generation for composite proof. |
| `baselineCapturedAt` | DateTime? | Required for composite proof. |
| `reportObservedAt` | DateTime? | Required for composite proof. |
| `contractObservedAt` | DateTime? | Required for composite proof. |
| `reportRowFingerprint` | String? | Required SHA-256 fingerprint of normalized safe report fields. |
| `providerAmount` | Decimal? | Required exact report amount for composite correlation; never a fabricated spend-ledger delta. |
| `currency` | String? | `USD` for current report evidence. |
| `reportPackageName` | String? | Safe report package label. |
| `reportItemType` | String? | Safe report item type. |
| `dealerContextHash` | String? | Required non-reversible hash binding account/dealer context. |
| `verifiedAt` | DateTime | Timestamp at which the proof was claimed. |
| `createdAt` | DateTime | Insert timestamp. |
| `updatedAt` | DateTime | ORM-managed update timestamp. |

### Constraints And Indexes

- Unique `operationId` prevents more than one proof per operation.
- Unique `(beinAccountId, invoiceNo)` prevents one provider invoice from proving multiple operations on the same account.
- SQL check `length(btrim(invoice_no)) > 0` prevents blank automatic proof.
- SQL composite check requires every baseline/report/contract field when `proofKind=SOLD_REPORT_CONTRACT_CORRELATION`.
- `invoiceNo` remains the canonical discovered invoice; `discoveredInvoiceNo` is an optional response alias, not a duplicate database column.
- Index `(cardNumberSnapshot, verifiedAt)` supports incident and card investigations.
- Index `(beinAccountId, providerCheckedAt)` supports provider-account audits.

## Verification Outcome Mapping

`shared/operations/renewal-fulfillment.ts` is authoritative for this deterministic mapping:

| Verification outcome | Fulfillment state | Automatic terminal rule |
|---|---|---|
| `MATCHED` + composite claim in `ENFORCE` | `VERIFIED`, authority `AUTOMATED_COMPOSITE` | `COMPLETED` for `CHARGED` or `UNKNOWN`; contradiction review for `NOT_CHARGED`. |
| `MATCHED` in `REVIEW_ONLY` | `UNVERIFIED` | Persist attempt only and hold `REVIEW_REQUIRED`; do not claim proof. |
| `VALID_NO_MATCH` | `NOT_FOUND` | Refund eligibility only with explicit deterministic `NOT_CHARGED`. |
| `REPORT_ONLY` | `NOT_FOUND` | `REVIEW_REQUIRED`; report row is not fulfillment. |
| `CONTRACT_ONLY` | `PROOF_CONFLICT` | `REVIEW_REQUIRED`; contract lacks causal report identity. |
| `INCOMPLETE_SCAN` or `CHECK_FAILED` | `CHECK_FAILED` | `REVIEW_REQUIRED`; never valid absence. |
| `PROOF_CONFLICT` | `PROOF_CONFLICT` | `REVIEW_REQUIRED` and quarantine where applicable. |

### Relationships

- `Operation.fulfillmentProof` is optional one-to-one.
- `BeinAccount.fulfillmentProofs` is one-to-many.

## New Entity: ProviderInvoiceClaim

One database registry makes invoice ownership unique across automated and manual evidence:

| Field | Rules |
|---|---|
| `operationId` | Unique operation owner. |
| `beinAccountId` / `invoiceNo` | Required trimmed invoice with unique pair. |
| `claimKind` | `LEGACY_PROOF`, `SOLD_REPORT_CONTRACT_CORRELATION`, or `MANUAL_PROVIDER_CONFIRMATION`. |
| `createdAt` | Claim timestamp. |

The follow-up migration backfills one claim for every existing non-empty legacy proof before enabling the shared unique constraint. Automated proof and manual evidence each require a unique `invoiceClaimId` and insert the claim in their operation-row-first transaction. This prevents a manual row and automated proof in separate tables from racing to own the same provider invoice.

## New Entity: OperationManualFulfillmentEvidence

Manual resolution never masquerades as automated Sold Report correlation. It is append-only and contains:

| Field | Rules |
|---|---|
| `operationId` / `beinAccountId` | Required operation and provider account. |
| `invoiceNo` | Trimmed non-empty provider invoice. |
| `cardNumberSnapshot` | Must equal the normalized operation card. |
| `packageNameSnapshot` | Required selected/provider package context. |
| `providerAmount` / `currency` | Required Decimal amount and ISO currency. |
| `evidenceSource` / `evidenceNote` | Required bounded stable source and human explanation. |
| `observedAt` | Required provider-observation time. |
| `actorUserId` / `createdAt` | Required attributable admin and append timestamp. |

Database checks require every field and enforce unique `operationId`; `ProviderInvoiceClaim` enforces account/invoice uniqueness across manual and automated evidence. The admin decision transaction locks the operation first, verifies account/card/package/amount context and absence of conflicting proof/refund, claims the shared invoice, inserts the manual evidence, sets `fulfillmentState=VERIFIED`, `fulfillmentAuthority=MANUAL_PROVIDER_CONFIRMATION`, and guarded `COMPLETED`, and captures the point-award run before commit. It may resolve `REVIEW_ONLY`; it does not create `OperationFulfillmentProof` or a `MATCHED` automated attempt. General APIs expose the stable authority/timestamp while evidence id/invoice/context remain admin-only. Idempotent points/notification finalization runs only after commit.

## New Entity: OperationFulfillmentVerification

One row owns the durable post-mutation verification schedule for one renewal.

| Field | Rules |
|---|---|
| `operationId` | Unique and required. |
| `state` | `PENDING`, `VERIFYING`, `REVIEW_ONLY`, `VERIFIED`, `NO_MATCH`, `CONFLICT`, or `CHECK_FAILED`. |
| `activeBaselineId` | Nullable pointer to the current non-superseded baseline. |
| `attemptCount` | Monotonic count. |
| `nextCheckAt` | Nullable due time for verification-only retry. |
| `lastOutcome` / `lastReasonCode` | Safe stable machine values. |
| timestamps | Created, updated, started, and terminal timestamps. |

Index `(state, nextCheckAt)` supports deterministic due work. Verification-only jobs use stable operation/attempt identities and contain no Pay capability.

## New Entity: OperationFulfillmentBaseline

| Field | Rules |
|---|---|
| `verificationId` / `operationId` | Required owning verification and operation. |
| `beinAccountId` | Final leased provider account for this generation. |
| `cardNumberSnapshot` | Exact normalized target card. |
| `baselineSequence` | Monotonic per verification; unique with verification. |
| `sessionGeneration` | Provider-session generation bound to package preparation. |
| `dealerContextHash` | Non-reversible hash of the exact provider-selected Dealer value plus normalized display label; must remain identical across baseline, post-scan, and pages. Raw dealer text is not persisted. |
| `invoiceSet` | Safe account-wide invoice identities only, for external-use detection. |
| `targetCardRows` | Safe normalized target-card rows only. |
| `pageCount` / `rowCount` / `firstPageWatermark` | Complete stable-scan metadata; first page is re-read after pagination. |
| `scanAttemptCount` | `1` or `2`; retry two restarts from fresh GET and never replays stale postback state. |
| `capturedAt` | Must precede provider sale preparation. |
| `supersededAt` / `supersededReason` | Set on failover/session reset; superseded baseline cannot prove fulfillment. |

Only one active baseline may exist per verification. Subscriber, country, raw HTML, cookies, ViewState, credentials, and provider error bodies are forbidden.

## New Entity: OperationFulfillmentVerificationAttempt

Append-only attempt record with unique `(verificationId, attemptNo)`:

- outcome: `MATCHED`, `VALID_NO_MATCH`, `REPORT_ONLY`, `CONTRACT_ONLY`, `INCOMPLETE_SCAN`, `CHECK_FAILED`, or `PROOF_CONFLICT`;
- baseline/account/session identifiers;
- complete-scan flag and page/row/candidate counts;
- candidate invoice when safe and non-empty;
- report/contract observation timestamps;
- stable reason code and retry due time;
- no raw provider response.

## New Entity: CardLifecycleReservation

| Field | Rules |
|---|---|
| `operationId` | Unique owner. |
| `cardNumber` | Normalized card snapshot. |
| `acquiredAt` / `renewedAt` | Lifecycle timestamps. |
| `releasedAt` / `releaseReason` | Nullable until safe terminal completion/failure or explicit review resolution. |

A partial unique database index on `cardNumber WHERE releasedAt IS NULL` makes concurrent same-card starts deterministic. `REVIEW_REQUIRED` does not release the reservation.

## New Entity: ProviderAccountCausalReservation

This durable row prevents gaps between delayed verification jobs:

| Field | Rules |
|---|---|
| `operationId` | Unique owning renewal. |
| `beinAccountId` | Provider account; partial unique while `releasedAt IS NULL`. |
| `reservationGeneration` | Monotonic context bound to baselines/session generations. |
| `acquiredAt` / `renewedAt` | Durable lifecycle timestamps. |
| `automaticWindowEndsAt` | Default is 60 seconds after final mutation, covering checks at 0s/5s/15s/30s plus bounded scan time. |
| `releasedAt` / `releaseReason` | Set only on safe terminal resolution, explicit review resolution, or audited quarantine transfer. |

The reservation is acquired transactionally before baseline capture and survives Redis lease expiry/job delay. Pool selection and every account consumer exclude an active reservation not owned by their operation. `REVIEW_REQUIRED` retains it until explicit resolution; operators can quarantine rather than silently release contaminated accounts.

## Extended Entity: BeinAccount

- `automationExclusive Boolean @default(false)` is the explicit admin attestation that no manual/external SBS activity uses the account.
- Only active, healthy, non-quarantined accounts with `automationExclusive=true` are eligible for Sold Report correlation.
- Account create/edit APIs and the localized admin screen expose the attestation with a warning; existing accounts remain ineligible until explicitly enabled.

## Provider Execution Lease (Redis)

The short lease value contains operation owner, causal-reservation generation, unique lease/invocation token, fencing generation, worker id, and acquisition time. Acquire/renew/assert/release use atomic compare-and-set scripts. Defaults are TTL 120 seconds and heartbeat 30 seconds. Same-operation or same-worker identity without the exact lease token is never sufficient. Provider mutation helpers and fenced session-cache writes require both the matching durable reservation and live lease; keepalive and other account consumers skip or wait. A delayed verification job may acquire a new execution lease for the same durable reservation, but no other operation can enter between attempts.

## Extended Entity: IntegrityIssueType

Add three values:

- `PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED`: charged completed/review operation lacks unique proof.
- `FULFILLMENT_PROOF_CONFLICT`: one invoice/context cannot be safely assigned to the candidate operation.
- `DUPLICATE_RENEWAL_CHARGE_BURST`: two or more same-card/package/amount charged renewals occur inside the configured short investigation window.

`OperationIntegrityIssue` already has unique `(operationId, issueType)`, which makes reconciliation apply idempotent. Safe JSON details hold related operation ids, bounded timestamps, and reason codes only.

## Proof Claim Outcomes

| Outcome | Condition | Terminal effect |
|---|---|---|
| `CLAIMED` | New valid invoice and context inserted. | Eligible for completion. |
| `ALREADY_CLAIMED` | Same operation already has matching proof. | Eligible for idempotent completion. |
| `OPERATION_PROOF_CONFLICT` | Same operation has different proof data. | Review-required. |
| `INVOICE_ALREADY_USED` | Account/invoice belongs to another operation. | Review-required. |
| `INVALID_INVOICE` | Invoice is blank after trim. | Review-required. |

The claim executes inside a transaction. Database uniqueness resolves concurrent claims; application code maps unique violations to the appropriate conflict without retrying Pay.

## State Transitions

```text
FINAL_PROVIDER_MUTATION_STARTED
  -> providerPaymentState = CHARGED | NOT_CHARGED | UNKNOWN
  -> fulfillmentState = VERIFYING

ENFORCE + VERIFYING + one new report invoice + same-invoice active contract + valid unique composite proof
  -> fulfillmentState = VERIFIED
  -> fulfillmentAuthority = AUTOMATED_COMPOSITE
  -> Operation = COMPLETED
  -> completion side effects (once)

REVIEW_ONLY + any post-mutation verification outcome (including MATCHED)
  -> sanitized attempt only; no automated proof claim
  -> fulfillmentState follows outcome mapping but MATCHED remains UNVERIFIED
  -> Operation = REVIEW_REQUIRED

REVIEW_REQUIRED + complete uniquely claimed OperationManualFulfillmentEvidence + explicit admin no-refund completion
  -> fulfillmentState = VERIFIED with manual evidence reference
  -> fulfillmentAuthority = MANUAL_PROVIDER_CONFIRMATION
  -> Operation = COMPLETED in the same operation-row-first transaction
  -> completion side effects after commit (once, labeled manual)

CHARGED + NOT_FOUND | CHECK_FAILED | PROOF_CONFLICT
  -> Operation = REVIEW_REQUIRED
  -> automatic refund blocked

UNKNOWN + any unverified result
  -> Operation = REVIEW_REQUIRED

UNKNOWN + valid unique composite proof
  -> Operation = COMPLETED

NOT_CHARGED + valid composite proof
  -> Operation = REVIEW_REQUIRED (contradictory evidence)

explicit deterministic NOT_CHARGED + VALID_NO_MATCH after complete bounded checks
  -> Operation = FAILED
  -> one atomic exact-ledger refund/failure/reservation release

pre-mutation cancellation/timeout/error + no provider ambiguity + exactly one canonical reseller deduction
  -> one atomic exact refund/terminal/point-reversal/reservation release

pre-mutation missing, duplicated, customer-owned, or mismatched deduction
  -> Operation = REVIEW_REQUIRED
  -> reservations remain held

balance/spend ledger only during recovery
  -> Operation = REVIEW_REQUIRED

ENFORCE + unique SOLD_REPORT_CONTRACT_CORRELATION proof during recovery
  -> Operation = COMPLETED if guarded status permits and no refund exists

legacy contract-only proof, missing baseline, incomplete scan, report-only, or contract-only
  -> Operation = REVIEW_REQUIRED
```

## Legacy And Reconciliation Rules

- Migration does not backfill proof from balance deltas, spend ledgers, success messages, points, or completed status.
- Historical rows remain unchanged until explicitly investigated.
- Dry-run computes candidates only.
- Confirmed apply upserts integrity issues and does not change operations, money, points, notifications, proof, or provider state.
- Resolving a historical issue requires a later explicit admin/provider-evidence workflow; this migration does not infer contracts.

## Rollout And Forward-Fix

- The table and enum additions are additive.
- Rollback before application deployment can drop the new table and enum values only through a deliberate forward migration; PostgreSQL enum removal is not treated as a routine rollback.
- Before migration, apply an external gate to every renewal start/confirm, admin verify/decision, refund, recovery/cleanup, and financial/provider mutation endpoint; drain in-flight work; then stop `bein-web`, `bein-maintenance`, `bein-keepalive`, and every `bein-worker-*`. No cutover begins until process/log/queue inspection proves no legacy web, maintenance, or Worker finalizer can run.
- Migrate/generate and build both new web and Worker while all legacy processes remain stopped. Start only new-version processes behind the external mutation gate, verify schema/client/config/process versions, then remove the gate. If deploy fails, keep the gate active and all incompatible processes stopped; never reopen a mixed-version window.
- Default proof mode is `REVIEW_ONLY`; `ENFORCE` requires the authorized report/contract invoice correlation smoke.
