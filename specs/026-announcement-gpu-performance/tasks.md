# Tasks: Announcement GPU Performance

**Input**: Design documents from `specs/026-announcement-gpu-performance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required for slide selection/preload behavior because the visible issue already survived a cache-only fix.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Focused Test Seam)

**Purpose**: Add a small testable seam for the carousel behavior before changing the renderer.

- [x] T001 Create announcement slider selection tests in `tests/unit/announcement-slider-performance.test.ts`
  - Reason: The current issue is caused by rendering too many slide layers and remounting too much; tests need to lock down one active slide plus adjacent preload behavior before UI changes.
  - Expected: Tests cover one slide, two slides, three slides, duplicate image URLs, active slide wrapping, and adjacent preload uniqueness.
  - Possible bugs: Tests can become too tied to React markup instead of the selection rules.
  - Fix/Mitigation: Test a pure helper for active/preload selection and use rendered/browser validation for markup.
  - Verification: `npx tsx --test tests/unit/announcement-slider-performance.test.ts` fails before the helper exists.

---

## Phase 2: Foundational Helper

**Purpose**: Isolate active/preload slide selection so the renderer can be simplified safely.

- [x] T002 Implement announcement slider helper in `src/lib/announcement/slider-performance.ts`
  - Reason: The renderer needs deterministic active slide and adjacent preload selection without embedding all logic in JSX.
  - Expected: Helper returns one active slide and a de-duplicated list of adjacent preload slides for any active index and slide count.
  - Possible bugs: Two-slide carousels can preload the same image twice, or one-slide banners can start unnecessary autoplay.
  - Fix/Mitigation: Normalize indexes, de-duplicate by resolved image URL, and return an empty preload list for one-slide banners.
  - Verification: `npx tsx --test tests/unit/announcement-slider-performance.test.ts`.

---

## Phase 3: User Story 1 - Smooth Announcement Slider (Priority: P1) MVP

**Goal**: Dashboard announcement images change smoothly with one visible slide and no stacked image redraw.

**Independent Test**: Open dashboard/admin preview with one, two, and three-or-more slides; verify one visible image and working autoplay/manual navigation.

### Implementation for User Story 1

- [x] T003 [US1] Replace three-card visible stack in `src/components/announcements/AnnouncementBannerView.tsx`
  - Reason: The current visible stack renders up to three image layers with transforms, blur, opacity, and blend effects, which drives GPU work and creates the "reload from scratch" feeling.
  - Expected: The slider renders a single stable visible card shell and updates only the active slide content.
  - Possible bugs: Links, title overlays, or descriptions can disappear if the previous card map logic is removed too aggressively.
  - Fix/Mitigation: Preserve active slide title, description, linkUrl, alt text, and imageFit behavior while changing only the shell strategy.
  - Verification: Manual dashboard/admin preview check with slides containing images, text, and links.

- [x] T004 [US1] Add adjacent image preload markup in `src/components/announcements/AnnouncementBannerView.tsx`
  - Reason: The next likely images should be ready without being drawn as visible layers.
  - Expected: Adjacent unique image URLs are preloaded with non-visible image elements that do not use `display: none`.
  - Possible bugs: Hidden preload elements can become visible, duplicate with two slides, or be ignored by the browser.
  - Fix/Mitigation: Use visually hidden/offscreen preload images with `aria-hidden`, empty alt text, and de-duplicated URLs.
  - Verification: Browser network check shows adjacent image requested before it becomes active, without extra visible layers.

- [x] T005 [US1] Remove runtime references to stacked-card classes in `src/components/announcements/AnnouncementBannerView.tsx`
  - Reason: Runtime must stop using `stitch-card-middle`, `stitch-card-back`, blur, blend mode, and broad transition behavior.
  - Expected: The rendered slider no longer references middle/back stack classes or `mix-blend-luminosity`.
  - Possible bugs: Removing classes can make the announcement look visually flat or lose necessary dimensions.
  - Fix/Mitigation: Keep the existing aspect-ratio container and a modest single-card shadow/border.
  - Verification: `rg -n "stitch-card-middle|stitch-card-back|mix-blend|visibleSlides" src/components/announcements/AnnouncementBannerView.tsx` returns no runtime usage.

- [x] T006 [US1] Verify one/two/three-slide behavior in `src/components/announcements/AnnouncementBannerView.tsx`
  - Reason: Carousel edge cases are where remounting, duplicate preloads, and missing navigation regressions usually appear.
  - Expected: One slide has no unnecessary timer/controls, two slides navigate both directions, and three slides autoplay correctly.
  - Possible bugs: Autoplay interval can continue for one slide or navigation can wrap incorrectly.
  - Fix/Mitigation: Gate autoplay and navigation on `slides.length > 1` and reuse helper-normalized indexes.
  - Verification: Manual or browser validation with one, two, and three active slides.

---

## Phase 4: User Story 2 - Lower GPU Usage During Normal Dashboard Use (Priority: P2)

**Goal**: Dashboard mouse movement and autoplay no longer trigger unnecessary fullscreen drawing or heavy compositing.

**Independent Test**: Move the mouse on the dashboard for 30 seconds and observe no cursor particles/canvas activity by default.

### Implementation for User Story 2

- [x] T007 [US2] Stop mounting global cursor particles in `src/components/providers/Providers.tsx`
  - Reason: The global cursor effect draws on a fullscreen canvas during mouse movement and is not required for dashboard work.
  - Expected: Dashboard provider no longer renders `<CursorEffects />` by default.
  - Possible bugs: Removing the mount can leave an unused import or change decorative behavior someone expected on non-dashboard pages.
  - Fix/Mitigation: Remove only the provider mount and unused import; leave `CursorEffects.tsx` available for future explicit opt-in.
  - Verification: Browser DOM check shows no cursor-effect canvas after dashboard load.

- [x] T008 [US2] Preserve cursor effect component without dashboard side effects in `src/components/effects/CursorEffects.tsx`
  - Reason: Future pages may opt into the effect, but it must not run globally by accident.
  - Expected: Component remains unchanged unless lint requires cleanup; no default dashboard mount exists.
  - Possible bugs: Over-editing the component can introduce unrelated visual regressions.
  - Fix/Mitigation: Avoid changing component internals unless tests/lint require it.
  - Verification: `rg -n "<CursorEffects" src` shows no default provider mount.

- [ ] T009 [US2] Perform browser performance sanity check for mouse movement and autoplay
  - Local note: Chrome/Edge headless could not complete in this environment because the browser GPU process failed before rendering. Code/runtime checks confirm the global cursor effect is no longer mounted; a real DevTools GPU observation is still needed on an interactive browser.
  - Reason: Build success does not prove GPU usage improved.
  - Expected: No visible pointer particle effect during mouse movement; autoplay does not create obvious GPU spikes from stacked layers.
  - Possible bugs: Browser extensions or DevTools cache settings can distort results.
  - Fix/Mitigation: Record browser/settings used and compare with the previous code path when possible.
  - Verification: Browser task manager/performance panel observation noted in final result.

---

## Phase 5: User Story 3 - Future Path For Heavy Uploaded Images (Priority: P3)

**Goal**: Keep the immediate fix dependency-light while documenting what to do if image file size remains a bottleneck.

**Independent Test**: Review quickstart and final notes; they clearly defer upload compression/backfill and list required future checks.

### Implementation for User Story 3

- [x] T010 [US3] Keep upload compression out of immediate code changes in `src/app/api/admin/upload/route.ts`
  - Reason: Adding image processing now increases deployment risk and does not fix existing production uploads without backfill.
  - Expected: No new image-processing dependency or upload conversion is introduced by this feature.
  - Possible bugs: Implementer may accidentally mix compression with rendering fixes and widen the blast radius.
  - Fix/Mitigation: Check `package.json` and upload route diff for no new compression dependency or format conversion.
  - Verification: `git diff -- package.json src/app/api/admin/upload/route.ts` shows no new image-processing dependency for this feature.

- [x] T011 [US3] Document deferred image optimization checks in `specs/026-announcement-gpu-performance/quickstart.md`
  - Reason: If large source images remain the bottleneck, the next plan needs a safe path for compression/backfill.
  - Expected: Quickstart states compression/backfill is deferred and names required future checks for JPEG, PNG transparency, WebP, GIF, and production install/build.
  - Possible bugs: Documentation can imply the current feature optimizes existing images when it does not.
  - Fix/Mitigation: Use explicit "deferred" wording and keep deployment notes dependency-light.
  - Verification: Review quickstart and final summary for no claim that existing images were compressed.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T012 Run focused unit tests
  - Reason: The helper behavior must be proven before relying on browser-only checks.
  - Expected: Slider selection/preload tests pass.
  - Possible bugs: Tests can pass while JSX still renders stacked images.
  - Fix/Mitigation: Pair unit tests with runtime grep and browser checks.
  - Verification: `npx tsx --test tests/unit/announcement-slider-performance.test.ts`.

- [x] T013 Run targeted lint and type checks
  - Reason: Renderer/provider edits can introduce JSX, hook, or unused-import errors.
  - Expected: Edited files lint cleanly and TypeScript passes.
  - Possible bugs: Full lint may include unrelated legacy warnings; targeted lint can miss unrelated breakage.
  - Fix/Mitigation: Run targeted lint plus `npx tsc --noEmit --pretty false`.
  - Verification: `npx eslint src/components/announcements/AnnouncementBannerView.tsx src/components/providers/Providers.tsx src/lib/announcement/slider-performance.ts tests/unit/announcement-slider-performance.test.ts` and `npx tsc --noEmit --pretty false`.

- [x] T014 Run production build
  - Reason: Next production build can catch server/client boundary issues not seen in focused tests.
  - Expected: Build completes successfully.
  - Possible bugs: Build can fail because a client component imports a server-only helper or a dynamic route has type issues.
  - Fix/Mitigation: Keep helper pure and browser-safe; rerun build after fixes.
  - Verification: `npm run build`.

- [x] T015 Verify image cache behavior remains intact
  - Reason: The previous media-cache fix must not regress while changing slider rendering.
  - Expected: Static and uploaded images retain cache/not-modified behavior.
  - Possible bugs: Renderer changes can accidentally bypass existing upload URL resolver or add cache-busting query strings.
  - Fix/Mitigation: Keep `resolveUploadedImageSrc` usage and do not add random query params.
  - Verification: Local repeated uploaded image request returns 304 or cache behavior with DevTools cache enabled.

- [x] T016 Perform encoding and diff safety checks
  - Reason: Repository rules require minimal diffs and no mojibake.
  - Expected: No whitespace errors and no newly introduced mojibake markers.
  - Possible bugs: Existing mojibake in legacy comments can confuse scans.
  - Fix/Mitigation: Scan only changed paths and this feature spec; note pre-existing files separately if needed.
  - Verification: `git diff --check` and the mojibake scan pattern listed in `AGENTS.md` against changed source, tests, and `specs/026-announcement-gpu-performance`.

- [x] T017 Prepare deployment notes
  - Reason: Production build/restart order matters and no database work is expected.
  - Expected: Final notes state no migration and no new dependency expected.
  - Possible bugs: Suggesting `prisma db push` or installing unnecessary packages can risk production.
  - Fix/Mitigation: Follow `AGENTS.md` deployment notes; use `migrate deploy` only if future migrations exist.
  - Verification: Compare final deployment instructions with `AGENTS.md`.

## Dependencies

- Phase 1 before renderer changes.
- Phase 2 before User Story 1 implementation.
- User Story 1 is MVP and should be implemented before measuring remaining image-size concerns.
- User Story 2 can proceed after User Story 1 or in parallel if edits are limited to `Providers.tsx`.
- User Story 3 is documentation/guardrail work and should happen before final summary.
- Final verification depends on all selected user stories.

## Parallel Opportunities

- T007 can run in parallel with T003-T006 because it touches `Providers.tsx`, not the announcement renderer.
- T010-T011 can run in parallel with implementation because they are guardrail/documentation checks.
- T012 and T016 can run after implementation; T014 should wait for tests and type checks.

## Implementation Strategy

1. Add failing helper tests for active/preload slide selection.
2. Add pure slider helper.
3. Replace stacked visible slider rendering with one stable visible card and adjacent preload.
4. Stop mounting global cursor particles by default.
5. Verify one/two/three-slide behavior, cache behavior, mouse movement, lint/type/build, and encoding safety.
6. Defer upload compression/backfill until evidence after this runtime fix.
