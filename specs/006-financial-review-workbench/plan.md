# Implementation Plan: Financial Review Workbench

**Branch**: `codex/fix-renewal-confirm-session-safety` | **Date**: 2026-05-20 | **Spec**: `specs/006-financial-review-workbench/spec.md`  
**Input**: Feature specification from `specs/006-financial-review-workbench/spec.md`

## Summary

Build a dedicated admin Financial Review workbench for `REVIEW_REQUIRED` operations so refund/no-refund decisions are no longer buried inside Integrity Reports. The implementation should reuse existing operation, transaction, audit snapshot, integrity summary, and beIN card-check concepts, but separate action workflow from analytics and show plain-language explanations before any money decision.

## Technical Context

**Language/Version**: TypeScript, Next.js App Router, Prisma, Node worker ecosystem  
**Primary Dependencies**: Next.js, React, Prisma Client, existing auth helpers, existing dashboard layout components  
**Storage**: PostgreSQL through Prisma  
**Testing**: `npm run build`, focused route tests where available, manual production-like review scenarios  
**Target Platform**: Admin web dashboard and production Node deployment  
**Project Type**: Web application with API routes and server-rendered dashboard pages  
**Performance Goals**: Pending review list should load within normal dashboard expectations and avoid blocking full integrity scans. Card verification can be slower because it contacts beIN, but it must show progress and never block the whole queue.
**Constraints**: Financial actions must be idempotent, admin-only, operation-linked, and safe when evidence is incomplete.  
**Scale/Scope**: Small admin workflow over recent `REVIEW_REQUIRED` operations, not a replacement for all reporting.

## Constitution Check

The repository constitution is still placeholder text. Apply the project-specific rules from `AGENTS.md`:

- Use Spec Kit files before implementation.
- Preserve encoding and avoid risky PowerShell write APIs.
- Use minimal diffs.
- Keep financial changes auditable and reversible.
- Do not auto-refund uncertain operations.

**Gate Status**: PASS. This plan is documentation only and sets safety gates before implementation.

## Project Structure

### Documentation (this feature)

```text
specs/006-financial-review-workbench/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- ui-content-map.md
|-- quickstart.md
|-- contracts/
|   `-- review-workbench-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (planned implementation)

```text
src/app/dashboard/admin/financial-review/page.tsx
src/app/api/admin/financial-review/route.ts
src/app/api/admin/financial-review/[operationId]/resolve/route.ts
src/components/admin/financial-review/FinancialReviewClient.tsx
src/components/admin/financial-review/ReviewOperationCard.tsx
src/components/admin/financial-review/ReviewEvidencePanel.tsx
src/components/admin/financial-review/ReviewReasonText.tsx
src/components/admin/financial-review/CardVerificationPanel.tsx
src/components/admin/financial-review/ReviewDecisionDialog.tsx
src/components/admin/financial-review/ReviewHeader.tsx
src/components/admin/financial-review/ReviewSummaryCards.tsx
src/components/admin/financial-review/ReviewFilters.tsx
src/components/admin/financial-review/ReviewQueueTabs.tsx
src/lib/financial-review/types.ts
src/lib/financial-review/evidence.ts
src/lib/financial-review/plain-language.ts
src/lib/financial-review/card-verification.ts
src/lib/financial-review/actions.ts
src/app/api/admin/financial-review/[operationId]/verify-card/route.ts
src/components/layout/Sidebar.tsx
src/app/dashboard/admin/reports/integrity/page.tsx
prisma/schema.prisma
worker/prisma/schema.prisma
prisma/migrations/[timestamp]_add_financial_review_workbench/migration.sql
worker/prisma/migrations/[timestamp]_add_financial_review_workbench/migration.sql
```

**Structure Decision**: Add a small admin workflow next to the existing dashboard. Keep evidence parsing, plain-language labels, card verification, and decision logic in `src/lib/financial-review/*` so API routes and UI share one meaning of "refund safe", "already refunded", "card likely renewed", and "beIN likely charged". All visible UI labels, buttons, fields, dialogs, empty states, and warnings must match `ui-content-map.md`.

## Phase 0: Research Summary

See `research.md`.

## Phase 1: Design Summary

See `data-model.md`, `ui-content-map.md`, `contracts/review-workbench-contract.md`, and `quickstart.md`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| New decision audit record | Financial decisions need reviewer, note, action, timestamp, and refund transaction linkage | Storing only in `operation.responseData` is harder to query and audit safely |
| New card verification record | Admins need to see when the card was checked, by whom, and what beIN showed at decision time | Relying on transient check output would leave no audit trail for disputes |
| Explicit UI content map | The user wants every component, button, field, and word defined before implementation | Letting implementers invent copy during coding would recreate confusion |
| Dedicated page instead of editing Integrity Reports only | The current page is too dense and analytics-focused | Adding more controls to the same page would make the confusion worse |
