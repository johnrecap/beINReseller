# Feature Specification: Audit Remediation and Release Readiness

**Current extended quality — 2026-09-08:** **45/57 active tasks accepted.** T067-T069 complete; T051 quality improved and T052 history analyzed. 802 distinct unit and 221 distinct worker cases pass; four additional mocked-browser scenarios and isolated web/worker builds pass. In-scope lint has zero errors; full lint retains seven errors in excluded mobile/customer files. Database baseline, provider evidence and release gates remain open. [Current verification](evidence/extended-quality-verification.md). Earlier counts below are historical.

## Extended local quality and connected audit — 2026-09-08

The maintainer authorized fixing remaining web/shared-worker quality issues and analyzing connected code beyond the previously accepted tasks, without subagents. Execute T051 quality corrections and source-only T052 migration-provenance research; record additional confirmed defects as T067 onward before implementation. Current concrete extensions are export-table measurement/identity, manager dashboard data loading/DTO consistency and maintenance cycle ownership. Preserve financial policy, canonical provider fences and the panel-only boundary. Do not edit excluded mobile/store code or enable deferred installment/final-cart/provider adapters. No production access, external provider calls, commit/push or historical migration rewrite. Run local source/type/unit checks and isolated browser/Redis/DB checks only as needed for verified changes.

## Local backlog execution authorization — 2026-09-08

The maintainer approved the reviewed implementation sequence in this task, without subagents: reconcile existing task descriptions/dependencies; complete panel auth and dispatch regression coverage; implement review capabilities and panel presentation; persist/recover completion effects; implement local account-readiness, compatibility/preflight and topology/runbook work; run connected regressions and isolated builds. Reuse completed T059-T066 repairs and preserve existing IDs.

Current local scope: T024-T036, T039-T045, T048-T051 and the locally executable portions of T052/T054/T058. T007/T008 attributable installment observation and the final-provider-cart evidence gap remain temporarily deferred by the user. T037/T038 real-provider adapter work and T053/T055-T057 external/preflight/deployment execution are outside this sequence. Local evidence must not accept those deferred gates. T012's existing renewal finalizer may be regression-verified independently; no installment evidence is fabricated.

Installment review classification remains a precise hold using its existing evidence; no new installment completion/refund authority is introduced while its observation work is deferred. Legacy panel review actions require the outcome-specific evidence in `contracts/financial-lifecycle.md`. Local unknowns remain explicit blockers rather than guessed data. Tests use only synthetic disposable database/Redis resources and mocked provider transport. Never use restored/interactive data for fixtures, edit historical migrations, enable accounts in bulk, or build over a running Next output. Store and phone-app modifications remain excluded. No commit, push, live provider call or production action is authorized.

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

## Review repair authorization — 2026-09-08

The maintainer requests implementing the preceding review findings in the current task, without subagents. T059-T066 define this repair slice and supersede older source-only restrictions for its local tests, isolated synthetic verification and static/build checks. Production, restored/interactive databases and real provider traffic remain excluded. Store/phone modifications remain excluded; preserve their existing shared compatibility.

Reopen T016/T017 acceptance for cross-worker continuation, actionable pre-sale quote conflict and network timeout gaps. Keep prior evidence as historical. The following observable requirements refine existing FR-003/007/011/012/013/014/015/016/018/025/026/029; they do not relax provider proof:

1. A completed preparation stage explicitly hands off its exact account lock; another worker may continue the same operation only after that handoff. A running or foreign owner is never stolen; competing continuations still have one execution lease.
2. A worker-detected quote conflict may close and release reservations only with a fenced, durable pre-sale observation plus no payment, deduction, spend, proof or conflicting dispatch. Unknown or contradictory evidence retains review. No receipt/refund is fabricated. This narrowly supersedes the earlier unconditional quote-hold prohibition on closure.
3. Every panel operation request uses the existing current-user/session guard and retains its existing ownership and ADMIN exceptions. Disabled/deleted/revoked users cannot create side effects.
4. Unsupported card CHECK_BALANCE requests are rejected before debit. Maintenance recovers all admitted outbox types with stable identities and explicit bounded exhaustion; final payment is never replayed.
5. Promo request/polling waits terminate even when a network request never resolves, preserving an uncertain request's identity for retry. Required review notes match server length/whitespace validation in all supported locales.
6. Include new regression suites in CI and repair source type errors. Migration history, provider settlement/cart evidence, account opt-in, old quote snapshots and live attestation remain explicit release gates when authentic evidence is unavailable; local synthetic success cannot certify them.

Clarification: the review's suggested fixes are approved; no further product decision is needed for the conservative, existing-component repair. Evidence-dependent installment completion is not replaced with a generic HTTP-success assumption.

**Feature Branch**: `034-web-project-memory` (preserved working branch; feature directory is independent)

**Created**: 2026-09-07

**Current status:** 18/54 accepted (T001-T006, T011, T015-T017, T059-T066). Local repair evidence is in [review-repairs.md](evidence/review-repairs.md); T007 and full provider/migration/build/release acceptance remain open.

**Input**: Create a complete Spec Kit plan for the preceding read-only review, with exact changes and progress tracking.

**T015 database authorization and result — 2026-09-07:** After the isolation/data explanation, the maintainer explicitly approved the synthetic test. Q04 executed on the existing dedicated loopback test database: seven cases, one pass and six reproduced pre-fix failures, zero skips; all 71 business tables had zero rows before and after. T015 test authoring is accepted from Q02/Q04 evidence; this does not accept T016/T017 behavior. No runtime source or migration changed. See [Phase 4 evidence](evidence/phase-4-verification.md).

## Phase 4 execution amendment — 2026-09-07

**Completion:** T015-T017 accepted with local/synthetic evidence in
[Phase 4 implementation](evidence/phase-4-implementation.md). No provider or
production acceptance is implied. Earlier test-only/dependency statements below
are historical and superseded by the explicit implementation amendment.

**Implementation authorization and dependency correction — 2026-09-07:** The maintainer now requests completing Phase 4, including the reviewed promo-name problems. Independent source analysis confirms that T007 installment observations and T012 post-payment no-charge settlement are not prerequisites of promo/quote admission. Execute T016 after T005/T015 and T017 after T016, using synthetic Q02-Q04 and mocked browser Q07 checks. Keep T007/T008/T012 unaccepted and require T012 before combined release verification T050. This supersedes the earlier serial execution gate below, not any financial evidence requirement. Preserve installment/no-charge finalizers and mutation/proof barriers. Package drift remains a precise review hold; this slice must not refund, release reservations, force FAILED, or repeat COMPLETE_PURCHASE to make a restart possible. No live provider/worker/payment, restored/interactive database, schema migration or production action is included.

The maintainer requests Phase 4 / T015-T017 for panel only. T015 depends only on accepted T005 and may author/run focused Q02/Q04 regressions on the existing dedicated synthetic local database, with queue/provider/auth doubles. A test-only module loader may isolate existing exports without importing runtime services. No schema, production, provider, interactive database or service change is authorized by this test slice. T016 still depends on unaccepted T012; T017 depends on T016. Do not bypass those gates or call test failures a completed behavior fix.

The planned preparation payload uses `actionRevision`; final payment accepts only zero/omitted revision. The planned panel selection request carries `quoteRevision` matching the authoritative package revision in operation response data; a stale or still-refreshing quote must conflict before state/dispatch/deduction changes. This concretizes FR-007 without enabling any runtime field.

**Promo-name review amendment — 2026-09-07:** The maintainer reports package names changing after applying a promo and sometimes changing again later. Extend the unfinished T016/T017 acceptance to the entire authoritative offer (name, price, applied code and card context), delayed responses, draft-code edits and provider reload drift. This is a source review and planning amendment, not a runtime fix or live-provider observation. T015's completed evidence retains its original scope; the additional regressions belong to T016/T017. Existing dependency gates and the 8/46 count remain. See [promo review](evidence/phase-4-promo-name-review.md).

## Scope and evidence boundary

**Panel-only scope amendment — 2026-09-07:** The maintainer excludes store modifications as well as phone-app work. Active delivery targets the reseller/admin web panel and its required shared services/workers, including responsive web. Retire T009/T010/T013/T014/T018-T023 in addition to T046/T047; retire FR-004/FR-006/FR-008/FR-009/FR-010 in addition to FR-023, and AUD-001/AUD-003/AUD-004/AUD-009/AUD-017 in addition to AUD-015. T009 retains its historical completed evidence outside active progress; no existing code, tests, migrations or guards are reverted. Active totals: 46 tasks, 8 accepted, 25 requirements, 14 audit items. See [scope amendment](evidence/panel-only-scope-amendment.md). Store fixes, Stripe integration, customer-worker enablement and app availability are not panel delivery obligations. Any shared-source compatibility issue is reported without silently reintroducing excluded work.

**Phase 3 authorization — 2026-09-07:** Implement US1 / T006–T012, with failing-first focused unit and synthetic local PostgreSQL regressions. Preserve the snapshot, interactive database and stopped provider workers. No real provider/payment calls, deployment or full release claim. Exact installment evidence remains mandatory: a balance decrease or generic HTTP success is not an attributable settlement receipt. Legacy/ambiguous evidence holds for review. This supersedes older scope restrictions for these seven tasks only.

**Phase 2 completion authorization — 2026-09-07:** The maintainer explicitly requested finishing Foundation after discussing executable verification. T003-T005 now include Q02 and focused Q04 execution, fixes within their owned scope, safe client/schema checks and a separate synthetic local PostgreSQL database. Verify expected pre-foundation failure against the first 33 migrations, then apply the three unchanged foundation migrations and verify the completed model/fixtures. Preserve the snapshot, interactive work database, external isolation and historical migration files. This supersedes older source-only/test restrictions for Phase 2 only; T006 onward, full release builds, live workers/providers and deployment remain outside this request.

**Local defect repair amendment — 2026-09-07:** The maintainer reported Server error while starting renewal during the authorized trial. Supplemental LOCAL-001 covers the reproduced Prisma P2010 void-result failure in the four existing advisory-lock call sites and the local clone's P2037 connection cap. Preserve lock keys/order/transaction scope, all financial semantics, schema and external isolation. Acceptance requires a failing-before/passing-after real local Prisma lock test, concurrent exclusion/release evidence and local connection-cap verification. Only these focused tests and local environment repairs are authorized; the original 58-task acceptance count is separate.

**Local interactive trial amendment — 2026-09-07:** The maintainer now explicitly requests running the project locally for manual testing. This authorizes root Prisma client generation, an isolated local Redis/Memurai instance, Next.js development startup bound to loopback against the writable work database, and bounded browser/HTTP smoke verification. External server connections must be blocked and real beIN/payment/notification workers must not start. Existing snapshot and production remain untouched. This supersedes earlier local-startup/generation prohibitions only for this trial; it does not accept remediation tasks or authorize deployment/full test suites.

**Local database amendment — 2026-09-07:** After supplying the backup and asking for the missing database updates, the maintainer authorized isolated local preparation: retain the restored read-only snapshot, create a separate writable clone, and apply the existing nine pending SQL migrations using Prisma. The preparation also reasserts the three missing canonical unique-index statements from the existing historical SQL on the clone after zero-duplicate checks; original data/history/files remain intact. This narrowly supersedes the DB/service/migration prohibition in the original source-authoring slice below. No new runtime source, application tests/builds, generated clients, app/worker/provider/Redis execution or production access is authorized by this preparation. No task is accepted merely because schema application succeeds. See [local database preparation](evidence/local-database-preparation.md).

This feature addresses fourteen active panel findings, compatibility risks, and follow-ups from the original twenty-item audit (excluded IDs are recorded above) in [audit-register.md](audit-register.md). The baseline is local commit `7457b7028811759736faa799a8b06b43691b1218` plus 188 pre-existing changed/untracked files. It is not a production snapshot. Feature 035 remains the historical source of fulfillment-proof work; feature 036 owns the cross-system remediation backlog and does not retroactively mark feature 035 checks as passed.

Phase 1 / T001–T002 is complete. On 2026-09-07 the maintainer authorized Phase 2 / T003–T005 source authoring: test seams, synthetic fixtures, synchronized Prisma models and three new migrations. Narrow compatibility edits include the existing dispatch selector fixed at revision 0 and nullable report-owner DTOs. No tests/builds, client generation, migration application, DB/Redis/provider connections, services or deployment may run. Read-only source/document checks are permitted. T006–T058 remain outside this slice. Authored upstream artifacts may feed subsequent authoring within Phase 2; task acceptance remains pending required runtime evidence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct financial closure (Priority: P1)

A panel reseller receives a result that agrees with the real payment and renewal evidence, including installment failures and delayed verification.

**Why this priority**: An incorrect terminal result can strand money or cause an unsafe second renewal.

**Independent Test**: Later, in an isolated environment, exercise success, confirmed rejection, uncertainty, retries, and crashes for panel-user ownership.

**Acceptance Scenarios**:

1. **Given** a deducted installment with authoritative evidence of non-payment, **When** it is closed, **Then** the exact original deduction is returned once and the failed result is committed with that refund.
2. **Given** uncertain provider payment, **When** a timeout or retry occurs, **Then** no refund or second payment is inferred from uncertainty.
3. **Given** an incomplete verification followed by the final complete negative check, **When** settlement is evaluated, **Then** the latest authoritative evidence controls the decision; stale presentation fields do not create a false conflict.
4. **Given** a provider debit for an installment but no attributable evidence that the installment was settled, **When** completion is evaluated, **Then** it remains under review without another payment or automatic refund; an attributable settlement receipt permits replay-safe completion.

### User Story 2 - Panel package selection and repeatable offers (Priority: P1)

A panel reseller can change an offer, see the authoritative package price, and confirm the current selection without leaving the operation waiting forever.

**Why this priority**: These failures interrupt the normal purchase path.

**Independent Test**: Exercise start, package discovery, selection, repeated offer changes, duplicate requests, and stale-price rejection as complete journeys.

**Acceptance Scenarios**:

1. **Given** an applied offer, **When** the owner submits a different offer, **Then** a distinct preparation attempt updates prices; resubmitting the same request has no duplicate effect.
2. **Given** two competing selections or an outdated price, **When** they are submitted, **Then** only one valid selection becomes payable and the other receives an actionable conflict.
3. **Given** a delayed promo response containing old packages, **When** application is still pending, **Then** the panel shows pending state, prevents selection/confirmation, and follows the current request until an authoritative result or explicit timeout; it never announces success from the old list.
4. **Given** an applied promo, **When** the user edits or clears the input without applying the change, **Then** the displayed offer and payable code stay bound to the accepted offer; the draft cannot silently replace the applied code.
5. **Given** a new provider offer changes names, prices or row ordering, **When** the panel refreshes it, **Then** the old selection and consent expire and the user chooses from the new offer. A later worker reload must not substitute another package using a stale row position or a similar name.
6. **Given** an unavailable, ambiguous or changed package during preparation, **When** execution cannot preserve the accepted offer, **Then** it stops before adding that substitute to the provider cart and reports the reason. A safe restart requires positively established pre-sale state and canonical closure; uncertain provider actions remain under review. Existing payment identities and fulfillment-proof requirements remain intact.
7. **Given** a promo reload or an IRDETO card, **When** the adapter recovers a package list, **Then** it preserves the card context and does not call the promo applied merely because a nonempty ordinary list was returned.

### User Story 3 - Resolve refunds and historical reviews (Priority: P1)

An administrator can resolve supported failed or historical operations using explicit evidence and can see why an unresolved case is held.

**Why this priority**: A review state without a usable exit can indefinitely hold money and cards.

**Independent Test**: Exercise panel deductions/refunds, modern and legacy evidence, installments, concurrent decisions and duplicate decision replay in isolation.

**Acceptance Scenarios**:

1. **Given** a safely refundable failed panel renewal, **When** an administrator closes it, **Then** only the canonical original panel deduction is returned once and financial closure is atomic.
2. **Given** a repeated or concurrent panel refund decision, **When** it is processed, **Then** money and reservation release are not repeated.
3. **Given** a historical operation missing new evidence fields, **When** it is reviewed, **Then** it is classified by available evidence; missing fields neither fabricate proof nor eliminate every supported resolution path.
4. **Given** required decision notes or unavailable actions, **When** the review form is shown, **Then** requirements and reasons are visible before submission and agree with server validation.

### User Story 4 - Enforce current access (Priority: P1)

An administrator's account disablement, permission change, or password reset takes effect on subsequent protected operation requests.

**Why this priority**: Old session claims must not authorize new financial actions.

**Independent Test**: Use web sessions issued before each access change, plus cross-owner and web-customer-token negative cases.

**Acceptance Scenarios**:

1. **Given** a disabled account or revoked session, **When** it calls any protected operation action, **Then** access is denied before an operation or financial effect is created.
2. **Given** a changed role, **When** an existing session requests an action, **Then** current permissions and ownership determine access.
3. **Given** a customer credential, **When** it accesses panel-only actions, **Then** it cannot be interpreted as a panel user's identity.

### User Story 5 - Recover background work (Priority: P1)

Operations recover from queue outages and worker interruption without repeating provider payment or silently losing completion effects.

**Why this priority**: Saving work for retry is useful only when a running process actually recovers it.

**Independent Test**: Exercise failure before/after queue delivery, worker crashes after financial commit, exhausted retries, and duplicate consumers.

**Acceptance Scenarios**:

1. **Given** a recoverable unsent operation step, **When** dispatch becomes available, **Then** maintenance either delivers it within its bounded retry policy or records an actionable terminal delivery failure.
2. **Given** uncertain delivery, **When** recovery repeats dispatch, **Then** duplicate queue delivery cannot repeat provider payment.
3. **Given** committed completion followed by process failure, **When** maintenance resumes, **Then** required notifications and counters are eventually applied once; existing points snapshots are preserved.

### User Story 6 - Controlled activation and migration (Priority: P1)

An operator can prepare compatible accounts, historical data, verification evidence, and services before admitting the new release.

**Why this priority**: Default configuration or incompatible data can stop otherwise valid flows immediately after deployment.

**Independent Test**: Rehearse a release against synthetic old/new data and disposable services; live observations remain a separate authorized operational stage.

**Acceptance Scenarios**:

1. **Given** no eligible automation accounts, **When** readiness is assessed, **Then** it reports the unavailable capability before panel/provider debit; it does not silently enable every account.
2. **Given** missing, expired, or release-mismatched verification evidence, **When** automatic mode is requested, **Then** effective mode and blocking reason are explicit and no automatic proof is invented.
3. **Given** duplicate account identities or historical panel deductions without a ledger, **When** compatibility is assessed, **Then** affected records are classified with a safe remediation route before migration/admission.
4. **Given** a required queue or maintenance task, **When** release readiness is evaluated, **Then** a matching declared consumer/scheduler and expected health signal exist.

### User Story 7 - Consistent panel experience (Priority: P2)

Panel users and staff see the same meaningful operation result and have a supported renewal entry point.

**Why this priority**: An operation under review must not look as though it is still progressing normally.

**Independent Test**: Compare panel contracts and UI states using deterministic responses, all supported locales, keyboard navigation, narrow screens, and RTL.

**Acceptance Scenarios**:

1. **Given** a review or pending refund, **When** any consumer reads progress, **Then** it shows the review/settlement state, a safe reason, and the permitted next action rather than indefinite ordinary processing.
2. **Given** validation, loading, success, conflict, or failure, **When** displayed, **Then** labels and messages are localized and action availability matches server permissions.

### User Story 8 - Traceable delivery and release evidence (Priority: P1)

The maintainer can track every reviewed issue to requirements, tasks, changed files, and evidence, and distinguish planned work from verified delivery.

**Why this priority**: This is the user's explicit tracking goal and the release gate for all other stories.

**Independent Test**: Inspect the cross-reference matrix, task evidence, prerequisite graph, release decision, and unchanged-source boundary.

**Acceptance Scenarios**:

1. **Given** any registered finding, **When** the maintainer opens the tracker, **Then** its classification, implementation tasks, acceptance criteria, and remaining evidence are identifiable.
2. **Given** a new test file, **When** the release evidence is assembled, **Then** required suites are actually selected by the automated workflow and skipped integration cases are not called passed.
3. **Given** shared financial or permission changes, **When** release validation occurs, **Then** connected points, commissions, debt, transfers, reports, signals, and bulk consumers receive proportionate regression coverage.
4. **Given** incomplete operational authorization or evidence, **When** reporting progress, **Then** planning can be complete while implementation/release tasks remain visibly incomplete.

### Edge Cases

- Concurrent selection, offer replacement, duplicate panel decisions, refund racing dispatch, and crash after an external effect but before recording its result.
- Provider rejection versus ambiguous response; first failed scan followed by complete absence; repeated invoice; stale ownership/lease; old evidence outside the accepted observation window.
- Empty account pool, expired attestation during an in-flight operation, Redis outage, stopped panel worker, exhausted retries.
- Legacy rows with null evidence, conflicting account aliases, missing panel deduction history, existing completed/refunded records, and currency rounding.
- Disabled/deleted actor, demoted role, cross-owner IDs, panel/customer token confusion, and UI capability drift.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every audit item MUST have a stable identity, evidence classification, affected journey, acceptance mapping, and tracked tasks.
- **FR-002**: Confirmed failed installments MUST refund the canonical original deduction once and commit the failed result with financial closure.
- **FR-003**: Uncertain provider execution MUST NOT cause a repeated payment, automatic refund, or unsupported completion.
- **FR-005**: Settlement MUST evaluate the latest locked verification evidence and reject genuine conflicting evidence without rejecting solely stale derived state.
- **FR-007**: Repeatable preparation actions MUST distinguish a new revision from a replay, reject stale selections, and never reuse that flexibility for final payment.
- **FR-007 clarification (promo review)**: An accepted offer binds package identity within its captured list, provider display name, price/currency, applied promo and card context. Draft input, pending/failed refreshes and later provider drift cannot silently change consent. Name equality, row index and WebForms field names alone do not establish identity across provider responses.
- **FR-011**: Reviews MUST classify modern, pre-payment, installment, and legacy evidence and expose supported resolution actions or a precise evidence hold; absent facts MUST NOT be fabricated.
- **FR-012**: Required decision notes and evidence MUST agree between forms, capability responses, and server validation.
- **FR-013**: Protected operation reads and writes MUST enforce current actor activity, session revocation, and current permission claims.
- **FR-014**: Authentication consolidation MUST preserve resource ownership and panel credential boundaries against foreign token types, without weakening existing shared authorization guards.
- **FR-015**: Every supported dispatch type MUST have a bounded recovery route, scheduler ownership, and exhaustion outcome.
- **FR-015 clarification (Phase 1 evidence)**: A legacy producer admitting a type absent from the worker switch must not continue to debit and submit unsupported work. T030/T031 must reconcile the admission/handler contract and reject unsupported input before financial effects; do not infer that CHECK_BALANCE and CHECK_ACCOUNT_BALANCE have equivalent business meaning.
- **FR-016**: Dispatch recovery MUST tolerate uncertain delivery and concurrent consumers without replaying final provider mutation.
- **FR-017**: Required post-completion effects MUST survive crashes and be idempotent, preserving historical points/ownership snapshots.
- **FR-018**: Account readiness MUST report eligibility and unavailable capabilities without automatically asserting exclusivity for historical accounts.
- **FR-019**: Verification activation MUST use real sanitized evidence tied to the release, explicit expiry handling, and visible requested/effective modes.
- **FR-020**: Compatibility planning MUST classify old evidence, duplicate identities, missing panel deduction history, and invalid balances without altering already-applied migration history or inventing ledger movements.
- **FR-021**: Deployment configuration MUST identify consumers, maintenance schedules, queue ownership, process counts, and health evidence consistently.
- **FR-022**: Panel progress MUST distinguish review, execution, settlement pending, refund, success, and failure, with safe reasons and allowed actions.
- **FR-024**: Changed user-facing states MUST reuse the Arabic, English, and Bengali message catalogs and provide accessible responsive/RTL interactions.
- **FR-025**: Risky behavior MUST receive failing regression cases before implementation where possible, plus isolated integration evidence; a skipped or unrun check MUST remain unverified.
- **FR-026**: Release planning MUST preserve active traffic/artifacts, drain in-flight financial work safely, use forward-compatible migration steps, and define rollback limits.
- **FR-027**: Connected points, commissions, debt, transfers, reports, signals, and bulk operations MUST retain their accounting/ownership meaning under these changes.
- **FR-028**: New evidence and diagnostics MUST exclude credentials, session material, raw provider payloads, and private payment data.
- **FR-029**: Recovery and evidence collection MUST be bounded and resumable, with observable oldest-pending age, attempts, and non-sensitive failure reasons.
- **FR-030**: All runtime tests, disposable-service checks, live verification, data remediation, and deployment MUST remain unexecuted in this planning task; later execution requires scope-appropriate authorization.
- **FR-031**: Tracking MUST distinguish planning, implementation, verification, and release; checked tasks require evidence and the complete intended release must include its new files and migrations.

### Key Entities

- **Operation**: owner, renewal purpose, provider payment, fulfillment evidence, business result, and reservations.
- **Payment selection claim**: fixed package/price revision, owner, creation/deadline, and linked payment.
- **Financial settlement**: canonical panel deduction, replay-safe local refund, provider execution evidence and supported review outcome.
- **Review classification**: evidence family, eligible actions, unmet evidence, actor, and decision note.
- **Dispatch/effect record**: logical action identity, attempt/revision, lease, delivery/result, and retry deadline.
- **Readiness evidence**: account eligibility, release verification, historical compatibility, topology, and release decision.
- **Audit item and task evidence**: stable finding/requirement/task links, status, source pointers, and verification boundary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All fourteen active registered findings have at least one task and acceptance reference; no implementation task is completed by planning alone.
- **SC-002**: Every defined duplicate/crash financial scenario produces at most one debit, one permitted refund per funding source, and no contradictory terminal result.
- **SC-003**: Every defined fresh-checkout, offer-replacement, and abandoned-claim scenario reaches its expected next state or documented recovery outcome.
- **SC-004**: All defined revoked-session and cross-owner scenarios deny access before financial or operation effects.
- **SC-005**: Each recoverable delivery/effect scenario reaches delivery or explicit exhaustion within the configured bound; none silently disappears.
- **SC-006**: Every review/evidence class has a supported action or a precise evidence hold; no unresolved case is displayed as ordinary successful progress.
- **SC-007**: All eight story acceptance sets and mandatory release checks have recorded outcomes before release; skipped checks remain release gaps.
- **SC-008**: Planning changes zero application/runtime files and performs zero application/database/provider executions.

## Assumptions and clarification outcome

- The initial deliverable was the complete plan. Phase 1 is complete; the accepted slice is Phase 2 / T003–T005 source authoring only. Earlier execution prohibitions persist.
- Reuse existing components and financial services; add only narrow models/adapters where current contracts cannot express required state.
- Preserve the current dirty branch and all pre-existing changes; do not commit, push, fetch, or run the branch-creation hook during this planning-only handoff. Spec Kit's active-document pointer may be updated for tracking.
- Safe financial guards from feature 035 remain invariants. Store and phone-app modifications are excluded by the panel-only scope amendment.
- Production inventory remains unknown and needs its existing authorized evidence gates. Store or phone-app availability does not gate this panel feature.
- No blocking product clarification remains. Unknown live facts are named execution prerequisites, not invented answers.

## Non-goals

No redesign, framework replacement, new UI library, changed commercial pricing/commission policy, broad ledger conversion, automatic cleanup of historical money, production access, or actual release in this task. Existing feature-034/035 tasks and historical verification are not rewritten as completed remediation.

**Panel release boundary:** Acceptance covers this active panel scope only. Existing shared migrations and excluded consumer compatibility still constrain a safe combined deployment; retain their guards and report conflicts without adding store/app modifications or claiming those consumers verified.
