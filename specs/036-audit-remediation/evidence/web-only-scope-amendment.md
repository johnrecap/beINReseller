# Web-only delivery scope amendment

**Current scope note:** The later [panel-only amendment](panel-only-scope-amendment.md) excludes store modifications too. Current progress is 7/46; original counts/results below are historical and are preserved.

Date: 2026-09-07. Authority: maintainer explicitly requested removing everything related to the phone application from the tasks because this work targets the web.

## Active scope

Web panel, web store, shared backend/financial services, required queues/workers, web authorization, localization and responsive browser behavior remain in scope. A customer owner, customer worker or narrow browser viewport does not by itself mean phone-app work.

## Removed and narrowed work

- Remove T046 (phone-app guided-renewal contract tests) and T047 (phone-app route/service integration) from the executable task list. Retire their IDs without renumbering or reusing them.
- Retire FR-023, AUD-015 and research decision D11 from active delivery. These are excluded, not resolved or completed.
- Narrow T023, T027, T030, T036, T041, T043, T048 and T054 to web/store/shared requirements. Remove app-only paths, credentials, producers, suite selection and external client acceptance obligations. Historical T004 compatibility remains recorded in previous evidence, without a new app work obligation.
- T048 now depends on T045, the last remaining US7 web task. T054 keeps web browser acceptance and no longer waits for app source/version/access.
- Keep Q07 responsive browser checks and Q11 production preflight. Neither requires phone-app delivery. Existing shared financial and authorization guards must remain intact.

Current totals: **56 active tasks, 8 accepted; 30 active requirements; 19 active audit items; 8 user stories**. Phase 9 now contains T043-T045 (three web tasks). Phase 3 remains partial for its existing installment-observation blocker; this scope amendment does not change test results or claim another implementation complete.

Existing app code, data models, migrations, services and historical verification artifacts are unchanged. Previous inventories and reports describe the scope/evidence at their original dates and do not reactivate retired tasks. No runtime test, build, database connection or provider action is needed for this documentation-only change.

## Spec Kit analyze / convergence

Prerequisites select feature 036. Existing optional Git hooks are omitted; branch and dirty source work are preserved. Static checks PASS: 56 distinct task IDs with the same eight checked tasks, no dependency on T046/T047, no active FR-023 mapping, all remaining requirements covered, all task dependency references resolving without a cycle, both checklists complete, and no app-only work in active task blocks. The web/store/auth/financial and release gates remain represented. No new task is appended; user scope removal is not counted as implementation completion.

Verification: both checklists are complete (16/16 requirements and 24/24 safety). All 15 recorded Phase 3 runtime source hashes are unchanged. This verification is static only; no tests, builds or database operations were run.
