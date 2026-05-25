# Implementation Plan: Operation beIN Account Card Search

**Branch**: `013-operation-bein-account-card-search` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-operation-bein-account-card-search/spec.md`

**Note**: This plan follows the repository Speckit constitution and the enhanced task-quality template in `.specify/templates/tasks-template.md`.

## Summary

Make operation financial audit reliable by enforcing the existing operation-to-beIN account link, exposing audit-safe beIN account identity in confirmed spend rows, and adding card-number search to both the admin beIN Spend Report and user operation history. The implementation uses the existing `Operation.beinAccountId`, `Operation.cardNumber`, and `BeinAccountSpendLedger` model, adds a ledger card lookup index, and extends report/history filters without creating a duplicate mapping table.

## Planning Quality Standard

Every task in `tasks.md` includes:
- Reason: why the task exists.
- Expected: concrete outcome after completion.
- Possible bugs: realistic failures introduced by the task.
- Fix/Mitigation: how to prevent or repair them.
- Verification: exact test, build, query, or UI flow.

This feature is financial/audit-related, so tasks must avoid vague "handle errors" instructions and must preserve evidence integrity.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node 24 in CI, Next.js 16.1.1, React 19.2.3

**Primary Dependencies**: Next route handlers, Prisma 7.2.0, PostgreSQL adapter, BullMQ worker, Tailwind/shadcn-style UI, lucide-react icons

**Storage**: PostgreSQL through Prisma models and migrations

**Testing**: Existing Node test style with `node:test` via TypeScript execution, plus build verification using `npm run build` and `npm run worker:build`

**Target Platform**: Admin/user web panel and background worker

**Project Type**: Full-stack web application with separate worker package

**Performance Goals**: Card-number report search should remain responsive for normal admin date ranges and should use an indexed ledger lookup as ledger volume grows

**Constraints**:
- Do not expose beIN account secrets or runtime session artifacts.
- Do not count legacy rows as confirmed spend without balance evidence.
- Preserve existing user-history ownership boundaries.
- Keep diffs targeted and encoding-safe.
- Existing `npm run lint` currently fails because of unrelated lint debt; feature verification must report this separately unless lint cleanup is explicitly included.

**Scale/Scope**: One admin report, one user history endpoint/UI, worker ledger consistency path, one Prisma migration, focused tests and verification docs

## Constitution Check

*GATE: Must pass before implementation. Re-check after data-model/contracts are applied.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| Evidence-Driven Operation Accounting | PASS | Uses confirmed spend ledger for confirmed debit evidence and operation account link for execution identity. |
| Traceable Planning | PASS | `tasks.md` includes reason, expected result, likely bugs, fixes, and verification for each task. |
| Test-First For Risky Behavior | PASS | Tasks include tests before changing filter and conflict behavior where seams exist. |
| Minimal, Encoding-Safe Edits | PASS | Plan touches specific files and includes mojibake checks after edits. |
| Security And Privacy Boundaries | PASS | Contracts expose only audit-safe account labels/usernames to admins and preserve redaction. |

No justified constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/013-operation-bein-account-card-search/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- admin-bein-spend-report.md
|   `-- operations-history.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
prisma/
|-- schema.prisma
`-- migrations/
    `-- <timestamp>_add_bein_spend_card_search_index/
        `-- migration.sql

src/
|-- lib/
|   `-- bein-spend-ledger.ts
|-- app/
|   `-- api/
|       |-- admin/reports/bein-spend/route.ts
|       |-- admin/reports/bein-spend/operations/route.ts
|       `-- operations/route.ts
`-- components/
    |-- admin/reports/BeinSpendReportClient.tsx
    `-- history/
        |-- HistoryFilters.tsx
        |-- HistoryPageClient.tsx
        `-- OperationsTable.tsx

worker/
`-- src/
    |-- lib/bein-spend-ledger.ts
    `-- http-queue-processor.ts

tests/
|-- unit/
|   |-- bein-spend-ledger-filters.test.ts
|   `-- operation-card-search-filter.test.ts
`-- integration/
    `-- operation-bein-account-link.test.ts
```

**Structure Decision**: Keep the feature in existing app/worker boundaries. Shared report parsing remains in `src/lib/bein-spend-ledger.ts`. Worker financial evidence remains in `worker/src/lib/bein-spend-ledger.ts`. UI changes stay in the existing report/history components.

## Source Of Truth And Data Flow

1. Worker selects a beIN account and stores it on the operation.
2. Final payment evidence records a confirmed spend ledger row when a positive beIN balance delta exists.
3. Admin spend report reads confirmed rows from the ledger, including card and account snapshots.
4. General operation history reads operations and filters by the operation card number.
5. Operation detail and financial review can use ledger evidence when it exists, and operation account link otherwise.

## Backfill And Legacy Behavior

- No legacy row will be converted to confirmed spend without balance before/after evidence.
- Existing operations with `beinAccountId` remain linked.
- Existing ledger rows remain the authority for confirmed spend.
- A migration adds search indexing but does not rewrite historical rows.
- Optional backfill can be planned later if a production audit proves there are operation rows with reliable account evidence but missing `beinAccountId`.

## API And UI Contracts

- Admin report endpoints accept `cardNumber`.
- `/api/operations` accepts `cardNumber` while staying scoped to the signed-in user.
- Report UI adds a card search input and includes it in summary/detail requests.
- History UI adds a card search input and sends it to `/api/operations`.
- Empty states must remain clear when filters return no rows.

## Risk Notes

| Risk | Mitigation |
|------|------------|
| Card search returns partial unrelated cards | Normalize input and document exact/contains behavior; prefer full-card exact search in UI guidance. |
| Totals do not match detail rows | Build summary and detail from the same parsed filters and same ledger where clause. |
| User history leaks another user's card operations | Keep `userId: session.user.id` in `/api/operations` before adding card filters. |
| Ledger account conflicts hide financial issues | Preserve conflict-to-review behavior in worker ledger recording. |
| Search gets slow as ledger grows | Add card/date index to ledger table. |
| Secrets leak in operation detail/report | Continue redaction and never include credential/session fields. |

## Verification Strategy

Required:
- Unit tests for card normalization and filter construction.
- Unit/integration test for account-link conflict behavior.
- Manual quickstart report/history validation.
- `npm run check:schema-sync`
- `npx prisma generate`
- `npm run build`
- `npm run worker:build`

Conditional:
- `npm run lint` only passes after unrelated lint debt is fixed. If still failing, report it as pre-existing.

## Complexity Tracking

No constitution violations or extra architectural layers are needed. The feature uses existing routes, models, and worker ledger code.
