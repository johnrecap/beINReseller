# Local backlog acceptance — 2026-09-08

This contract refines existing tasks after the maintainer approved execution without subagents. It does not add a new product, consumer or provider integration.

Implemented local routing reuses `BEIN_EXECUTED_NO_REFUND` for both modern and attributable legacy receipt completion; legacy requests additionally require a stable decision key and source reference. `RESOLVE_PRE_MUTATION` is limited to affirmative unsent evidence. Legacy post-attempt refunds without an attributable rejection plus independent non-execution, and deferred installment adjudication, retain explicit holds. No artificial modern timestamp or new installment settlement policy is introduced. The local capability contract accepts these precise holds; it does not mark the deferred provider evidence fulfilled.

| Family | Existing work reused | Remaining acceptance |
| --- | --- | --- |
| T027-T029 | T062 current identity and denial suite | Persisted actor reset/activity/current-role matrix; owner/non-owner and ADMIN exceptions; no side effects on denial. |
| T030-T031 | T063 all-type watchdog and unsupported admission | Each admitted type: outage, stale claim, duplicate delivery, exhaustion, terminal/review veto; concurrent dispatch and payment identity preserved. |
| T024-T026 | Strict modern finalizers, T061 pre-sale closure, T064 notes | Pure evidence-family capabilities, transactional revalidation, safe explicit legacy outcomes or holds; scoped admin contract and replay/race tests. Deferred installments stay held. |
| T043-T045 | Existing renewal/active views and localized note validation | Consumer-safe state/next action/reasons, server-derived admin controls, localized errors and keyboard/RTL/responsive verification. |
| T032-T034 | Existing effect schema and captured points runs | Atomic creation/application, crash/replay recovery, bounded retry/exhaustion and privacy-safe health. No external-message delivery introduced. |
| T035-T036 | Existing pool/reservation/config eligibility | Pre-debit readiness with own-reservation exception, visible precise unavailable mode/account reasons, no guessed exclusivity. |
| T039-T042 | Existing reconciliation and release-gates document | Bounded dry-run compatibility report, synthetic legacy/constraint tests, declared panel topology and reviewed cutover/rollback runbook. No historical migration rewrite. |
| T048-T051 | Existing CI suites, passing focused types/lint | Coverage/skip guard, connected accounting regressions and recorded isolated build/verification results. |

T052/T054/T058 may record local evidence as it becomes available; broad release acceptance remains open when its deferred prerequisites are missing. Preserve historical results and stable task IDs, and mark partial versus accepted accurately. Tests may create and remove only their own synthetic fixture identities. No fixture data enters the interactive clone or production.
# Dispatch scheduling refinement — T030/T031

The stale-acknowledgement tests reproduced overwrite of CANCELLED/REVIEW_REQUIRED and newer claim generations. Dispatch claims and acknowledgements will compare the captured attempt number. A thrown queue error is never delivery evidence; BullMQ's successful stable-ID result acknowledges duplicate delivery normally. Add `OperationDispatch.nextAttemptAt` with indexed `(status, nextAttemptAt)` scanning and `(status, updatedAt)` stale-claim scanning via a new additive migration, preserving historical migrations. Both Prisma schemas must match. Five total queue-delivery attempts use the planned 5s/30s/2m/10m delays; final provider Pay is not retried by this policy. Tests and migration rehearsal target only the disposable audit database.
