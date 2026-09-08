# Phase 4 / T015 verification — 2026-09-07

## Outcome

Phase 4 PARTIAL; T015 test authoring COMPLETE. Q02/Q04 reproduced the required failing-first cases. Only T015 is checked off; active progress is 8/46. Runtime offer/quote corrections remain unimplemented. T016 depends on unaccepted T012, which depends on T008/T007 attributable installment evidence; T017 depends on T016. These dependencies were not removed to bypass financial acceptance.

## Existing system checked

Subsequent source-only review of changing promo package names: [findings and added T016/T017 acceptance](phase-4-promo-name-review.md). That review changed planning only; it did not rerun or expand the executed T015 results below.

- `src/lib/operation-dispatch.ts`: createOperationDispatch hardcodes persisted actionRevision zero; another promo payload conflicts with the existing operation/type dispatch.
- `src/lib/queue.ts`: reseller job identity currently contains only type and operation ID; distinct promo revisions collide.
- `src/app/api/operations/[id]/apply-promo/route.ts`: refreshing and promoApplied are shared operation flags without a revision correlation.
- `worker/src/http-queue-processor.ts`: promo handler writes packages without checking a preparation revision.
- `src/app/api/operations/[id]/select-package/route.ts`: schema accepts packageIndex/promoCode; no quoteRevision or refreshing gate precedes selection.
- `src/app/api/operations/[id]/confirm-purchase/route.ts`: uses selectedPackage; dedicated quote-revision validation remains planned.
- `src/lib/operations/lock-timeouts.ts`: reused actual package-selection planner.

## Changed files and isolation

Only three test files plus feature documentation/project memory were changed:
`tests/helpers/promo-dispatch-harness.ts`, `tests/unit/promo-dispatch-revision.test.ts` and `tests/integration/promo-dispatch-revision-db.test.ts`.

The test-only loader transpiles and executes whole existing modules, without rewriting their functions. Its explicit import map rejects unknown dependencies; queue/provider/auth globals are replaced before evaluation. Prisma transactions in integration cases use the existing guarded synthetic fixture. Panel selection tests isolate quote admission; they do not certify reservation/auth/queue-delivery correctness. All test inputs use synthetic identifiers.

No runtime source, schema, migration, service, storefront or phone-app code was modified. No worker/provider/payment execution or production action occurred.

## Executed Q02 result

Command: `node --import tsx --test --test-reporter=tap tests/unit/promo-dispatch-revision.test.ts`. Full red result: [phase-4-unit-red.log](phase-4-unit-red.log).

**10 tests: 4 pass, 6 fail, 0 skipped.** The failing-first result is intentional evidence of unimplemented behavior, not a passing feature or permission to ignore failures in CI.

| Case | Observed result |
| --- | --- |
| Second offer revision | FAIL: OPERATION_DISPATCH_PAYLOAD_CONFLICT |
| Same revision/payload replay | PASS: one durable row |
| Changed payload with same revision | PASS: conflict without another row |
| Nonzero final-payment revision | FAIL: not rejected before writing |
| Different offer queue IDs | FAIL: both use APPLY_PROMO--synthetic-op |
| Outbox-to-queue revision transport | FAIL: parsePayload drops both action revisions |
| Legacy final-payment queue ID | PASS: stable zero/omitted identity |
| Current panel quote | PASS: accepted by actual handler |
| Stale panel quote | FAIL: 200 instead of 409 |
| Still-refreshing panel quote | FAIL: 200 instead of 409 |

Nonzero final-payment revision and quoteRevision checks assert the accepted planned contract. Their absence is not evidence that a second payment occurred. No real payment is attempted. Stale worker writeback, concurrent end-to-end offer handling, final confirmation and browser polling still require T016/T017 verification.

## Historical Q04 execution blocker (superseded by explicit approval below)

Seven PostgreSQL cases were authored. None executed: sandbox access to the saved credential failed before a database URL was established. An escalation for that exact credential-backed synthetic test command was rejected by automatic approval review, which considered database-test authorization unclear in light of the original read-only restriction. The rejection was not bypassed; no alternate credential, URL or database was used.

To execute, explicit user confirmation is needed for reading the saved local synthetic-test credential and running only these cases on `deshpanel_audit_test_20260907_v2` at loopback port 5433. The fixture writes/removes its own synthetic rows; it must never target the restored snapshot or interactive work database. Q04 remains NOT_RUN, not skipped/passed.

## Remaining acceptance

T015 is accepted as a test-authoring task after the explicit approval and recorded Q04 run below. Failing behavior remains a release gap; the test suite is not green. T016/T017 remain blocked by the documented dependency graph, independently of database approval. Resolving T007 requires attributable sanitized installment receipt/rejection HTML and its parser; generic HTTP success/balance is insufficient. No remaining task was silently appended or removed.

## Static verification and independent review

Focused TypeScript diagnostics for all three authored test files: zero. Focused ESLint: PASS after renaming the harness local module variable. No full app type/build result is claimed. Both checklist inventories remain complete (16 requirements / 19 safety items); active task dependency graph remains acyclic and all 25 requirements remain mapped.

An independent read-only reviewer identified missing outbox-to-queue coverage and overly broad financial rejection assertions. Both were corrected; final review found no further material objection to this partial test evidence. Integration/concurrency, stale worker writeback, final-confirmation and browser acceptance remain open. Convergence added no tasks and did not bypass T012.

## Authorized PostgreSQL execution — 2026-09-07

The user explicitly approved the explained synthetic test. The prior approval-review blocker is resolved for this exact operation. The saved test credential was read without displaying its contents; target validation occurred before connection/test startup.

Target: `deshpanel_audit_test_20260907_v2` at loopback:5433, role `deshpanel_phase2_test`. No restored snapshot, interactive database, provider or production target was used.

Command: `node --import tsx --test --test-reporter=tap tests/integration/promo-dispatch-revision-db.test.ts`.

**7 tests: 1 pass, 6 fail, 0 skipped.** Current quote selection passed; new revision, same-request replay, persisted revision identity, nonzero final-payment revision rejection, stale quote and refreshing quote expectations failed. These are reproduced behavior/contract gaps, not database connection or fixture failures.

- [Full PostgreSQL result](phase-4-db-red.log)
- [Before/after counts](phase-4-db-verification.json): **71 business tables, zero total rows before and after**, including cleanup following failed assertions.
- Existing Q02 remains 10 tests: 4 pass / 6 fail / 0 skipped. No unnecessary rerun.
- No runtime code, tests, schemas or migration files were changed in this execution turn.

### Additional confirmed replay defect

An isolated read-only `SELECT $1::jsonb` probe used synthetic JSON. Input and returned objects contained identical values (`isDeepStrictEqual: true`), but `JSON.stringify` differed because PostgreSQL returned keys in a different order. The actual `createOperationDispatch` compares stringified objects, so a byte-order comparison rejects identical persisted replay. This is a confirmed connected gap within T016's existing replay contract; semantic/canonical comparison is required without ignoring changed values.

### Acceptance and convergence

T015 requires failing regression evidence before fixes, so its test-authoring acceptance is complete. T016/T017 remain open and dependency-blocked by T012/T007; no financial dependency was removed. Active progress: 8/46, 25 covered requirements, 14 audit items. Convergence clarified the existing replay acceptance and appended no task. Earlier NOT_RUN statements above are historical to the denied pre-authorization attempt.
