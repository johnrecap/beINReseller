# Implementation Plan: Points Analysis Report

**Branch**: `019-points-analysis-report` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/019-points-analysis-report/spec.md`

## Summary

Add a read-only Points Analysis tab to the existing admin Reports Center. The tab will explain point movement in plain business language by reading existing `point_ledger_entries`, owner users, point cash redemptions, transactions, and related operation references. No point or balance mutation is allowed in this feature.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19.2, Next.js 16.1 app router

**Primary Dependencies**: Next.js, next-auth auth helpers, Prisma Client, existing report center components, existing point balance helpers, lucide-react

**Storage**: PostgreSQL through Prisma. Reuse existing `point_ledger_entries`, `point_cash_redemptions`, `transactions`, `users`, and related operation tables.

**Testing**: `npx tsx --test`, `npx tsc --noEmit`, `npm run build`, authenticated browser/manual smoke testing

**Target Platform**: Existing web admin panel

**Project Type**: Full-stack Next.js dashboard application

**Performance Goals**: First page loads only the active points tab data. Ledger API uses server pagination and date filtering. Summary queries avoid unbounded browser payloads.

**Constraints**: Read-only report, admin-only access, minimal diffs, preserve file encodings, no full-file rewrites, no backfill of historical data, no exposure of sensitive internal data.

**Scale/Scope**: One new Reports Center tab, one panel component, one or more admin report APIs, pure summary helpers, and focused tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Existing point ledger rows remain the source of truth.
- **Traceable Planning**: PASS. Tasks include reason, expected result, possible bugs, mitigation, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. Add aggregation and API/registry tests before implementation because the feature explains financial-adjacent data.
- **Minimal, Encoding-Safe Edits**: PASS. Feature adds focused files and registry wiring only.
- **Security And Privacy Boundaries**: PASS. New API and page are admin-only and read-only.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/019-points-analysis-report/
|-- plan.md
|-- spec.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- admin-points-analysis.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/admin/reports/points-analysis/route.ts
|-- app/api/admin/reports/points-analysis/owners/[id]/route.ts
|-- components/admin/report-center/
|   |-- PointsAnalysisReportPanel.tsx
|   |-- report-tabs.ts
|   |-- report-panel-loaders.ts
|   `-- AdminReportCenterClient.tsx
|-- lib/points/
|   |-- analysis.ts
|   `-- balance.ts
|-- lib/egypt-time.ts
`-- lib/permissions/

tests/
|-- unit/points-analysis.test.ts
`-- unit/report-center-tabs.test.ts
```

**Structure Decision**: Put aggregation and row-label mapping in `src/lib/points/analysis.ts`, keep API shape in admin report routes, and render UI as a new report-center panel. This keeps data rules testable and avoids duplicating point calculations in React.

## Source Of Truth And Legacy Behavior

- `point_ledger_entries` is the source of truth for point movement.
- `point_cash_redemptions` and `transactions` explain conversions to balance.
- Existing wallet summaries continue to use `summarizePointBalance`.
- Legacy/manual point sources remain visible in a separate bucket.
- No historical data is backfilled, edited, or recalculated.
- Missing related operation or transaction rows must not hide ledger rows.

## API Authorization Rules

- All new endpoints require ADMIN role.
- The report does not grant conversion, release, adjustment, or balance mutation permissions.
- Responses expose only report-safe owner, ledger, transaction, and operation reference fields.
- Non-admin and unauthenticated requests return the existing standard API auth errors.

## UI States

- Loading summary and table.
- Empty ledger state.
- Filtered no-results state.
- API error state without technical details.
- Owner detail loading/error/empty states.
- Deleted or inactive owner badge.
- Conversion disabled status from point program settings.
- Mobile horizontal overflow for tables and compact filter controls.

## Required Indexes And Migration Impact

- Existing useful indexes: `point_ledger_entries(owner_user_id, status)`, `point_ledger_entries(owner_user_id, status, source_type)`, `point_ledger_entries(source_type, source_id)`, `point_cash_redemptions(owner_user_id, requested_at)`.
- Implementation should inspect whether date-heavy admin filtering needs a new index on `point_ledger_entries(created_at)` or `(source_type, created_at)`.
- Do not add a migration unless query review shows the production report will be slow without it.

## Verification Limitations

- Full UI verification requires an authenticated admin session.
- Production totals can only be fully validated against a real database snapshot.
- Browser network verification depends on local dev server availability.
- Existing ledger data may include legacy records that do not have modern operation or redemption links.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Report reads ledger evidence only.
- **Traceable Planning**: PASS. Requirements map to data model, contracts, quickstart, and tasks.
- **Test-First For Risky Behavior**: PASS. Aggregation and tab wiring tests are required before UI implementation.
- **Minimal, Encoding-Safe Edits**: PASS. Planned edits are additive and scoped.
- **Security And Privacy Boundaries**: PASS. Admin-only, read-only APIs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
