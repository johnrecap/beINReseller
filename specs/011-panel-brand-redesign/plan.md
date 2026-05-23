# Implementation Plan: Panel Brand Redesign

**Branch**: `011-panel-brand-redesign` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/011-panel-brand-redesign/spec.md`

## Summary

Create a full visual redesign plan for the panel using the supplied Desh Panel image library, with a dark operations-first theme, purple brand depth, neon green activity accents, and controlled use of logos, banners, robots, and icons. The plan explicitly avoids changing operational logic and focuses on design tokens, shared UI surfaces, image organization, responsive QA, and owner handoff.

## Technical Context

**Language/Version**: TypeScript 5.9.3, React 19.2.3, Next.js 16.1.1 App Router
**Primary Dependencies**: Tailwind CSS v4, CSS variables, lucide-react, existing shared UI components, existing `BrandLogo` component
**Storage**: N/A for this redesign. No database schema change planned.
**Testing**: `npm run lint`, `npm run build`, manual screenshot review, browser visual checks, responsive RTL/LTR checks
**Target Platform**: Web dashboard for desktop and mobile browsers
**Project Type**: Next.js web application with dashboard pages and API routes
**Performance Goals**: Avoid large unoptimized above-the-fold images; keep dense operational pages responsive; do not add blocking animation or heavy backgrounds to tables
**Constraints**: No beIN operation, worker, payment, ledger, credit request, points, rewards, auth, permission, or proxy logic changes. Respect current dirty worktree and do not revert unrelated changes.
**Scale/Scope**: Full visual system plan for login, shell, dashboard, admin/manager/agent/user pages, transactions, history, reviews, credit requests, points/rewards, forms, tables, and empty states.

## Constitution Check

Repository constitution is placeholder. Apply project rules from `AGENTS.md`:

- Use SpecKit documentation before implementation.
- Preserve encoding and avoid risky PowerShell write APIs.
- Keep diffs minimal and scoped.
- Do not perform full-file rewrites unless necessary.
- Do not revert unrelated dirty worktree changes.
- Do not change operational beIN/payment/worker/business logic as part of a visual redesign.
- Verify no mojibake patterns are introduced after edits.

**Gate Status**: PASS. This feature is documentation and planning only. Future implementation must remain UI-scoped and token-first.

## Project Structure

### Documentation

```text
specs/011-panel-brand-redesign/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- user-actions.md
|-- contracts/
|   `-- ui-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code Expected To Change In Future Implementation

```text
public/images/brand/
src/styles/tokens.css
src/app/globals.css
src/app/layout.tsx
src/app/favicon.ico
src/app/login/page.tsx
src/app/dashboard/layout.tsx
src/components/brand/BrandLogo.tsx
src/components/layout/DashboardShell.tsx
src/components/layout/Header.tsx
src/components/layout/Sidebar.tsx
src/components/shared/PageHeader.tsx
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/table.tsx
src/components/ui/badge.tsx
src/components/ui/input.tsx
src/components/dashboard/
src/components/admin/
src/components/manager/
src/components/agent/
src/components/credit-requests/
src/components/rewards/
src/components/transactions/
src/components/history/
src/components/renewal/
```

**Structure Decision**: Implement the redesign from the shared layer downward. First define tokens and asset mapping, then update brand/shell components, then operational surfaces, then page-specific visual polish. This prevents inconsistent hard-coded colors and reduces risk to working business flows.

## Phase 0: Research Summary

See [research.md](./research.md).

## Phase 1: Design Summary

See [data-model.md](./data-model.md), [contracts/ui-contract.md](./contracts/ui-contract.md), [quickstart.md](./quickstart.md), and [user-actions.md](./user-actions.md).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Full visual pass across many pages | The current theme is spread across global CSS, tokens, shell, sidebar, UI primitives, and role pages | Editing one page would leave inconsistent UI and repeated colors |
| Asset optimization step | Supplied images are large and not all suitable for direct above-the-fold use | Referencing source images directly would hurt load time and deployment portability |
| Manual visual QA matrix | Automated build cannot catch overlap, unreadable table contrast, or poor crop choices | Relying only on `npm run build` misses visual regressions |
| Owner handoff file | Final asset selection and theme approval require product decisions | Guessing final visual choices can waste implementation time |
