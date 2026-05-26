# Implementation Plan: Report Center Tabs

**Branch**: `018-report-center-tabs` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-report-center-tabs/spec.md`

## Summary

Create one admin Reports Center page with tabs for analytics, activity monitoring, integrity reports, beIN spend, account login monitor, balance alert monitor, and activity logs. The safe approach is to extract existing pages into reusable panels, keep old routes available, lazy-load active tabs, and then replace multiple sidebar entries with one grouped entry.

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

**Primary Dependencies**: Next.js, next-auth, Prisma client through existing APIs, lucide-react, existing UI components, Recharts

**Storage**: No new storage. Existing report APIs and tables remain source of truth.

**Testing**: `node:test` through `npx tsx --test`, `npx tsc --noEmit`, `npm run build`, browser/manual smoke verification

**Target Platform**: Existing web admin panel

**Project Type**: Full-stack Next.js dashboard application

**Performance Goals**: Initial reports center load must request data only for the active tab. Switching tabs should not reload the full dashboard shell.

**Constraints**: Keep old report routes working, preserve admin-only access, avoid schema migrations, avoid full-file rewrites, preserve file encoding, do not expose beIN secrets.

**Scale/Scope**: Seven admin reporting/monitoring pages grouped into one center. No redesign of each report's internal logic in this phase.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. This feature does not change accounting records or report data sources. Existing APIs remain the source of truth.
- **Traceable Planning**: PASS. Tasks include reason, expected result, possible bugs, mitigation, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. Add a tab registry unit test and route/sidebar behavior checks before wiring navigation.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted extraction and small route/sidebar edits.
- **Security And Privacy Boundaries**: PASS. Admin-only routes remain admin-only and no beIN secrets are exposed.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/018-report-center-tabs/
|-- plan.md
|-- spec.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- admin-report-center.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/dashboard/admin/reports/page.tsx
|-- app/dashboard/admin/analytics/page.tsx
|-- app/dashboard/admin/users/activity/page.tsx
|-- app/dashboard/admin/reports/integrity/page.tsx
|-- app/dashboard/admin/reports/bein-spend/page.tsx
|-- app/dashboard/admin/bein-accounts/login-failures/page.tsx
|-- app/dashboard/admin/bein-accounts/low-balance/page.tsx
|-- app/dashboard/admin/logs/page.tsx
|-- components/admin/report-center/
|   |-- AdminReportCenterClient.tsx
|   |-- ReportCenterTabs.tsx
|   |-- report-tabs.ts
|   |-- AnalyticsReportPanel.tsx
|   |-- ActivityReportPanel.tsx
|   |-- IntegrityReportPanel.tsx
|   |-- BeinSpendReportPanel.tsx
|   |-- LoginMonitorPanel.tsx
|   |-- BalanceMonitorPanel.tsx
|   `-- LogsReportPanel.tsx
|-- components/layout/Sidebar.tsx
`-- hooks/useTranslation.ts

tests/
`-- unit/report-center-tabs.test.ts
```

**Structure Decision**: Keep each existing report as a reusable panel under `src/components/admin/report-center/`. Route files become thin wrappers that enforce route access and render the same panel. The new report center imports panels lazily and manages tab state.

## Source Of Truth And Legacy Behavior

- Existing report APIs remain the source of truth.
- Existing report routes remain available after implementation.
- No historical report data is rewritten.
- No migration or backfill is required.
- Sidebar settings for login failure and low balance monitor remain the source of truth for whether those monitor tabs are visible.

## API Authorization Rules

- No new data APIs are required.
- The new report center route must require admin access.
- Existing report APIs and routes keep their current authorization behavior.
- Tab visibility must not bypass existing API-side protections.

## UI States

- Reports center loading state.
- Active tab loading state.
- Empty tab state from the existing report panel.
- Error state scoped to the active tab.
- Unknown tab fallback state.
- Disabled or hidden monitor tabs when sidebar settings turn them off.
- Mobile tab overflow handled with scrollable segmented tabs or a responsive select fallback.

## Required Indexes And Migration Impact

- No new indexes.
- No Prisma schema migration.
- No database backfill.

## Verification Limitations

- Full browser verification requires an authenticated admin session.
- Existing pages may contain pre-existing English/Arabic copy and styling issues; this feature should not attempt unrelated redesign.
- Existing direct routes must be manually verified after extraction because they are user-facing support links.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Data sources and ledgers are untouched.
- **Traceable Planning**: PASS. `tasks.md` maps each story to files and verification.
- **Test-First For Risky Behavior**: PASS. Registry and navigation behavior tests precede implementation.
- **Minimal, Encoding-Safe Edits**: PASS. Targeted component extraction and sidebar edits only.
- **Security And Privacy Boundaries**: PASS. Admin boundaries are preserved.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
