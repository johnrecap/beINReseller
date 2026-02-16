# Chat Change Log (Current Working Tree)

This file documents all persisted code/database changes currently present from this chat session.

## 1) Database and Schema

### `prisma/schema.prisma`
- Added new operation terminal status: `REVIEW_REQUIRED` in `OperationStatus` enum.

### `worker/prisma/schema.prisma`
- Added `REVIEW_REQUIRED` in worker-side `OperationStatus` enum for parity.

### New migration
- `prisma/migrations/20260216193000_add_review_required_and_financial_guards/migration.sql`
- Adds enum value `REVIEW_REQUIRED`.
- Adds unique partial index: one `REFUND` per `operation_id` in `transactions`.
- Adds unique partial index: one `OPERATION_DEDUCT` per `operation_id` in `transactions`.
- Adds unique partial index: one wallet refund per `reference_id` in `wallet_transactions`.

## 2) Operation State-Race Hardening

### `src/app/api/operations/[id]/heartbeat/route.ts`
- Switched blind `update` to guarded `updateMany` for heartbeat timeout + heartbeat touch.
- Prevents overwriting operations that already changed state in parallel.
- Returns `409` when state moved during request.

### `src/app/api/cron/cleanup-stuck-operations/route.ts`
- Added guarded expiration transition with strict stale-condition check.
- Added safe skip when row already changed state.
- Clears `finalConfirmExpiry` and `heartbeatExpiry` when expiring.
- Refund tracking is now explicit per processed row.

### `src/app/api/cron/timeout-operations/route.ts`
- Added guarded timeout transition using `updateMany`.
- Uses different stale guards for `AWAITING_FINAL_CONFIRM` vs other statuses.
- Adds safe skip when state changed concurrently.
- Clears `finalConfirmExpiry` on timeout.

### `src/app/api/operations/[id]/cancel/route.ts`
- Cancel now disallows terminal statuses: `COMPLETED`, `CANCELLED`, `REVIEW_REQUIRED`.
- Both cancel paths now use guarded `updateMany` (no stale overwrite).
- Returns `409` if operation is no longer cancellable.
- Refund amount now uses latest DB state + fallback from latest `OPERATION_DEDUCT` tx.

### `src/app/api/operations/[id]/confirm-purchase/route.ts`
- Added `Prisma` error handling for unique-race (`P2002` -> `409`).
- Added operation guard before deduction (must still be `COMPLETING` and `amount=0`).
- Prevents duplicate/late confirm charges.
- Returns explicit `409` for `OPERATION_NOT_CONFIRMABLE`.

## 3) Start Idempotency and Queue Dedup

### `src/app/api/operations/start-renewal/route.ts`
- Added Redis card lock (`operation:start-renewal:card-lock:<card>`) with TTL.
- Added active-operation guard constant reused for checks.
- Added recent-completed guard window to reduce immediate re-run double-charge loops.
- Wrapped flow in `try/finally` to always release lock.

### `src/lib/queue.ts`
- Added deterministic queue `jobId` per `type + operationId`.
- Added customer-prefixed deterministic `jobId` for customer jobs.
- Prevents duplicate enqueue of same operation stage.

## 4) Cross-flow Card Blocking

### `src/app/api/operations/signal-check/route.ts`
- Duplicate check changed from signal-only to any active operation on same card.

### `src/app/api/operations/signal-refresh/route.ts`
- Same as above: blocks when any active operation exists on same card.
- Error message generalized to active operation (not only signal-refresh).

## 5) Frontend Flow Safety and UX

### `src/app/dashboard/renew/page.tsx`
- Added in-function start lock ref to prevent rapid double-start click race.
- Added `REVIEW_REQUIRED` response handling in wizard result flow.

### `src/hooks/useOperationHeartbeat.ts`
- Treats `409` same as stale/terminal heartbeat conditions.
- Prevents noisy retries after server-side state transition.

### `src/app/api/operations/[id]/packages/route.ts`
- Added explicit response branch for `REVIEW_REQUIRED`.

## 6) Refund Safety + Monitoring Hooks

### `src/lib/refund.ts`
- Added `Prisma` import and `P2002` duplicate-refund handling.
- Added terminal-state guard: block refund if operation is `COMPLETED` or `REVIEW_REQUIRED`.
- Emits monitor log when such blocked refund attempt is detected.

### `worker/src/utils/error-handler.ts`
- Added `Prisma` import.
- Added `P2002` duplicate-refund handling in worker refund path.

## 7) Files changed list (exact)

1. `prisma/schema.prisma`
2. `prisma/migrations/20260216193000_add_review_required_and_financial_guards/migration.sql`
3. `src/app/api/cron/cleanup-stuck-operations/route.ts`
4. `src/app/api/cron/timeout-operations/route.ts`
5. `src/app/api/operations/[id]/cancel/route.ts`
6. `src/app/api/operations/[id]/confirm-purchase/route.ts`
7. `src/app/api/operations/[id]/heartbeat/route.ts`
8. `src/app/api/operations/[id]/packages/route.ts`
9. `src/app/api/operations/signal-check/route.ts`
10. `src/app/api/operations/signal-refresh/route.ts`
11. `src/app/api/operations/start-renewal/route.ts`
12. `src/app/dashboard/renew/page.tsx`
13. `src/hooks/useOperationHeartbeat.ts`
14. `src/lib/queue.ts`
15. `src/lib/refund.ts`
16. `worker/prisma/schema.prisma`
17. `worker/src/utils/error-handler.ts`

## 8) Important note

- `worker/src/http-queue-processor.ts` and `worker/src/http/HttpClientService.ts` are not currently in the persisted diff at this moment.
- This report reflects the current working tree exactly.