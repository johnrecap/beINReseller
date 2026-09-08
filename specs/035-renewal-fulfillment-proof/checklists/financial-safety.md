# Financial Safety Requirements Checklist: Renewal Fulfillment Proof

**Purpose**: Validate that provider payment, fulfillment, reseller-wallet settlement, refund, recovery, admin, reconciliation, and release requirements for the web reseller panel and Worker are complete and unambiguous before implementation; mobile/store/Stripe/store-credit surfaces are excluded
**Created**: 2026-08-24
**Feature**: [spec.md](../spec.md)

## Evidence Separation

- [x] CHK001 Are provider payment and service fulfillment defined as separate states and sources of truth? [Completeness, Spec §FR-001–FR-004]
- [x] CHK002 Is an expected balance delta explicitly prohibited from proving completion? [Clarity, Spec §FR-004]
- [x] CHK003 Is a normalized unique composite proof required before every automated completion path and a shared unique invoice claim required before manual completion? [Consistency, Spec §FR-006–FR-010, FR-025]
- [x] CHK004 Are blank invoice and context mismatch outcomes explicitly unsafe? [Edge Case, Spec §FR-008, §Edge Cases]
- [x] CHK005 Is the provider spend ledger limited to financial evidence, including expected-price restrictions? [Boundary, Spec §FR-019–FR-020]

## Terminal Decision Matrix

- [x] CHK006 Are `CHARGED` or `UNKNOWN` plus a uniquely claimed composite proof in `ENFORCE` the only automated successful terminal combinations? [Clarity, Contract §Terminal Decision Matrix]
- [x] CHK007 Are charged/no-proof, unknown/no-proof, check-failed, incomplete, report-only, contract-only, and proof-conflict outcomes required to remain under review? [Coverage, Spec §FR-011–FR-012, FR-053]
- [x] CHK008 Is confirmed no-charge plus no-contract the only post-Pay automatic refund-eligible combination? [Clarity, Spec §FR-013]
- [x] CHK009 Is automatic refund forbidden whenever provider charge is confirmed? [Consistency, Spec §FR-011, SC-002]
- [x] CHK010 Are success notification, points, analytics, and completion snapshots ordered after the applicable composite or structured-manual evidence transaction? [Completeness, Spec §FR-018]

## Retry, Recovery, And Concurrency

- [x] CHK011 Is Pay resubmission forbidden after the durable started marker in every retry/recovery scenario? [Coverage, Spec §FR-014–FR-015]
- [x] CHK012 Is balance-only recovery explicitly routed away from completion? [Clarity, Spec §FR-016]
- [x] CHK013 Is proof-backed crash recovery specified as idempotent? [Recovery, Spec §US4]
- [x] CHK014 Are same-operation replay and different-operation invoice races distinguished? [Concurrency, Data Model §Proof Claim Outcomes]
- [x] CHK015 Are guarded terminal/manual-decision conflicts preserved during recovery? [Coverage, Spec §FR-017]

## Duplicate Prevention

- [x] CHK016 Are both live review status and historical safety issues included in the same-card block? [Completeness, Spec §FR-021, FR-032]
- [x] CHK017 Are normal-route and card-lock-contention checks both required? [Coverage, Quickstart §5]
- [x] CHK018 Are issue statuses that block versus allow a new renewal testable? [Clarity, Quickstart §5]

## Admin Review

- [x] CHK019 Is provider charge alone explicitly insufficient for no-refund? [Clarity, Spec §FR-025]
- [x] CHK020 Is automatic `cardRenewed=true` synthesis explicitly prohibited? [Conflict Prevention, Spec §FR-026]
- [x] CHK021 Are an `ENFORCE` composite proof and separate uniquely claimed structured manual invoice/account/card/package/amount/currency/source/note/actor/time evidence the only accepted no-refund authorities, with boolean-only confirmation rejected? [Completeness, Admin Contract]
- [x] CHK022 Must live verification claim proof before completion? [Ordering, Spec §FR-027]

## Historical Reconciliation

- [x] CHK023 Are bounded date inputs, optional card filter, and default dry-run defined? [Completeness, Spec §FR-028]
- [x] CHK024 Are missing proof, duplicate bursts, and invoice conflicts all reportable candidate types? [Coverage, Spec §FR-029]
- [x] CHK025 Is apply protected by an exact explicit confirmation? [Safety, Reconciliation Contract]
- [x] CHK026 Are all forbidden financial, provider, status, points, and notification side effects enumerated? [Completeness, Spec §FR-031]
- [x] CHK027 Is repeated apply idempotent through a documented uniqueness boundary? [Measurability, Spec §FR-030]
- [x] CHK028 Is the exact incident window represented with a Cairo offset and no live-access claim? [Clarity, Admin Contract §Incident Invocation]

## Migration, Privacy, Localization, And Release

- [x] CHK029 Are additive migration, database constraints, ordered deployment, and root/Worker schema parity required? [Completeness, Spec §FR-036–FR-037]
- [x] CHK030 Are provider secrets and raw runtime responses excluded from every new record/output? [Security, Spec §FR-035]
- [x] CHK031 Are all three existing locales and Arabic RTL requirements included? [Localization, Spec §FR-023–FR-024]
- [x] CHK032 Is installment behavior explicitly regression-only and separately spec-gated? [Scope, Spec §FR-034]
- [x] CHK033 Are release criteria zero-tolerance for unproved completion, charged refunds, duplicate provider mutation, unsafe reservation release, and invoice reuse? [Acceptance, Spec §SC-001–SC-006, SC-019]
- [x] CHK034 Are test database, production migration, build ordering, diff, BOM, and mojibake checks specified? [Operational, Quickstart]
- [x] CHK035 Is one transport invocation the maximum for Pay and final `OK` under timeout/network/5xx? [Replay Safety, Spec §FR-055–FR-056]
- [x] CHK036 Does a lost, expired, superseded, or mismatched lease prevent every provider mutation? [Lease Safety, Spec §FR-057–FR-058]
- [x] CHK037 Can only one operation hold an unreleased card lifecycle reservation? [Concurrency, Spec §FR-041]
- [x] CHK038 Can only one operation hold the durable provider-account causal reservation across baseline/mutation/delayed verification, with a separately fenced execution lease per active job? [Concurrency, Spec §FR-040]
- [x] CHK039 Is Sold Report Amount prohibited from masquerading as an observed balance debit? [Evidence Boundary, Plan §Source Of Truth]
- [x] CHK040 Are composite claim/completion, pre/post-mutation reseller-wallet settlement, reservation release, and side-effect capture transactionally ordered? [Atomicity, Spec §FR-063, FR-066–FR-067]
- [x] CHK041 Are proof-versus-refund and two-operation invoice races required as database tests? [Concurrency, Quickstart §8]
- [x] CHK042 Does `VALID_NO_MATCH` require every report page and the contract read to complete successfully? [Refund Safety, Spec §FR-051]
- [x] CHK043 Are `CHARGED`, `UNKNOWN`, incomplete scan, and check failure barred from automatic refund? [Refund Safety, Spec §FR-052–FR-054]
- [x] CHK044 Is failover prohibited from reusing baseline, session generation, and package checkbox? [Isolation, Spec §FR-060]
- [x] CHK045 Do composite completion side effects remain post-commit and exactly once? [Ordering, Contract §Completion Side-Effect Contract]
- [x] CHK046 Does `REVIEW_ONLY` forbid automated proof claim/completion even for a matched candidate while allowing only explicit structured-manual authority, and is every mode forbidden from balance/report/contract/legacy fallback? [Release Safety, Spec §FR-025, FR-039, FR-064]

## Notes

- All 46 financial-safety requirement checks pass.
- No unresolved CRITICAL, HIGH, or MEDIUM requirement ambiguity remains before task generation.
