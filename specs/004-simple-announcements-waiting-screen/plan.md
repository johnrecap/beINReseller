# Implementation Plan: Simple Announcements and Waiting Screen

**Branch**: `004-simple-announcements-waiting-screen`
**Spec**: `specs/004-simple-announcements-waiting-screen/spec.md`
**Date**: 2026-05-20

## Summary

Replace the complex announcement management experience with a simpler admin flow for multi-image upload, image ordering, ticker controls, and live main-page preview. Add a waiting screen for paused renewal/check operation flows from settings, with an admin-controlled countdown duration in hours or days. Implement the provided Stitch designs exactly as-is for the admin settings surface, announcement widget, maintenance screen, and sidebar visuals. For the sidebar, only replace Stitch placeholder navigation content with the current production sidebar content.

This plan is documentation and mockup work only until explicitly approved for implementation.

## Technical Context

**Language/Version**: TypeScript, React, Next.js App Router  
**Primary Dependencies**: Existing Next.js application, Prisma, existing upload API, existing announcement components  
**Storage**: Existing PostgreSQL announcement tables and upload folder  
**Testing**: Existing build checks, targeted UI tests/manual browser checks later  
**Target Platform**: Production Linux server running Next.js and PM2  
**Project Type**: Web application  
**Performance Goals**: Public announcement display should render without visible layout shift; admin preview should remain responsive with at least 10 images  
**Constraints**: No financial, renewal, verification, worker, queue, refund, or beIN automation behavior changes during planning/mockup work. Any later operation-pause implementation must block before operation creation, job dispatch, or balance deduction.  
**Scale/Scope**: One admin announcement page, one public announcement renderer, one waiting screen view, one sidebar visual refresh plan

## Stitch Design References

The implementation should use the Stitch output as the exact visual source of truth:

```text
E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/
|-- admin_settings_panel/
|   |-- code.html
|   `-- screen.png
|-- announcement_widget/
|   |-- code.html
|   `-- screen.png
|-- maintenance_screen/
|   |-- code.html
|   `-- screen.png
`-- hyper_lattice_tech/
    `-- DESIGN.md
```

Exact-design rules:

- Do not reinterpret the Stitch visuals.
- Do not change colors, spacing, shadows/glow, border radius, typography scale, card composition, or animation behavior by personal judgment.
- Use the same dark glass panels, lime active states, purple accents, grid/depth, Inter/JetBrains Mono hierarchy, rounded controls, card stack, ticker movement, and countdown cells shown in Stitch.
- Replace only placeholder data with real production data: image URLs, announcement text, countdown values, sidebar labels/routes, user name, role, and visibility state.
- If a visual detail cannot be implemented exactly due to production constraints, document the constraint and get owner approval before changing it.

## Constitution Check

- Minimal diffs only.
- Do not change financial or worker logic.
- Preserve production announcement records.
- Keep database changes additive if future implementation needs any.
- Prefer existing local components and APIs.
- Provide rollback path before production deployment.

## Project Structure

### Documentation

```text
specs/004-simple-announcements-waiting-screen/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- sidebar-navigation-inventory.md
|-- contracts/
|   `-- ui-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Mockup

```text
docs/mockups/
`-- simple-announcements-waiting-screen.html
```

### Future Source Code Map

```text
src/components/admin/AnnouncementSettings.tsx
src/components/admin/announcements/SimpleAnnouncementManager.tsx
src/components/admin/announcements/AnnouncementImageCard.tsx
src/components/admin/announcements/AnnouncementLivePreview.tsx
src/components/announcements/AnnouncementBannerView.tsx
src/components/maintenance/WaitingScreen.tsx
src/components/layout/Sidebar.tsx
src/components/layout/DashboardShell.tsx
src/components/layout/Header.tsx
src/app/api/admin/announcement/route.ts
src/app/api/admin/announcement/[id]/route.ts
src/app/api/announcement/active/route.ts
src/lib/announcement/schema.ts
src/lib/announcement/helpers.ts
```

## Design Direction

### Simplified Announcement Admin

The admin page should behave like a small media manager:

1. Upload or choose images.
2. See images as cards.
3. Reorder with drag/drop or clear move buttons.
4. Remove unwanted images.
5. Configure ticker in one compact section.
6. Preview the main-page result.
7. Save.

Advanced settings should be hidden behind a collapsed "Advanced" area or removed from the first iteration.

Exact Stitch mapping:

- Copy the Stitch admin settings panel layout, cards, controls, status labels, timer inputs, dark glass treatment, and spacing exactly.
- Keep the production language/translation system for real labels and saved data only.
- Keep the simplified image workflow, but render it inside the exact Stitch visual structure.

### Public Announcement Display

The public display should match the Stitch announcement widget exactly:

- Desktop: same stacked card carousel, card layers, transforms, opacity, glow, and right-to-left exit behavior from Stitch.
- Mobile: same responsive interpretation of the Stitch widget, adjusted only where required to avoid overflow.
- Single image: use the same Stitch card shell with one active card and no broken empty layers.
- Ticker: same Stitch ticker strip style and movement.
- Carousel interval should follow the owner-approved timing of about 4.8 seconds unless later tuned.

### Operation Pause Waiting Screen

The waiting screen should match the Stitch maintenance screen exactly and replace the current plain blocking overlay shown when renewal/check-related flows are paused from settings:

- Same background, glass panel, brand area, status pill, heading, paragraph, countdown cells, footer pill, grid/depth, glow, and typography from Stitch.
- Text content may be replaced with approved production copy.
- Countdown based on a stored pause end time.
- The backend/API side of any future implementation must check the pause state before creating operations, dispatching jobs, or touching balance.

Exact Stitch mapping:

- Copy the Stitch maintenance screen visual exactly.
- Keep wording practical for customers, but do not change the screen structure or styling.

### Sidebar Visual Refresh

The sidebar should visually match the Stitch dashboard sidebar exactly, while preserving the production navigation inventory:

- Keep the existing groups: reseller, manager, admin, footer/user/logout.
- Keep the existing role checks and `canAccessSubscription(userRole)` behavior.
- Keep admin sidebar settings for login failure and low balance links.
- Keep existing labels from translations and fallback strings.
- Keep existing routes, active route matching, mobile overlay, close button, RTL/LTR placement, and logout action.
- Copy the Stitch visual treatment exactly: glass side rail, active route rail/accent, live status dot/system status treatment, footer treatment, hover/active states, spacing, and motion.
- Do not copy Stitch placeholder nav items into production. Replace them with the existing sidebar links from `sidebar-navigation-inventory.md` while keeping the Stitch shell and states unchanged.

## Implementation Phases

### Phase 1: Setup and Baseline

- Review current announcement, upload, maintenance, renewal blocking, and sidebar behavior.
- Review the standalone HTML mockup.
- Review the Stitch design references.
- Confirm the admin flow, public display, waiting screen style, and exact sidebar visual mapping.

### Phase 2: Foundational Contracts and Helpers

- Prepare shared announcement DTO rules, ordered slide fallback, ticker visibility rules, and visual constants.
- Define operation-pause display rules before touching operation behavior.
- Create the sidebar navigation inventory before visual changes.

### Phase 3: Simple Image Announcement Manager

- Introduce a focused admin component for image cards and ticker settings.
- Keep existing save endpoint behavior where possible.
- Preserve legacy fields and records.
- Apply the exact Stitch admin panel visual structure to the simplified image cards.

### Phase 4: Simple Text Ticker Controls

- Provide compact ticker enable, text, position, speed, and rounded-corner controls.
- Keep disabled ticker output invisible.
- Match the Stitch ticker visual and motion exactly while keeping the UI controls simple.

### Phase 5: Main Page Public Display

- Render ordered slides first.
- Fall back to old single image.
- Render ticker only when enabled and non-empty.
- Ensure desktop and mobile layouts do not overlap.
- Use the exact Stitch stacked card movement with owner-approved 4.8 second timing.

### Phase 6: Operation Pause Waiting Screen

- Replace the current plain renewal/check blocking output with the new waiting screen.
- Reuse existing maintenance status first, and plan extension points for operation-specific pause settings if needed.
- Add settings controls for pause duration number and unit: hours or days.
- Store a shared pause end time so all visitors see the same countdown.
- Ensure pause checks happen before side effects in future implementation.
- Keep countdown visual only; do not automatically start operations when it reaches zero unless separately approved.

### Phase 7: Sidebar Visual Refresh

- Inventory current sidebar links for admin, manager, and normal user roles.
- Inventory current hidden-link behavior from `/api/admin/sidebar-settings`.
- Apply the exact Stitch dashboard sidebar visuals to `src/components/layout/Sidebar.tsx`.
- Keep content, permission behavior, active route matching, logout, mobile overlay, and RTL/LTR behavior unchanged.
- Validate no navigation item is added, removed, renamed, or redirected.

### Phase 8: Verification and Rollout

- Build locally.
- Test admin upload/reorder flow.
- Test public display.
- Test operation pause waiting screen.
- Test sidebar as admin, manager, and normal user.
- Deploy with rollback path.

## Rollout Safety

- Keep old announcement data intact.
- Do not delete old banner fields.
- Do not change financial database tables.
- Do not start or stop workers as part of this feature.
- Do not allow operation pause handling to create an operation, dispatch a job, deduct balance, or then refund.
- If public display fails, disable the new renderer and keep the old banner fallback.
- If sidebar styling causes navigation issues, revert only the sidebar visual component while keeping announcement and waiting-screen work independent.
