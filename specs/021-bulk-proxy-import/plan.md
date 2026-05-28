# Implementation Plan: Bulk Proxy Import

**Branch**: `021-bulk-proxy-import` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-bulk-proxy-import/spec.md`

## Summary

Add bulk proxy import to the existing admin proxy management flow. The admin pastes multiple proxy rows into a textarea, previews validation, and imports valid non-duplicate proxies in one action. The implementation reuses the existing proxy table and secret encryption, adds a parser/import service, adds admin-only preview/import API support, and adds UI controls to the existing proxy page. Imported proxies are auto-labeled as `بروكسي N`.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Next.js 16.1 app router, Prisma 7.2

**Primary Dependencies**: Existing `prisma.proxy`, `encryptSecret`, admin auth middleware, current proxy management page, existing UI components

**Storage**: Existing PostgreSQL `proxies` table with unique `host + port`

**Testing**: `node:test` + `tsx`, TypeScript check, Next production build

**Target Platform**: Existing admin dashboard and production server

**Project Type**: Full-stack Next.js dashboard

**Performance Goals**: Import preview/save for 50 proxy rows should complete quickly and avoid one request per proxy. Enforce a bounded maximum such as 500 rows per import.

**Constraints**: Do not expose plaintext proxy passwords. Keep current single-proxy create/update/test flows unchanged. No schema migration expected.

**Scale/Scope**: One parser/service, one admin API surface, one existing admin page, focused unit tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Feature does not touch balances, operations, or financial ledger.
- **Traceable Planning**: PASS. Tasks must include reason, expected result, risks, mitigation, and verification.
- **Test-First For Risky Behavior**: PASS. This handles secrets and bulk DB writes, so parser/import behavior requires tests before implementation.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are scoped to proxy import parser/API/UI and docs.
- **Security And Privacy Boundaries**: PASS. Passwords are encrypted and never returned.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/021-bulk-proxy-import/
|-- plan.md
|-- spec.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- proxy-import.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/admin/proxies/import/
|   `-- route.ts
|-- app/dashboard/admin/proxies/
|   `-- page.tsx
|-- lib/proxies/
|   `-- bulk-import.ts
|-- i18n/translations/
|   |-- ar.ts
|   `-- en.ts

tests/
`-- unit/proxy-bulk-import.test.ts
```

**Structure Decision**: Keep the parser/import rules in `src/lib/proxies/bulk-import.ts` so API and tests share one source of truth. Add a new route under the existing admin proxies API namespace. Update the existing proxy management page rather than creating a separate page.

## Source Of Truth And Legacy Behavior

- Source of truth for saved proxies remains the `proxies` table.
- Existing uniqueness rule remains `host + port`.
- Existing imported passwords must use the same encryption path as manual proxy creation.
- No legacy/backfill behavior is required because this only adds a new creation path.

## API Authorization Rules

- Preview/import API must require ADMIN using the same admin auth guard as existing proxy APIs.
- API responses must include `hasPassword`, never plaintext password.
- Server-side validation is authoritative even if the UI also validates.

## Required Indexes And Migration Impact

- No migration is expected.
- Existing unique index on `host + port` is sufficient for duplicate enforcement.
- Import should still check duplicates before create to return a clear summary, but DB uniqueness remains the final guard.

## Verification Limitations

- Real proxy connectivity is not part of import; testing remains a separate action.
- Bulk import can validate format and save records, but it cannot prove provider proxy quality.
- File upload is intentionally out of scope for this version.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS.
- **Traceable Planning**: PASS.
- **Test-First For Risky Behavior**: PASS.
- **Minimal, Encoding-Safe Edits**: PASS.
- **Security And Privacy Boundaries**: PASS.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
