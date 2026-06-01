# Tasks: Maintenance Resume And Media Cache Fixes

**Input**: Design documents from `specs/025-maintenance-media-cache/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature changes user blocking behavior, public media cache behavior, and upload validation/security boundaries.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Focused Tests)

**Purpose**: Add failing focused tests before changing maintenance or upload behavior.

- [x] T001 Create effective maintenance status tests in `tests/unit/maintenance-effective-status.test.ts`
  - Reason: Maintenance expiry is the highest-risk behavior and needs a reusable decision seam before route changes.
  - Expected: Tests cover saved-off, future timed maintenance, expired timed maintenance, missing pause time, invalid pause time, and admin display normalization.
  - Possible bugs: Tests can encode client clock behavior instead of server-time behavior.
  - Fix/Mitigation: Pass explicit `now` values into the helper in every test.
  - Verification: `npx tsx --test tests/unit/maintenance-effective-status.test.ts` fails before helper implementation.

- [x] T002 Create media cache header tests in `tests/unit/media-cache-headers.test.ts`
  - Reason: Cache fixes need proof that uploaded images get validators and not-modified behavior.
  - Expected: Tests cover long immutable upload cache, moderate static image cache, ETag matching, Last-Modified matching, and no-sniff header.
  - Possible bugs: Tests can require exact ETag formatting that is hard to maintain.
  - Fix/Mitigation: Assert validator stability and matching behavior rather than cosmetic format.
  - Verification: `npx tsx --test tests/unit/media-cache-headers.test.ts` fails before helper implementation.

- [x] T003 Create upload validation tests in `tests/unit/image-upload-validation.test.ts`
  - Reason: Long cache is safe only when uploaded files are verified safe and immutable.
  - Expected: Tests accept valid PNG/JPEG/WebP/GIF bytes and reject SVG, unknown bytes, mismatched claimed type, and unsupported extensions.
  - Possible bugs: Minimal test fixtures can be invalid images and create false negatives.
  - Fix/Mitigation: Use the smallest valid byte fixtures already accepted by the parser or create fixtures that match existing dimension logic.
  - Verification: `npx tsx --test tests/unit/image-upload-validation.test.ts` fails before helper implementation.

---

## Phase 2: Foundational Helpers

**Purpose**: Build small shared helpers so routes can reuse tested behavior.

- [x] T004 Implement maintenance effective-state helper in `src/lib/maintenance/effective-status.ts`
  - Reason: Public status, renewal start, and admin settings must make the same maintenance decision.
  - Expected: Helper computes effective state from raw settings and server time without writing to storage.
  - Possible bugs: Expired invalid dates can accidentally open the panel.
  - Fix/Mitigation: Treat invalid dates as manual maintenance when mode is true.
  - Verification: `npx tsx --test tests/unit/maintenance-effective-status.test.ts`.

- [x] T005 Implement media cache helper in `src/lib/uploads/media-cache.ts`
  - Reason: Upload serving needs one tested place for cache headers and validator decisions.
  - Expected: Helper builds upload/static cache headers, ETags, Last-Modified, Content-Length, no-sniff, and not-modified decisions.
  - Possible bugs: 304 support can still read the full file if metadata is computed too late.
  - Fix/Mitigation: Design helper around filesystem stat metadata before file body reads.
  - Verification: `npx tsx --test tests/unit/media-cache-headers.test.ts`.

- [x] T006 Implement image byte validation helper in `src/lib/uploads/image-validation.ts`
  - Reason: Upload POST and public serving need consistent safe image type rules.
  - Expected: Helper detects JPEG, PNG, WebP, and GIF from bytes; rejects SVG/unknown bytes; returns MIME, extension, and dimensions where available.
  - Possible bugs: Existing valid WebP or GIF files can be rejected if detection is too strict.
  - Fix/Mitigation: Preserve current dimension parsing support and add fixtures for every allowed type.
  - Verification: `npx tsx --test tests/unit/image-upload-validation.test.ts`.

---

## Phase 3: User Story 1 - Maintenance Reopens When Timer Ends (Priority: P1) MVP

**Goal**: Timed maintenance stops blocking users when its server-time end has passed, while manual maintenance stays manual.

**Independent Test**: Simulate raw settings in helper tests, then manually verify renewal page behavior before and after expiry.

### Tests for User Story 1

- [x] T007 [US1] Add route-shaped maintenance blocking cases in `tests/unit/maintenance-effective-status.test.ts`
  - Reason: The helper must support both public display and renewal blocking semantics.
  - Expected: Tests prove expired timed maintenance displays open and does not block renewal, while manual maintenance blocks renewal.
  - Possible bugs: Helper can return correct display state but wrong blocking state.
  - Fix/Mitigation: Test both returned fields explicitly.
  - Verification: `npx tsx --test tests/unit/maintenance-effective-status.test.ts`.

### Implementation for User Story 1

- [x] T008 [US1] Use effective maintenance helper in `src/app/api/maintenance-status/route.ts`
  - Reason: The maintenance screen must reopen based on computed status without public DB writes.
  - Expected: Endpoint returns `maintenance_mode=false` for expired timed maintenance and remains read-only.
  - Possible bugs: Endpoint can accidentally hide maintenance message for active manual maintenance.
  - Fix/Mitigation: Preserve existing message fallback for active states.
  - Verification: Manual request to `/api/maintenance-status` with active, expired, and manual settings.

- [x] T009 [US1] Use effective maintenance helper in `src/app/api/operations/start-renewal/route.ts`
  - Reason: UI reopening is insufficient if the renewal API still rejects users with stale `maintenance_mode=true`.
  - Expected: Non-admin renewal start is blocked only by effective active maintenance; admins keep existing bypass.
  - Possible bugs: The change can bypass all maintenance if raw settings are missing.
  - Fix/Mitigation: Treat missing settings as off but true mode with invalid pause as manual active.
  - Verification: Focused manual renewal start checks and `npx tsc --noEmit --pretty false`.

- [x] T010 [US1] Normalize maintenance duration on server in `src/app/api/settings/route.ts`
  - Reason: Admin browser clocks can create wrong pause end times.
  - Expected: PUT computes `maintenance_pause_until` from server time when mode and duration are submitted; GET does not mislead admins after expiry.
  - Possible bugs: Existing settings form can stop saving unrelated settings if normalization overwrites the body incorrectly.
  - Fix/Mitigation: Restrict normalization to maintenance keys and preserve all unrelated key/value updates.
  - Verification: Manual admin save/reload for maintenance and a non-maintenance setting.

- [x] T011 [US1] Update client expiry refetch in `src/hooks/useMaintenance.ts`
  - Reason: Users should not wait up to the normal polling interval after the visible countdown reaches zero.
  - Expected: Hook schedules a one-time refetch just after `maintenancePauseUntil` while keeping existing periodic polling.
  - Possible bugs: Multiple timers can accumulate when status changes.
  - Fix/Mitigation: Store and clear the expiry timeout in the effect cleanup.
  - Verification: Manual maintenance countdown test with a short local/test expiry.

- [x] T012 [US1] Update expired maintenance copy in `src/components/shared/MaintenanceOverlay.tsx`
  - Reason: The screen currently says it is waiting for admin confirmation, which conflicts with automatic reopen.
  - Expected: Copy says the service is checking/reopening automatically rather than requiring admin confirmation.
  - Possible bugs: Copy can imply the page is open while the next refetch has not completed.
  - Fix/Mitigation: Use wording that says status is being checked and will resume automatically.
  - Verification: Manual review of expired countdown state.

---

## Phase 4: User Story 2 - Public Display Images Stop Re-Downloading (Priority: P2)

**Goal**: Static brand images and public uploaded announcement images avoid full repeated downloads during normal browsing.

**Independent Test**: Verify headers and browser transfer behavior with DevTools cache enabled.

### Tests for User Story 2

- [x] T013 [US2] Add Next header rule expectations in `tests/unit/media-cache-headers.test.ts`
  - Reason: The blanket no-store rule caused static and uploaded images to re-download.
  - Expected: Tests or helper assertions prove `/images/*` and `/api/uploads/*` do not receive the global no-store behavior.
  - Possible bugs: Header rule order can make the exclusion ineffective.
  - Fix/Mitigation: Verify exact configured route patterns or helper output after editing `next.config.ts`.
  - Verification: `npx tsx --test tests/unit/media-cache-headers.test.ts`.

### Implementation for User Story 2

- [x] T014 [US2] Update cache header rules in `next.config.ts`
  - Reason: Public images must not inherit `no-store`.
  - Expected: Dynamic app/API routes remain no-store, while `/images/*` gets moderate public cache and `/api/uploads/*` is left to its route-specific cache.
  - Possible bugs: Broad exclusions can cache sensitive API responses.
  - Fix/Mitigation: Exclude only exact public media path prefixes.
  - Verification: Inspect response headers for `/images/desh-panel-brand.jpeg`, `/api/uploads/...`, and a normal API route.

- [x] T015 [US2] Add validators and not-modified support in `src/app/api/uploads/[...path]/route.ts`
  - Reason: Repeated uploaded image requests should avoid full body transfer when cache validators match.
  - Expected: Route validates path/folder/type, stats file, returns 304 when valid, and otherwise returns image body with long immutable cache headers.
  - Possible bugs: Route can read file before deciding 304, wasting disk IO.
  - Fix/Mitigation: Use metadata helper before `readFile`.
  - Verification: `npx tsx --test tests/unit/media-cache-headers.test.ts` and manual browser Network check.

- [x] T016 [US2] Verify carousel behavior before changing `src/components/announcements/AnnouncementBannerView.tsx`
  - Reason: The second-agent review agreed carousel rewrite is deferred unless cache fixes are insufficient.
  - Expected: No carousel code changes happen unless manual verification still shows repeated full downloads with cache enabled.
  - Possible bugs: Implementer may bundle a UI rewrite and introduce visual regressions.
  - Fix/Mitigation: Record manual Network evidence before deciding to change carousel code.
  - Verification: DevTools Network check with "Disable cache" off while rotating the carousel.

---

## Phase 5: User Story 3 - Uploaded Image Files Are Safer To Serve (Priority: P3)

**Goal**: Public uploaded image URLs are immutable and safe enough for long caching.

**Independent Test**: Upload valid images, reject SVG/spoofed images, and verify existing unsafe files are not served.

### Tests for User Story 3

- [x] T017 [P] [US3] Extend upload validation spoof cases in `tests/unit/image-upload-validation.test.ts`
  - Reason: The upload route must not trust client MIME or extension.
  - Expected: Tests reject SVG bytes with `.png`, HTML/text bytes with image MIME, unsupported extensions, and invalid image dimensions.
  - Possible bugs: The tests can duplicate route logic instead of exercising helper behavior.
  - Fix/Mitigation: Test only public helper input/output and route contracts separately where practical.
  - Verification: `npx tsx --test tests/unit/image-upload-validation.test.ts`.

### Implementation for User Story 3

- [x] T018 [US3] Update admin upload validation in `src/app/api/admin/upload/route.ts`
  - Reason: Uploaded file bytes must determine the safe type and saved extension.
  - Expected: POST rejects SVG/spoofed files, derives extension from detected bytes, keeps max size and announcement dimension rules.
  - Possible bugs: Existing valid announcement images can fail if dimension validation receives a renamed MIME value.
  - Fix/Mitigation: Pass detected MIME and dimensions through the existing dimension rule path.
  - Verification: `npx tsx --test tests/unit/image-upload-validation.test.ts` and manual valid uploads.

- [x] T019 [US3] Enforce no-overwrite upload filenames in `src/app/api/admin/upload/route.ts`
  - Reason: Immutable cache is safe only if the same URL is never overwritten.
  - Expected: Save retries with a new generated filename if the target path already exists.
  - Possible bugs: Infinite retry loop if filename generation is broken.
  - Fix/Mitigation: Limit retries and return a clear upload error if no unique name can be generated.
  - Verification: Unit helper test or local mock collision test plus manual upload.

- [x] T020 [US3] Reject unsupported public upload serving in `src/app/api/uploads/[...path]/route.ts`
  - Reason: Old unsafe files on disk should not become public just because they exist.
  - Expected: Public route refuses SVG and unsupported extensions before serving.
  - Possible bugs: Unsupported extension rejection can block a valid old file that the app still references.
  - Fix/Mitigation: Supported app uploads are limited to JPG, PNG, WebP, and GIF; verify current references before deploy if needed.
  - Verification: Direct request to an SVG/unsupported test path returns an error status.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T021 Run focused unit tests
  - Reason: Maintenance, cache, and upload changes are independently testable and must pass before build.
  - Expected: All focused tests pass.
  - Possible bugs: Tests can pass in isolation but fail together due shared mocks.
  - Fix/Mitigation: Run all three test files in one command.
  - Verification: `npx tsx --test tests/unit/maintenance-effective-status.test.ts tests/unit/media-cache-headers.test.ts tests/unit/image-upload-validation.test.ts`.

- [x] T022 Run type check and production build
  - Reason: Route and client hook changes can fail only under full TypeScript or Next build.
  - Expected: Type check and build pass.
  - Possible bugs: Next build can fail because route response headers use unsupported types.
  - Fix/Mitigation: Keep route helpers typed to plain strings and standard response init values.
  - Verification: `npx tsc --noEmit --pretty false` and `npm run build`.

- [x] T023 Perform browser cache verification
  - Reason: Header tests do not prove real browser transfer behavior.
  - Expected: With DevTools "Disable cache" off, dashboard navigation and carousel rotation do not repeatedly transfer full unchanged images.
  - Possible bugs: Tester can leave "Disable cache" on and misread the result.
  - Fix/Mitigation: Capture the DevTools setting and transferred-size evidence during verification.
  - Verification: Manual steps from `specs/025-maintenance-media-cache/quickstart.md`; completed here with a local `next start` server and HTTP cache-validator checks because direct DevTools automation was unavailable.

- [x] T024 Perform encoding and diff safety checks
  - Reason: Repository rules require minimal diffs and no mojibake.
  - Expected: No whitespace errors and no introduced mojibake markers.
  - Possible bugs: Editing docs or UI text can introduce encoding issues.
  - Fix/Mitigation: Use `apply_patch` for manual edits and scan changed files.
  - Verification: `git diff --check` and the mojibake scan pattern listed in `AGENTS.md` against `src`, `tests`, and `specs/025-maintenance-media-cache`.

- [x] T025 Prepare deployment notes
  - Reason: Production has a live database and Next builds need safe restart order.
  - Expected: Final notes state no migration expected and use `migrate deploy` only if migrations are later added.
  - Possible bugs: Deploying with `prisma db push` or building while `bein-web` serves `.next` can break production.
  - Fix/Mitigation: Follow `AGENTS.md` deployment notes exactly.
  - Verification: Compare final deployment instructions against `AGENTS.md`.

---

## Dependencies

- Phase 1 before behavior changes.
- Phase 2 before routes and upload endpoints.
- User Story 1 is MVP and should be completed before media cache work because it directly blocks users.
- User Story 2 depends on media cache helper from Phase 2.
- User Story 3 depends on image validation helper from Phase 2 and is required before long immutable cache is considered safe.
- Final verification depends on selected user stories being complete.

## Parallel Opportunities

- T001, T002, and T003 can run in parallel.
- T004, T005, and T006 can run in parallel after tests are written.
- T008 and T009 can be implemented in parallel after T004 if they avoid shared helper edits.
- T014 and T015 can be implemented in parallel after T005 if coordinated.
- T018 and T019 touch the same file and should be sequential.
- T021 and T024 can run after implementation, but build verification T022 should wait for focused tests.

## Implementation Strategy

1. Add focused failing tests.
2. Add shared helpers.
3. Implement timed maintenance effective state and client expiry refetch.
4. Implement public media cache headers and upload route validators.
5. Harden upload validation and no-overwrite save behavior.
6. Verify browser transfer behavior with DevTools cache enabled.
7. Defer carousel rewrite and broad security scan unless evidence requires them.
