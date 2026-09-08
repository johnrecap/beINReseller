# Tasks: Audit Remediation and Release Readiness

**Current extended quality — 2026-09-08:** **45/57 active tasks accepted.** T067-T069 complete; T051 quality improved and T052 history analyzed. 802 distinct unit and 221 distinct worker cases pass; four additional mocked-browser scenarios and isolated web/worker builds pass. In-scope lint has zero errors; full lint retains seven errors in excluded mobile/customer files. Database baseline, provider evidence and release gates remain open. [Current verification](evidence/extended-quality-verification.md). Earlier counts below are historical.

## Extended local findings

- [x] T067 Fix renewal export table identity and scaled-height measurement — `src/components/renewal/BeINExportTable.tsx`; `output/playwright/quality-export-smoke.cjs`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE**: Before/after regression, types, lint and applicable browser/config checks pass. [Extended quality verification](evidence/extended-quality-verification.md).
  - **Requirements**: FR-024, FR-025, FR-027. **Depends on**: T050. **Owner**: current-task implementer.
  - **Reason**: TableContent is recreated during render; getBoundingClientRect already contains scale, then container applies scale a second time.
  - **Expected**: Stable rendered table content; visible container fits scaled content after contract/viewport changes while export stays full size.
  - **Possible bugs / mitigation**: Regress screenshot layout or crop rows; preserve existing table markup and test real geometry at 360/768/1280.
  - **Verification**: Browser before/after geometry/identity and export copy, focused lint/types.

- [x] T068 Repair manager dashboard page/service contract — `src/app/dashboard/manager/page.tsx`; `src/app/api/manager/dashboard/route.ts`; `src/lib/manager-dashboard.ts`; `src/components/manager/ManagerPageContent.tsx`; `src/components/manager/ManagerActionsLog.tsx`; `tests/unit/manager-dashboard-contract.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE**: Before/after regression, types, lint and applicable browser/config checks pass. [Extended quality verification](evidence/extended-quality-verification.md).
  - **Requirements**: FR-013, FR-014, FR-025, FR-027. **Depends on**: T029. **Owner**: current-task implementer.
  - **Reason**: Page self-fetch assumes HTTPS for 127.0.0.1 and trusts Host; API returns _count.operations while UI reads operationsCount.
  - **Expected**: Reuse one guarded server query from page/API with typed serializable DTO and correct non-deleted user/count projection, retaining inactive users.
  - **Possible bugs / mitigation**: Change ADMIN scope or action history visibility; retain current role/owner semantics and response fields, test scoped queries and results.
  - **Verification**: Actual service/page boundary tests; wrong owner/current role regressions; types/lint.

- [x] T069 Prevent overlapping maintenance cycles and premature shutdown — `src/lib/maintenance/operation-maintenance-runner.ts`; `ecosystem.config.js`; `tests/unit/maintenance-runner-lifecycle.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE**: Before/after regression, types, lint and applicable browser/config checks pass. [Extended quality verification](evidence/extended-quality-verification.md).
  - **Requirements**: FR-015, FR-017, FR-025, FR-029. **Depends on**: T034. **Owner**: current-task implementer.
  - **Reason**: A runner reuses one token across cycles; a cycle lasting beyond TTL can overlap another local cycle and delete its lease; shutdown currently closes connections before active work finishes.
  - **Expected**: Per-cycle tokens, one active cycle per process and graceful drain; keep existing row CAS/idempotency protection across separate processes.
  - **Connected refinement**: Configure a bounded five-minute PM2 drain window for maintenance; a forced stop after that bound still relies on durable recovery. Do not claim unbounded graceful shutdown.
  - **Possible bugs / mitigation**: Timer survives shutdown or locks leak after failure; fake timers and controlled promises verify all exits without live services.
  - **Verification**: Actual runner lifecycle tests for long cycles, failure, distinct tokens and shutdown ordering; existing maintenance/dispatch regressions.

**Historical local backlog — 2026-09-08:** **42/54 active tasks accepted.** T012, T024-T036, T039-T045 and T048-T050 completed locally without subagents. 790 unit and 218 worker tests pass; the integration matrix has 178 distinct passing cases including final follow-ups; 22 mocked-browser groups pass. Isolated builds/types and focused lint pass. Full lint/CI, attributable installment/final-cart evidence, migration provenance and live release gates remain open. [Current verification](evidence/local-backlog-verification.md). Earlier dated counts below are historical.

**Current execution — 2026-09-08:** The maintainer approved the local backlog sequence without subagents. Execute T027-T031 first, then T024-T026/T043-T045, T032-T036, T039-T042 and T048-T051, respecting the corrected dependencies below; T012 may receive independent renewal-only verification. Record local portions of T052/T054/T058 without accepting deferred release gates. The order of shared-file edits is sequential. T007/T008 and final-provider-cart evidence remain deferred; T037/T038 and external T053/T055-T057 are not in this sequence. See [local contract](contracts/local-backlog.md). Previous counts remain historical until each new result is verified.

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

**Active scope: panel only.** Store and phone-app modifications are excluded. Panel UI, responsive browser behavior, and the shared services/workers required by panel operations remain. **54 active tasks / 18 accepted; 25 requirements / 14 audit items.** Retired IDs are not reused. [Scope amendment](evidence/panel-only-scope-amendment.md). Existing runtime code and historical evidence are preserved.

**Current request — 2026-09-08:** Review repairs T059-T066 completed sequentially without subagents. T016/T017 were reopened and reaccepted using the current repair evidence. Existing task IDs and historical evidence are preserved. These bounded repairs do not accept the broader legacy-review, effects, live-provider or release backlog. See [review repair contract](contracts/review-repairs.md).

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

**Current authorization — Phase 2 completion:** Finish T003-T005 including focused Q02/Q04 execution and necessary foundation corrections on a newly created synthetic local test database. Preserve existing local databases and external isolation. This overrides historical source-only restrictions below for these three tasks; full Q06/Q09 release work and T006 onward remain separate. Capture pre-foundation failure, migrated success and cleanup before checking tasks off.

## Supplemental local trial repair

- [x] LOCAL-001 Repair observed renewal startup failure — `src/lib/operations/renewal-creation-guard.ts`; `src/lib/operations/card-lifecycle-reservation.ts`; `src/lib/renewal-payment-refund-finalization.ts`; `worker/src/lib/provider-account-reservation.ts`; `tests/integration/local-advisory-lock-compatibility.test.ts`; local work-clone connection cap.
  - **Requirements**: Local defect repair amendment; preserves FR-001/FR-025/FR-027. **Depends on**: completed local trial setup; independent of unaccepted financial redesign. **Owner**: current-task implementer.
  - **Reason**: Actual startup logs reproduce P2010 for a PostgreSQL void result; concurrent page requests also hit the local database connection limit.
  - **Expected**: Existing locks execute through Prisma without deserialization failure and retain mutual exclusion; local page requests have bounded connection headroom.
  - **Possible bugs**: Accidentally dropping a lock, changing key/order/lifetime, masking unrelated errors or enabling provider work.
  - **Fix/Mitigation**: Text-cast only the existing lock result; inspect local cap before adjusting; retain network guard and stopped workers. No business-row rewrites or historical migration changes.
  - **Verification**: Author and run the focused local advisory-lock regression before/after; assert contention and release via two real connections; inspect local database cap and current session counts; record evidence in `evidence/local-database-preparation.md`. No full suite/build or real renewal is accepted. This supplemental ID is outside the original 58-task denominator.
  - **Evidence — 2026-09-07 / COMPLETE**: Before: focused real Prisma test failed P2010/void. After: all four SQL sites execute and preserve cross-connection exclusion and release; test PASS. Eight existing renewal guard/refund unit cases PASS. Local clone cap verified 6 before, 40 after (cluster max 100). No customer rows were written by the regression, no workers or external services started. Source SQL lock keys/order remain unchanged. Narrow converge review appended no further repair tasks; broader financial acceptance and authenticated renewal/provider result remain pending.

**Latest local trial — 2026-09-07**: User-authorized root client generation, isolated Redis and Next development startup/manual smoke are permitted under the latest spec amendment. Provider workers, external actions and production remain excluded. The original source-only restrictions below are historical for this narrow scope; 2/58 acceptance is unchanged. Results are recorded under the local trial section of [local-database-preparation.md](evidence/local-database-preparation.md).

**Current status:** 45/57 accepted (T001-T006, T011-T012, T015-T017, T024-T036, T039-T045, T048-T050, T059-T069). Current [local verification](evidence/extended-quality-verification.md) supersedes historical counts. T007/T008, T037/T038 and T051-T058 remain open or partial.

**Local prerequisite amendment — 2026-09-07**: [local-database-preparation.md](evidence/local-database-preparation.md) records the authorized backup restore, successful application of nine existing migrations to a separate writable local clone, and restoration there of three missing historical unique indexes. This overrides the original DB/service/migration prohibition below only for that operation. It is partial compatibility evidence relevant to T004/T040/T052, not acceptance of Q04, Q09 or those tasks, and does not authorize T006 onward application changes.

**Execution boundary**: Phase 1 / T001–T002 is complete. On 2026-09-07 the maintainer authorized Phase 2 / T003–T005 source authoring only. Author tests before implementation; authored upstream artifacts may feed subsequent authoring within this slice, while Q02/Q04 execution and task check-off remain pending. No tests/builds, client generation, migration application, DB/Redis/provider access, service actions or deployment. T006–T058 are outside this slice. Preserve existing Git work and migration history.

**Format**: `[ID] [P?] [Story] action with owned paths`. All paths are repository-relative. Files not currently present are planned new artifacts/sources, not claims of existing code. [P] marks independent test authoring within a phase after stated dependencies; it does not authorize worker sessions or simultaneous edits to shared files.

**Tracking rule**: Change [ ] to [x] only with code/artifact result and Verification evidence. Add date, commit/source reference, check outcome and evidence path under the task. Use IN_PROGRESS / BLOCKED / DEFERRED with reason and owner in a note while keeping the checkbox empty. Production-dependent tasks are WAITING_FOR_AUTHORIZATION_AND_EVIDENCE now, not silently skipped.

**Immediate versus release evidence**: Each coding/test-authoring task is accepted using its own focused checks against the code available at that step, after the required execution authorization. Test-authoring acceptance includes the meaningful expected failing case before the fix. Q02–Q05 and targeted existing Q08 checks may run at that step; T050 collects and reruns the integrated set and is not their first permitted execution point. Full Q06/Q09/Q10/Q11/Q12 obligations belong to T051–T057 and never become hidden backward dependencies of earlier tasks. A checked implementation task does not mark its deferred release obligation passed; the later task stays open until evidence exists.

## Phase 1 — Setup / تثبيت النطاق

- [x] T001 تثبيت خط الأساس وحصر الفروقات قبل أي إصلاح — `specs/036-audit-remediation/audit-register.md`; `specs/036-audit-remediation/evidence/baseline.md`
  - **Requirements**: FR-001, FR-030, FR-031. **Depends on**: none. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: The tree contains 188 earlier changes and the deployed revision is unknown.
  - **Expected**: Record current hashes, commit, audit-item sources and allowed write scope; identify drift from the reviewed snapshot.
  - **Possible bugs**: Treating new unrelated edits as reviewed; including secrets.
  - **Fix/Mitigation**: Hash sources without printing contents; preserve unrelated work; reopen changed evidence.
  - **Verification**: Q01: compare source inventory/hash and Git diff with audit-register; no application execution.
  - **Evidence — 2026-09-07 / COMPLETE**: Q01 PASS at `7457b7028811759736faa799a8b06b43691b1218` plus frozen local hashes: [baseline.md](evidence/baseline.md), [baseline-sources.json](evidence/baseline-sources.json), [phase-1-verification.md](evidence/phase-1-verification.md). 1,116 files captured; no runtime source drift since review. Production remains UNKNOWN.

- [x] T002 تحديد كل مستهلك للخدمات المشتركة ومسارات الحماية والطوابير — `specs/036-audit-remediation/evidence/consumer-inventory.md`; `src/app/api/operations`; `src/lib/bein-spend-ledger.ts`; `src/lib/queue.ts`
  - **Requirements**: FR-001, FR-014, FR-015, FR-021, FR-027. **Depends on**: T001. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Shared guards/ledgers/jobs have unchanged consumers outside the audit diff.
  - **Expected**: Document every operation route guard/permission/ownership, spend writer/report, queue producer/consumer and financial effect writer. Inventory card advisory/reservation/operation lock order in intersecting webhooks and finalizers; require common-order adaptation before T021.
  - **Possible bugs**: Missing an old panel route or queue; duplicating auth.
  - **Fix/Mitigation**: Read callers and type unions; inventory is evidence, not permission to rewrite each file.
  - **Verification**: Q01: reconcile route/job/writer inventory against source; each in-scope panel consumer gets an owning task; excluded consumers are compatibility references only.
  - **Evidence — 2026-09-07 / COMPLETE**: Q01 PASS using the T001 snapshot: [consumer-inventory.md](evidence/consumer-inventory.md), [consumer-index.json](evidence/consumer-index.json), [phase-1-verification.md](evidence/phase-1-verification.md). All 19 operation route files / 21 HTTP handlers reconciled; 479 indexed category entries / 348 unique source-test paths have follow-up task ownership. Broad indexes are discovery, not whole-file audit or runtime-test claims.

## Phase 2 — Foundation / الأساس المشترك

- [x] T003 كتابة اختبارات نموذج البيانات وحدود الإثبات وإنشاء مواضع اختبار صغيرة عند الحاجة — `tests/integration/audit-financial-model-db.test.ts`; `tests/unit/audit-financial-context.test.ts`; `shared/operations/audit-financial-context.ts`
  - **Requirements**: FR-003, FR-016, FR-017, FR-020, FR-025, FR-028. **Depends on**: T002. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Financial purpose/owner/claim/refund/effect constraints need behavioral checks before new writes.
  - **Expected**: Tests cover XOR owner, unique action revisions, fixed claim time, pending-refund exclusion and effect uniqueness; pure seam only if necessary. Add concurrent existing Stripe webhook/new settlement lock-order regression.
  - **Possible bugs**: Tests only match source strings; seam changes existing behavior prematurely.
  - **Fix/Mitigation**: Use input/output and transaction scenarios; extraction preserves existing behavior; new constraints initially fail.
  - **Verification**: Immediate: Q02 unit seam cases and author the failing Q04 model/lock-race cases; execute those focused isolated cases when authorized. Full Q09 release rehearsal is deferred to T052.
  - **Evidence — 2026-09-07 / COMPLETE**: Eight original DB cases failed before foundation columns, as expected. Final suite passes 9 unit/guard and 11 DB cases without skips; forced contention is observed in pg_locks before the real refund finalizer proceeds. Focused types pass. Pure seam remains dormant. [Runtime evidence](evidence/phase-2-runtime-verification.md).

- [x] T004 إضافة حقول ونماذج التوافق بترحيلات جديدة فقط — `prisma/schema.prisma`; `worker/prisma/schema.prisma`; `prisma/migrations/20260907090000_audit_financial_context/migration.sql`; `prisma/migrations/20260907100000_audit_dispatch_claim_identity/migration.sql`; `prisma/migrations/20260907110000_audit_refund_review_effects/migration.sql`
  - **Compatibility paths**: `src/lib/operation-dispatch.ts` and `tests/integration/renewal-payment-refund-finalization-db.test.ts` (all compound lookups at revision 0 only, including untracked sources); `src/lib/bein-spend-ledger.ts` and `src/components/admin/reports/BeinSpendReportClient.tsx` (nullable panelUserId DTO only). No new preparation behavior or customer spend writer is enabled.
  - **Requirements**: FR-011, FR-016, FR-017, FR-020. **Depends on**: T003. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Current schema cannot represent customer provider spend, repeatable preparation, fixed claims or durable refund/effects.
  - **Expected**: Add data-model.md entities/constraints/indexes; preserve reseller rows and existing applied migration history.
  - **Possible bugs**: Old workers fail on new strict fields; historical aliases/credit cannot backfill safely.
  - **Fix/Mitigation**: Expand nullable fields first, classify old rows, default final dispatch revision 0, never synthesize ledger/evidence.
  - **Verification**: Immediate: focused Q04 model/constraint scenarios after isolated authorization and Q01 byte-equivalence of both schemas; preserve existing SQL. Deferred release verification: full Q09 rehearsal in T052 and combined Q06 in T051.
  - **Evidence — 2026-09-07 / COMPLETE**: Three unchanged migrations applied to the isolated pre-foundation schema; all six model families and new-write constraints exercised. Both schemas remain identical and all 36 migration hashes are preserved. Immediate Q04 PASS; combined Q06 and full Q09 remain T051/T052. [Runtime evidence](evidence/phase-2-runtime-verification.md).

- [x] T005 إعداد بيانات اختبار قديمة وجديدة لكل نوع مالك وتمويل — `tests/helpers/audit-operation-fixtures.ts`; `tests/helpers/disposable-database.ts`; `tests/integration/audit-financial-model-db.test.ts`
  - **Requirements**: FR-020, FR-025, FR-027, FR-028. **Depends on**: T004. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Synthetic modern-only rows miss legacy and mixed-funding failures.
  - **Expected**: Reusable fixtures include reseller/customer/installment/legacy, mixed payment, null evidence, active refund, stale baseline and old dispatch.
  - **Possible bugs**: Tests accidentally reach real services or hide old-data gaps.
  - **Fix/Mitigation**: Require disposable guards, synthetic identifiers, mocked providers and explicit fixture provenance.
  - **Verification**: Q04 fixture setup/cleanup with existing disposable guard; verify real connection targets are rejected.
  - **Evidence — 2026-09-07 / COMPLETE**: Eleven variants ran successfully. Fixed the reproduced invalid hash and 17-digit card fixture bugs; guard-before-import and callback-error cleanup pass. Final database has zero business rows and no invalid indexes. No test targeted the snapshot/work clone or a provider. [Runtime evidence](evidence/phase-2-runtime-verification.md).

## Phase 3 — US1 / التسوية المالية الصحيحة

**IN_PROGRESS — 2026-09-07:** User authorized T006–T012 implementation and focused isolated verification. The current Phase 3 spec/plan amendment overrides historical Phase 2-only restrictions. Supporting paths: `worker/src/http/types.ts`, `worker/src/http/HttpClientService.ts`, fixture cleanup and connected regression tests. No real provider execution or deployment. Analyze gate: existing US1/FR-002/FR-003/FR-005/FR-027/FR-028 contracts and dependencies remain consistent; both planning checklists complete, no new business policy or migration required.

**Goal / independent acceptance**: See US1 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T006 [P] [US1] كتابة حالات فشل واسترداد القسط والتكرار — `worker/tests/installment-settlement.test.ts`; `tests/integration/installment-settlement-db.test.ts`
  - **Evidence 2026-09-07**: COMPLETE: authored failing-first regression and focused passing checks. [Details](evidence/phase-3-verification.md).
  - **Requirements**: FR-002, FR-003, FR-025. **Depends on**: T005. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Current installment code ignores blocked refund and marks FAILED.
  - **Expected**: Regression fails for lost refund; covers proven rejection, unknown pay, duplicate jobs, missing deduction and crash boundary. Include CHARGED with UNKNOWN installment settlement, authoritative SETTLED receipt, and successful replay.
  - **Possible bugs**: A test accepts caller allowFinalPayRefund as proof.
  - **Fix/Mitigation**: Assert exact evidence context and atomic money/status/reservation outcomes.
  - **Verification**: Q02/Q04: installment-settlement suites; capture failing result before T007/T008.

- [ ] T007 [US1] تسجيل نوع العملية وإثبات دفع الأقساط قبل مخاطبة المزود — `src/app/api/operations/start-installment/route.ts`; `src/app/api/operations/[id]/confirm-installment/route.ts`; `worker/src/http-queue-processor.ts`; `shared/operations/audit-financial-context.ts`
  - **Local backlog status — 2026-09-08:** DEFERRED by maintainer: attributable installment observation. Preserve existing UNKNOWN/hold behavior.
  - **Evidence 2026-09-07**: PARTIAL: implemented and component-tested; attributable HTTP installment observation is still missing (T007 dependency). [Details](evidence/phase-3-verification.md).
  - **Requirements**: FR-002, FR-003, FR-028. **Depends on**: T006. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Installments currently masquerade as ordinary renewal evidence.
  - **Expected**: Set purpose, durable single-mutation identity and normalized installment evidence bound to exact account/card/installment. Persist separate installmentSettlementState and attributable receipt/due-item evidence; charge alone never completes.
  - **Possible bugs**: Marker written after request; ambiguous response called not charged.
  - **Fix/Mitigation**: Claim before provider call, fence lease, derive outcome from exact authoritative context; never invent renewal report proof.
  - **Verification**: Q02 installment mutation/replay cases, including crash immediately before and after submission.

- [ ] T008 [US1] ربط رد خصم القسط بالحالة النهائية داخل معاملة واحدة — `worker/src/utils/error-handler.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/installment-finalization.ts`
  - **Local backlog status — 2026-09-08:** DEFERRED with T007: no new installment settlement/refund authority in the local backlog slice.
  - **Evidence 2026-09-07**: PARTIAL: implemented and component-tested; attributable HTTP installment observation is still missing (T007 dependency). [Details](evidence/phase-3-verification.md).
  - **Requirements**: FR-002, FR-003, FR-011, FR-027. **Depends on**: T007. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: False refund result must not turn into ordinary failed completion.
  - **Expected**: Single canonical refund, correct applicable points reversal, failed status and safe release commit together; blocked closure becomes review. Successful closure separately requires attributable SETTLED evidence; ambiguous charged installments remain review.
  - **Possible bugs**: Double refund; partial status commit; unsafe lease release.
  - **Fix/Mitigation**: Lock canonical deduction and evidence; reuse existing reversal logic only when applicable; return explicit settlement result.
  - **Verification**: Q02/Q04 installment-settlement suites: exact balances, one refund, status, points and reservations after replay/crash.

- [x] T011 [P] [US1] كتابة اختبار التحقق غير المكتمل ثم النتيجة السلبية النهائية — `worker/tests/latest-verification-settlement.test.ts`; `tests/integration/latest-verification-settlement-db.test.ts`
  - **Evidence 2026-09-07**: COMPLETE: authored failing-first regression and focused passing checks. [Details](evidence/phase-3-verification.md).
  - **Requirements**: FR-005, FR-003, FR-025. **Depends on**: T005. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: A stale CHECK_FAILED field currently blocks newer valid no-match settlement.
  - **Expected**: Cover incomplete->final negative, stale attempt/baseline, remaining retries, positive spend/proof and concurrent decision.
  - **Possible bugs**: Latest timestamp wrongly erases valid positive evidence.
  - **Fix/Mitigation**: Assert expected verification ID/baseline/attempt identity and all genuine vetoes.
  - **Verification**: Q02/Q04 latest-verification-settlement suites; record failed regression before T012.

- [x] T012 [US1] اعتماد آخر محاولة موثقة وتحديث الحالة والتسوية ذريًا — `worker/src/lib/renewal-no-charge-finalization.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/fulfillment-baseline.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Renewal-only latest-attempt settlement and existing proof/finalization suites pass; deferred installment observation is not a dependency of this bounded finalizer. [Current verification](evidence/local-backlog-verification.md).
  - **Evidence 2026-09-07**: PARTIAL: implemented and component-tested; attributable HTTP installment observation is still missing (T007 dependency). [Details](evidence/phase-3-verification.md).
  - **Requirements**: FR-005, FR-003. **Depends on**: T011. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Derived stale fields must not contradict the authoritative locked attempt.
  - **Expected**: Expected active verification/baseline/attempt is checked; derived fields update with safe refund/failure atomically.
  - **Possible bugs**: Old attempt settles a newer operation; negative scan overrides proof.
  - **Fix/Mitigation**: Keep spend/proof/manual/refund conflicts and remaining-check vetoes; enforce lock order.
  - **Verification**: Q02/Q04 latest-verification-settlement; original fulfillment proof/finalization suites remain passing.

## Phase 4 — US2 / اختيار الباقة والعروض

**COMPLETE for the accepted Phase 4 slice:** T015-T017 verified with synthetic Q02-Q04 and mocked-browser Q07. Independent review accepted T016/T017. Provider and combined release acceptance remain separate.

**Goal / independent acceptance**: See US2 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T015 [P] [US2] كتابة اختبارات تغيير العرض وإعادة الطلب والسعر القديم — `tests/unit/promo-dispatch-revision.test.ts`; `tests/integration/promo-dispatch-revision-db.test.ts`; `tests/helpers/promo-dispatch-harness.ts`
  - **Evidence 2026-09-07**: COMPLETE (test authoring): Q02 4 pass / 6 reproduced pre-fix failures; Q04 1 pass / 6 reproduced pre-fix failures after explicit user approval, zero skips. Synthetic database empty before/after. Runtime fixes remain unaccepted. [Phase 4 evidence](evidence/phase-4-verification.md).
  - **Requirements**: FR-007, FR-016, FR-025. **Depends on**: T005. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: One operation/job key cannot express a second offer application.
  - **Expected**: New revision changes offer; identical identity replays; changed payload/stale price conflicts; final pay stays one identity.
  - **Possible bugs**: Preparation revision used to create another final payment.
  - **Fix/Mitigation**: Assert revision eligibility whitelist and immutable financial dispatch identity.
  - **Verification**: Q02/Q04 promo-dispatch-revision suites.

- [x] T016 [US2] إضافة رقم محاولة للعروض وضبط تغيّر الباقة مع تثبيت هوية الدفع النهائي — `src/lib/operation-dispatch.ts`; `src/lib/queue.ts`; `src/app/api/operations/[id]/apply-promo/route.ts`; `worker/src/http-queue-processor.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http/types.ts`; `worker/tests/promo-package-refresh.test.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Evidence 2026-09-07**: COMPLETE. Revision/replay, provider-context and fenced hold tests pass; independent source re-review accepted. [Implementation evidence](evidence/phase-4-implementation.md).
  - **Requirements**: FR-007, FR-016. **Depends on**: T005, T015. **Owner**: current-task implementer; root owns integration and evidence.
  - **Supporting seam paths**: `shared/operations/package-quote.ts`; `worker/src/lib/promo-quote.ts`; `tests/helpers/promo-dispatch-harness.ts`; existing promo unit/integration suites. Keep extracted helpers narrow, behavioral and service-free where possible.
  - **Reason**: Current payload conflicts or DISPATCHED reuse strand promo refresh.
  - **Expected**: Repeatable APPLY_PROMO jobs use operation/type/revision; COMPLETE_PURCHASE/final payment remain stable; stale preparation result cannot overwrite current quote. Applied-code/card context and fresh provider package snapshot stay together; name/price drift or ambiguous matches stop before substitute cart submission.
  - **Possible bugs**: Late first promo wins over new promo; random payment job IDs.
  - **Fix/Mitigation**: Compare revision at writeback and freeze selected quote before deduction; preserve old revision-0 jobs. Compare persisted JSON payloads semantically/canonically: PostgreSQL JSONB key order must not turn an identical replay into PAYLOAD_CONFLICT (T015 reproduced).
  - **Promo-name acceptance**: Implement PRM-02/03/04/05 from [the review](evidence/phase-4-promo-name-review.md). Preserve card type in promo recovery and do not label an ordinary fallback list an applied offer without evidence. Classify proven pre-sale quote conflict separately from uncertain provider actions, retaining all payment/proof barriers. No same-operation re-preparation via deleted/nonzero COMPLETE_PURCHASE dispatches; safe fresh-operation restart requires canonical closure, otherwise retain an actionable review hold. No new schema change or fuzzy name/row/checkbox identity.
  - **Test-first order**: Use the existing isolated loader or a narrow test seam to author `worker/tests/promo-package-refresh.test.ts` before changing adapter/worker behavior. Mock HTTP/auth/queue/provider dependencies; cover reapply drift/duplicates, no cart/Pay on conflict, stale writeback, unknown-action hold, fallback promo evidence and IRDETO context. Read/run the existing correlation/finalization regressions proportionately without weakening their identity assertions. These additional cases are NOT_RUN; T015 remains accepted only for its original cases.
  - **Verification**: Q02/Q04 promo-dispatch-revision plus duplicate financial dispatch cases; Q02 new worker promo suite and connected proof regressions. Record exact cases/results under Phase 4 evidence.

- [x] T017 [US2] تحديث واجهة التجديد بعد العرض والتحقق من الباقة والسعر المعتمدين — `src/app/dashboard/renew/page.tsx`; `src/app/api/operations/[id]/packages/route.ts`; `src/app/api/operations/[id]/select-package/route.ts`; `src/app/api/operations/[id]/confirm-purchase/route.ts`; `src/lib/operations/lock-timeouts.ts`; `tests/unit/promo-package-quote-contract.test.ts`; `src/i18n/translations/ar.ts`; `src/i18n/translations/en.ts`; `src/i18n/translations/bn.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Evidence 2026-09-07**: COMPLETE after T016. Locked quote/debit contracts and both panel consumers verified; 76 focused unit/worker and 14 PostgreSQL cases pass with zero skips, six mocked-browser scenario groups pass. [Implementation evidence](evidence/phase-4-implementation.md).
  - **Requirements**: FR-007, FR-024. **Depends on**: T016. **Owner**: current-task implementer; root owns integration and evidence.
  - **Connected panel consumer**: `src/app/dashboard/operations/active/page.tsx` also sends final renewal confirmation. Carry its accepted selected-package quote revision, preserving the separate installment request. Include both panel entry points in Q03/Q07; no phone-app/store change.
  - **Reason**: A processing response needs polling and a price revision before payment.
  - **Expected**: Poll active promo revision, clear failure state, display server quote and reject outdated confirmation before debit. Separate draft/applied codes; invalidate selection and consent on refresh/rename/reorder; never show success for 202 plus old packages or select while pending.
  - **Possible bugs**: Client keeps stale price or infinite polling; cancellation loses operation ID.
  - **Fix/Mitigation**: Bound polling with explicit status/retry; preserve identity and server-derived amount. Compare the quote/package/code under the existing canonical lock order; do not overwrite applied promo from selection input. Explicit code removal refreshes the quote. Map conflicts and pending/failed/retry states through existing locale catalogs, with keyboard/RTL/aria feedback and no new UI library. A safe restart never assumes the old operation's reservation was released.
  - **Test-first order**: Author `tests/unit/promo-package-quote-contract.test.ts` against actual route/state behavior before edits; extend the existing guarded integration suite for stale/reordered selections, conflicting draft code and final-confirm revision. Cover PRM-01/02/03 and T016 conflict projection from [the review matrix](evidence/phase-4-promo-name-review.md). No source-regex-only assertions as behavioral evidence; new cases remain NOT_RUN in this review.
  - **Verification**: Q02/Q03 quote contract cases; Q04 locked selection/confirmation; Q07 delayed 202 with old list, rename/reorder, draft edit/removal, stale responses, failure/retry and outdated confirmation at supported viewports.

## Phase 5 — US3 / الاسترداد والمراجعات

**Goal / independent acceptance**: See US3 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T024 [P] [US3] كتابة مصفوفة اختبارات المراجعة الحديثة والقديمة والأقساط — `tests/unit/financial-review-capabilities.test.ts`; `tests/integration/legacy-review-adjudication-db.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Capability matrix includes modern/legacy/pre-mutation/installment holds, malformed money and settlement conflicts; real PostgreSQL adjudication/race tests pass. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-011, FR-012, FR-025. **Depends on**: T017, T061. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Missing modern fields currently remove usable old-review actions.
  - **Expected**: Cases classify modern/pre-mutation/installment/legacy/conflict; unknown data remains hold; capability is revalidated after race. Each allowed and denied legacy outcome row in financial-lifecycle.md is an explicit case.
  - **Possible bugs**: Missing timestamp treated as proof of no payment; admin bypasses invoice claim.
  - **Fix/Mitigation**: Assert preserved evidence, current ADMIN, canonical panel deduction, pending-refund veto and immutable previous decision.
  - **Verification**: Q02/Q04 capability/adjudication suites.

- [x] T025 [US3] إضافة تصنيف موحد للمراجعة وتسوية الحالات القديمة بأدلتها — `src/lib/financial-review/capabilities.ts`; `src/lib/operations/legacy-review-finalization.ts`; `src/lib/operations/pre-mutation-renewal-finalization.ts`; `src/lib/operations/manual-fulfillment-finalization.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Legacy receipt completion records separate immutable provenance with invoice claim and replay identity; pre-mutation closure revalidates locked evidence. Unevidenced legacy refunds and installments remain explicit holds. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-011, FR-003. **Depends on**: T024. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Modern strict evidence cannot be retroactively fabricated for old cases.
  - **Expected**: Use appropriate finalizer per evidence family; record verified legacy/manual provenance separately; precise hold when insufficient. Implement the exact outcome-specific legacy evidence matrix, including no-charge plus independently established non-execution for refunds.
  - **Possible bugs**: Invented FINAL_OK; duplicate invoice; stale capability permits unsafe action.
  - **Fix/Mitigation**: Lock/reclassify at submission, share invoice/settlement guards, never reopen identical completed outcomes.
  - **Verification**: Q04 legacy review matrix including concurrent decisions, absent deduction and refund-in-progress.

- [x] T026 [US3] توحيد قدرات المراجعة والتحقق من الملاحظات في API — `src/app/api/admin/financial-review/route.ts`; `src/app/api/admin/financial-review/[operationId]/decision/route.ts`; `src/lib/financial-review/types.ts`; `src/lib/operations/financial-review-refund-finalization.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Server returns safe capabilities and revalidates current ADMIN, notes, canonical deduction and action eligibility inside the financial transaction; replay/race tests pass. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-011, FR-012, FR-022. **Depends on**: T025, T064. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: UI must learn exact eligible actions and required note/evidence from server.
  - **Expected**: Add safe classification/allowedActions/requiredFields/blockedReasons; enforce trimmed 1..2000 decision note for closure.
  - **Possible bugs**: Leaking raw evidence; action allowed by stale frontend; breaking old envelope.
  - **Fix/Mitigation**: Add compatible fields, admin-only evidence, transactional revalidation and explicit stable error codes.
  - **Verification**: Q03 financial-review request/response and empty/oversize-note cases; Q04 decision replay.

## Phase 6 — US4 / الجلسات والصلاحيات

**Goal / independent acceptance**: See US4 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T027 [P] [US4] كتابة اختبارات الجلسة الملغاة وتغيير الدور والملكية — `tests/unit/operation-auth-contract.test.ts`; `tests/integration/operation-auth-revocation-db.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Current guard and actual handler denial tests plus persisted role/owner/revocation matrices pass; no side effects before denial. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-013, FR-014, FR-025. **Depends on**: T005, T062. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Route-local token helpers bypass current database state.
  - **Expected**: All inventoried protected handlers deny disabled/deleted/revoked actors and wrong owners; customer credential cannot become panel identity.
  - **Possible bugs**: Only start-renewal is covered; mocks skip current-user lookup.
  - **Fix/Mitigation**: Parameterize route inventory and negative claims; verify no writes before denial.
  - **Verification**: Q02/Q04 operation-auth suites against web credentials.

- [x] T028 [US4] استبدال مساعدات تسجيل الدخول المحلية بالحارس المركزي — `src/lib/auth-utils.ts`; `src/app/api/operations`; `specs/036-audit-remediation/evidence/consumer-inventory.md`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** All 19 route files / 21 handlers reconciled against the central current-identity guard; existing ownership and four ADMIN exceptions retained. See auth-matrix.md. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-013, FR-014. **Depends on**: T027, T062. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Current isActive/passwordChangedAt/role checks already exist centrally.
  - **Expected**: Every route in T002 inventory uses current panel identity before action-specific permission/ownership checks.
  - **T002 source clarification**: Include the collection GET through withAuth; changing only local helpers leaves that caller behind. Preserve existing non-panel cancellation guards without changing that flow; retain the four existing ADMIN exceptions.
  - **Possible bugs**: Conflating customer/store JWTs; denying valid web session due to timestamp units.
  - **Fix/Mitigation**: Reuse existing getAuthenticatedUser semantics; retain separate customer guards and exact token time units.
  - **Verification**: Q02/Q04 route matrix for start, bulk, signals, select, promo, captcha, confirm, cancel, read and heartbeat.

- [x] T029 [US4] إثبات توافق الأدوار والملكية بعد توحيد الحماية — `tests/integration/operation-auth-revocation-db.test.ts`; `tests/unit/operation-auth-contract.test.ts`; `specs/036-audit-remediation/evidence/auth-matrix.md`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Persisted ADMIN/MANAGER/AGENT/USER own/foreign matrices, reset/demotion and hierarchy/ownership regressions pass. See auth-matrix.md. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-013, FR-014, FR-027. **Depends on**: T028. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Fixing revocation must not remove legitimate manager/agent/admin ownership flows.
  - **Expected**: Record role/owner matrix for allowed and denied paths, reset/demotion timing, and unchanged customer boundaries.
  - **Possible bugs**: Overbroad ADMIN bypass; user ownership inferred from historical links.
  - **Fix/Mitigation**: Use current hierarchy primitives and existing regression expectations; document any pre-existing mismatch.
  - **Verification**: Q04 auth matrix; Q08 existing hierarchy/password-reset/ownership suites selected by inventory.

## Phase 7 — US5 / الطوابير وآثار الإكمال

**Goal / independent acceptance**: See US5 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T030 [P] [US5] كتابة اختبارات استعادة كل أنواع مهام الطابور — `tests/unit/dispatch-recovery-all-types.test.ts`; `tests/integration/dispatch-recovery-all-types-db.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** All admitted outbox types, attempt CAS, lost acknowledgement, duplicate/stale delivery and exhaustion verified; actual Redis/BullMQ retains one final job. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-015, FR-016, FR-029, FR-025. **Depends on**: T017, T063. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: The daemon watchdog currently retries only one financial job type.
  - **Expected**: Cover outage, stale DISPATCHING, already delivered job, max attempts and terminal/review operation for every admitted type.
  - **T002 source clarification**: Include direct panel/admin/verification producers, actual queueTarget defaults, and legacy CHECK_BALANCE admission with no HTTP handler. Prove unsupported requests are rejected before debit; aliases require explicit semantic equivalence.
  - **Possible bugs**: Tests cover only CONFIRM_PURCHASE; exhausted PENDING never resolves.
  - **Fix/Mitigation**: Use producer/type inventory and stable job IDs with fake queue failures.
  - **Verification**: Q02/Q04 dispatch-recovery suites plus Q05 uncertain delivery/Redis race.

- [x] T031 [US5] توسيع الصيانة وإغلاق قبول أنواع الطابور غير المدعومة — `src/lib/operation-dispatch.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`; `src/app/api/cron/dispatch-operation-jobs/route.ts`; `src/lib/operations/recovery.ts`; `src/app/api/operations/create/route.ts`; `src/app/api/operations/bulk/route.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Indexed bounded retries, five-attempt exhaustion and late-Pay-marker veto implemented; immutable provider submission guards retained. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-015, FR-016, FR-029. **Depends on**: T030, T063. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Saved-for-retry responses need an actual generic dispatcher.
  - **Expected**: One declared scheduler drains bounded due jobs, preserves specialized payment safety, and records actionable exhaustion.
  - **T002 source clarification**: Reconcile producer admission against the actual worker switch. Reject unsupported legacy input before deduction/dispatch; do not rename or alias an account-balance job into a card operation. Existing supported signal/bulk behavior remains covered by T049.
  - **Possible bugs**: Requeue final Pay; duplicate cron/daemon delivery; early expiry of PENDING.
  - **Fix/Mitigation**: Type-aware recovery, leases/CAS, stable financial identity and explicit pending/exhausted outcomes.
  - **Verification**: Q02/Q04 all types; Q05 concurrent scheduler/crash cases; assert provider submission count <=1.

- [x] T032 [P] [US5] كتابة اختبارات توقف العامل بعد حفظ الإكمال — `tests/integration/completion-effects-db.test.ts`; `tests/integration/renewal-fulfillment-finalization-db.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Actual auto/manual completion writers create durable effects; concurrent replay, mid-counter rollback, exhaustion and no historical backfill pass in PostgreSQL. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-017, FR-027, FR-025. **Depends on**: T005. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Completion side effects currently happen after commit without full durable replay.
  - **Expected**: Auto/manual completion crash resumes notification/counter once; points reuse captured run and recipients.
  - **Possible bugs**: Double counters; points recomputed from changed ownership.
  - **Fix/Mitigation**: Assert immutable effect identity/snapshot and existing points finalizer reuse.
  - **Verification**: Q02/Q04 completion-effects: crash before/after effect commit and duplicate consumers.

- [x] T033 [US5] حفظ آثار الإكمال وتنفيذها بأمان عبر الصيانة — `worker/src/lib/fulfillment-finalization.ts`; `src/lib/operations/manual-fulfillment-finalization.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/activity-tracker.ts`; `src/lib/maintenance/completion-effect-maintenance.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Completion effects captured atomically and delivered with local marker/action transaction; points reuse existing captured award runs and recipients. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-017, FR-027, FR-029. **Depends on**: T031, T032. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: ALREADY_COMPLETED must not permanently skip missing effects.
  - **Expected**: Completion transaction creates effects; consumer atomically applies local counters/notifications and marks delivered; points remain existing captured runs.
  - **Possible bugs**: Crash between counter and marker; old completed rows produce fabricated effects.
  - **Fix/Mitigation**: Unique origin keys, atomic local application, explicit evidence-only historical backfill.
  - **Verification**: Q04 completion-effects and existing points-award tests; no duplicate totals after replay.

- [x] T034 [US5] إظهار تأخر المهام والمراجعة وآثار الإكمال دون بيانات حساسة — `src/lib/maintenance/operation-maintenance-runner.ts`; `src/lib/maintenance/completion-effect-maintenance.ts`; `specs/036-audit-remediation/evidence/recovery-bounds.md`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Bounded batch and privacy tests pass; real Redis stale-leader release cannot remove successor; health includes pending age and exhausted effects. See recovery-bounds.md. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-028, FR-029, FR-015, FR-017. **Depends on**: T033. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Silent queues and unbounded scans hide operational failure.
  - **Expected**: Expose counts/oldest pending age/attempts/reasons; defaults batch50 cap200 and documented retry policy with indexed scans.
  - **Possible bugs**: Raw provider payload in logs; full-table polling; hidden exhausted tasks.
  - **Fix/Mitigation**: Aggregate safe metadata, enforce caps and due-time indexes; no network in financial transaction.
  - **Verification**: Q02 bounds/log-redaction cases; Q05 isolated backlog drains within configured policy.

## Phase 8 — US6 / جاهزية الحسابات والترحيل والخدمات

**Goal / independent acceptance**: See US6 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T035 [P] [US6] كتابة اختبارات جاهزية الحساب والوضع الفعلي قبل الخصم — `tests/integration/renewal-readiness-db.test.ts`; `tests/unit/renewal-readiness.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Real account/reservation readiness matrix, ENFORCE missing-attestation unit case and actual installment API pre-debit rejection pass; provider session remains explicitly unverified. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-018, FR-019, FR-003, FR-025. **Depends on**: T005. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Default account flags and missing attestation can make admission unusable.
  - **Expected**: No eligible account/expired evidence gives explicit pre-debit outcome; declared REVIEW_ONLY is distinguished from ENFORCE.
  - **Possible bugs**: Blanket opt-in; stale expiry starts debit; in-flight replay when mode changes.
  - **Fix/Mitigation**: Test each admission boundary and immutable already-submitted marker.
  - **Verification**: Q02 readiness/admission cases with fake clock and account inventory.

- [x] T036 [US6] إضافة فحص أهلية الحسابات قبل قبول العمليات المالية — `worker/src/pool/account-pool-manager.ts`; `src/app/api/admin/bein-accounts/route.ts`; `src/app/api/admin/bein-accounts/[id]/route.ts`; `src/app/api/operations/start-renewal/route.ts`; `src/lib/renewal-readiness.ts`; `src/app/api/operations/[id]/confirm-purchase/route.ts`; `src/app/api/operations/[id]/confirm-installment/route.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Readiness enforced before start and financial admission, with owned-reservation exception and account recheck under locks; configuration exposes requested/effective mode and availability. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-018, FR-021, FR-003. **Depends on**: T035. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: No eligible automation-exclusive account must be visible before funds are committed.
  - **Expected**: Shared readiness checks the panel account pool and account eligibility; explicit admin attestation is audited.
  - **Possible bugs**: TOCTOU between admission and payment; mislabeled account pool.
  - **Fix/Mitigation**: Recheck at financial mutation with actual reservation; never bulk enable historical accounts.
  - **Verification**: Q02/Q04 readiness and no-debit cases for panel renewal/installment; Q08 signals/bulk availability.

- [ ] T037 [US6] كتابة اختبارات صلاحية إثبات التحقق وتنقيح البيانات — `tests/unit/renewal-fulfillment-correlation-smoke.test.ts`; `tests/unit/renewal-fulfillment-admin-config.test.ts`; `worker/tests/live-smoke-adapter.test.ts`
  - **Local backlog status — 2026-09-08:** OUTSIDE CURRENT LOCAL SEQUENCE: provider-adapter test work remains open; existing fixture/config tests may run as regressions.
  - **Requirements**: FR-019, FR-028, FR-025. **Depends on**: T005. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: The existing live command is intentionally unimplemented and fixtures cannot certify production.
  - **Expected**: Tests cover adapter interface, sanitized pass/fail, timestamp/fingerprint/expiry and missing authorization.
  - **Possible bugs**: Fixture pass writes live attestation; secrets leak through evidence.
  - **Fix/Mitigation**: Inject transport and clock; forbid live write from fixture mode and raw payload persistence.
  - **Verification**: Q02 named suites using doubles only; no real beIN session.

- [ ] T038 [US6] إكمال أداة التحقق الحي وكتابة إثبات صالح بطريقة مقيدة — `scripts/verify-sold-report-contract-correlation.ts`; `worker/src/lib/live-smoke-session-adapter.ts`; `shared/operations/renewal-fulfillment-config.ts`; `src/app/api/admin/bein-config/route.ts`; `src/lib/renewal-readiness.ts`
  - **Local backlog status — 2026-09-08:** OUTSIDE CURRENT LOCAL SEQUENCE: no live-provider adapter or final-cart proof implementation is authorized by this local backlog amendment.
  - **Requirements**: FR-019, FR-028, FR-003. **Depends on**: T036, T037. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: ENFORCE currently has no shipped real-evidence generation path.
  - **Expected**: Authorized read-only adapter gathers required equality/coverage, privileged writer persists sanitized release-bound attestation, and expiry blocks new automatic admission.
  - **Possible bugs**: Unintended provider mutation; permissive admin setting injects fake pass.
  - **Fix/Mitigation**: Reuse fenced read sessions, whitelist read operations, validate writer provenance and signed/admin authority; no fake attestation.
  - **Verification**: Q02 mocked adapter/config tests; actual Q10 remains deferred until T053.

- [x] T039 [P] [US6] كتابة حالات توافق البيانات القديمة والترحيلات — `tests/integration/audit-remediation-compatibility-db.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Seven compatibility PostgreSQL cases plus historical completion/pagination and finite-money cases pass; old revision/default/index behavior retained. Full fresh/upgrade migration rehearsal remains T052. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-020, FR-026, FR-025. **Depends on**: T005. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Migrations add constraints and ledgers without knowing historical data.
  - **Expected**: Fixtures cover aliases, empty names, negative/nonfinite panel amounts, absent canonical deductions, old review fields, old/new writers and terminal records.
  - **Possible bugs**: Preflight mutates data; down migration destroys new evidence.
  - **Fix/Mitigation**: Assert dry-run reporting, immutable existing SQL and forward-compatible gates.
  - **Verification**: Q04/Q09 compatibility suite in a disposable database.

- [x] T040 [US6] إضافة تقرير توافق قابل للاستئناف دون إصلاح تلقائي للأموال — `scripts/reconcile-renewal-fulfillment.ts`; `scripts/preflight-audit-remediation.ts`; `src/lib/renewal-fulfillment/reconciliation.ts`; `specs/036-audit-remediation/evidence/legacy-remediation.md`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Read-only bounded/resumable compatibility classifier and source migration-provenance report implemented; no apply mode or automatic money repair. [Current verification](evidence/local-backlog-verification.md).
  - **Observed prerequisite — 2026-09-07**: `prisma/migrations/0_init/migration.sql` is empty; clean deploy fails at 20260216193000 with missing OperationStatus. Classify schema-only bootstrap/fresh-install history alongside the known historical index drift; retain original SQL. [Evidence](evidence/phase-2-runtime-verification.md).
  - **Requirements**: FR-020, FR-028, FR-029. **Depends on**: T039. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Historical cases need explicit evidence classification and bounded next actions.
  - **Expected**: Dry-run default reports redacted categories, blockers and proposed evidence-based remediation; separate explicit apply scope for any future correction.
  - **Possible bugs**: Fabricated ledger/time; accidental apply; oversized sensitive report.
  - **Fix/Mitigation**: Bounded pagination, explicit confirmation for later writes, no raw secrets/PII, no automatic account merge/balance clamp.
  - **Verification**: Q09 synthetic snapshot dry-run/apply-boundary tests; Q11 production read remains deferred.

- [x] T041 [US6] توحيد ملف الخدمات وربط كل طابور وعملية صيانة بمستهلك — `ecosystem.config.js`; `worker/ecosystem.config.js`; `src/lib/queue.ts`; `docs/PROJECT_GUIDE.md`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Both PM2 profiles share mandatory PANEL_WORKER_COUNT (1..32), tested for 8/10/invalid values; panel queues and scheduler reconciled. Live count remains T055. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-021, FR-015, FR-028. **Depends on**: T002. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Root/worker panel profiles and 8-vs10 notes are inconsistent.
  - **Expected**: Documented deployment profile, explicit consumer per enabled queue and maintenance ownership; process counts derived from same source.
  - **T002 source clarification**: Reconcile only panel worker/maintenance topology. Preserve existing excluded process definitions; adding or enabling customer workers is outside scope.
  - **Possible bugs**: Double schedulers; admitting panel jobs without a worker; unintentional live restart.
  - **Fix/Mitigation**: Source edits only; static topology contract first; live profile selection waits for T055.
  - **Verification**: Q03 topology inventory; Q05 disposable consumer visibility; do not start/restart production here.

- [x] T042 [US6] كتابة إجراء نشر وتراجع يحافظ على العمليات الجارية — `docs/deployment/audit-remediation-release.md`; `specs/036-audit-remediation/contracts/jobs-and-release.md`; `.gitignore`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Concrete ingress/drain/fence/migration/build/start and evidence-preserving rollback procedure documented; no operational action executed. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-026, FR-021, FR-030, FR-031. **Depends on**: T040, T041. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Build/migration/restart order must not corrupt live artifacts or uncertain financial work.
  - **Expected**: Runbook covers admission stop, drain/fence, migration/generation, stop-web/build/start, matching workers, health and forward-repair rollback limits. Add only a narrow version-control exception for docs/deployment/audit-remediation-release.md.
  - **Possible bugs**: Build into live .next; blind rollback after new refunds; restart wrong worker names.
  - **Fix/Mitigation**: Use evidence-selected topology, preserve old artifacts/durable records, explicit operational authorization gate.
  - **Verification**: Immediate Q01 runbook/source/topology consistency and Git visibility. Deferred release verification: Q09 rehearsal T052; actual cutover T057.

## Phase 9 - US7 / Panel interfaces

**Goal / independent acceptance**: See US7 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T043 [P] [US7] كتابة اختبارات عقود عرض المراجعة والتسوية لكل المستهلكين — `tests/unit/operation-consumer-state-contract.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Actual read-only packages GET and additive DTO tests pass, including expiry, pending refund, review and absence of leaked raw evidence. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-022, FR-012, FR-024, FR-025. **Depends on**: T026. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Panel renewal and active-operation views must agree with server review capabilities.
  - **Expected**: Panel view matrix includes blocked refund, review, success/failure, missing reason and compatible envelope.
  - **Possible bugs**: Breaking legacy status parsers; exposing admin evidence.
  - **Fix/Mitigation**: Use additive safe fields and explicit first-party mapping; validate role-limited payload.
  - **Verification**: Q02/Q03 view contract matrix; panel route responses retain safe fields.

- [x] T044 [US7] توحيد عرض الحالات والإجراء المتاح داخل البانل — `src/app/api/operations/[id]/route.ts`; `src/app/dashboard/renew/page.tsx`; `src/app/dashboard/operations/active/page.tsx`; `src/lib/financial-review/types.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Renewal and active views use safe progress and bounded polling; read endpoints no longer settle expiry. Pending-refund message precedence regression fixed. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-022, FR-024. **Depends on**: T043. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: A held operation must not look like indefinite ordinary processing.
  - **Expected**: Safe reviewRequired/settlementState/reason/next action projection; no GET financial mutation and no false success.
  - **Possible bugs**: Status-only old consumers regress; endless polls; lost operation reference.
  - **Fix/Mitigation**: Keep legacy envelope plus additive fields; stop ordinary polling on explicit holds and offer supported action.
  - **Verification**: Q03/Q04 state matrix; Q07 waiting, review, blocked panel refund, error, reload and success UI.

- [x] T045 [US7] تصحيح نماذج المراجعة والرسائل والترجمة وحالات الجاهزية — `src/components/admin/financial-review/FinancialReviewClient.tsx`; `src/components/admin/BeINConfigForm.tsx`; `src/app/dashboard/admin/bein-accounts/page.tsx`; `src/i18n/translations/ar.ts`; `src/i18n/translations/en.ts`; `src/i18n/translations/bn.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Server-derived review controls, stable legacy decision identity, note/evidence validation and localized readiness/actions verified across browser sizes/locales with keyboard focus. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-012, FR-018, FR-019, FR-022, FR-024. **Depends on**: T026, T036, T044. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Optional note label contradicts server and readiness needs actionable feedback.
  - **Expected**: Required decision note with matching limits; separate evidence note; server-derived action controls; localized account/mode/refund reasons.
  - **Possible bugs**: Missing translation; stale capability; inaccessible disabled button/error.
  - **Fix/Mitigation**: Reuse catalogs/components, keyboard/focus/aria-live, revalidate action server-side, support 360/768/1280 RTL.
  - **Verification**: Q02 locale key parity; Q03 note validation; Q07 keyboard/RTL/responsive and async failure/success cases.

## Phase 10 — US8 / دليل الإصدار والتشغيل

**Goal / independent acceptance**: See US8 in [spec.md](spec.md). Complete this story's defined success, negative, retry, and recovery scenarios; shared-file integration follows the dependencies below.

- [x] T048 [US8] إدراج كل اختبارات التسوية المطلوبة في CI — `.github/workflows/ci.yml`; `scripts/audit-gate-manifest.cjs`; `scripts/run-audit-gates.cjs`; `tests/unit/audit-gate-coverage.test.ts`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** CI uses explicit integration manifest and executable missing/empty/skip/TODO failure gate; all selected local suites have execution records. CI migration provisioning remains blocked separately. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-025, FR-031. **Depends on**: T005, T065. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: The panel financial and connected regression suites need explicit CI selection.
  - **Expected**: CI selects panel installment/latest-verification/finalization and in-scope remediation suites with disposable gates; required skips fail readiness.
  - **Possible bugs**: New glob runs unsafe tests; CI declares skipped suites passed.
  - **Fix/Mitigation**: Use explicit safe integration selection and guard validation; include intended branch/PR execution policy.
  - **Verification**: Q01 workflow audit; Q06 future CI; named panel/shared regression suites plus in-scope regression suites have execution records.

- [x] T049 [US8] إضافة تحقق ترابطي للنقاط والعمولات والمديونيات والتحويلات والتقارير — `tests/integration/audit-connected-financial-regression-db.test.ts`; existing matrix-selected unit suites; `specs/036-audit-remediation/evidence/regression-matrix.md`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Connected points/ownership/financial DB scenarios and debt/transfer/report/signal/bulk unit/handler regressions pass; coverage depth and limits recorded in regression-matrix.md. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-027, FR-025, FR-028. **Depends on**: T029, T031, T033, T036, T048. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Shared owner/ledger/status changes may affect functions outside changed files.
  - **Expected**: Matrix and targeted scenarios cover points/commission snapshots, debt/transfer totals, provider reports, signals/bulk eligibility and ownership.
  - **Possible bugs**: Broad shallow regex tests; unsolicited policy rewrite.
  - **Fix/Mitigation**: Use inventory-selected real services with synthetic fixtures; preserve commercial policy; include only meaningful regression cases.
  - **Verification**: Q08 exact matrix-selected suites and Q04 new connected-financial-regression suite.

- [x] T050 [US8] تنفيذ مجموعات التحقق المعزولة وتسجيل النتائج الفعلية — `specs/036-audit-remediation/evidence/verification.md`; `tests/integration`; `worker/tests`
  - **Evidence — 2026-09-08 / LOCAL COMPLETE:** Combined local verification recorded: unit and worker gates, synthetic PostgreSQL/Redis suites and connected follow-up cases, zero required skips; no provider or production requests. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-025, FR-030, FR-031. **Depends on**: T012, T049. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Written tests are not evidence until run under authorized isolated scope.
  - **Expected**: After later authorization, record Q02-Q05/Q08 outcomes, versions, selected suites, failures and skips; no real provider requests.
  - **Possible bugs**: Using production DB URL; reporting skipped integration as pass.
  - **Fix/Mitigation**: Disposable guard, provider doubles, explicit environment identity and redacted evidence; stop on unintended external target.
  - **Verification**: Q02-Q05/Q08 only after scope authorization; all relevant cases executed or task remains incomplete.

- [ ] T051 [US8] التحقق من الأنواع والبناء وملفات الاعتماد في بيئة آمنة — `specs/036-audit-remediation/evidence/verification.md`; `package.json`; `worker/package.json`
  - **Local status — 2026-09-08:** LOCAL PARTIAL: root/worker types and isolated web/worker compilation pass. Focused lint is recorded; broader lint still has errors outside this slice. Extended quality now fixes all in-scope lint errors; seven excluded mobile/customer errors and 41 warnings remain in the full lint run. Full Q06/CI acceptance remains open; no dependency upgrades to conceal failures. See [extended verification](evidence/extended-quality-verification.md). [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-025, FR-030, FR-031. **Depends on**: T050. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Source review cannot establish that the combined web/worker release builds.
  - **Expected**: Authorized local/CI schema sync, lint, web and worker builds with recorded outcomes; inspect package-lock consistency.
  - **Possible bugs**: Building into live .next or changing packages to hide unrelated failures.
  - **Fix/Mitigation**: Use isolated checkout/artifact paths; no blind dependency upgrade; classify existing/new failures honestly.
  - **Verification**: Q06 commands in quickstart; no build in this planning task.

- [ ] T052 [US8] تجربة ترحيل البيانات القديمة والتراجع على نسخة صناعية معزولة — `specs/036-audit-remediation/evidence/migration-rehearsal.md`; `tests/integration/audit-migration-compatibility-db.test.ts`; `docs/deployment/audit-remediation-release.md`
  - **Local status — 2026-09-08:** LOCAL PARTIAL: new additive scheduling migration and synthetic compatibility cases pass; 0_init is confirmed empty; refund-migration directory absence is intentional per Git/test evidence. Fresh baseline and full upgrade/rollback rehearsal remain unverified. See [history correction](evidence/extended-quality-verification.md). [Current verification](evidence/local-backlog-verification.md).
  - **Observed prerequisite — 2026-09-07**: Phase 2 acceptance used schema-only bootstrap because 0_init is empty. Establish a reproducible, reviewed fresh-install baseline and full upgrade/recovery rehearsal without rewriting recorded migrations; the synthetic Phase 2 run does not close this gap. [Evidence](evidence/phase-2-runtime-verification.md).
  - **Requirements**: FR-020, FR-026, FR-030. **Depends on**: T040, T051. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Production migration history is unknown and old rows may block constraints.
  - **Expected**: Execute authorized disposable rehearsal for modern/legacy/alias/panel-deduction cases and document forward-repair rollback boundaries.
  - **Possible bugs**: Deleting evidence in rollback; assuming all old data can auto-backfill.
  - **Fix/Mitigation**: Synthetic snapshot only; explicit incompatible-row holds; preserve money/event ledgers.
  - **Verification**: Q09 isolated migration rehearsal; zero production reads/writes.

- [ ] T053 [US8] تسجيل إثبات beIN الحقيقي للقراءة فقط بعد تصريح مستقل — `specs/036-audit-remediation/evidence/provider-readiness.md`; `scripts/verify-sold-report-contract-correlation.ts`
  - **Requirements**: FR-019, FR-028, FR-030. **Depends on**: T052. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Mocked/fixture scans cannot establish real report-contract invoice equality.
  - **Expected**: With explicit provider-read authorization, gather sanitized real coverage and release-bound attestation; no renewal or payment submitted.
  - **Possible bugs**: Live smoke changes session/provider state beyond read scope; secrets logged.
  - **Fix/Mitigation**: Use approved fenced read-only adapter, permitted accounts and redaction; unavailable evidence keeps gate pending.
  - **Verification**: Q10 only after explicit authorization and T038 adapter completion; record pass/fail and expiry.

- [ ] T054 [US8] Verify panel consumer acceptance - `specs/036-audit-remediation/evidence/consumer-acceptance.md`; `specs/036-audit-remediation/contracts/consumer-api.md`
  - **Local status — 2026-09-08:** LOCAL PARTIAL: 22 mocked-browser scenario groups and panel API contracts pass at 360/768/1280; T051 full-quality gate and provider-based acceptance remain open. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-022, FR-024, FR-030. **Depends on**: T045, T051. **Owner**: current-task implementer.
  - **Reason**: Web UI states and connected API behavior need observed acceptance.
  - **Expected**: Authorized browser checks cover panel at 360/768/1280px, supported locales, keyboard/RTL and financial waiting/review/result states.
  - **Possible bugs**: Visual success hides contract failure; narrow viewports hide actions.
  - **Fix/Mitigation**: Verify first-party web flows against deterministic responses; no live financial transaction for screenshots.
  - **Verification**: Q07 isolated web UI and Q03 panel contracts. Store and phone-app modifications are excluded.

- [ ] T055 [US8] مطابقة جاهزية السيرفر والبيانات والخدمات بقراءة مصرح بها — `specs/036-audit-remediation/evidence/production-preflight.md`; `docs/deployment/audit-remediation-release.md`
  - **Requirements**: FR-018, FR-020, FR-021, FR-026, FR-030. **Depends on**: T052. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Actual deployed commit/migrations/accounts/cron/workers remain unknown.
  - **Expected**: Later authorized read-only inventory records deployed revision, migrations, eligible accounts, in-flight work and exact topology; blockers named.
  - **Possible bugs**: Implicit DB access from planning; sensitive rows copied into report.
  - **Fix/Mitigation**: Explicit operational read scope, aggregates/redaction, no mutation or live tests.
  - **Verification**: Q11 production preflight only after explicit authorization; no preflight was run during planning.

- [ ] T056 [US8] تجميع حزمة إصدار قابلة للمراجعة وربطها بكل دليل قبول — `specs/036-audit-remediation/evidence/release-decision.md`; `docs/deployment/audit-remediation-release.md`; `specs/036-audit-remediation/tasks.md`
  - **Requirements**: FR-001, FR-026, FR-031. **Depends on**: T053, T054, T055. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Untracked files/migrations and unresolved P1 evidence cannot be omitted from a release.
  - **Expected**: Exact commit/artifact manifest, intended files/migrations, task evidence, zero mandatory blockers and concrete cutover/rollback proposal.
  - **Possible bugs**: Accidental inclusion of unrelated changes; stale live attestation at release.
  - **Fix/Mitigation**: Review actual diff against baseline; revalidate time-bound evidence and source revision; no automatic commit/push.
  - **Verification**: Q12 release checklist against task/evidence graph; user reviews concrete release before operational action.

- [ ] T057 [US8] تنفيذ النشر والمراقبة فقط بعد اعتماد حزمة الإصدار — `specs/036-audit-remediation/evidence/deployment.md`; `docs/deployment/audit-remediation-release.md`
  - **Requirements**: FR-021, FR-026, FR-030, FR-031. **Depends on**: T056. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Deployment is a distinct operational action outside the current request.
  - **Expected**: After explicit release authorization, follow validated cutover and record services, queues, reviews/refunds/effects health and rollback decision.
  - **Possible bugs**: Traffic served from rebuilding .next; lost in-flight financial work; expired attestation.
  - **Fix/Mitigation**: Stop admission/drain/fence, protected artifacts and migrations, matching workers; hold on conflict and use approved rollback limits.
  - **Verification**: Q12 authorized deployment only; task remains unchecked without operational evidence.

## Phase 11 — Closure / إغلاق التتبع

- [ ] T058 تحديث حالة المهام وذاكرة المشروع وإعادة تحليل Spec Kit — `specs/036-audit-remediation/tasks.md`; `specs/036-audit-remediation/README.md`; `specs/036-audit-remediation/audit-register.md`; `PROJECT_MEMORY.md`; `docs/PROJECT_GUIDE.md`
  - **Local status — 2026-09-08:** LOCAL DOCUMENTATION UPDATED: current tasks, evidence, runbook and project memory synchronized without subagents. Final release closure remains dependent on T057. [Current verification](evidence/local-backlog-verification.md).
  - **Requirements**: FR-001, FR-030, FR-031. **Depends on**: T057. **Owner**: current-task implementer; root owns integration and evidence.
  - **Reason**: Future delivery must not be confused with today's completed planning.
  - **Expected**: Every completed task links actual evidence; analyze/converge finds no missing work; memory reflects delivered versus unknown state.
  - **Possible bugs**: Checking blocked operational tasks; declaring all 188 files verified from selective checks.
  - **Fix/Mitigation**: Keep unresolved tasks open with owners; update artifacts before scope changes; repeat analyze after drift.
  - **Verification**: Q01 documentation consistency/freshness plus implementation-stage analyze/converge; no false completion when any required gate is pending.

## Dependencies and implementation strategy

## Review repair slice — 2026-09-08

- [x] T059 [US2] Author review regressions — `worker/tests/promo-package-refresh.test.ts`; `worker/tests/account-locking.test.ts`; `tests/unit/review-repairs.test.ts`; `tests/integration/promo-dispatch-revision-db.test.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-007, FR-011, FR-025. **Depends on**: T005, T015. **Owner**: current-task implementer.
  - **Reason**: Prior mocks missed handoff, closure and unresolved network requests. **Expected**: Reproduce defects before runtime edits. **Possible bugs**: Fake locks prove only mocks. **Fix/Mitigation**: Exercise actual modules and explicit competing owners; use isolated services when available. **Verification**: Q02/Q04/Q05 focused regressions recorded in review-repair evidence.
- [x] T060 [US2] Implement fenced preparation handoff — `worker/src/pool/account-locking.ts`; `worker/src/http-queue-processor.ts`; `worker/tests/account-locking.test.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-007, FR-025. **Depends on**: T059. **Owner**: current-task implementer.
  - **Reason**: Another worker cannot continue a valid operation. **Expected**: Only a parked exact owner can transfer across worker IDs. **Possible bugs**: Stealing active execution or stale publication. **Fix/Mitigation**: CAS and existing execution lease; no plain unlock. **Verification**: Different-worker continuation and competing/lost-owner tests.
- [x] T061 [US3] Close proven pre-sale quote conflicts safely — `worker/src/lib/promo-quote.ts`; `worker/src/http-queue-processor.ts`; `tests/integration/promo-dispatch-revision-db.test.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-003, FR-007, FR-011. **Depends on**: T060. **Owner**: current-task implementer.
  - **Reason**: A zero-debit conflict strands card/account. **Expected**: Atomic zero-refund closure only with positive pre-sale evidence and no contradictions. **Possible bugs**: Releasing after mutation or stale job. **Fix/Mitigation**: Canonical locks, execution fence, exact revision/snapshot, provider/ledger/dispatch vetoes; retain review otherwise. **Verification**: Q04 safe closure, replay, wrong revision, lost lease and each financial veto.
- [x] T062 [US4] Enforce current panel identity — `src/lib/auth-utils.ts`; `src/lib/api-middleware.ts`; `src/app/api/operations`; `tests/unit/operation-auth-contract.test.ts`; `tests/helpers/promo-dispatch-harness.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-013, FR-014, FR-025. **Depends on**: T005. **Owner**: current-task implementer.
  - **Reason**: Route-local sessions bypass revocation/current role. **Expected**: Existing central guard precedes every panel action. **Possible bugs**: Lost ownership exceptions or changed non-panel auth. **Fix/Mitigation**: Inventory callers and preserve boundaries. **Verification**: Actual guard/route denial and allowed role/owner cases; no writes on denial.
- [x] T063 [US5] Recover preparation dispatch and reject unsupported admission — `src/lib/operation-dispatch.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`; `src/app/api/operations/create/route.ts`; `src/app/api/operations/bulk/route.ts`; `tests/unit/dispatch-recovery-all-types.test.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-015, FR-016, FR-029. **Depends on**: T061, T062. **Owner**: current-task implementer.
  - **Reason**: Exhausted promo waits indefinitely until expiry; legacy input has no handler. **Expected**: All-type bounded dispatch with current-revision exhaustion and pre-debit rejection. **Possible bugs**: Replaying Pay or overwriting new quotes. **Fix/Mitigation**: Stable identities, status/CAS and existing financial recovery. **Verification**: Queue failure/retry/exhaustion/stale revision, unsupported input and no-debit cases.
- [x] T064 [US7] Bound network waits and align required review notes — `src/app/dashboard/renew/page.tsx`; `src/components/admin/financial-review/FinancialReviewClient.tsx`; `src/lib`; `src/i18n/translations`; `tests/unit/review-repairs.test.ts`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-007, FR-012, FR-024. **Depends on**: T061. **Owner**: current-task implementer.
  - **Reason**: Awaited requests bypass polling deadline; optional label conflicts with API. **Expected**: Network/body timeout releases UI while preserving retry identity; notes validated before submit. **Possible bugs**: Assuming timeout cancels server work. **Fix/Mitigation**: Abort plus immutable request identity and localized errors. **Verification**: Never-resolving transport/body, retry, whitespace/oversize note and browser states.
- [x] T065 [US8] Repair CI/type coverage and verify combined repair — `.github/workflows/ci.yml`; `tests/unit/audit-financial-context.test.ts`; `src/lib/api-middleware.ts`; `specs/036-audit-remediation/evidence/review-repairs.md`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-025, FR-026. **Depends on**: T060, T061, T062, T063, T064. **Owner**: current-task implementer.
  - **Reason**: New suites omitted from CI; known type errors block build. **Expected**: Focused checks and root/worker types pass, CI names real tests. **Possible bugs**: Claiming clean migration install from schema bootstrap. **Fix/Mitigation**: Preserve provenance blockers and separate build/test evidence. **Verification**: Q02-Q06 in isolation, encoding/diff/source checks; record any blocked check honestly.
- [x] T066 [US8] Reconcile provider and rollout evidence gaps — `specs/036-audit-remediation/evidence/review-repairs.md`; `docs/deployment/audit-remediation-release.md`; `PROJECT_MEMORY.md`; `docs/PROJECT_GUIDE.md`
  - **Evidence 2026-09-08 / COMPLETE (local scope):** [Review repair results and limits](evidence/review-repairs.md). Original broader acceptance and release gates remain open.
  - **Requirements**: FR-018, FR-019, FR-020, FR-026, FR-030. **Depends on**: T065. **Owner**: current-task implementer.
  - **Reason**: Authentic installment/cart and migration/server evidence cannot be invented. **Expected**: Close source-resolvable gaps and identify exact remaining adapter/provenance/readiness gates with original task owners. **Possible bugs**: Calling safe review a working settlement path. **Fix/Mitigation**: Preserve UNKNOWN and original unaccepted tasks; no provider/production traffic. **Verification**: Source-backed gap matrix, analyze/reconciliation, guide/memory validation; no release acceptance.

The repair tasks above are the current independent slice. Their direct dependencies supersede story-order scheduling for these exact paths only. Original broader T024-T058 acceptance remains separate. Test authoring precedes each risky runtime change even when grouped in its implementation task.

- T001–T005 establish baseline, contracts, failing model cases and additive compatibility. No runtime implementation starts before planning analysis passes and the user requests implementation.
- Main integration order: US1 -> US2 -> US3 -> US4 -> US5 -> US6 -> US7 -> US8 -> closure. Tests marked [P] may be authored after their direct prerequisites without changing shared runtime files.
- Shared `worker/src/http-queue-processor.ts`, `src/lib/operation-dispatch.ts`, both schemas, maintenance runner, review component and locales have one active writer at a time.
- Independent examples: US1 T006/T011 use distinct test files after T005; US2 T015 after T005; US3 T024 after T017; US4 T027 after T005; US5 T030 after T017 and T032 after T026; US6 T035/T037/T039 after T005; US7 T043 after T026. These are scheduling opportunities, not automatic delegation.
- First demonstrable increment: T001–T012 (financial closure), with all US1 acceptance evidence. It is not a release of the entire pre-existing dirty tree.
- Operational evidence fan-out: T053/T054/T055 follow isolated rehearsal T052; T056 waits for all three. T057 cannot run merely because code is complete. T058 cannot mark required but unauthorized release work complete.
- If scope changes, update spec first, then affected design/checklists/tasks, and rerun analyze before implementation. Preserve stable task IDs; append new tasks rather than silently renumbering completed work.
