# Recovery and completion effects — 2026-09-08

T030-T034 local evidence. The panel outbox is drained by the declared `bein-maintenance` runner. The authenticated cron entry is an alternative trigger; do not configure it as a second independent periodic scheduler. Row CAS, stable queue identity and provider submission fencing remain required even with a leader lease.

| Work | Bound and durable identity | Failure outcome |
| --- | --- | --- |
| Pending/stale dispatch | Default 50, cap 200 per scan; operation/type/revision identity; claim/ack/failure compare attempt generation | Five total delivery attempts; retry delays 5s, 30s, 120s, 600s; exhausted work becomes explicit review. |
| Provider Pay | Existing immutable submission marker and final job identity | Queue delivery retry never authorizes another Pay. Uncertain submission stays held. |
| Completion effects | Unique operation/effect; immutable completion snapshot; default 50, cap 200; UUID lease, 60s stale threshold | Same five-attempt schedule; exhausted count and oldest pending age appear in health. |
| Local effect application | Effect lock plus notification/counter writes and DELIVERED marker in one PostgreSQL transaction | Crash before commit rolls back both; retry does not increment twice. |
| Points | Captured award run/recipient snapshot | Reuses existing finalizer and repair; effect delivery does not recalculate rewards or ownership. |
| Leader release | One Redis compare-and-delete Lua operation | An expired predecessor cannot delete its successor's token. |

New dispatch indexes: `(status,nextAttemptAt)` and `(status,updatedAt)` in `20260908120000_dispatch_retry_schedule`. Both Prisma schemas agree. This migration was applied only to the synthetic audit database.

Behavioral evidence: all admitted operation job types exercise queue failure, stale/duplicate/late acknowledgements and exhaustion; actual Redis/BullMQ preserves one final-confirmation job after lost acknowledgement and concurrent retry. A late pre-payment phase update cannot erase a committed Pay marker. The Redis lease regression executes the actual Lua script against a unique test key.

Auto and manual completion tests verify effect capture; concurrent consumers, failure after counter updates, crash/replay, exhaustion and historical-row non-backfill are covered. Maintenance exception logs now keep safe context and omit raw provider/connection errors. Health reports aggregate effects; no customer receipt/session payload is added.

Sources: `src/lib/operation-dispatch.ts`; `shared/operations/completion-effects.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`; `tests/integration/dispatch-recovery-all-types-db.test.ts`; `tests/integration/dispatch-redis-replay-db.test.ts`; `tests/integration/completion-effects-db.test.ts`; `tests/integration/renewal-fulfillment-finalization-db.test.ts`; `tests/unit/maintenance-bounds-privacy.test.ts`.

Limits: queue delivery was observed locally, not a live provider execution. Historical completed operations are not automatically backfilled. Actual cron ownership, process capacity and production backlog age remain T055/T056.
