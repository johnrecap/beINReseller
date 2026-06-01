# Implementation Plan: Maintenance Resume And Media Cache Fixes

**Branch**: `025-maintenance-media-cache` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-maintenance-media-cache/spec.md`

## Summary

Fix the production-facing maintenance timer and media loading issues agreed through the second-agent review. The implementation adds a shared server-side effective maintenance decision, keeps public maintenance status read-only, computes timed maintenance from server time, improves public image caching and validation, rejects unsafe uploaded image types, and defers carousel rewrites and the broader security scan until evidence shows they are needed.

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

**Primary Dependencies**: Existing settings table access, admin settings API, maintenance status API, renewal start API, upload API, public upload serving route, Next.js headers configuration, browser cache/clipboard-independent UI behavior

**Storage**: Existing PostgreSQL `setting` records for maintenance; existing filesystem assets under `public/images` and `public/uploads`

**Testing**: `node:test` via `tsx`, TypeScript check, Next production build, manual browser network verification with DevTools cache enabled

**Target Platform**: Existing web dashboard and production server

**Project Type**: Full-stack Next.js dashboard

**Performance Goals**: Repeated public image views should avoid full file transfer when the browser cache is valid. Maintenance expiry should reopen immediately on the next status check or expiry refetch.

**Constraints**: Public status checks must not mutate database state. Uploaded display images are public only. Static `/images` filenames are not guaranteed versioned. Do not include a broad security refactor in this feature.

**Scale/Scope**: One maintenance decision helper, three routes that read maintenance state, one client hook and overlay, Next cache headers, upload validation, public upload serving, focused tests and manual browser verification.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Renewal start blocking changes are maintenance-only and must not alter balance, beIN account assignment, provider charge, refund, or operation accounting.
- **Traceable Planning**: PASS. Tasks map to user stories, files, tests, and verification with detail blocks.
- **Test-First For Risky Behavior**: PASS. Maintenance blocking and upload validation have test seams; tests are planned before route behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are scoped to maintenance, cache headers, upload serving/validation, and tests. Manual edits must use `apply_patch`.
- **Security And Privacy Boundaries**: PASS. The plan rejects unsafe uploads, keeps public endpoints read-only, and does not expose secrets or private files.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/025-maintenance-media-cache/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- maintenance-status.md
|   |-- media-cache.md
|   `-- image-upload-validation.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
next.config.ts

src/
|-- hooks/
|   `-- useMaintenance.ts
|-- components/
|   |-- shared/MaintenanceOverlay.tsx
|   `-- admin/SettingsForm.tsx
|-- app/api/
|   |-- maintenance-status/route.ts
|   |-- settings/route.ts
|   |-- operations/start-renewal/route.ts
|   |-- uploads/[...path]/route.ts
|   `-- admin/upload/route.ts
`-- lib/
    |-- maintenance/effective-status.ts
    `-- uploads/
        |-- image-validation.ts
        `-- media-cache.ts

tests/
`-- unit/
    |-- maintenance-effective-status.test.ts
    |-- media-cache-headers.test.ts
    `-- image-upload-validation.test.ts
```

**Structure Decision**: Keep changes inside existing maintenance, settings, upload, and route boundaries. Add small shared helpers only where route behavior must be reused and tested.

## Source Of Truth And Legacy Behavior

- Source of truth for saved maintenance settings remains `setting` records: `maintenance_mode`, `maintenance_message`, and `maintenance_pause_until`.
- Effective maintenance state is computed from saved settings and current server time; it is not a new persisted table.
- Public `/api/maintenance-status` must not clean up expired settings in the database.
- Admin settings save computes timed maintenance end time from server time, using submitted duration value/unit.
- Existing uploaded images under supported folders remain public.
- Existing unsupported or SVG uploads on disk must not be served by the public upload route after hardening.
- Existing static `/images` assets are not filename-versioned, so they receive moderate cache rather than one-year immutable cache.

## API Authorization Rules

- `/api/maintenance-status` stays public, read-only, and returns only non-sensitive maintenance fields.
- `/api/operations/start-renewal` keeps existing authentication and permission checks and uses effective maintenance status for non-admin blocking.
- `/api/settings` GET/PUT remains ADMIN-only and normalizes maintenance duration on the server.
- `/api/admin/upload` remains ADMIN-only and rejects unsafe image content before saving.
- `/api/uploads/[...path]` stays public but only serves approved folders and supported safe image extensions.

## Required Indexes And Migration Impact

- No schema migration is expected.
- No new index is expected.
- Existing `setting.key` lookup is sufficient for maintenance settings.
- Filesystem metadata is sufficient for uploaded image cache validators.

## Verification Limitations

- DevTools "Disable cache" forces repeat downloads and is not a valid production success signal.
- Browser cache behavior varies by browser and proxy; automated tests prove headers and validators, while manual browser checks prove observed transfer behavior.
- Deleted public uploaded images may remain in browser cache. This is acceptable for public display assets but must be revisited if uploads ever become private.
- A full security scan is intentionally deferred and should be run separately.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. The plan uses existing renewal checks and does not touch charge/deduction logic.
- **Traceable Planning**: PASS. Design artifacts and tasks identify files, tests, and verification paths.
- **Test-First For Risky Behavior**: PASS. Helper tests precede route changes.
- **Minimal, Encoding-Safe Edits**: PASS. The work is split into narrow helper and route updates with mojibake checks.
- **Security And Privacy Boundaries**: PASS. Public routes are constrained, unsafe uploads are rejected, and no sensitive secrets are exposed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No constitution violation is needed | No simpler alternative was rejected |
