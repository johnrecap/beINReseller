# Implementation Plan: Financial Operation Safety

**Branch**: `001-financial-operation-safety` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/001-financial-operation-safety/spec.md`

## Summary

This plan hardens the reseller renewal and cancellation flow so the owner does not lose money when beIN may have charged but the panel receives an unclear response. The work is split into phases that can be implemented and verified independently: classify post-payment results, make late cancellation review-only, protect refunds, preserve live operations, then add safe speed improvements.

## Technical Context

**Language/Version**: TypeScript, Node.js, Next.js app routes, worker TypeScript  
**Primary Dependencies**: Prisma, PostgreSQL, BullMQ/Redis, PM2 worker processes, beIN HTTP integration  
**Storage**: PostgreSQL for operations, transactions, user balances, beIN account data; Redis for sessions and queue/runtime coordination  
**Testing**: TypeScript compile checks, targeted ESLint, worker build, focused unit/integration tests or scripted simulations for payment result classification  
**Target Platform**: Production web app plus background worker on Windows/Linux-compatible Node runtime  
**Project Type**: Web app with API routes and background worker  
**Performance Goals**: Preserve current pre-payment package loading speed; no extra blocking step before final customer confirmation; post-payment verification may add review safety when outcome is unclear  
**Constraints**: Production is live; customer balances exist; no broad balance rewrite; no full-file rewrites of sensitive worker files; mobile renewal and Store flows are excluded  
**Scale/Scope**: Reseller renewal, confirmation, cancellation, refund, and card-check safety paths

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Production safety**: PASS. Plan is additive/guarded and does not require rewriting old balances.
- **Financial correctness**: PASS. Owner-loss prevention is prioritized over automatic refund convenience after final Pay.
- **Encoding safety**: PASS. Use minimal diffs and `apply_patch`; do not rewrite source files with risky PowerShell text APIs.
- **Mobile/Store exclusion**: PASS. No planned changes to removed Mobile renewal app behavior or Store flows.
- **Sensitive file handling**: PASS. `worker/src/http-queue-processor.ts` and `worker/src/http/HttpClientService.ts` are touched only in small guarded sections.

## Project Structure

### Documentation (this feature)

```text
specs/001-financial-operation-safety/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- payment-outcome-contract.md
|   |-- cancellation-contract.md
|   `-- manual-review-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/operations/[id]/cancel/route.ts
|-- app/api/operations/[id]/confirm-purchase/route.ts
|-- app/api/operations/[id]/confirm-installment/route.ts
|-- app/api/operations/[id]/packages/route.ts
|-- app/api/cron/cleanup-stuck-operations/route.ts
|-- app/api/cron/timeout-operations/route.ts
|-- lib/refund.ts
|-- lib/operation-dispatch.ts
|-- lib/integrity/detector.ts
`-- app/api/admin/reports/integrity/*

worker/
|-- src/http-queue-processor.ts
|-- src/http/HttpClientService.ts
|-- src/utils/error-handler.ts
|-- src/lib/integrity-detector.ts
`-- src/lib/session-cache.ts

prisma/
|-- schema.prisma
`-- migrations/
```

**Structure Decision**: Keep the existing structure. Add small helper functions only if they reduce risk in sensitive files. Avoid moving or rewriting the large worker files.

## Phase 0: Research Decisions

See [research.md](./research.md).

## Phase 1: Design Artifacts

- Data model: [data-model.md](./data-model.md)
- Contracts:
  - [payment-outcome-contract.md](./contracts/payment-outcome-contract.md)
  - [cancellation-contract.md](./contracts/cancellation-contract.md)
  - [manual-review-contract.md](./contracts/manual-review-contract.md)
- Quickstart: [quickstart.md](./quickstart.md)

## Phase 2: Implementation Phases

### Phase A: Safe Final Payment Outcome Classification

Goal: final Pay results must be separated into clear success, clear non-charge failure, and uncertain outcome.

Main files:
- `worker/src/http/HttpClientService.ts`
- `worker/src/http-queue-processor.ts`
- `worker/src/utils/error-handler.ts`

Rules:
- If beIN success text exists: complete operation.
- If dealer balance decreased: complete or review-required, never refund automatically.
- If response is busy, timeout, unreadable, login redirect, no confirmation, or connection failure after final Pay: manual review, no refund.
- Refund is allowed only when the system has clear evidence that beIN did not charge.

### Phase B: Safe Cancellation Around Final Payment

Goal: cancellation before final Pay is normal; cancellation during/after final Pay is review-only.

Main files:
- `src/app/api/operations/[id]/cancel/route.ts`
- `worker/src/http-queue-processor.ts`
- `src/lib/refund.ts`

Rules:
- Before final Pay: cancellation can refund safely if customer was charged and beIN was not.
- During/after final Pay: do not refund automatically; move to review.
- Late cancel must not overwrite COMPLETED or REVIEW_REQUIRED.

### Phase C: Refund Guard and Review Data

Goal: all refund decisions must be auditable and one-time.

Main files:
- `src/lib/refund.ts`
- `worker/src/utils/error-handler.ts`
- `src/lib/integrity/detector.ts`
- optional `prisma/schema.prisma` if extra review fields are needed

Rules:
- Keep duplicate refund prevention.
- Store the reason why a refund was allowed or blocked.
- Store beIN balance before/after when available.
- Admin can see enough evidence to decide.

### Phase D: Live Rollout Safety

Goal: changes must not break operations already running on production.

Main files:
- API/worker files touched in Phases A-C
- deployment checklist in `quickstart.md`

Rules:
- New behavior applies through guarded state checks.
- Existing terminal operations stay terminal.
- Existing active operations are not mass-updated.
- Deployment uses backup, migration check, worker pause/resume, and smoke tests.

### Phase E: Safe Speed Improvements

Goal: speed up only safe pre-payment steps.

Main files:
- `worker/src/http-queue-processor.ts`
- `worker/src/http/HttpClientService.ts`
- `worker/src/lib/session-cache.ts`

Rules:
- Keep session reuse before final Pay.
- Keep STB/package caching before final Pay.
- Do not use stale cache to decide refund after final Pay.
- Reduce noisy debug logs around final Pay after safety is verified.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Manual review instead of automatic final failure | Prevents owner loss when beIN outcome is unclear | Automatic refund is simpler but can lose real money |
| Extra outcome classification | Needed to distinguish safe refund from unsafe refund | Treating every failure the same caused the risk |
| Rollout steps before code activation | Production has live balances and active operations | Direct deploy can affect in-flight customer money |
