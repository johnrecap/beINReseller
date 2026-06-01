# Implementation Plan: Announcement GPU Performance

**Branch**: `026-announcement-gpu-performance` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/026-announcement-gpu-performance/spec.md`

## Summary

Fix the announcement image "reload from scratch" feeling and high browser GPU usage by changing the carousel from a three-layer visual stack to one stable visible slide, preloading only adjacent images, removing heavy runtime effects from the announcement card, and disabling the global cursor particle canvas by default. Defer upload compression/backfill until after runtime rendering is measured.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16.1 app router

**Primary Dependencies**: Existing announcement renderer, announcement helper utilities, global providers, cursor effect component, browser cache behavior from 025 media-cache work

**Storage**: Existing announcement banner and slide records; no new storage

**Testing**: Focused unit tests via `tsx`/`node:test` where practical, targeted lint, TypeScript check, Next production build, local browser or HTTP verification for image cache behavior, manual/browser performance sanity checks

**Target Platform**: Existing web dashboard in desktop browsers

**Project Type**: Full-stack Next.js dashboard with client-rendered announcement UI

**Performance Goals**: One visible slide image at a time, no global cursor canvas on dashboard, no repeated full image body transfer under normal cache-enabled browsing, lower GPU activity during autoplay and mouse movement

**Constraints**: Do not add `sharp` or any image-processing dependency in this feature. Do not rewrite existing uploaded files. Do not change mobile surfaces. Keep admin preview and live dashboard rendering aligned.

**Scale/Scope**: Announcement banner renderer, global providers, optional small helper extraction, focused tests, and verification documentation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. This feature does not touch customer balance, beIN dealer balance, operation status, account assignment, refunds, or review workflows.
- **Traceable Planning**: PASS. Tasks map user stories to files, tests, and verification with required detail blocks.
- **Test-First For Risky Behavior**: PASS. The affected behavior is UI performance, not operation accounting. The plan still includes test seams for slide selection/preload logic where practical before UI changes.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are scoped to the announcement renderer and global provider mounting. Manual edits must use `apply_patch`.
- **Security And Privacy Boundaries**: PASS. No sensitive data exposure is introduced. Upload compression is deferred.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/026-announcement-gpu-performance/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- announcement-rendering.md
|   |-- cursor-effects.md
|   `-- performance-verification.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- components/
|   |-- announcements/AnnouncementBannerView.tsx
|   |-- providers/Providers.tsx
|   `-- effects/CursorEffects.tsx
|-- lib/
|   `-- announcement/
|       |-- constants.ts
|       `-- helpers.ts
`-- app/
    `-- globals.css

tests/
`-- unit/
    `-- announcement-slider-performance.test.ts
```

**Structure Decision**: Keep the immediate fix inside the existing announcement renderer and provider boundary. Add a small helper/test seam only if needed to prove active and adjacent slide selection without browser-only rendering.

## Source Of Truth And Legacy Behavior

- Announcement data source remains existing banner and slide records.
- Existing uploaded image URLs remain valid.
- Existing media-cache behavior from 025 remains the source of truth for HTTP caching and must not be weakened.
- Existing large files are not rewritten, deleted, or converted by this feature.
- Admin preview and live dashboard share `AnnouncementBannerView.tsx`, so both must stay visually consistent.

## API Authorization Rules

- No new API route is planned.
- Existing public announcement and public upload routes keep their current authorization behavior.
- No admin permissions change is planned.

## Required Indexes And Migration Impact

- No schema migration is expected.
- No new index is expected.
- No new production dependency is expected for the immediate fix.

## Verification Limitations

- Browser GPU measurements vary by device, GPU driver, browser, extension state, and DevTools settings.
- DevTools "Disable cache" invalidates normal browser cache behavior and must not be used as the success signal for image transfer.
- Without production-sized images, local verification proves rendering and cache behavior, not exact production GPU numbers.
- Upload compression/backfill is deferred; if large original files remain slow after rendering fixes, a new feature should address image processing and existing file migration.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. No financial or operation accounting behavior changes.
- **Traceable Planning**: PASS. Contracts, quickstart, and tasks identify concrete verification points.
- **Test-First For Risky Behavior**: PASS. UI helper tests are planned before renderer changes where a seam exists.
- **Minimal, Encoding-Safe Edits**: PASS. Scope is limited to announcement rendering and cursor mounting.
- **Security And Privacy Boundaries**: PASS. No secrets, sessions, provider data, or private files are exposed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No constitution violation is needed | No simpler alternative was rejected |
