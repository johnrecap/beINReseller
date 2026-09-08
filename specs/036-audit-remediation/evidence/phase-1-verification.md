# Phase 1 verification — T001 / T002

**Date:** 2026-09-07. **Environment:** local source tree, no application or service execution.
**Scope:** the maintainer's Phase 1 / Setup request. T003–T058 remain unexecuted.
**Evidence type:** Q01 only. Status of Q02–Q12: NOT_RUN.

## Accepted results

| Task | Result | Source evidence | Acceptance |
| --- | --- | --- | --- |
| T001 | Frozen local revision and drift inventory | [baseline.md](baseline.md), [baseline-sources.json](baseline-sources.json), audit-register source matrix | PASS: 1,116 hashes; original 1,103-file comparison preserved; no runtime drift from the reviewed snapshot |
| T002 | Operation guards, queue graph, spend/effect consumers and intersecting locks | [consumer-inventory.md](consumer-inventory.md), [consumer-index.json](consumer-index.json) | PASS: all 19 route files / 21 HTTP handlers; every indexed path/line/task resolves |

The index has 479 category entries covering 348 unique files. Categories overlap. Only the operation route guard/ownership matrix and named financial/queue/lock boundaries are described as read for behavior; broad import/test indexes are discovery evidence. There is no claim of 348 complete file audits.

## Checks actually performed

- `specify version --features --json`: 0.12.17.
- `specify integration status --json`: Codex present, zero missing managed files. Six pre-existing customized shared files preserved.
- `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`: correct feature-036 paths and all required documents.
- Checklist count: requirements 16/16; safety-and-coverage 24/24. This is requirement quality, not runtime validation.
- Read-only Python metadata checks: byte SHA-256 comparison, source existence and line bounds, complete route-file enumeration, 21 exported methods, nonempty valid owner tasks for every indexed entry, 58 unique task IDs, all 31 requirements covered, dependency order and six detail fields per task.
- UTF-8/BOM/replacement-character/mojibake inspection on feature documents and evidence.
- Closing Q01 checks passed: scoped Git whitespace inspection, 16 Markdown files with no broken local links, source anchors/task ownership, and project-memory structural validation. The final source comparison found exactly eight existing documentation files changed and five new evidence files; 1,108 existing files stayed byte-identical. Only T001/T002 are checked, and all 31 requirements remain covered. Memory freshness is refreshed after the final saved-document state; the frozen baseline is never rewritten.

## Preservation boundary

Only evidence/tracking files under feature 036, the project guide and project memory are writable in this slice. The current branch, HEAD, original runtime changes, schemas, migrations, package files, queues and services are preserved. The baseline includes metadata hashes, not credentials or runtime data.

No Node/Next/worker application import, unit/integration/e2e run, build, Prisma execution, DB/Redis access, HTTP request to beIN/Stripe, PM2 operation or Git network/commit operation was performed.

## Reconciliation of discovered scope

- AUD-005: include operations collection GET's claim-only wrapper in T028; preserve each route's owner/ADMIN/customer rule.
- AUD-014 / FR-015: T030/T031 cover legacy CHECK_BALANCE admission without an HTTP consumer and direct queue producers. T031 must reject unsupported input before deduction rather than alias it to an unrelated provider-account job.
- AUD-016: T041 covers actual store/customer queueTarget values and CUSTOMER_WORKER_CONCURRENCY, plus the two PM2 profiles.
- Financial locking: distinguish current ordering from the future common order; T003/T021 own concurrency regressions and all participating writer adaptations.
- Store public SubscriptionPackage catalogue is local data; per-card package discovery is beIN-derived. The inventory distinguishes both.

No new task IDs were needed; existing task detail/owned paths were refined before any runtime implementation. The accepted slice closes at T002. Whole-feature convergence and all release gates remain later work, including T058; this document does not claim that feature 036 is implemented or releasable.

## Follow-up state

All twenty audit items remain open. T001/T002 completion supplies their baseline and integration map; it is not evidence of defect repair. Next dependency-ready phase is Phase 2 / Foundation, starting T003, under a subsequent execution request and its applicable verification boundaries.
