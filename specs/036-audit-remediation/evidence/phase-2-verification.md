# Phase 2 foundation — source delivery and verification boundary

**Date**: 2026-09-07. **Tasks**: T003, T004, T005.
**Current state**: COMPLETE for T003-T005 immediate acceptance. Later authorized execution passed 20 focused tests with no skips; see [runtime verification](phase-2-runtime-verification.md). Full release gates remain pending.
**Preserved branch/HEAD**: `034-web-project-memory` / `7457b7028811759736faa799a8b06b43691b1218`.
**Baseline**: 1,121 existing source/document files were hashed at turn entry; memory freshness was CURRENT. Phase 1 evidence is immutable. [Source delta](phase-2-source-delta.json) records before/after hashes for the scoped code and SQL.

## Delivered scope

The sections below preserve the historical source-only delivery record. Their NOT_RUN/unapplied statements describe that earlier delivery and are superseded for focused Phase 2 acceptance by the runtime evidence linked above.

| Task | Authored result | Acceptance still required |
| --- | --- | --- |
| T003 | Seven unit cases, eight DB cases; pure owner/installment/refund/claim/revision seam | Q02 and focused Q04, including meaningful pre-fix failure evidence |
| T004 | Six Prisma models, three new migration files, both schemas synchronized; revision-0 and nullable-report compatibility | Q04; integrated Q06/Q09 later under T051/T052 |
| T005 | Eleven synthetic variants with atomic setup and scoped cleanup; strict audit-only disposable target guard | Q02 guard cases and Q04 setup/cleanup |

Tests were authored before the initial seam/schema implementation. Their pre-change expected failures are: missing audit seam and models/columns, required reseller userId, no revision key, and no fixed-claim/refund/effect constraints. These failures were **not observed by execution**. Newly added constraints also have authored negative cases. No task is checked merely because a test exists.

## Existing components inspected and reused

- Both Prisma schemas and existing migration SQL conventions, spend-ledger readers, shared dispatch, mobile finalization, store claim policy, actual Stripe refund finalizer and its existing DB regression.
- Existing pure renewal evidence module remains unchanged. The new seam represents installment/refund/fixed-claim contracts absent from it; no runtime caller imports the seam yet.
- Spend report rendering already accepts missing usernames; only panelUserId DTO nullability changed.
- All current compound dispatch consumers were searched across tracked **and untracked** sources. There are three production lookup sites (one shared, two mobile) and two existing DB-test lookup sites; all now explicitly select revision 0.
- The existing refund finalizer is invoked by the new authored concurrency case against a test-only canonical lock transaction. This is lock-serialization scaffolding, not a test of the future settlement authorizer.

## Data and compatibility decisions

See [data-model.md](../data-model.md) for the detailed contract.

1. Nullable purpose and claim fields preserve unknown history. No historical timestamp, charge, invoice, credit debit or ownership is synthesized.
2. Spend ownership adds customerId; existing reseller rows and RESTRICT deletion are preserved. NOT VALID XOR enforces inserted/updated rows without claiming old-data validation. Operation-owner agreement remains T010.
3. Dispatch uniqueness becomes operation/job/revision. Every existing producer still defaults to 0; only APPLY_PROMO permits nonzero revisions at schema level. T016 must coordinate queue IDs/writeback and drain incompatible old readers before activation.
4. Claims have a fixed two-minute interval; same-key deadline mutation is rejected. T019 owns safe replacement and existing payment reconciliation.
5. New refund records preserve original amounts and request identities; observations/adjudications and completion snapshots cannot be rewritten by UPDATE. SQL amount checks and cancellation checks cover external, store-credit and wallet legs.
6. Record uniqueness does not sum requests, authenticate evidence/events, or enforce cross-row payment/owner linkage. T021/T023 must lock and validate these before authorizing any settlement. Pending-refund veto is **not wired** to existing financial writers yet. Effects are not yet produced/drained; T033/T034 own that integration.
7. No existing migration SQL was changed. There are now 37 migration directories / 36 SQL files; the older directory `20260616120000_unique_refund_transaction_per_operation` already lacked local SQL. Its deployed provenance must be established in T040/T052; no replacement history was invented.
8. New migrations are unapplied. Client generation and compatible combined web/worker deployment remain required later; do not deploy this partial phase by itself.

## Fixture and provider boundaries

- Variants: reseller, customer, installment, legacy, mixed, credit-only, wallet, null-evidence, active-refund, stale-baseline and old-dispatch.
- Every identifier/data value is synthetic, including invalid placeholder credentials and normalized refund input; no provider HTTP request is made by fixtures.
- Audit wrapper validates opt-in + confirmation + PostgreSQL URL + loopback host + disposable database name; production mode, live names, malformed URLs and query redirects are rejected before DB imports.
- This guard does not retroactively protect other suites or prove that an operator-created database contains only synthetic data. Future Q04 must establish resource identity separately.
- A dedicated test client is created only after the guard; setup is atomic, cleanup is scoped to generated identities and closes the client. No truncate, production cleanup or environment-value logging.

## Checks performed

| Check | Result | What it does not prove |
| --- | --- | --- |
| Spec Kit CLI/prerequisites and quality checklists | PASS; CLI 0.12.17, no missing integration files, 40/40 checklist items | Runtime behavior |
| Scoped cross-artifact analysis | PASS; 31 requirements/58 tasks retained; only T001-T002 checked | Test acceptance |
| Source/SQL/consumer review | PASS, including independent read-only reviewer | Executable migration or generated type correctness |
| TypeScript syntax parsing | PASS across 10 affected TS/TSX files; source not imported/executed | Type checking, tests or build |
| Schema byte comparison | PASS | Prisma validation or migrated database parity |
| Previous SQL / unrelated source preservation | PASS against incoming SHA-256 inventory | Production revision or data |
| Documentation links, encoding/diff and memory structure | Recorded by closing read-only checks | Release readiness |
| Q02-Q12 | NOT_RUN | No application tests, DB/Redis, browser/provider or release evidence exists |

Independent review found and closed the cancellation-reservation gap: SQL and pure veto now require zero confirmed and reserved amounts for all three legs, with authored store-credit and wallet negative cases. Review found no remaining material issue in the bounded authored scope.

## Remaining work and tracking

T003-T005 remain unchecked until scope-appropriate runtime acceptance is possible. T006 onward is not started. All twenty audit findings stay open. No database, Redis, provider, generated client, application test/build, service, Git commit/branch/push/pull or deployment action occurred.

This is a scoped convergence pass over Phase 2 sources/artifacts only. Full feature convergence and release closure remain T058; absent operational evidence is not silently accepted. The project guide and root PROJECT_MEMORY are synchronized after final source/document checks.
