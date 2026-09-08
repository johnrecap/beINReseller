# Panel-only delivery scope amendment

Date: 2026-09-07. Authority: after excluding the phone application, the maintainer explicitly requested cancelling store modifications as well.

## Scope and preservation

Active delivery covers the reseller/admin web panel, its beIN renewal/installment/offer flow, panel financial reviews, permissions, reporting, and required shared services/workers. Responsive browser behavior remains included. Store subscriptions, store credit, Stripe refunds/webhooks, customer-worker enablement and phone-app integration are excluded.

This is a planning change only. Existing runtime code, tests, schemas, migrations, processes and prior verified results remain intact. Shared-source changes must preserve existing guards and compatibility; discovering a need to alter an excluded flow requires a separately accepted scope change. Excluded defects are not declared fixed, safe or production-ready. A panel-only acceptance does not certify an entire shared deployment or excluded consumers.

## Retired work and tracking

- Newly retired tasks: T009, T010, T013, T014, T018, T019, T020, T021, T022, T023.
- Previously retired phone-app tasks: T046 and T047.
- T009 was historically accepted; its source/tests and Phase 3 evidence remain. It is removed from active progress, not reverted or reclassified as a failed test.
- Newly retired requirements: FR-004, FR-006, FR-008, FR-009, FR-010. FR-023 remains retired.
- Newly retired audit items: AUD-001, AUD-003, AUD-004, AUD-009, AUD-017. AUD-015 remains retired.
- D03/D04 customer-spend and external-refund decisions are retired; D11 remains retired.
- Store-only safety checklist IDs CHK002/CHK004/CHK006/CHK007/CHK010 are retired.
- Stable remaining IDs and phase numbers are preserved.

Current totals: **46 active tasks / 7 accepted, 25 active requirements, 14 active audit items, 8 user stories**. Accepted active tasks are T001-T006 and T011. LOCAL-001 remains a separate historical supplemental repair.

## Narrowed tasks and dependencies

Panel-only narrowing applies to T024-T026 reviews, T030-T034 recovery/effects, T036 readiness, T039-T042 compatibility/topology/release, T043-T045 views and T048/T052/T054 verification. Non-panel credential rejection remains a panel security test, not a store modification. Completed foundation task descriptions and historical evidence describe work already performed; they do not authorize new store work.

- T012 depends on T008 and T011 (customer-spend work T010 removed).
- Phase 4 now consists of T015, T016 and T017: panel offer regression cases; revision-aware preparation with immutable final-payment identity; panel quote refresh and stale-price validation.
- T016 depends on T012 and T015; the existing financial dependency remains visible.
- T024 and T030 depend on T017.
- T025 depends on T024.
- T032 depends on T026.
- T048 continues to depend on T045.

Phase 3 remains PARTIAL: attributable installment observation under T007 is unresolved; T008/T012 check-offs retain their dependency gates. The earlier Phase 4 request remains pending after this scope update; no Phase 4 implementation or test run is claimed here.

## Spec Kit analysis and convergence

Check active IDs, dependency resolution/cycles, requirement and audit coverage, task fields, checklist completeness, document links and source preservation. Optional Git commit hooks remain omitted to preserve the user's uncommitted work. No new task is appended by scope removal. Runtime tests/builds, database/provider operations and service actions are outside this documentation change.

Static verification PASS: {"tasks": 46, "accepted": 7, "requirements": 25, "coverage_percent": 100, "audit_items": 14, "missing_dependencies": 0, "cycles": 0, "checklists": {"requirements.md": 16, "safety-and-coverage.md": 19}, "phase3_runtime_hashes_unchanged": 15, "analysis": "PASS", "new_convergence_tasks": 0}. No runtime tests or builds were run.
