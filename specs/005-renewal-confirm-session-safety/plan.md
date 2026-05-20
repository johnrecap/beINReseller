# Implementation Plan: Renewal Confirmation Session Safety

**Branch**: `codex/fix-renewal-confirm-session-safety` | **Date**: 2026-05-20 | **Spec**: `specs/005-renewal-confirm-session-safety/spec.md`
**Input**: Feature specification from `specs/005-renewal-confirm-session-safety/spec.md`

## Summary

Fix the renewal confirmation path so customer balance, operation status, refund safety, and beIN final payment evidence stay aligned. The technical approach is to centralize safe `responseData` parsing, restore operation-scoped Redis sessions before any legacy response-data assumptions, stop marking final Pay as submitted in the API, and only set final Pay evidence in the worker when beIN Pay has actually started.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js, Next.js 16.1.1  
**Primary Dependencies**: Prisma 7.2, BullMQ, Redis/ioredis, NextAuth, beIN HTTP worker services  
**Storage**: PostgreSQL via Prisma, Redis for session cache, BullMQ queues  
**Testing**: `npm run build`, `cd worker && npm run build`, focused manual renewal simulations; add unit coverage where practical  
**Target Platform**: Production Linux server with PM2 worker and web processes  
**Project Type**: Next.js web app plus Node worker service  
**Performance Goals**: Preserve existing renewal speed; no extra login when operation-scoped session is available  
**Constraints**: Live production balances; no destructive migrations; no automatic refund after real final Pay may have started  
**Scale/Scope**: Renewal, final confirmation, refund safety, and worker logs only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The repository constitution is still placeholder text, so project-specific gates come from `AGENTS.md` and production safety requirements:

- Use minimal diffs and avoid full-file rewrites.
- Use safe edit methods and preserve encoding.
- Do not perform destructive data changes.
- Keep changes isolated to renewal confirmation and safety evidence paths.
- Verify with build checks before delivery.

Status: PASS. The planned work is scoped to code paths shown in the production logs and avoids database rewrites.

## Project Structure

### Documentation (this feature)

```text
specs/005-renewal-confirm-session-safety/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- confirmation-safety-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/operations/[id]/confirm-purchase/route.ts
`-- lib/operation-safety.ts

worker/src/
|-- http-queue-processor.ts
|-- http/HttpClientService.ts
`-- lib/session-cache.ts
```

**Structure Decision**: Keep fixes inside the existing API, shared safety helper, and worker paths. No new service or schema layer is needed.

## Complexity Tracking

No constitution violations are required. The change intentionally avoids adding a new architecture layer.

## Phase 0: Research

See `research.md`.

## Phase 1: Design and Contracts

See `data-model.md`, `contracts/confirmation-safety-contract.md`, and `quickstart.md`.

## Post-Design Constitution Check

Status: PASS. The plan still uses existing project boundaries and does not require database migration or balance backfill.
