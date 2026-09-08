# Implementation Plan: Audit Remediation and Release Readiness

**Current extended quality — 2026-09-08:** **45/57 active tasks accepted.** T067-T069 complete; T051 quality improved and T052 history analyzed. 802 distinct unit and 221 distinct worker cases pass; four additional mocked-browser scenarios and isolated web/worker builds pass. In-scope lint has zero errors; full lint retains seven errors in excluded mobile/customer files. Database baseline, provider evidence and release gates remain open. [Current verification](evidence/extended-quality-verification.md). Earlier counts below are historical.

## Current extended quality design — 2026-09-08

Use existing components and domain services; broad rewrites or global lint suppression are rejected. T051 fixes in-scope types/CommonJS tooling without changing excluded code or hiding its diagnostics. T067 measures untransformed export content and reuses stable JSX for visible/export views. T068 moves the existing dashboard query into one server service reused by page/API, avoiding Host-derived self-fetch and matching current user/count fields. T069 gives each maintenance cycle a distinct lease token and prevents overlap within one runner; shutdown waits for current work before closing connections. Tests reproduce each behavior before fixes. T052 investigates local Git/source history only; absent authoritative migrations remain blocked. The approved extension preserves provider/financial authority and adds no network integration or schema mutation.

**Historical local backlog — 2026-09-08:** **42/54 active tasks accepted.** T012, T024-T036, T039-T045 and T048-T050 completed locally without subagents. 790 unit and 218 worker tests pass; the integration matrix has 178 distinct passing cases including final follow-ups; 22 mocked-browser groups pass. Isolated builds/types and focused lint pass. Full lint/CI, attributable installment/final-cart evidence, migration provenance and live release gates remain open. [Current verification](evidence/local-backlog-verification.md). Earlier dated counts below are historical.

## Current local backlog design — 2026-09-08

Implement the newly authorized local sequence in the current task without delegation. Earlier repair results remain evidence; old descriptions of already-fixed auth, watchdog and note behavior are not new implementation work.

1. Auth/dispatch: reuse the actual route/VM harness and canonical synthetic fixtures. Add persisted-actor/role/owner checks, real outbox persistence and isolated Redis delivery races. Repair only failures and complete each original task from its remaining acceptance.
2. Review/API/UI: add one pure capability classifier consumed by server and panel; derive classification, actions, required fields and block reasons from persisted evidence. Revalidate on the server under canonical locks. Reuse strict modern finalizers and separate immutable legacy adjudication. Deferred installments expose a hold; no new payment authority. Project safe state/reasons consistently in renewal and active views, using existing catalogs/components.
3. Completion effects: create existing OperationCompletionEffect rows within the completion transaction. One bounded maintenance consumer atomically applies local notifications/counters and acknowledges each stable effect. Reuse captured point-award runs; do not recreate point rules or replay provider work. Explicit retries/exhaustion and aggregate health are required.
4. Readiness/compatibility: reuse current account eligibility/reservation and requested/effective proof-mode logic before financial admission. A valid owned reservation counts as available. No account opt-in, provider login or inferred attestation. Author read-only bounded compatibility reports and synthetic upgrade/legacy checks; missing migration provenance remains a release blocker. Declare one panel process-count source shared by PM2 profiles; preserve excluded processes.
5. Verification: extend existing connected suites and add CI coverage/skip guards, then perform synthetic DB/Redis/browser checks, schema parity, types/lint and web/worker builds in isolated outputs. Build/local acceptance is separate from future provider/migration/production acceptance. Synchronize task evidence, guide and memory only after results are known.

Dependency correction: auth does not wait for review UI; generic outbox work does not wait for the full role matrix; local preflight/topology does not wait for live-provider evidence; UI contracts do not wait for the deployment runbook. Shared-file edits stay sequential. Required contracts/tests still precede implementation and final release gates are preserved.

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

## Current review repair design — 2026-09-08

Execute T059-T066 sequentially in this task without delegation. This amendment takes precedence over historical phase restrictions/counts below. Reuse the current quote, canonical financial lock, pre-mutation guards, execution-lease CAS, current-user validation, outbox watchdog, locale catalogs and test harnesses. No schema/history rewrite or production/provider action.

Research decision: explicitly park an exact legacy account owner after all preparation HTTP/session work and before publishing the next stage, then allow only that parked owner to transition atomically to a fenced lease. Simply dropping the worker-ID check permits stealing active work; a plain unlock creates an account-use gap. Both alternatives are rejected.

Quote closure decision: capture a positively fenced pre-sale quote conflict and atomically validate zero financial/provider exposure under canonical locks before terminal closure and reservation release. Preserve REVIEW_REQUIRED on ambiguity; do not add a generic force-close or infer safety from missing timestamps. Extend existing quote/finalization components and test concurrent stale writers.

Auth/dispatch/UI decision: reuse getAuthenticatedUser with each route's ownership rules, extend the generic watchdog with state-aware failure handling, reject unsupported producer input, and bound network waits with cancellation plus retained request identity. Tests precede runtime changes where seams exist. New locale strings use existing ar/en/bn catalogs.

Verification: focused actual-module tests, synthetic PostgreSQL only where existing isolated setup is usable, isolated Redis lock races, root/worker noEmit and focused lint. A production build must use an isolated output and must not disrupt the serving .next. Q10/Q11/live reads and release remain separately authorized. Historical migrations, missing authentic provider observations and mixed-version in-flight operations are not auto-repaired from guesses. Final evidence records exact checks and unresolved release gates.

Phase 4 T015-T017 is locally complete; see [implementation evidence](evidence/phase-4-implementation.md).
Earlier test-only/serial-gate notes are historical; the current implementation
amendment and task dependencies are authoritative. Phase 3 and release gates stay open.

**Current Phase 4 implementation scope — 2026-09-07:** Following the explicit request to complete Phase 4, T016 depends on accepted T005/T015 and T017 on T016. A source-based independent dependency review found the old T012 dependency represented serial shared-file/release acceptance, not a call dependency for quote admission. T012 remains required before T050; its installment evidence dependencies stay open. Preserve all installment/no-charge/fulfillment finalizers unchanged. Classify provider quote drift as an actionable review hold without refund/release/re-preparation. Reuse a small pure `shared/operations/package-quote.ts` contract for web/worker snapshot validation and a focused worker test seam when needed. New tests precede implementation; only synthetic local Q02-Q04 and mocked Q07 run. Earlier source-only and serial-gate notes below are historical to their respective slices.

**Phase 4 execution:** Author T015 regressions using the actual exported dispatch/queue/selection code with a test-only transpilation loader and explicit dependency doubles. Use the existing synthetic PostgreSQL fixture for persistence checks. This avoids creating a new production service solely for testing or importing live Redis/Prisma/auth/provider globals. T016/T017 wait for T012 acceptance. No runtime/schema mutation in this independent test slice. The existing FR-007 contract is concretized in the Phase 4 spec amendment.

**Promo-name amendment:** T016/T017 also own the source-confirmed stale-list, draft/applied-code and provider-rematch problems in [the promo review](evidence/phase-4-promo-name-review.md). Before runtime changes, author additional HTTP/worker and panel contract regressions; T015's accepted historical test scope is unchanged. Reuse the existing HTTP adapter, operation JSON and canonical lifecycle guards. Keep a quote snapshot with its revision, applied code and card context; name/index/WebForms controls are not stable cross-response product IDs. Changed offers invalidate selection and consent. A proven pre-sale conflict permits a fresh operation only after canonical closure; uncertain provider actions keep the current review barriers. COMPLETE_PURCHASE/final-pay identities remain immutable, and no schema change is included. No runtime work is authorized or accepted by this source-review amendment alone.

**Active scope: panel only.** Store and phone-app modifications are excluded. Panel UI, responsive browser behavior, and the shared services/workers required by panel operations remain. **54 active tasks / 18 accepted; 25 requirements / 14 audit items.** Retired IDs are not reused. [Scope amendment](evidence/panel-only-scope-amendment.md). Existing runtime code and historical evidence are preserved.

**Branch**: `034-web-project-memory` (preserved) | **Date**: 2026-09-07 | **Spec**: [spec.md](spec.md)
**Feature directory**: `specs/036-audit-remediation`
**Current status:** 18/54 accepted (T001-T006, T011, T015-T017, T059-T066). Local repair evidence is in [review-repairs.md](evidence/review-repairs.md); T007 and full provider/migration/build/release acceptance remain open.

## Summary

**Current Phase 3 design:** Execute T006–T012 in dependency order against the existing synthetic database. Lock card lifecycle before operation, derive ledger ownership under the operation lock, and compare replay evidence including owner/account/amount. Claim an installment mutation once before any payment HTTP request; duplicate/crashed submissions must never pay again. Normalize evidence against the exact claimed context and close money/status/points/reservations in one transaction. Generic provider success without attributable settlement stays UNKNOWN. Final no-charge renewal settlement requires the expected active verification, baseline and latest attempt, preserving positive evidence and refund vetoes. Supporting owned paths include HTTP result types/service for fenced submission, fixture cleanup, connected regression tests and shared financial helpers; no migration change is intended. All new runtime functions accept an isolated database dependency for behavioral tests. Focused verification and converge results are recorded in Phase 3 evidence before task acceptance.

**Current Phase 2 completion scope:** Execute T003-T005 Q02/focused Q04 on an empty, explicitly identified local synthetic database. Reuse the existing 0_init plus ordered migrations in an isolated byte-equivalent bundle, omitting the documented empty directory. Capture the foundation suite's pre-change failure after 33 migrations, then apply the three foundation migrations and rerun; no synthetic rows enter the work clone or snapshot. Correct only failures/gaps within the foundation, preserve schema/SQL history, verify fixture cleanup and update acceptance evidence. Full combined build and release rehearsal remain T051/T052. Existing checklists/contracts remain applicable; no new business policy or API is introduced.

**LOCAL-001 repair design:** Cast each existing pg_advisory_xact_lock result to text so Prisma can deserialize it. This preserves tagged parameterization, key hashes, order and transaction lifetime; do not remove locks. Reusing $queryRaw with a cast avoids changing narrow transaction interfaces and test doubles; switching to $executeRaw is an alternative with a larger interface impact. Inspect and adjust only the work-clone connection cap after checking cluster headroom. Regression runs real SQL through the installed Prisma/pg adapter, uses synthetic advisory keys, tests two-session exclusion/release and writes no business rows. No migration/API/UI contract changes or backfill are needed. Supplemental task evidence is independent of T003-T058 acceptance.

**Latest local trial permission — 2026-09-07:** The user requested local application startup. Generate the root client, use an isolated loopback Redis and the migrated work database, start Next dev on loopback, and perform bounded browser/HTTP smoke checks. Clear inherited provider settings, block external Node socket connections and leave provider workers stopped. This narrow operational exception supersedes older startup/generation restrictions below; no application source change, full suite acceptance or production action is implied.

**Current local database amendment (2026-09-07):** The separately authorized backup preparation described in [spec.md](spec.md) and [local-database-preparation.md](evidence/local-database-preparation.md) permits a local writable clone and existing migration application only. It overrides the original source-only DB/service restriction for that isolated operation; application execution, generation/tests/builds and task acceptance remain excluded. Root owns the local evidence. No new product behavior or dependency is added.

Extend the existing renewal, ledger, review, dispatch, auth, and maintenance components to address the fourteen active panel audit items. Preserve feature-035 payment/proof fencing. Resolve financial closure first, followed by checkout, administrative resolution, auth, background recovery, readiness, and consumer compatibility. The current authorized slice is T003–T005 source authoring only. Tests/builds, client generation, migration application, DB/Redis/provider access and services remain prohibited. Narrow schema compatibility includes the revision-0 dispatch selector and nullable report-owner DTOs, without enabling revised preparation or customer spend writers.

The spec states required outcomes. [research.md](research.md) records chosen approaches; [data-model.md](data-model.md) and [contracts/](contracts/) define the implementation contract. [audit-register.md](audit-register.md) maps the prior report to [tasks.md](tasks.md). [README.md](README.md) is the Arabic progress entry point.

## Planning Quality Standard

Every task has owned paths, dependencies, requirement IDs, Reason, Expected, Possible bugs, Fix/Mitigation, and an exact Verification reference. Test tasks precede risky behavior changes. Verification descriptions are future work: none is executed in this planning-only task. A task with absent runtime evidence stays unchecked, even if its code exists.

## Technical Context

- **Language/Version**: TypeScript 5.9; Next.js 16.1.1 / React 19.2.3; Prisma 7. Version authority: root and worker manifests.
- **Primary Dependencies**: Existing NextAuth panel auth, Prisma/PostgreSQL, Redis/BullMQ and HTTP beIN worker; no new framework or UI library.
- **Storage**: Existing shared PostgreSQL model in both Prisma schemas; Redis queues and leases; narrowly added durable claim/refund/effect records.
- **Testing**: Existing Node test runner with tsx, unit/contract/integration suites, disposable PostgreSQL/Redis gates, build/lint, browser and sanitized live checks only in later authorized stages.
- **Target Platform**: Windows development; Linux/PM2 production. Production contents/process state are unknown.
- **Project Type**: Role-based panel plus web panel APIs and separate worker package.
- **Performance Goals**: Maintenance defaults to batches of 50, never over 200, using due-time indexes and leases; financial transactions contain no external network wait. Recovery/effect attempts default to five total attempts (initial plus four retries at 5s/30s/2m/10m), then explicit review. Existing provider-payment single-attempt rules remain stricter.
- **Constraints**: Preserve pre-existing changes; minimal encoding-safe Phase 2 source authoring; no secrets; no test/build execution, client generation, migration application, DB/provider/service actions.
- **Scale/Scope**: Twenty audit items; eight user stories; thirty-one functional requirements. Whole-project regression means connected financial/auth consumers, not a new redesign or exhaustive unrelated refactor.

## Constitution Check

| Principle | Design evidence | Result |
| --- | --- | --- |
| I. Evidence-driven accounting | Funding-source ledger, provider/refund evidence, review decision matrix; no inferred refunds from uncertainty | PASS at design level |
| II. Traceable planning | AUD -> FR/US -> task -> exact path/check mapping and per-task detail blocks | Rechecked after tasks generation |
| III. Test-first risky behavior | Separate test/seam tasks before financial/state/auth changes; actual checks deferred by user boundary | PASS at design level |
| IV. Minimal encoding-safe edits | Reuse current helpers; apply_patch; future migrations only; no broad source rewrite | PASS at design level |
| V. Security/privacy | Current auth + ownership; sanitized evidence; no provider/session secrets in API/docs/logs | PASS at design level |

The constitution is unchanged. Checklists assess requirement quality, not test execution.

## Spec Kit workflow and preservation

- CLI inspected: Specify 0.12.17; Codex integration installed, zero missing managed files.
- Six existing shared managed files are customized: common/check-prerequisites/setup-plan scripts and checklist/plan/tasks templates. Inspected local behavior/templates are authoritative; no forced initialization or upgrade.
- Existing constitution retained. Specify -> ambiguity scan -> plan -> quality checklist -> tasks -> analyze is required; stop before implement/converge.
- The git hook's fetch/prune and branch creation are excluded under the existing workspace-preservation/planning-only boundary. Keep the dirty branch; change only the active feature pointer and documentation marker. Optional commit hooks are not run; git extension configuration already disables auto-commit.
- The inspected setup-plan command creates the new planning template only. Prerequisite commands read planning paths. No application scripts are run.
- Brainstorming alternatives: extend feature 035, create an isolated remediation feature, or rewrite the renewal architecture. Choose 036 because it tracks panel financial/auth work and preserves historical evidence; reject the rewrite as unnecessary risk.
- A bounded independent read-only design review may research financial constraints under the speckit-plan research step; root alone writes artifacts and owns integration.

## Existing System Checked

| Area | Existing components to extend | Required boundary |
| --- | --- | --- |
| Financial closure | `worker/src/utils/error-handler.ts`, `worker/src/lib/renewal-no-charge-finalization.ts`, `worker/src/lib/fulfillment-finalization.ts`, spend-ledger helpers | Canonical deduction, same account/invoice, latest evidence, atomic status |
| Panel offers | `src/lib/operation-dispatch.ts`, panel packages/select/apply-promo/confirm routes, selection planner, renew page, HTTP client/types and worker rematch | Quote revision and applied-code snapshot, preserved card context, no silent package substitution, replay-safe preparation and stable final payment |
| Panel review/refund | `src/lib/operations/manual-fulfillment-finalization.ts` and existing panel refund finalizers | Canonical panel deduction, legacy classification and idempotent closure |
| Auth | `src/lib/auth-utils.ts`, `src/app/api/operations` | Reuse central current-user validation; preserve each route's ownership checks |
| Maintenance | existing runner, dispatch watchdog, captured points repair, worker completion effects | One declared scheduler; bounded durable work; never repeat provider Pay |
| Rollout | both schemas, migration history, shared fulfillment config, live-smoke script, both PM2 configs | Existing data unknown; additive changes; real evidence; drained cutover |
| Consumers | renew/active pages, financial-review component, panel operation responses and locale catalogs | Compatible shapes, permitted actions, review versus settlement, RTL |
| Verification | root/worker tests, disposable database helper, CI and package scripts | Behavioral regressions, no source-regex-only proof of money/state correctness |

## Architecture and source of truth

Phase 4 caller inventory also finds final renewal confirmation in `src/app/dashboard/operations/active/page.tsx`. T017 must carry the same selected quote revision there; its installment branch remains unchanged. This is required contract compatibility within panel scope.

1. Operation is the authoritative panel business lifecycle. Reads project safe progress while panel selection/finalization transactions synchronize authoritative transitions.
2. Canonical panel deductions supply refundable amounts. Operation.amount alone is never a refund source.
3. Provider spend and fulfillment proof are separate. Preserve exact panel ownership, canonical spend and proof matching; customer attribution expansion is retired.
4. Share pure evidence classification between web and worker. Keep Prisma/network adapters at their runtime boundaries. Extract narrowly only when a direct behavioral test seam is absent.
5. Add dispatch action revision for repeatable preparation; preserve stable final-payment identity and durable mutation fencing. Freeze selected quote revision before deduction.
6. Panel refund/review uses existing canonical local finalizers and preserves existing conflict guards. New external refund orchestration is excluded.
7. Review capability is a server-derived decision matrix; the UI renders allowed actions and missing evidence. A missing legacy timestamp is not converted into a made-up modern timestamp.
8. Completion effects use a separate durable table keyed by operation/effect, linked to immutable completion snapshots. Reuse existing points award-run repair instead of paying points a second way.

## Implementation waves and dependencies

Phase 1's [consumer inventory](evidence/consumer-inventory.md) remains historical discovery. T028 covers panel collection authentication; T030/T031 reconcile panel producer admission with supported worker jobs; T041 covers panel worker/maintenance topology only. Excluded store/app consumers do not receive new implementation obligations.

- **Setup/foundation**: freeze audit baseline and contracts, establish behavioral seams and additive data model. No product behavior switch yet.
- **US1 financial closure**: installment settlement, latest-attempt finalization. These share worker files and execute sequentially.
- **US2 checkout**: panel offer revisions and authoritative selection/price; depends on foundation, serializes writes to shared dispatch/queue paths.
- **US3 panel reviews**: modern/pre-mutation/installment/legacy classification, canonical panel refunds and decision validation; T024-T026 follow panel offer handling.
- **US4 auth**: current user guards with route inventory and negative tests. Independent of financial behavior after foundation, but no automatic task delegation.
- **US5 background recovery**: generic dispatch/exhaustion, durable completion effects, metrics; depends on stable dispatch/refund identities.
- **US6 readiness**: account/attestation admission, compatibility classification, complete process topology, release runbook. No live action during coding-only phases.
- **US7 consumers**: localized panel review and refund-result projection; depends on the canonical state/auth contracts.
- **US8 release evidence**: CI selection, connected regressions, isolated rehearsal, web-consumer and live-provider evidence, and deployment decision.

US1 is the first demonstrable slice, not a standalone authorization to release the entire dirty tree. Every in-scope P1 defect and panel operational prerequisite must be resolved before release; improvement tasks remain individually tracked.

## Data and migration strategy

**Observed Phase 2 rehearsal:** 0_init is zero bytes and clean deployment fails on the next migration's missing OperationStatus. The synthetic acceptance database therefore used reference schema/migration metadata only, followed by six pre-foundation and three unchanged foundation migrations. No business data was imported. T040/T052 must repair/document fresh-install baseline provisioning and full deployment rehearsal; no historical SQL was rewritten. All three foundation migrations passed focused acceptance, and this result does not prove clean-install readiness.

See [data-model.md](data-model.md). The three Phase 2 migrations are authored and unapplied; earlier migration bytes are preserved. Determine the deployed migration history before any release sequence. The pre-existing directory `20260616120000_unique_refund_transaction_per_operation` has no local migration.sql; T040/T052 must establish its provenance before rehearsal or deployment. Do not fabricate or rewrite historical SQL.

Add nullable compatibility fields first, copy only verifiable identifiers/evidence, classify unresolved rows, then enforce strict new-write constraints. Do not invent historical panel deductions from today's balance, set automationExclusive globally, synthesize a final Pay timestamp, or delete conflicting aliases automatically. Deploy schema-compatible writers/readers together; drain old in-flight operations or route them through explicit legacy handling.

## Security and message contract

Panel web uses `getAuthenticatedUser` and current permissions; preserve owner/admin rules per route. Existing non-panel guards remain unchanged; foreign tokens cannot satisfy panel auth. Admin refund/legacy actions require an active ADMIN and an auditable decision. Every amount is derived and validated server-side.

Catalog keys, response codes, and field validation are defined in [contracts/consumer-api.md](contracts/consumer-api.md). Reuse existing components. New keys must exist in ar/en/bn. Panel responses exclude account identifiers, raw evidence, or stack traces.

## Verification and release gates

[quickstart.md](quickstart.md) defines Q01-Q12, their execution scope, commands, and expected evidence. Document-only checks may run now. Application tests/builds, isolated DB/Redis, browsers, live provider checks, and production actions must not run now. Later implementation alone cannot claim those gates passed.

A future release requires: zero unresolved P1 defects; all mandatory suites executed; financial invariants and source hashes reviewed; eligible accounts; valid real attestation or deliberately selected supported review mode; supported legacy web behavior; declared consumers/schedulers; migration preflight/rehearsal; and separately authorized operational execution.

## Risks and rejected shortcuts

- Do not disable guards to make blocked operations appear complete.
- Derive panel refunds from canonical panel deductions; preserve shared guards without extending excluded funding paths.
- Do not mark an outbox dispatched because queue submission was attempted; recover uncertainty with stable job identity.
- Do not perform provider I/O inside a locked financial transaction.
- Do not declare stale live attestation valid; stop new automatic admission and resolve in-flight evidence without payment replay.
- Do not call historical test records current evidence or equate checked planning checklists with a release pass.
- Financial-effect retries need unique constraints plus atomic application, not only a boolean in memory.

## Project Structure

```text
specs/036-audit-remediation/
  README.md
  audit-register.md
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/financial-lifecycle.md
  contracts/consumer-api.md
  contracts/jobs-and-release.md
  checklists/requirements.md
  checklists/safety-and-coverage.md
  tasks.md
```

Current runtime roots remain `src/app`, `src/components`, `src/lib`, `shared`, `prisma`, and `worker/src`. New source/model names in these documents are explicitly planned. The plan creates no new application package.

## Complexity Tracking

No constitution exception is requested. Existing foundation additions remain preserved. Future panel effect/review state is extended only where a durable cross-process decision cannot safely fit an existing record; reuse and extension are the default.

**Panel release boundary:** Acceptance covers this active panel scope only. Existing shared migrations and excluded consumer compatibility still constrain a safe combined deployment; retain their guards and report conflicts without adding store/app modifications or claiming those consumers verified.
