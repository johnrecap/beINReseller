# Tasks: Renewal Fulfillment Proof

**Input**: Design documents from `specs/035-renewal-fulfillment-proof/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/renewal-fulfillment.md`, `contracts/admin-reconciliation.md`, `quickstart.md`

**Tests**: Required and test-first because this feature changes provider charges, completion, refunds, recovery, points, notifications, admin financial decisions, and database uniqueness.

**Execution**: The current Codex task executes tasks sequentially. `[P]` identifies file-independent work but does not authorize subagents or other tasks.

## Phase 1: Failing Financial Safety Contracts

- [x] T001 [P] Add payment-versus-fulfillment state tests in `worker/tests/http-client-payment-classification.test.ts` and `tests/unit/renewal-fulfillment-state.test.ts`
  - **Reason**: The existing tests encode “matching balance delta = renewal success”; the corrected contract must prove only `CHARGED` until fulfillment exists.
  - **Expected**: Tests cover all four payment states, all six fulfillment states, and the terminal decision matrix without changing installment semantics.
  - **Possible bugs**: Renaming the old enum can break installment callers or tests may assert internal strings instead of behavior.
  - **Fix/Mitigation**: Keep the existing final-pay category enum, test a separate pure mapper/decision function, and include installment regression fixtures.
  - **Verification**: Run `npx tsx --test tests/unit/renewal-fulfillment-state.test.ts worker/tests/http-client-payment-classification.test.ts` and confirm new cases fail before T009-T010.

- [x] T002 [P] Add fulfillment proof validation/idempotency/concurrency tests in `tests/unit/renewal-fulfillment-proof.test.ts` and `tests/integration/renewal-fulfillment-proof-db.test.ts`
  - **Reason**: Database uniqueness is the only reliable defense against one invoice proving two concurrent operations.
  - **Expected**: Unit tests cover blank invoice, same-operation replay, mismatched operation proof, and invoice reuse; database-gated tests race two operations and produce one proof/one conflict.
  - **Possible bugs**: A mocked Prisma test would miss unique-constraint behavior or database-gated tests may run against an unsafe database.
  - **Fix/Mitigation**: Keep pure validation tests local; require the existing explicit test database guard for real persistence and skip safely when absent.
  - **Verification**: Run both focused files; pure cases fail before T008-T011 and DB cases either fail on the isolated database or report an intentional environment skip.

- [x] T003 Add renewal Worker orchestration regression tests in `worker/tests/http-queue-renewal-state.test.ts` and `worker/tests/renewal-fulfillment-orchestration.test.ts`
  - **Reason**: The production defect is an orchestration error: contract verification is skipped on balance success and completion side effects run too early.
  - **Expected**: Tests require verification for success/failure/uncertain post-Pay outcomes, proof claim before completion, review on no contract/conflict, and zero Pay resubmission after the started marker.
  - **Possible bugs**: Source-only assertions can pass while runtime behavior remains wrong.
  - **Fix/Mitigation**: Test pure terminal decisions and proof-claim outcomes as behavior; retain only narrow source assertions for external call ordering that lacks an executable seam.
  - **Verification**: Run the two Worker files and confirm the new completion-gate cases fail before T010-T013.

- [x] T004 [P] Add recovery completion-proof tests in `tests/unit/operation-recovery-classifier.test.ts`, `tests/unit/operation-recovery-proof.test.ts`, and `tests/integration/operation-timeout-recovery.test.ts`
  - **Reason**: Recovery currently permits completion from a spend ledger plus balance evidence and can recreate false success after a crash.
  - **Expected**: Balance-only evidence reviews, unique fulfillment proof completes, conflict reviews, and proof-created-before-crash completes idempotently without Pay.
  - **Possible bugs**: Legacy safe no-charge recovery can be accidentally blocked.
  - **Fix/Mitigation**: Preserve explicit no-charge/refund cases and add separate charged balance-only fixtures.
  - **Verification**: Run the focused recovery tests and confirm proof-dependent cases fail before T016.

- [x] T005 [P] Add start-renewal and admin-decision safety tests in `tests/unit/start-renewal-review-guard.test.ts`, `tests/unit/financial-review-decision-safety.test.ts`, and `tests/integration/admin-financial-review-decisions.test.ts`
  - **Reason**: Duplicate card attempts and synthesized `cardRenewed=true` are separate paths that can close or repeat an unsafe operation.
  - **Expected**: Open fulfillment issues block both start branches; no-refund requires proof or explicit card renewal; action/payment status alone is rejected.
  - **Possible bugs**: Existing safe manual workflows or completed historical review behavior can be overblocked.
  - **Fix/Mitigation**: Test proof-backed and explicit-manual success alongside charged-only failure and non-blocking resolved issues.
  - **Verification**: Run the three focused files and confirm new safety cases fail before T014/T017.

- [x] T006 [P] Add reconciliation dry-run/apply contract tests in `tests/unit/renewal-fulfillment-reconciliation.test.ts` and `tests/integration/renewal-fulfillment-reconciliation-db.test.ts`
  - **Reason**: Historical tooling must never become an accidental payment/refund/backfill script.
  - **Expected**: Tests cover argument validation, incident filter, missing-proof and duplicate-burst detection, exact apply confirmation, repeat-apply idempotency, and zero financial/status/points/notification mutation.
  - **Possible bugs**: A broad candidate query can scan unbounded production history or package selection parsing can create false duplicates.
  - **Fix/Mitigation**: Require bounded timestamps, normalize only safe package/amount/card fields, and assert query filters and forbidden-table snapshots.
  - **Verification**: Run both files and confirm implementation cases fail before T020.

- [x] T007 [P] Add localization key parity tests in `tests/unit/renewal-fulfillment-locales.test.ts`
  - **Reason**: New charged/verifying/review/admin-confirmation states must exist in English, Arabic, and Bengali without hardcoding.
  - **Expected**: All semantic keys exist in the three catalogs and Arabic values are non-empty Unicode text.
  - **Possible bugs**: Tests can overfit translated prose or miss the consuming UI.
  - **Fix/Mitigation**: Assert key paths and non-empty values, plus focused source checks that affected UI reads translation keys.
  - **Verification**: Run the locale test and confirm missing-key cases fail before T019.

## Phase 2: Foundational Data And State Boundaries

- [x] T008 Create the additive proof schema and migration in `prisma/schema.prisma`, `worker/prisma/schema.prisma`, and `prisma/migrations/20260824090000_renewal_fulfillment_proof/migration.sql`
  - **Reason**: Proof uniqueness, blank-invoice rejection, relations, and historical issue types need database enforcement before Worker completion can rely on them.
  - **Expected**: Both schemas are identical; proof has one-operation and account/invoice uniqueness, safe indexes, and non-empty invoice SQL check; three issue enum values exist.
  - **Possible bugs**: Relation names can conflict, PostgreSQL enum additions can be ordered incorrectly, or worker schema can drift.
  - **Fix/Mitigation**: Follow neighboring schema/migration conventions, keep migration additive, run format/schema-sync/validate/generate, and use isolated migration verification.
  - **Verification**: `npx prisma format`, `npm run check:schema-sync`, `npx prisma validate`, `npx prisma generate`, plus T002 DB test when configured.

- [x] T009 Implement pure payment/fulfillment decisions in `shared/operations/renewal-fulfillment.ts`
  - **Reason**: Worker, recovery tests, API state, and reconciliation need one non-duplicated terminal matrix without database or provider coupling.
  - **Expected**: Typed state mapping and terminal decisions distinguish complete, review, fail/refund, and continue-verifying; installment callers remain untouched.
  - **Possible bugs**: A generic abstraction can overreach or map explicit success to fulfillment.
  - **Fix/Mitigation**: Keep the module renewal-specific with only current callers and encode the accepted table directly.
  - **Verification**: T001 and T003 pure behavior cases pass.

- [x] T010 Change final-pay classification consumers so balance delta means charged only in `worker/src/http/HttpClientService.ts`, `worker/src/http/types.ts`, and `worker/src/http/final-pay-outcome-simulations.ts`
  - **Reason**: Existing financial evidence can stay, but it must no longer be named or consumed as renewal completion authority.
  - **Expected**: `CONFIRMED_SUCCESS` remains a financial outcome for compatibility; renewal maps it to `providerPaymentState=CHARGED`; tests no longer describe it as fulfilled success.
  - **Possible bugs**: Installment completion can regress or clear no-charge patterns can become uncertain.
  - **Fix/Mitigation**: Limit behavior change to renewal consumers, preserve classifier return values, and keep installment regression tests.
  - **Verification**: T001 plus existing Worker final-pay delay/classification suites pass.

- [x] T011 Implement race-safe proof claim service in `worker/src/lib/fulfillment-proof.ts`
  - **Reason**: Worker and admin live verification need one database-backed claim result before completion.
  - **Expected**: Trim/validate invoice, verify operation/account/card context, create proof, return idempotent same-operation result, and classify both unique-constraint conflicts safely.
  - **Possible bugs**: Broad Prisma error catching can hide outages or P2002 target parsing can be version-sensitive.
  - **Fix/Mitigation**: Catch only Prisma known-request unique violations, re-read authoritative rows to distinguish conflicts, and propagate all other errors.
  - **Verification**: T002 unit/DB tests pass and Worker build resolves generated Prisma types.

## Phase 3: User Story 1 - Complete Only Fulfilled Renewals (P1)

- [x] T012 [US1] Always verify and claim fulfillment after renewal Pay in `worker/src/http-queue-processor.ts`
  - **Reason**: The current `!result.success` guard skips contract verification precisely when the expected provider debit appears.
  - **Expected**: Every Pay that succeeded or may have started records `VERIFYING`, runs bounded contract checks, maps the final outcome, and claims proof before any completion branch.
  - **Possible bugs**: Verification can run on a true pre-Pay failure, duplicate account usage cleanup, or reuse a blank invoice.
  - **Fix/Mitigation**: Gate on success-or-final-pay-started evidence, use the existing bounded verifier, validate proof context, and keep pre-Pay safe failure separate.
  - **Verification**: T003 orchestration tests and existing contract-verification tests pass.

- [x] T013 [US1] Gate renewal completion and side effects on durable proof in `worker/src/http-queue-processor.ts` and `worker/src/lib/points.ts`
  - **Reason**: Status, points, analytics, notifications, and cache/account cleanup currently follow balance-only success.
  - **Expected**: Only claimed/already-claimed matching proof reaches guarded completion; points/analytics/success notification run after committed completion and remain idempotent.
  - **Possible bugs**: A crash after proof but before status can strand the operation, or duplicate notification can occur on replay.
  - **Fix/Mitigation**: Persist proof first, reuse guarded completion/snapshot primitives, make recovery own crash convergence, and preserve current idempotent points finalization.
  - **Verification**: T003, point-award completion-writer tests, and notification ordering assertions pass.

## Phase 4: User Stories 2 And 3 - Review, Duplicate Block, Safe Refund (P1)

- [x] T014 [US2] Block cards with unresolved fulfillment safety in `src/app/api/operations/start-renewal/route.ts`
  - **Reason**: A false `COMPLETED` row bypasses the existing active/review checks and allows a second debit.
  - **Expected**: Both route branches reject open/acknowledged fulfillment issue types with stable 409 code while resolved/unrelated issues remain non-blocking.
  - **Possible bugs**: Old unrelated integrity issues can block valid renewals or one branch can diverge.
  - **Fix/Mitigation**: Centralize the card conflict query/helper inside the route domain and test both paths.
  - **Verification**: T005 start-renewal tests pass.

- [x] T015 [US2] [US3] Apply the payment/fulfillment terminal matrix and review evidence in `worker/src/http-queue-processor.ts`, `worker/src/lib/bein-spend-ledger.ts`, and `src/lib/operation-safety.ts`
  - **Reason**: Charged/no-proof must review with refund blocked, while proven no-charge/no-contract retains one safe refund.
  - **Expected**: Response evidence exposes both state fields; spend ledger remains financial only; review/no-charge branches use existing refund idempotency; expected price is not stored as observed spend.
  - **Possible bugs**: Contract-verified charge without readable balance may lose financial audit context, or check failure may be misread as no contract.
  - **Fix/Mitigation**: Allow proof without fabricated spend amount, keep `CHECK_FAILED` distinct, and test each matrix row.
  - **Verification**: T001/T003 plus existing refund-safety and spend-ledger tests pass.

## Phase 5: User Story 4 - Proof-Only Recovery (P2)

- [x] T016 [US4] Require fulfillment proof in `src/lib/operations/recovery-proof.ts`, `src/lib/operations/recovery.ts`, and `src/lib/operations/recovery-classifier.ts`
  - **Reason**: Recovery currently accepts balance ledger evidence as completion proof.
  - **Expected**: Recovery selects proof, completes only matching unique proof, reviews balance-only/contract-JSON-only/conflict cases, and never submits Pay.
  - **Possible bugs**: Existing completed proof-backed operations can be reprocessed or safe no-charge refunds can regress.
  - **Fix/Mitigation**: Preserve terminal guards and no-charge classifier branches; add exact proof context checks.
  - **Verification**: T004 focused recovery suites pass.

## Phase 6: User Story 5 - Auditable Admin Closure (P2)

- [x] T017 [US5] Require proof or explicit renewal confirmation in `src/lib/financial-review/types.ts`, `src/lib/financial-review/evidence.ts`, `src/lib/financial-review/manual-decisions.ts`, and the admin decision route
  - **Reason**: Current normalization silently sets `cardRenewed=true` and the guard accepts trusted provider charge as no-refund authority.
  - **Expected**: Historical pre-amendment behavior exposed fulfillment proof, rejected charge-only, and accepted proof or explicit true. This boolean authority is superseded by amendment tasks T029/T030/T031/T038 and is not an accepted release behavior.
  - **Possible bugs**: Existing manual refund behavior or completed historical review compatibility can break.
  - **Fix/Mitigation**: Limit new condition to no-refund, preserve refund guard and append-only metadata, and cover compatibility cases.
  - **Verification**: T005 admin unit/integration tests pass.

- [x] T018 [US5] Claim proof in live admin verification in `worker/src/http-queue-processor.ts` and `src/app/api/admin/financial-review/[operationId]/verify-card/route.ts`
  - **Reason**: The live verifier currently completes on a contract match without enforcing invoice uniqueness.
  - **Expected**: Worker claims proof before guarded completion; blank/reused invoice returns a safe conflict check and leaves review open; point finalization occurs only after proof-backed completion.
  - **Possible bugs**: Polling may report completed before the latest verification evidence is persisted or a duplicate job may create extra card checks.
  - **Fix/Mitigation**: Persist verification/proof state before status, reuse existing status polling, and keep claim idempotent.
  - **Verification**: T003/T005 live-review cases and existing financial-review points tests pass.

- [x] T019 [US2] [US5] Add localized fulfillment UI states and explicit admin control in `src/i18n/translations/ar.ts`, `en.ts`, `bn.ts`, renewal/active-operation components, and `src/components/admin/financial-review/FinancialReviewClient.tsx`
  - **Reason**: Users/admins must see charged/verifying versus charged/unconfirmed, and admins must explicitly attest manual renewal.
  - **Expected**: All three catalogs provide semantic keys; Arabic remains RTL-safe; UI shows payment and fulfillment separately; no-refund manual path requires an explicit checkbox/control.
  - **Possible bugs**: Translation shape drift can break type inference, card/invoice mixed text can render poorly, or one card's checkbox can leak to another.
  - **Fix/Mitigation**: Match existing catalog structure/hooks, keep per-operation state, and use direction-safe layout/primitives.
  - **Verification**: T007, TypeScript/build, and manual English/Arabic/Bengali UI smoke checks pass.

## Phase 7: User Story 6 - Historical Safety Reconciliation (P2)

- [x] T020 [US6] Implement bounded dry-run/idempotent apply in `scripts/reconcile-renewal-fulfillment.ts` and add the package script in `package.json`
  - **Reason**: Existing completed charged operations need detection and duplicate blocking without automatic money or status changes.
  - **Expected**: CLI validates filters, reports three candidate classes, supports the incident window, requires exact apply confirmation, and upserts only safety issues.
  - **Possible bugs**: Float/package comparisons can overgroup operations, output can leak private evidence, or apply can touch forbidden tables.
  - **Fix/Mitigation**: Reuse safe money tolerance/package snapshot parsing, output bounded identifiers/reason codes, and constrain writes to integrity-issue upsert.
  - **Verification**: T006 unit/DB tests and quickstart dry-run/repeat-apply scenarios pass.

## Final Phase: Documentation, Verification, And Convergence

- [x] T021 Update durable behavior and deployment notes in `docs/PROJECT_GUIDE.md`, `specs/035-renewal-fulfillment-proof/quickstart.md`, and `PROJECT_MEMORY.md`
  - **Reason**: The new financial source-of-truth boundary, migration, recovery, admin workflow, tooling, and release gate must survive handoff.
  - **Expected**: Guide and memory point to exact sources, preserve unrelated 034 records, add one compact material update ID, and keep production/live incident state unknown.
  - **Possible bugs**: Documentation can claim production reconciliation or overwrite current memory work.
  - **Fix/Mitigation**: Use additive targeted edits, cite local verification only, run memory validate/freshness, and inspect final diff.
  - **Verification**: Project guide review, memory validation/freshness, and source pointer checks pass.

- [x] T022 Run focused schema, migration, root, Worker, recovery, admin, locale, and reconciliation verification
  - **Reason**: Each financial boundary must pass before broad builds can provide useful signal.
  - **Expected**: Schema sync/validate/generate and all feature-focused tests pass; isolated DB checks pass or report the exact missing test environment.
  - **Possible bugs**: Generated Prisma client can hide schema drift or tests can silently skip a configured database.
  - **Fix/Mitigation**: Run schema sync before generate, inspect skip messages, and treat an available-but-failing database as a blocker.
  - **Verification**: Execute commands listed in quickstart sections 1–6 and record exact totals/results.

- [x] T023 Run lint, web build, Worker build, and localized browser/manual smoke verification
  - **Reason**: Cross-runtime types, generated Prisma clients, UI catalogs, and Worker orchestration can pass focused tests but fail integration/build.
  - **Expected**: Lint and both builds pass; renewal/review pages show correct states without console errors in representative desktop/mobile RTL/LTR views.
  - **Possible bugs**: Existing unrelated lint/build failures or local browser dependencies may block a check.
  - **Fix/Mitigation**: Separate pre-existing failures with evidence, fix feature-caused failures, and document only genuinely unavailable manual checks.
  - **Verification**: `npm run lint`, `npm run build`, `npm --prefix worker run build`, plus browser/manual results.

- [x] T024 Run clean-code/test-guard/docs review, diff/encoding checks, and two convergence passes
  - **Reason**: Financial code must not ship with swallowed errors, brittle/mock-only tests, stale artifacts, mojibake, or incomplete tasks.
  - **Expected**: Changed production/tests/docs satisfy their guards; `git diff --check`, BOM, and scoped mojibake scans pass; analysis has no unresolved CRITICAL/HIGH/MEDIUM; second artifact-to-diff pass adds no task.
  - **Possible bugs**: Final cleanup can change behavior after tests or convergence can miss an untracked deliverable.
  - **Fix/Mitigation**: Re-run affected focused tests after cleanup, include untracked files in diff inventory, and repeat convergence after all documentation/memory edits.
  - **Verification**: Record both unchanged convergence passes and mark every accepted task complete.

## Reopened Amendment: Sold Report Invoice Correlation

T001–T024 remain the historical completed contract-only implementation. Their completion does not satisfy FR-039–FR-064 or SC-012–SC-018. The following test-first tasks are the accepted amendment gate.

## Phase 8: Amendment Failing Tests And Fixtures

- [x] T025 [P] [US7] Add sanitized Sold Report controls/grid/pagination fixtures and pure parser tests in `worker/tests/fixtures/sold-packages-report/` and `worker/tests/sold-packages-report.test.ts`
  - **Reason**: The screenshots identify the Apply control and grid, but fixed columns, incomplete pagination, or login HTML could silently become false absence.
  - **Expected**: Tests cover initial/Apply pages, ordered duplicate controls and split ViewState, preservation of the provider-selected dealer office, rejected dealer-context changes/unexpected dealer groups, `Alone`/`Including Sub-Dealers` summary labels that are not selector values, reordered headers, summary/alternating rows, valid empty results, blank invoice, Decimal formats, login redirect, malformed/missing grid, pager traversal/cycle/default-100-cap/duplicate page, first-page watermark insertion, fresh-GET scan restart, and privacy exclusions.
  - **Possible bugs**: Handcrafted fixtures may overfit the screenshot or retain subscriber/country data.
  - **Fix/Mitigation**: Keep parser header-driven and fixtures sanitized/minimal; require complete-scan markers and explicitly assert prohibited fields never leave parsing.
  - **Verification**: Run `worker/tests/sold-packages-report.test.ts`; all new cases fail before T032 and pass afterward.

- [x] T026 [P] [US7] Add baseline/diff/exact-correlation and outcome-mapping behavior tests in `worker/tests/fulfillment-correlation.test.ts`, `worker/tests/contract-verification.test.ts`, and `tests/unit/renewal-fulfillment-state.test.ts`
  - **Reason**: Temporal causality and shared invoice identity must replace fuzzy same-day contract selection.
  - **Expected**: Cover old same-day invoices, one exact new match, promotion/package/amount/exact-Cairo-date mismatch, two candidates, unrelated account-wide sale, blank/reused invoice, report-only, contract-only, incomplete scan, exact same-invoice active contract, every outcome-to-fulfillment-state mapping, and `MATCHED` differences between `REVIEW_ONLY` and `ENFORCE`.
  - **Possible bugs**: Normalization can make different offers equal or Decimal comparison can regress to Float.
  - **Fix/Mitigation**: Canonicalize only documented provider variations, preserve invoice/card digits, and use Decimal/canonical minor-unit assertions.
  - **Verification**: Focused matcher tests fail before T032/T036 and pass without network/database afterward.

- [x] T027 [P] Add executable provider mutation replay tests in `worker/tests/http-client-provider-retry-policy.test.ts` and `worker/tests/http-client-payment-classification.test.ts`
  - **Reason**: Global Axios retry can replay POST inside one Worker call even when the durable job marker prevents a later job retry.
  - **Expected**: ECONNRESET, timeout, and 500/502/503 yield exactly one request for final `OK`, Pay, signal activation, and installment mutation; a report failure may restart the scan from fresh GET but no Apply/pager POST is replayed; marker callback/CAS occurs before `OK`.
  - **Possible bugs**: Source regex tests can pass while adapters still retry or tests can count mocks rather than transport attempts.
  - **Fix/Mitigation**: Exercise the configured Axios adapter/request layer with deterministic response sequences and assert call counts/order.
  - **Verification**: Tests fail against current retry/marker behavior and pass after T034.

- [x] T028 [P] Add card/account-reservation and execution-lease concurrency tests in `tests/integration/card-lifecycle-reservation-db.test.ts`, `tests/integration/provider-account-reservation-db.test.ts`, `worker/tests/account-lock-timeouts.test.ts`, and `worker/tests/account-lease-concurrency.test.ts`
  - **Reason**: Causal report attribution is invalid if another operation uses the same card/account or stale ownership can mutate/release it.
  - **Expected**: Same-card race has one active reservation; same-account database race has one durable causal owner across delayed-job gaps; Redis has one exact execution owner; missing/same-operation/same-worker/stale invocation cannot acquire, renew, assert, mutate, write session cache, or release; only the same causal generation can hand off between jobs.
  - **Possible bugs**: Mock Redis/Prisma can hide atomic races or stronger constraints can block resolved history.
  - **Fix/Mitigation**: Keep pure ownership tests plus disposable PostgreSQL/Redis integration cases and explicit release/review-hold fixtures.
  - **Verification**: Pure tests fail before T033; configured integration suites prove one winner.

- [x] T029 [P] [US7] Add Worker orchestration, failover, recovery, and admin composite-proof tests in `worker/tests/renewal-fulfillment-orchestration.test.ts`, `worker/tests/http-queue-renewal-state.test.ts`, `tests/unit/operation-recovery-proof.test.ts`, and `tests/unit/financial-review-decision-safety.test.ts`
  - **Reason**: Baseline ordering, failover invalidation, verification-only retry, and legacy-proof rejection cross multiple existing completion paths.
  - **Expected**: Baseline precedes preparation; package reload/rematch follows it; failover starts a generation only before uncertain mutation; final marker CAS precedes `OK`; retries never mutate; legacy/no-baseline proof cannot complete; `REVIEW_ONLY` stores matched attempt without automated proof/completion; boolean-only admin evidence is rejected; complete unique manual evidence can complete in either mode with post-commit points/notification exactly once.
  - **Possible bugs**: Source-only orchestration assertions can miss runtime call order or break installment behavior.
  - **Fix/Mitigation**: Extract callable orchestration/finalization seams, retain minimal source assertions only where unavoidable, and include installment serialization regression.
  - **Verification**: Focused tests fail before T035–T038 and pass afterward.

- [x] T030 [P] Add follow-up migration, composite-check, proof/refund, and response-contract tests in `tests/unit/renewal-fulfillment-proof.test.ts`, `tests/integration/renewal-fulfillment-proof-db.test.ts`, `tests/integration/renewal-fulfillment-finalization-db.test.ts`, and `tests/unit/renewal-fulfillment-locales.test.ts`
  - **Reason**: Legacy proofs, nullable upgrade fields, card uniqueness, proof/refund races, and response compatibility need database and API boundaries before implementation.
  - **Expected**: Upgrade preserves/backfills legacy proof invoice claims; composite rows require complete metadata; separate manual rows require complete structured fields; the shared cross-kind account/invoice registry lets automated-versus-manual races have one winner; card/account/invoice and proof-versus-reseller/admin/Worker/cleanup-refund races cannot produce both outcomes; pre-mutation reseller-wallet refunds are atomic; manual completion rollback/post-commit side effects are atomic/idempotent; response contracts expose stable `fulfillmentAuthority`/safe timestamp, keep manual evidence details admin-only, and locale/API keys remain compatible.
  - **Possible bugs**: Prisma-only tests may miss SQL checks or unavailable test databases may silently skip critical coverage.
  - **Fix/Mitigation**: Validate raw ordered migration on a disposable upgraded database and report skips as release blockers, not passes.
  - **Verification**: Unit cases fail before T031/T036/T038; configured PostgreSQL suite passes after implementation.

## Phase 9: Amendment Data And Concurrency Foundations

- [x] T031 Create the ordered additive migrations in `prisma/schema.prisma`, `worker/prisma/schema.prisma`, `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql`, `prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql`, and `prisma/migrations/20260824180000_fulfillment_proof_composite_integrity/migration.sql`
  - **Reason**: Existing proof rows are contract-only and no durable baseline, attempt, typed state, or card reservation boundary exists.
  - **Expected**: Add proof kind/report metadata, shared cross-kind provider-invoice claims with legacy backfill, typed operation evidence/`fulfillmentAuthority` plus final-mutation CAS columns, verification/baseline/attempt entities, card and provider-account causal reservations with active partial uniqueness, separate structured manual evidence, `BeinAccount.automationExclusive=false`, canonical provider-login uniqueness with collision preflight, composite/manual completeness SQL checks, composite proof-to-claim/baseline foreign keys, due-work indexes, and legacy defaults without changing migration `20260824090000`.
  - **Possible bugs**: Stronger indexes can fail on legacy duplicates, enum ordering can break deploy, or root/Worker schemas can drift.
  - **Fix/Mitigation**: Add preflight SQL, nullable/backward-compatible fields, explicit legacy proof kind, ordered additive statements, and byte-parity verification.
  - **Verification**: `npm run check:schema-sync`, Prisma format/validate/generate, migration syntax review, T030, and disposable upgrade test pass.

- [x] T032 [US7] Implement ordered WebForms controls, the authenticated Sold Report adapter, and pure matcher in `worker/src/http/webforms-form.ts`, `worker/src/http/sold-packages-report.ts`, `worker/src/lib/renewal-fulfillment-correlation.ts`, `worker/src/http/types.ts`, and `worker/src/http/HttpClientService.ts`
  - **Reason**: The Worker needs complete, page-local, privacy-safe report scans without corrupting renewal WebForms state.
  - **Expected**: Same-origin URL, ordered successful-controls serializer, exact preservation of the provider-selected Dealer control plus stable safe context hash across scans/pages, no fabricated `ALONE` option, fresh-GET full-scan restart, Apply/pager traversal with stable first-page watermark/default 100-page cap, normalized safe rows, exact Cairo date and Decimal correlation, fingerprints, explicit complete/incomplete results, and no subscriber/country/raw HTML output.
  - **Possible bugs**: Report navigation can overwrite `currentViewState`, pager loops can look empty, or session expiry can parse as data.
  - **Fix/Mitigation**: Keep all report form state local, validate grid/login/headers each page, cap/cycle-detect, and use T025 fixtures.
  - **Verification**: T025/T026 and Worker TypeScript build pass.

- [x] T033 Implement durable card/provider-account reservations and strict fenced execution leases in `src/lib/operations/card-lifecycle-reservation.ts`, `src/app/api/operations/start-renewal/route.ts`, `worker/src/lib/provider-account-reservation.ts`, `worker/src/pool/account-locking.ts`, `worker/src/pool/account-pool-manager.ts`, `worker/src/pool/account-queue-manager.ts`, `worker/src/pool/health-checker.ts`, `worker/src/lib/session-cache.ts`, `worker/src/lib/session-keepalive.ts`, `worker/src/keepalive.ts`, and the renewal/installment/signal/balance handlers in `worker/src/http-queue-processor.ts`
  - **Reason**: Same-card and same-account concurrency destroys baseline causality; current same-worker fallback and non-atomic re-acquire/release are unsafe.
  - **Expected**: Transactional card and account reservation creation, review hold/release helpers, continuous account ownership between delayed jobs, atomic exact-owner execution-lease acquire/renew/assert/release, no missing/same-operation fallback, 120s TTL/30s heartbeat, fenced session-cache CAS, mutation assertion, and serialization for renewal/installment/signal/balance/report/keepalive.
  - **Possible bugs**: Locks can strand accounts, duplicate same-operation jobs can interfere, or resolved cards remain blocked.
  - **Fix/Mitigation**: Stable operation/reservation generation plus unique lease/invocation/fencing token, bounded TTL/heartbeat, audited force-unlock/quarantine, exact terminal/review release rules, and stale-reservation reconciliation.
  - **Verification**: T028, start-route tests, account-pool tests, and Worker build pass.

- [x] T034 Disable transport retries for provider mutations and move the durable marker before final `OK` in `worker/src/http/HttpClientService.ts` and `worker/src/http-queue-processor.ts`
  - **Reason**: Both Pay and the preceding `OK` can create irreversible provider state and cannot be safely replayed.
  - **Expected**: Global retries apply only to safe methods; a report retry restarts a full scan from fresh GET instead of replaying a postback; every mutation is one attempt; `FINAL_PROVIDER_MUTATION_STARTED` compare-and-set and reservation/lease assertion persist before `OK`; legacy Pay marker maps only to no-resubmit; all ambiguity enters verification/review.
  - **Possible bugs**: Login/check read-postbacks may lose useful retry or unchanged balance may still be misclassified as no-charge.
  - **Fix/Mitigation**: Separate safe-read adapter policy, preserve explicit session retry only for known reads, and require deterministic rejection plus `VALID_NO_MATCH` for no-charge.
  - **Verification**: T027, final-pay guardrails, installment regressions, and Worker build pass.

## Phase 10: Amendment Renewal Correlation And Finalization

- [x] T035 [US7] Capture/supersede durable baselines and restart preparation on failover in `worker/src/lib/fulfillment-baseline.ts` and `worker/src/http-queue-processor.ts`
  - **Reason**: The baseline must precede the provider sale and be bound to the account/session/package controls that perform it.
  - **Expected**: `attemptPurchaseWithAccount` reserves the final account and captures a complete baseline before `loadPackages`; original account reuses only its valid generation; safe pre-mutation failover supersedes old reservation/context, captures again, reloads packages/promo, and rematches name/promotion/Decimal price; any uncertain Add/Sell/STB/OK/Pay response forbids failover; the final-mutation claim compares the exact active reservation generation with the baseline session generation before `OK`.
  - **Possible bugs**: Cached packages/checkboxes can cross generations, baseline can be captured after mutation, or failed capture can still reach confirmation.
  - **Fix/Mitigation**: Persist timestamps/generation transactionally, invalidate caches/session on switch, and hard-gate provider preparation on active complete baseline plus causal-reservation and execution-lease assertions.
  - **Verification**: T026/T029 and account failover suites pass.

- [x] T036 [US7] Replace contract-only completion with shared composite verification/finalization in `shared/operations/renewal-fulfillment.ts`, `worker/src/lib/contract-verification.ts`, `worker/src/lib/fulfillment-proof.ts`, `worker/src/lib/fulfillment-finalization.ts`, and `worker/src/http-queue-processor.ts`
  - **Reason**: Current fuzzy contract match can select an old invoice and proof/refund/completion are not atomic.
  - **Expected**: Complete report diff yields one candidate; exact invoice finds one active contract; the shared module maps every outcome deterministically; every attempt is recorded; `REVIEW_ONLY` never claims/completes; `ENFORCE` operation-row-first transaction locks the verification plus latest attempt and requires the exact matched attempt/baseline/invoice/account/card/reservation generation and charged-ledger context before it claims composite proof, completes, and captures point run; stale or replayed evidence cannot finalize; side effects run post-commit once.
  - **Possible bugs**: Concurrent refund/proof wins inconsistently, legacy proof is accepted, or report Amount fabricates spend evidence.
  - **Fix/Mitigation**: Shared lock order/finalizer, proof-kind completeness checks, renewal post-mutation proof exclusion in every applicable refund writer, preserved pre-mutation/installment rules, and separate spend-ledger provenance.
  - **Verification**: T026/T029/T030 plus proof/refund concurrency and completion-side-effect ordering suites pass.

- [x] T037 [US7] Add deterministic verification-only retry scheduling in `worker/src/http-queue-processor.ts`, `src/lib/operation-dispatch.ts`, `src/lib/operations/recovery.ts`, `src/lib/operations/recovery-proof.ts`, and `src/app/api/admin/financial-review/[operationId]/verify-card/route.ts`
  - **Reason**: Sold Report and contracts can become visible after the immediate response, but retries must have no callable Pay path.
  - **Expected**: Durable attempts run immediately then after 5s/15s/30s with stable job IDs/due state; the account causal reservation remains continuous while each job reacquires only its fenced execution lease, scans report/contract only, deduplicates repeated requests, rejects mismatched duplicate-attempt evidence, and finishes according to shared payment/outcome/mode mapping. Every verification job bypasses generic mutation/refund catch handling and rethrows read-only failures to Bull; mutation jobs are never made retryable. The operation-maintenance leader recreates a missing due verification job from `nextCheckAt` after a database-commit/queue-add crash, and creates the next logical read-only attempt for a stranded latest `MATCHED + VERIFYING + nextCheckAt=null` record, using deterministic job IDs in both cases.
  - **Possible bugs**: Delayed jobs can invoke `CONFIRM_PURCHASE`, duplicate attempts can race, or account lease expires mid-scan.
  - **Fix/Mitigation**: Dedicated verification-only handler/data contract, unique attempt number, continuous database account reservation, per-job lease heartbeat/fencing, and code-level absence of all sale-mutation dependencies.
  - **Verification**: Fake-timer/dedupe/recovery tests in T029 and queue integration tests pass with zero Pay calls.

- [x] T038 Update shared state, every web-panel refund/recovery writer, atomic pre-mutation termination, admin evidence/config/account eligibility, API/UI/locales in `shared/operations/renewal-fulfillment.ts`, `src/lib/operation-safety.ts`, `src/lib/refund.ts`, `worker/src/utils/error-handler.ts`, `worker/src/lib/pre-mutation-renewal-finalization.ts`, refund call sites in `worker/src/http-queue-processor.ts`, `src/app/api/cron/cleanup-stuck-operations/route.ts`, `src/lib/operations/recovery.ts`, `src/lib/operations/recovery-proof.ts`, `src/lib/operations/recovery-classifier.ts`, `src/lib/financial-review/evidence.ts`, `src/lib/financial-review/manual-decisions.ts`, `src/lib/financial-review/types.ts`, `src/app/api/admin/financial-review/route.ts`, `src/app/api/admin/financial-review/[operationId]/decision/route.ts`, `src/app/api/admin/financial-review/[operationId]/verify-card/route.ts`, `src/app/api/admin/bein-config/route.ts`, `src/components/admin/BeINConfigForm.tsx`, `src/app/api/admin/bein-accounts/route.ts`, `src/app/api/admin/bein-accounts/[id]/route.ts`, `src/app/dashboard/admin/bein-accounts/page.tsx`, `src/app/api/operations/route.ts`, `src/app/dashboard/operations/active/page.tsx`, `src/app/dashboard/renew/page.tsx`, `src/components/history/OperationsTable.tsx`, `src/components/admin/financial-review/FinancialReviewClient.tsx`, and `src/i18n/translations/{ar,en,bn}.ts`
  - **Reason**: Existing recovery/admin checks accept any proof and boolean-only manual confirmation; config and UI lack Sold Report mode/reason codes.
  - **Expected**: Only an `ENFORCE` composite proof auto-completes; every web-panel renewal post-mutation refund writer, including generic Worker catches, delegates to one atomic finalizer that locks operation first and requires `FINAL_OK`, no composite/manual/charge evidence, and terminal complete typed `NOT_CHARGED + VALID_NO_MATCH`; every pre-mutation reseller-wallet cancellation/error uses a separate atomic exact-ledger finalizer and fails ambiguous settlement to held review; installment semantics remain unchanged; separate structured manual evidence is complete/unique/audited and may perform labeled manual completion; general APIs expose stable `fulfillmentAuthority`/safe confirmation time while admin-only details remain protected; config validates same-origin report path and deterministic bounds and defaults `REVIEW_ONLY`; only admin-attested automation-exclusive accounts enter the pool; provider login writes are canonicalized and database-unique across case/whitespace aliases; clients show stable localized verification states. Provider login/CAPTCHA retries assert the exact execution lease before and after each network step and stop immediately on lease loss.
  - **Possible bugs**: Legacy API responses break, admin details leak provider data, or stronger manual requirements block documented recovery without guidance.
  - **Fix/Mitigation**: Backward-compatible marker/response parser, shared operation-row-first lock order for every renewal post-mutation refund entry point while preserving `NOT_SUBMITTED`/installment behavior, admin-only safe details, stable codes, explicit manual/account-attestation validation, and AR/EN/BN key parity.
  - **Verification**: T029/T030, recovery/admin/refund/localization tests, web build, and RTL/LTR smoke pass.

## Phase 11: Amendment Rollout, Documentation, And Convergence

- [x] T039 Add the authorized correlation-smoke workflow and synchronize durable docs in `scripts/verify-sold-report-contract-correlation.ts`, `docs/PROJECT_GUIDE.md`, `specs/035-renewal-fulfillment-proof/quickstart.md`, and `PROJECT_MEMORY.md`
  - **Reason**: Screenshots cannot prove authenticated form/pager semantics or report/contract invoice equality, and production state must not be inferred.
  - **Expected**: Safe command emits sanitized equality/scan evidence only; absence/mismatch keeps attempt-only/no-proof `REVIEW_ONLY`; guide externally gates all renewal/admin/refund/recovery mutation paths, drains work, stops `bein-web`, `bein-maintenance`, `bein-keepalive`, and every `bein-worker-*` before migration/build, then starts only new-version processes behind the gate; it also documents automation-exclusive account attestation, and memory records exact implemented sources/pending live authorization without overwriting 034 history.
  - **Possible bugs**: Smoke output can leak subscriber/session data or docs can claim live success not performed.
  - **Fix/Mitigation**: Strict output allowlist/redaction, explicit authorization flag, no provider mutation, and evidence state `UNKNOWN/PENDING` until actually run.
  - **Verification**: Fixture-mode smoke passes; live mode is not run without authorization; memory validate/freshness and source-pointer checks pass.

- [ ] T040 Run full amended verification and two convergence passes across Spec Kit, schema/migration, core unit/integration/concurrency, lint/build, diff/encoding, and release-mode checks
  - **Reason**: The amendment spans provider transport, distributed locking, financial finalization, data migration, admin/API/UI, and deployment safety.
  - **Expected**: All available focused/broad web-panel and Worker suites and both core builds pass; disposable PostgreSQL/Redis concurrency is required before release; unavailable service/live checks are named release blockers; mobile/store/app checks are explicitly out of scope; no unresolved CRITICAL/HIGH/MEDIUM core finding remains; second convergence adds no task.
  - **Possible bugs**: Mock-only green tests or cleanup after tests can invalidate evidence.
  - **Fix/Mitigation**: Run narrow-to-broad after final edits, require real disposable-service results before release, inventory untracked files, and repeat analysis/diff/encoding checks.
  - **Verification**: Record exact commands/totals, checklist 42/42 and 46/46, `git diff --check`, BOM/mojibake scans, web/Worker builds, and two unchanged artifact-to-diff passes.
  - **Current status**: BLOCKED for release/`ENFORCE`. Available core evidence is 670 root tests passed, 195 Worker tests passed with four Redis skips, three database harness checks passed with 20 PostgreSQL cases skipped, both builds/type checks/schema parity/Prisma/focused lint/diff/encoding passed, and second-agent review found no CRITICAL/HIGH defect blocking `REVIEW_ONLY`. Still required: real PostgreSQL/Redis races, canonical-login collision preflight, authorized same-Invoice provider smoke, at least one attested automation-exclusive account, crash-durable post-completion effects, and resolution or explicit release acceptance of broad `HttpClientService.ts` lint debt. Mobile/store/app execution remains excluded.

## Dependencies And Execution Order

- T001-T007 are the mandatory failing-test gate.
- T008 blocks all proof persistence and generated-client work.
- T009-T011 block Worker, recovery, and admin completion changes.
- T012 precedes T013 and T015.
- T014 depends on T008 issue types but is independent of Worker completion after foundational work.
- T016 depends on T008/T009 and proof relation availability.
- T017 depends on T008 proof selection; T018 depends on T011/T012/T017.
- T019 depends on API/state contracts from T009/T014/T017.
- T020 depends on T008 issue types and proof relation.
- T021 follows all runtime/test changes; T022-T024 follow all implementation and documentation.
- T025-T030 are the reopened amendment failing-test gate.
- T031 blocks all composite persistence/finalization and generated clients.
- T032/T033/T034 are foundational and may proceed in parallel after their tests, but changes to `HttpClientService.ts` integrate sequentially.
- T035 depends on T031-T034; T036 depends on T031/T032/T035; T037 depends on T033/T036.
- T038 depends on T031/T036/T037; T039 follows runtime/config work; T040 follows every amendment task.

## Requirement Coverage

- FR-001–FR-020: T001-T003, T008-T013, T015-T016.
- FR-021–FR-027: T005, T014, T017-T019.
- FR-028–FR-033: T006, T020.
- FR-034: T001, T010, T015.
- FR-035–FR-038: T002, T008, T011, T018, T020, T022-T024.
- FR-039–FR-040: T025-T026, T028-T033, T035-T037.
- FR-041: T028, T030-T031, T033, T038.
- FR-042–FR-051: T025-T026, T029, T031-T032, T035-T037.
- FR-052–FR-056: T027, T029, T034, T036-T038.
- FR-057–FR-060: T027-T029, T033-T035, T037-T038.
- FR-061: T026, T028, T031, T033, T038-T039.
- FR-062–FR-063: T030-T031, T036, T038, T040.
- FR-064: T026, T029-T031, T036, T038-T040.
- FR-065–FR-066: T027-T031, T033-T034, T036, T038-T040.
- FR-067: T028-T031, T033, T036, T038-T040.
- SC-001–SC-006: T026-T030, T034-T038, T040.
- SC-007–SC-011: T029-T030, T038-T040.
- SC-012–SC-018: T025-T040.
- SC-019: T028-T031, T033, T038-T040.

## Implementation Strategy

1. Lock the corrected financial semantics and orchestration in failing tests.
2. Add the database uniqueness boundary and pure state matrix.
3. Gate the primary Worker completion path and side effects.
4. Extend duplicate blocking, safe refund, recovery, and admin paths.
5. Add localized UI and historical safety tooling.
6. Verify narrow-to-broad, update durable docs/memory, and converge twice.
