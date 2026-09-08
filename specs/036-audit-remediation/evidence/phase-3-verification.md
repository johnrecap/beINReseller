# Phase 3 / US1 — component verification and remaining evidence

**Current scope note:** The later [panel-only amendment](panel-only-scope-amendment.md) excludes store modifications too. Current progress is 7/46; original counts/results below are historical and are preserved.

**Historical scope note:** This run predates the [web-only amendment](web-only-scope-amendment.md). Its test results and original task denominator are preserved. Current active progress is 8/56; phone-app delivery has been removed.

2026-09-07. Branch/HEAD preserved: 034-web-project-memory / 7457b7028811759736faa799a8b06b43691b1218 plus existing local changes. **Phase 3 is PARTIAL.** Test tasks T006/T009/T011 are accepted (8/58 total, 3/7 in this phase). T007 remains open; T008/T010/T012 component acceptance is held behind its dependency. No commit or deployment.

## Implemented behavior

- Installment creation records purpose INSTALLMENT. Confirmation rejects wrong purpose, missing payer and non-finite prices. Before payment, the worker checks the exact loaded due item, price and card. A durable single-use claim binds account/card/due item/correlation/time to current reservations, generation and original deduction. Both payment POSTs check the execution lease and disable transport retries. Replayed or crashed claims never submit again.
- The installment finalizer takes canonical card locks then the operation lock. Exact negative evidence refunds the original deduction once, reverses applicable points, marks FAILED and releases reservations atomically. Missing deduction, wrong context, positive spend, pending refund and unknown settlement hold for review. Exact attributable SETTLED evidence plus matching spend supports replay-safe completion and the existing award-run capture.
- **The current HTTP adapter only supplies generic success/error and balances. All real installments submitted through it now remain under review until an attributable settlement observation is available.** The processor records observed debit separately and keeps settlement UNKNOWN. It does not invent receipts, rejection references or renewal Sold Report proof. Do not deploy this partial installment path as a finished feature.
- Provider-spend writers derive reseller/customer ownership under the operation lock. Replay checks owner/account/amount/balances; a unique-key race cannot silently accept conflicts. Customer spend uses provider cost, not retail price. Recovery retains owner identity, report DTOs include either owner and the existing table displays customers. Automated customer completion was exercised without reseller point awards.
- No-charge renewal finalization checks expected verification, active baseline and latest attempt, complete negative scan, no remaining retry and all spend/proof/manual/refund vetoes. Stale CHECK_FAILED presentation state no longer blocks the final negative. Derived state, refund and reservations commit together. Generic recovery cannot infer this settlement from old JSON.

## Verification

Tests use deshpanel_audit_test_20260907_v2 on loopback 5433 with the existing restricted test role and external socket guard. Only synthetic records were created. Snapshot/work databases and provider/worker daemons were not test targets. Worker Prisma generation used the unchanged synchronized schema.

Failing-first evidence:

- T006: seven installment cases initially failed because the new finalizer module was absent. This is a TDD missing-component failure; the old ignored-refund/FAILED ordering was established from source, not by running a real provider operation.
- T009: both owner cases failed against the old required-user writer: undefined userId and no derived customer owner.
- T011: the final-negative-after-CHECK_FAILED regression returned EVIDENCE_CONFLICT twice instead of one refund and one replay. Five negative controls passed before the fix.

**Final combined run: 144 passed, 0 failed, 0 skipped.** Earlier overlapping runs are not added to this total. [Full focused log](phase-3-focused.log); [runtime source hashes](phase-3-source-hashes.json). Cleanup verification found 72 tables, 36 migration records, zero business rows and zero invalid indexes: [database metadata](phase-3-database-metadata.json).

Worker TypeScript no-emit and focused web/test checking passed. The focused web check includes repository declaration files; its initial omission of NextAuth augmentations was corrected without auth changes. Focused ESLint passed with only the existing Browserslist age notice. No web/worker build ran. Schemas remain byte-equal; no source BOM was added and no historical SQL was edited.

## Remaining work and convergence

**T007 needs sanitized original HTTP HTML for an installment settlement/receipt and a definitive rejection, retaining non-secret context needed to bind the observation to the exact due item.** Remove credentials, cookies, ViewState and customer personal information. An offline parser and behavioral fixtures can then be wired without contacting beIN. Generic success text, balance decrease or an empty/unvalidated form is not enough.

T008/T010/T012 code and focused component checks are present; dependency check-offs remain open until this actual observation path is connected. AUD-002/AUD-003/AUD-007 have component remediation evidence, not full closure. Bounded convergence found the remaining work already covered by T007 and appended no new task. Full build, historical-data rehearsal, live-provider acceptance, broader refund orchestration and production rollout remain later gates. Synthetic success does not guarantee an error-free production system.
