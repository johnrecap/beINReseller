# Connected regression matrix — 2026-09-08

T049 reuses the existing business services and tests. No commercial rate, debt, commission, transfer or signal policy was redesigned.

| Connected area | Executed source-based evidence | Limit |
| --- | --- | --- |
| Points and recipient snapshots | `operation-spend-award-run.test.ts`, completion/finalization DB suites; points calculation, routing, awards and policy unit suites | Synthetic ownership/settings; no production balances. |
| Manual/pre-mutation refund accounting | Legacy adjudication and `audit-connected-financial-regression-db.test.ts`: demotion, dispatch/refund race, replay, one canonical refund | Legacy post-attempt refund and installment settlement remain evidence holds. |
| Ownership and transfers | `user-ownership-transfer-concurrency.test.ts`: preserved nonzero financial state, forced race, rollback and current owner; hierarchy/assignment unit suites | Does not execute every deposit or transfer UI. |
| Credit debt and report totals | Existing credit-request-debt, credit-debt-payment-report, balance-movement-report and credit ownership unit suites | Tests actual calculation/query-builder outputs, not full persisted approval workflows. |
| Provider spend reporting | Existing spend report/card search and spend-ledger validation suites; actual financial finalization DB suites | No validation of historical production spend completeness. |
| Signal/bulk access | Actual handler auth matrix, existing worker suites and unsupported CHECK_BALANCE admission tests | No beIN signal request was sent. |
| Old data and migrations | Compatibility fixtures: revision-zero insert, due indexes, legacy/alias/empty package, negative/missing deduction, installment and historical completion hold; finite-money unit cases | Full baseline/upgrade rehearsal remains blocked by migration provenance. |
| Consumer states | Actual packages GET, pure safe DTO, renewal/active/admin browser components | Mocked HTTP responses, not live provider output. |

All selected suites are enumerated by `scripts/audit-gate-manifest.cjs`; database selection is explicit and requires disposable flags. Required skipped/TODO or empty results fail the gate. Full repository lint, provider final-cart/installment evidence and production acceptance remain separately open; passing this matrix is not whole-project certification.
