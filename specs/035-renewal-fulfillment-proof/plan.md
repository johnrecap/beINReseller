# Implementation Plan: Renewal Fulfillment Proof

**Branch**: `034-web-project-memory` (working tree preserved; feature artifacts in `035-renewal-fulfillment-proof`) | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/035-renewal-fulfillment-proof/spec.md`

## Summary

Correct renewal completion so provider payment, report attribution, and service fulfillment are independent facts. Under one card reservation, one durable provider-account causal reservation, and one fenced execution lease per active job, capture a complete Sold Report baseline before sale preparation, reload/rematch the package, detect exactly one new matching invoice after the first final provider mutation, require the same invoice on an active contract, and claim a composite proof before completion/points/notification. Disable transport retries for every provider mutation, preserve verification-only recovery, route all ambiguity to review, and retain the non-mutating historical reconciliation workflow.

## Planning Quality Standard

Every implementation task includes Reason, Expected, Possible bugs, Fix/Mitigation, and Verification. Implementation starts only after all requirements checklists pass and cross-artifact analysis has no unresolved CRITICAL, HIGH, or MEDIUM finding.

## Technical Context

**Language/Version**: TypeScript 5.9 root app, TypeScript 5.7 Worker, Node.js, Prisma 7.2

**Primary Dependencies**: Next.js 16.1 App Router, React 19.2, PostgreSQL, Prisma, BullMQ/Redis, existing provider HTTP client, contract verification, operation recovery, financial review, spend ledger, reseller-wallet refund, points, notifications, and localization catalogs

**Storage**: Existing PostgreSQL `operation_fulfillment_proofs` plus additive ordered migrations for composite metadata, shared invoice claims, durable Sold Report baselines/verification attempts, card/provider-account reservations, manual evidence, account eligibility, canonical provider-login uniqueness, and composite proof integrity; existing operations, spend ledger, reseller transactions, integrity issues, operation dispatches, operation spend award runs, and JSON evidence remain in use

**Testing**: Node test runner through `tsx`, isolated PostgreSQL migration/concurrency tests when database URL is provided, Prisma schema checks, ESLint, Next build, Worker TypeScript build, manual localized UI/browser smoke check

**Target Platform**: Existing Next.js dashboard/API and Node Worker PM2 processes

**Project Type**: Full-stack web dashboard plus background provider-integration Worker

**Performance Goals**: Bounded complete report/contract attempts with deterministic defaults (100 report pages; immediate, 5s, 15s, and 30s verification checks); proof claim/completion is one indexed transaction; the 120s execution lease heartbeat runs every 30s; reconciliation requires bounded time filters

**Constraints**: No provider mutation before a complete baseline; no transport or job sale-mutation replay after `FINAL_PROVIDER_MUTATION_STARTED`; no automatic refund with confirmed/unknown provider charge; no split refund/status/reservation writes; no completion side effects before an `ENFORCE` composite proof or complete structured manual evidence commits; no live production inspection; no credentials/provider payloads; production migration deploy only; root/Worker schema parity; minimal encoding-safe edits; mobile/store/Stripe/store-credit surfaces are explicitly excluded from implementation, verification, and release claims

**Scale/Scope**: Web reseller-panel renewal preparation and `CONFIRM_PURCHASE`, Sold Report WebForms adapter, Worker recovery, start route, admin review/live verification, shared account serialization, three locale catalogs, ordered additive proof/reservation migrations, one bounded reconciliation command, focused unit/integration/concurrency tests; installment fulfillment remains regression-only while its account use obeys the shared lease; the non-running application/store surface is out of scope by explicit maintainer instruction

## Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Payment ledger, fulfillment proof, refund, review, and conflict sources are separated with explicit terminal rules.
- **Traceable Planning**: PASS. FR/SC, stories, data model, contracts, source files, tasks, and verification commands are mapped.
- **Test-First For Risky Behavior**: PASS REQUIRED. Failing payment/proof/recovery/admin/reconciliation tests precede implementation tasks.
- **Minimal, Encoding-Safe Edits**: PASS. Existing services/routes are extended; schema changes are additive; `apply_patch`, diff, BOM, and mojibake checks are required.
- **Security And Privacy Boundaries**: PASS. Only safe contract fields and identifiers are stored; sessions, cookies, ViewState, credentials, and raw provider responses are prohibited.

### Amendment Gate — Sold Report Correlation

- **Specification status**: REOPENED. T001–T024 and their local verification describe the superseded contract-only implementation and remain historical completed work.
- **Required new evidence chain for `ENFORCE` automated completion**: complete baseline, exactly one new report invoice, same-invoice active contract, unique composite claim. `REVIEW_ONLY` stops after recording the matched candidate attempt.
- **Fail-closed rule**: absent baseline, incomplete scan, external account activity, report-only, contract-only, and all ambiguity remain non-successful.
- **Scope amendment**: the mobile application, store-subscription routes, Stripe flows, and store-credit lifecycle are not delivery or release gates for feature 035. Existing unrelated worktree changes in those areas are neither validated nor represented as completed work here.
- **Rollout rule**: default `REVIEW_ONLY`; `ENFORCE` requires authorized sanitized evidence that report and contract invoice values are identical.

### Workflow Preservation Exception

The installed Spec Kit git hook normally creates a branch and updates `.specify/feature.json`/`AGENTS.md`. The user explicitly requires preservation of the active uncommitted feature 034 memory work and modified managed files. Therefore feature 035 artifacts are created directly under `specs/035-renewal-fulfillment-proof/`; no hook, branch switch, `.specify/feature.json`, or AGENTS pointer update is performed. This does not weaken any specification, analysis, checklist, task, implementation, or verification gate.

## Existing System Checked

- Defect and payment classifier: `worker/src/http/HttpClientService.ts`, `worker/tests/http-client-payment-classification.test.ts`.
- Renewal worker and post-Pay branches: `worker/src/http-queue-processor.ts`, `worker/tests/http-queue-renewal-state.test.ts`.
- Contract matching: `worker/src/lib/contract-verification.ts` and its tests.
- Financial evidence: `worker/src/lib/bein-spend-ledger.ts`, `src/lib/bein-spend-ledger.ts`, `BeinAccountSpendLedger` in both Prisma schemas.
- Recovery completion: `src/lib/operations/recovery-proof.ts`, `src/lib/operations/recovery-classifier.ts`, `src/lib/operations/recovery.ts`, related root tests.
- Duplicate-card entry guard: `src/app/api/operations/start-renewal/route.ts`, `tests/unit/start-renewal-review-guard.test.ts`.
- Admin review and live verification: `src/lib/financial-review/*`, decision/verify-card routes, `FinancialReviewClient.tsx`, related unit/integration tests.
- Completion effects: operation spend award run services, points finalization, notifications, analytics, integrity detection.
- Explicitly excluded entry points: mobile renewal, store-subscription, Stripe, and store-credit paths; they are not opened as acceptance surfaces for this feature.
- Data and deploy: both Prisma schemas, ordered migrations, `scripts/check-prisma-schema-sync.js`, package scripts, PM2 production notes.
- Messages: `src/i18n/translations/ar.ts`, `en.ts`, `bn.ts`, renewal and active-operation UI.
- Prior accepted contracts: `specs/023-final-payment-guardrails/*`, `specs/030-financial-review-evidence/*`, and their completed tasks.

## Project Structure

### Documentation

```text
specs/035-renewal-fulfillment-proof/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- renewal-fulfillment.md
|   `-- admin-reconciliation.md
|-- checklists/
|   |-- requirements.md
|   `-- financial-safety.md
`-- tasks.md
```

### Source Code

```text
prisma/
|-- schema.prisma
`-- migrations/<ordered feature timestamps>/migration.sql

worker/
|-- prisma/schema.prisma
|-- src/http/HttpClientService.ts
|-- src/http/webforms-form.ts
|-- src/http/sold-packages-report.ts
|-- src/http-queue-processor.ts
|-- src/lib/renewal-fulfillment-correlation.ts
|-- src/lib/fulfillment-baseline.ts
|-- src/lib/fulfillment-finalization.ts
|-- src/lib/contract-verification.ts
|-- src/lib/fulfillment-proof.ts
|-- src/lib/session-cache.ts
|-- src/pool/account-locking.ts
`-- tests/

src/
|-- app/api/operations/start-renewal/route.ts
|-- app/api/admin/financial-review/
|-- components/admin/financial-review/FinancialReviewClient.tsx
|-- components/renewal/
|-- i18n/translations/{ar,en,bn}.ts
|-- lib/financial-review/
|-- lib/operations/
`-- lib/renewal-fulfillment.ts

shared/operations/renewal-fulfillment.ts

scripts/reconcile-renewal-fulfillment.ts
tests/{unit,integration}/
```

**Structure Decision**: Extend current boundaries. `webforms-form.ts` serializes ordered successful controls, the HTTP Sold Report adapter owns fresh-GET scans and local ViewState, and a pure correlation module owns normalization/diff semantics. The Worker owns baseline capture, provider verification, fenced execution leases, and finalization; database reservations own card and provider-account causal exclusivity; root recovery/admin routes read composite proof; the existing integrity model stores historical safety issues. `shared/operations/renewal-fulfillment.ts` is the single provider-terminal/outcome mapping used by root and Worker.

## Source Of Truth And Transaction Order

1. Provider balance/audit and spend ledger establish financial debit state; report Amount is correlation metadata and does not fabricate this ledger.
2. A complete pre-mutation Sold Report baseline establishes the operation/account/session causal boundary.
3. A complete post-mutation diff identifies exactly one new matching invoice.
4. The card contract view independently establishes one active contract with that exact invoice.
5. Database composite-proof uniqueness plus guarded operation-row transaction establishes authoritative automated fulfillment. A separate shared invoice claim plus complete append-only manual row establishes explicitly manual admin fulfillment without masquerading as correlation.
6. Operation spend award run/points, notification, and analytics occur only after the applicable authoritative evidence and completion commit.
7. Local reseller-wallet settlement is independent evidence: every renewal refund locks the operation and exact canonical deduction, commits money/status/reservation state together, or leaves the operation under review.

No later source may infer an earlier source. In particular, points, notifications, completed status, expected price, and spend ledger do not create proof.

## Migration And Legacy Plan

- Preserve the existing proof migration as potentially deployed; do not edit it.
- Add ordered migrations to both schemas: the composite-correlation migration for proof kind/report metadata, shared cross-kind provider-invoice claims, baseline/attempt records, card/provider-account causal reservations, append-only manual evidence and automation-exclusive eligibility; a canonical provider-login migration with collision preflight; and a composite-integrity migration for cross-table invoice/proof constraints.
- Keep `invoiceNo` as the canonical discovered invoice. Expose `discoveredInvoiceNo` only as a response alias when useful; do not store a duplicate database column.
- Canonicalize every provider username/email write as `trim().toLowerCase()` and add a preflighted unique index over `lower(btrim(username))`; existing canonical aliases stop migration for explicit manual consolidation instead of silently choosing one account ID.
- Existing proof rows receive `LEGACY_CONTRACT_ONLY` semantics and cannot satisfy new automatic completion.
- Do not backfill proof automatically.
- Historical completed charged rows without proof are candidates for dry-run/apply safety issues only.
- Production uses `prisma migrate deploy`, then `prisma generate`; no `db push`.

## API, Authorization, And Localization

- Start-renewal continues existing web-panel auth, permission, rate-limit, maintenance, and card-lock behavior; it adds a stable 409 error code for fulfillment review.
- Financial review list/decision/live-check remain admin-only.
- Admin no-refund/completion requires an `ENFORCE` composite proof or separate append-only structured manual provider evidence with an atomically unique account/invoice claim; `cardRenewed=true` alone is rejected. Manual completion may resolve `REVIEW_ONLY`, is labeled manual in audit/API data, and captures/finalizes completion effects only after its guarded transaction commits.
- APIs expose machine state/code; UI uses the existing three translation catalogs.
- Arabic UI preserves RTL and mixed card/invoice readability.
- Add same-origin Sold Report URL validation and a proof mode of `REVIEW_ONLY | ENFORCE`; no arbitrary external URL is accepted. `REVIEW_ONLY` records sanitized attempts and always leaves post-mutation renewal in review without claiming automated proof; only `ENFORCE` may claim and complete.
- Expose stable attempt reason codes without subscriber/country/raw HTML.

## Verification Strategy

- TDD pure tests for Sold Report controls/grid/pagination parsing, baseline diff/correlation, payment mapping, mutation no-retry, proof claim outcomes, Worker terminal matrix, atomic pre/post-mutation reseller-wallet settlement, recovery/admin composite-proof guards, account/card races, reconciliation, and localization key parity.
- Real isolated PostgreSQL test for uniqueness and concurrent invoice claim when test database configuration is available.
- PostgreSQL/Redis-gated tests for continuous account causal reservation plus strict owner-scoped execution-lease acquire/renew/assert/release, fenced session caching, and stale-owner mutation denial.
- Source-level regression checks are kept only for orchestration invariants that are otherwise impractical to invoke; behavior tests remain primary.
- Schema sync, Prisma format/validate/generate, focused root/Worker tests, lint, web build, Worker build, reconciliation dry-run fixtures, diff/encoding checks, and browser/manual localized states.
- Disposable PostgreSQL/Redis concurrency suites are release gates; an unavailable service is recorded as a blocker, never counted as a pass.

## Post-Design Constitution Check

- Financial sources and conflicts remain separate and auditable: PASS.
- Database and application race boundaries are explicit: PASS.
- Every risky mutation has a prior test task and exact verification: PASS.
- No destructive/backfill/production action is automated: PASS.
- No sensitive provider runtime material is persisted or displayed: PASS.
- Baseline/report/contract causality and rollout mode are explicit: PASS.
- Transport-level and Worker-level replay barriers are both explicit: PASS.

## Provider Transport And Lease Design

- Global Axios retries are restricted to safe HTTP methods. Every provider-mutating POST, including final `OK`, Pay, package preparation, promo, signal activation, and installment payment, gets one transport attempt.
- A failed read-only Sold Report scan may retry once only by restarting from a fresh report GET; Apply/pager POST bodies and their ViewState are never replayed, and report state never shares renewal ViewState.
- A durable database provider-account reservation spans baseline, mutation, all delayed verification attempts, and unresolved review. Each active job acquires a 120s Redis execution lease with a 30s heartbeat and fencing token; pool selection, session-cache writes, keepalive, and every mutation assert both reservation and exact execution ownership.
- The final-mutation compare-and-set accepts the current reservation generation explicitly and locks the operation, card reservation, account reservation, verification, and active baseline; `reservation_generation::text`, baseline `session_generation`, card/account context, and the caller's current generation must match before `OK`.
- Provider login, CAPTCHA submission, session export, fenced cache save, retry delay, and every subsequent retry assert the exact live execution lease. Lease-loss errors are non-retryable and escape immediately so a stale Worker cannot mutate or replace a newer owner's provider session.
- Only accounts explicitly marked `automationExclusive=true` are eligible for correlation. Admin account create/edit validates this opt-in and the pool excludes/quarantines all ineligible or externally contaminated accounts.
- Provider account identity is the canonical beIN login, not a case-sensitive local row. Create/update/import paths normalize it and the database rejects whitespace/case aliases so one real dealer cannot receive two simultaneous causal reservations or two invoice-claim namespaces.
- START renewal captures the account-wide invoice identity baseline inside `attemptPurchaseWithAccount` after the final account reservation/login and before `loadPackages`. Failover is allowed only before any uncertain provider mutation; it invalidates prior reservation/baseline/session/package/promo controls, captures a new baseline, reloads packages, and exactly rematches the selected package.
- The durable `FINAL_PROVIDER_MUTATION_STARTED` marker is written with an atomic compare-and-set before `OK`, because `OK` can return direct contract success before a Pay page appears. Legacy `FINAL_PAY_REQUEST_STARTED` maps to the same no-resubmit barrier but is not evidence that Pay occurred.
- Verification checks run immediately and after 5s, 15s, and 30s. Report page cap defaults to 100, full-scan restart attempts to 2, date comparison to the exact Africa/Cairo final-mutation calendar date, execution lease TTL to 120s, and heartbeat to 30s. Config may only tighten or explicitly override these bounded values under tested validation.
- Attempt persistence is compare-and-set: a replayed attempt number must have byte-equivalent safe evidence and returns an explicit replay identity; mismatched evidence is rejected. The automated finalizer locks verification plus its latest attempt and requires the exact `MATCHED` attempt id/number, active baseline, invoice, account, card, reservation generation, and charged-ledger account before claiming proof. Every verification-only job bypasses generic mutation/refund catch handling; its read-only failures are rethrown to Bull while no mutation job receives this retry behavior. The operation-maintenance leader scans due `nextCheckAt` rows and idempotently recreates a missing read-only attempt job, closing the database-commit/queue-add crash window; it also schedules the next logical scan for a stranded latest `MATCHED + VERIFYING + nextCheckAt=null` attempt so finalization can converge after a crash.

Exact configurable keys are `bein_sold_packages_report_url`, `bein_renewal_fulfillment_proof_mode`, `bein_sold_report_page_cap`, `bein_sold_report_scan_attempts`, and `bein_renewal_verification_delays_ms`. Defaults are respectively the same-origin report path, `REVIEW_ONLY`, `100`, `2`, and `0,5000,15000,30000`; admin writes reject malformed values and runtime reads fail closed to those defaults. Execution-lease TTL/heartbeat and Sold Report date tolerance are deliberately non-configurable safety constants of `120000`, `30000`, and `0` so a settings write cannot silently widen the causal window.

## Composite Verification Decision Matrix

| Payment | Correlation result | Operation decision |
|---|---|---|
| `CHARGED` | `MATCHED` composite proof | `COMPLETED` |
| `UNKNOWN` | `MATCHED` composite proof | `COMPLETED` |
| `NOT_CHARGED` | `MATCHED` composite proof | `REVIEW_REQUIRED` contradiction |
| `CHARGED` / `UNKNOWN` | any non-match/failure/conflict | `REVIEW_REQUIRED`, no refund |
| explicit deterministic `NOT_CHARGED` | complete `VALID_NO_MATCH` | `FAILED`, one idempotent refund |
| any | incomplete scan, missing baseline, report-only, contract-only | `REVIEW_REQUIRED` after possible mutation |

All post-mutation renewal no-charge exits—including the generic Worker exception handler and recovery—delegate to one operation-row-first transaction. It validates `FINAL_OK`, durable terminal complete verification, and absence of charge/proof/manual evidence before committing canonical refund, failure state, point reversal, issue resolution, and reservation release atomically.

Pre-mutation renewal cancellations/timeouts/errors use a separate operation-row-first atomic finalizer. It requires no provider-mutation ambiguity and exactly one canonical reseller deduction (or an exact idempotent prior refund); otherwise it holds `REVIEW_REQUIRED` and keeps reservations.

In `REVIEW_ONLY`, every automatic row in this matrix after provider mutation resolves to `REVIEW_REQUIRED`; a `MATCHED` candidate is saved only as an attempt and cannot claim `OperationFulfillmentProof`. A later explicit admin transaction may complete from unique structured manual evidence. In `ENFORCE`, only the matching-proof rows may auto-claim/finalize as shown. No mode restores legacy contract-only behavior.

## Compatibility And Supersession

| Earlier rule | Feature 035 amendment |
|---|---|
| Feature 023 permitted expected balance delta to finish final payment | Superseded for renewal completion: delta classifies money only. |
| Feature 030 requires same-context balance provenance for trusted provider debit | Preserved. Sold Report Amount is matching metadata, not an observed spend-ledger debit. |
| Existing contract-only proofs | Retained as audit history with legacy proof kind; they cannot auto-complete new/recovered operations. |
| Installment fulfillment | Unchanged; only shared account serialization/no-retry safety applies. |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Direct 035 artifacts without active Spec Kit pointer update | Preserve the user's uncommitted 034 memory workflow and managed-file changes | Running the mandatory git hook would switch/mutate current user work and violate the explicit preservation constraint |
