# Implementation Plan: Renewal Safety Corrections and beIN Spend Ledger

**Branch**: `002-renewal-safety-bein-ledger` | **Date**: 2026-05-14 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/002-renewal-safety-bein-ledger/spec.md`

## Summary

This plan finishes the remaining safety corrections found in the renewal/cancellation review and adds confirmed beIN account spend tracking. The implementation must first fix phase detection and refund safety, then add a confirmed spend ledger that records only the final beIN account whose dealer balance was charged, then expose admin reports for date-range totals.

## Technical Context

**Language/Version**: TypeScript, Node.js, Next.js App Router, worker TypeScript  
**Primary Dependencies**: Prisma, PostgreSQL, BullMQ/Redis, PM2 worker processes, beIN HTTP integration  
**Storage**: PostgreSQL for operations, transactions, beIN accounts, integrity issues, and new spend ledger; Redis for queue/session runtime state  
**Testing**: TypeScript compile checks, Prisma generate, worker build, targeted ESLint, scripted simulations for cancellation phases, refund guards, and ledger totals  
**Target Platform**: Production web app plus background worker on Windows/Linux-compatible Node runtime  
**Project Type**: Web app with API routes, admin UI, and background worker  
**Performance Goals**: No extra user-visible delay before final confirmation; spend report summary should load from indexed ledger rows; detail rows must paginate  
**Constraints**: Production is live; customer balances exist; no bulk balance rewrite; no risky full-file rewrite of sensitive worker files; Mobile renewal and Store flows are excluded unless shared functions are touched  
**Scale/Scope**: Renewal, activation/check/installment safety paths that use beIN accounts; confirmed beIN spend ledger; admin spend reports

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Production safety**: PASS. Plan is additive and avoids bulk changing old balances or statuses.
- **Financial correctness**: PASS. Confirmed spend totals use only confirmed ledger rows.
- **Encoding safety**: PASS. Use `apply_patch` for edits; no risky PowerShell text rewrite APIs.
- **Sensitive files**: PASS. Large worker files are modified only through focused patches and supporting helper modules.
- **Secret handling**: PASS. Ledger/report snapshots exclude passwords, cookies, TOTP secrets, and proxy credentials.
- **Mobile/Store exclusion**: PASS. Mobile renewal and Store flows remain out of scope unless shared code requires guarded tests.

## Project Structure

### Documentation (this feature)

```text
specs/002-renewal-safety-bein-ledger/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- operation-safety-contract.md
|   |-- bein-spend-ledger-contract.md
|   `-- admin-bein-spend-report-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
prisma/
|-- schema.prisma
`-- migrations/20260514090000_add_bein_operation_ledger/migration.sql

worker/
|-- prisma/schema.prisma
|-- src/http-queue-processor.ts
|-- src/http/HttpClientService.ts
|-- src/utils/error-handler.ts
`-- src/lib/bein-spend-ledger.ts

src/
|-- lib/cancellation-safety.ts
|-- lib/refund.ts
|-- lib/operation-safety.ts
|-- lib/bein-spend-ledger.ts
|-- app/api/operations/[id]/cancel/route.ts
|-- app/api/operations/[id]/cancel-confirm/route.ts
|-- app/api/operations/[id]/confirm-purchase/route.ts
|-- app/api/operations/[id]/heartbeat/route.ts
|-- app/api/operations/[id]/route.ts
|-- app/api/cron/cleanup-stuck-operations/route.ts
|-- app/api/cron/timeout-operations/route.ts
|-- app/api/admin/reports/bein-spend/route.ts
|-- app/api/admin/reports/bein-spend/operations/route.ts
|-- app/dashboard/admin/reports/bein-spend/page.tsx
`-- components/admin/reports/BeinSpendReportClient.tsx

scripts/
|-- cancellation-phase-safety-simulations.ts
`-- bein-spend-ledger-simulations.ts
```

**Structure Decision**: Keep the existing app/worker split. Add small shared app helpers under `src/lib/` and worker-specific write helper under `worker/src/lib/`. Add one new ledger table for confirmed spend. Do not repurpose `Operation.beinAccountId`.

## Phase 0: Research Decisions

See [research.md](./research.md).

## Phase 1: Design Artifacts

- Data model: [data-model.md](./data-model.md)
- Contracts:
  - [operation-safety-contract.md](./contracts/operation-safety-contract.md)
  - [bein-spend-ledger-contract.md](./contracts/bein-spend-ledger-contract.md)
  - [admin-bein-spend-report-contract.md](./contracts/admin-bein-spend-report-contract.md)
- Quickstart: [quickstart.md](./quickstart.md)

## Phase 2: Implementation Phases

### Phase A: Baseline and Safety Tests

Goal: capture the current risky behavior before changing production logic.

Main files:
- `scripts/cancellation-phase-safety-simulations.ts`
- `scripts/bein-spend-ledger-simulations.ts`
- `specs/002-renewal-safety-bein-ledger/quickstart.md`

Rules:
- Write failing simulations first.
- Cover `COMPLETING` package preparation, `COMPLETING` cancellation-confirm, final Pay submitted, terminal operation, duplicate refund, and duplicate ledger cases.

### Phase B: Explicit Operation Phase Safety

Goal: stop using `COMPLETING` alone as proof that final Pay started.

Main files:
- `src/lib/operation-safety.ts`
- `src/lib/cancellation-safety.ts`
- `src/app/api/operations/[id]/cancel/route.ts`
- `src/app/api/operations/[id]/cancel-confirm/route.ts`
- `src/app/api/operations/[id]/confirm-purchase/route.ts`
- `worker/src/http-queue-processor.ts`

Rules:
- Package preparation is safe pre-final-Pay.
- Cancellation-confirm is safe pre-final-Pay unless explicit final Pay evidence exists.
- Final Pay submitted or uncertain post-Pay remains review-only.

### Phase C: Central Refund Guard

Goal: app and worker refund paths use the same money safety rule.

Main files:
- `src/lib/refund.ts`
- `worker/src/utils/error-handler.ts`
- `worker/src/http-queue-processor.ts`
- `src/app/api/cron/cleanup-stuck-operations/route.ts`
- `src/app/api/cron/timeout-operations/route.ts`
- `src/app/api/operations/[id]/heartbeat/route.ts`

Rules:
- Refund inside a database transaction must re-check operation status.
- Duplicate refund is a no-op.
- Timeout and cleanup must not silently cancel amount-positive legacy operations.

### Phase D: Confirmed beIN Spend Ledger

Goal: record only the final beIN account whose dealer balance was charged.

Main files:
- `prisma/schema.prisma`
- `worker/prisma/schema.prisma`
- `prisma/migrations/20260514090000_add_bein_operation_ledger/migration.sql`
- `worker/src/lib/bein-spend-ledger.ts`
- `worker/src/http-queue-processor.ts`

Rules:
- One confirmed spend row per operation.
- Failed pre-charge account attempts are excluded.
- Spend amount comes from confirmed dealer balance delta.
- Missing balance evidence is review/unconfirmed, not confirmed total spend.

### Phase E: Admin Reports and Operation Detail

Goal: let admins see spend totals by beIN account, panel user, operation type, and date range.

Main files:
- `src/lib/bein-spend-ledger.ts`
- `src/app/api/admin/reports/bein-spend/route.ts`
- `src/app/api/admin/reports/bein-spend/operations/route.ts`
- `src/app/api/operations/[id]/route.ts`
- `src/app/dashboard/admin/reports/bein-spend/page.tsx`
- `src/components/admin/reports/BeinSpendReportClient.tsx`

Rules:
- Admin-only.
- Date range required.
- Details paginated.
- Secrets never returned.
- Confirmed totals exclude unconfirmed review items.

### Phase F: Production Gate

Goal: verify safe rollout with no surprise balance changes.

Main files:
- `specs/002-renewal-safety-bein-ledger/quickstart.md`
- `docs/superpowers/tasks/2026-05-08-reseller-panel-hardening-tasks.md`

Rules:
- Backup before migration.
- Pause/reduce workers for deploy if possible.
- Smoke test with safe test account/card.
- Check customer balance totals, refund counts, ledger rows, and reports.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| New ledger table | Confirmed date-range spend reports need reliable indexed financial rows | Existing `Operation.beinAccountId` can mean assigned account before charge |
| Shared safety helper | App and worker refund paths must agree | Route-specific checks already drifted |
| Operation phase evidence | `COMPLETING` is overloaded | Status-only rule caused safe cancellation to become review |
| Excluding unconfirmed success from totals | Prevents false beIN spend totals | Package-price fallback can be wrong without balance delta |
