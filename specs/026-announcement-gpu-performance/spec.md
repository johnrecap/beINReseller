# Feature Specification: Announcement GPU Performance

**Feature Branch**: `026-announcement-gpu-performance`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "The announcement images still feel like they reload from scratch on every slide change, images are too heavy, and browser GPU usage is very high. After second-agent review, fix the immediate rendering/GPU causes first: single visible slide, adjacent preload only, stable slide structure, disable global cursor particles, and defer upload compression/backfill."

## User Scenarios & Testing

### User Story 1 - Smooth Announcement Slider (Priority: P1)

Dashboard users see announcement images change smoothly without the browser appearing to reload each image from scratch.

**Why this priority**: This is the visible problem reported by the user and affects every dashboard visit when announcements are active.

**Independent Test**: Open the dashboard with an active multi-image announcement, let autoplay rotate, and manually use next/previous controls. The visible slide should change without stacked image redraw, flicker, or repeated full image transfers.

**Acceptance Scenarios**:

1. **Given** an announcement with three or more active slides, **When** the slider advances automatically, **Then** only one visible slide is rendered and adjacent images are preloaded without visible stacked cards.
2. **Given** an announcement with two active slides, **When** the user presses next and previous repeatedly, **Then** the slider swaps images without remounting the whole card shell or showing duplicate preload images.
3. **Given** an announcement with one active slide, **When** the dashboard loads, **Then** no carousel timer, duplicate image layer, or unnecessary navigation state is created.

---

### User Story 2 - Lower GPU Usage During Normal Dashboard Use (Priority: P2)

Dashboard users can move the mouse and leave the dashboard open without the browser consuming excessive GPU for decorative effects.

**Why this priority**: The user reported very high GPU usage. The global cursor particle canvas is not required for business workflows and can be removed without reducing core function.

**Independent Test**: Open the dashboard and move the mouse continuously for 30 seconds. Browser task manager or performance tools should show materially lower GPU/CPU activity than before this change.

**Acceptance Scenarios**:

1. **Given** a logged-in dashboard session, **When** the user moves the mouse across the page, **Then** no global fullscreen particle canvas is active by default.
2. **Given** a dashboard page with announcement autoplay, **When** the user leaves the page open for at least one minute, **Then** only the necessary announcement timer remains active and no decorative pointer effect continuously draws.

---

### User Story 3 - Clear Future Path For Heavy Uploaded Images (Priority: P3)

Admins and maintainers have a documented path to optimize large announcement uploads later without blocking the immediate GPU fix.

**Why this priority**: Large original images still matter, but adding a new image-processing dependency immediately is riskier than first removing the unnecessary runtime drawing cost.

**Independent Test**: Review the implementation notes and deployment checklist. They must clearly state that upload compression/backfill is deferred, what evidence would trigger it, and what file types must be tested before enabling it.

**Acceptance Scenarios**:

1. **Given** existing large production announcement images, **When** the slider performance fix is deployed, **Then** those files remain usable and are not converted or deleted automatically.
2. **Given** future evidence that large images remain the main bottleneck after the rendering fix, **When** maintainers plan the next feature, **Then** they have documented checks for compression, transparency, GIF behavior, and production dependency installation.

### Edge Cases

- Announcement has no active slides but has a legacy single image.
- Announcement has no image and only text or ticker.
- Slide with a link follows a slide without a link; the visible card shell should stay stable.
- Adjacent preload should not create duplicate hidden images when there are only two slides.
- User enables reduced motion; slider should avoid unnecessary animation and still show the active image.
- Browser cache is disabled in DevTools; this should be documented as an invalid success signal for normal users.
- Existing uploaded images may be large and must continue to display after runtime rendering changes.

## Requirements

### Functional Requirements

- **FR-001**: The announcement slider MUST render only one visible slide image at a time.
- **FR-002**: The announcement slider MUST preload only adjacent unique slide images needed for the next likely transition.
- **FR-003**: The visible slide card MUST keep a stable outer structure while slide content changes.
- **FR-004**: Slides with and without links MUST not cause the top-level visible card structure to switch between unrelated shapes.
- **FR-005**: The announcement slider MUST avoid blur, blend-mode layering, deep stacked-card effects, and broad "animate everything" transitions during normal rotation.
- **FR-006**: The dashboard MUST NOT mount the global cursor particle effect by default.
- **FR-007**: The feature MUST preserve existing announcement controls, autoplay behavior, ticker behavior, text overlays, image fit options, and admin preview parity unless a behavior is explicitly marked deferred.
- **FR-008**: The feature MUST keep existing cache behavior from the previous media-cache work and verify that repeated image requests can avoid full body transfer when cache validators match.
- **FR-009**: The feature MUST document upload compression and existing-image backfill as deferred follow-up work, not part of the immediate fix.
- **FR-010**: The feature MUST include verification steps for one-slide, two-slide, and three-or-more-slide announcements.

### Key Entities

- **Announcement Slider State**: The active slide index, pause state, autoplay interval, and adjacent preload targets used by the announcement renderer.
- **Announcement Slide**: A display image with optional text, link, alt text, and fit mode.
- **Global Cursor Effect**: A decorative pointer-driven canvas effect that must be disabled by default for dashboard sessions.
- **Performance Evidence**: Browser task manager, performance trace, screenshot, network transfer result, and build/test outputs used to prove the fix.

## Success Criteria

### Measurable Outcomes

- **SC-001**: During announcement autoplay, only one visible announcement image is present in the rendered card area.
- **SC-002**: Repeated request for the same uploaded announcement image returns cached or not-modified behavior under normal cache-enabled browsing.
- **SC-003**: Moving the mouse on the dashboard for 30 seconds no longer activates a fullscreen decorative drawing loop.
- **SC-004**: Manual checks pass for announcements with one slide, two slides, and at least three slides.
- **SC-005**: Production build completes successfully after the performance changes.
- **SC-006**: No new image-processing dependency is required for the immediate fix.

## Assumptions

- Mobile app work is out of scope because the current project does not use the mobile app surface.
- Existing 025 media-cache work remains in place and should not be reverted.
- The immediate user-visible issue is dominated by runtime drawing/remounting and decorative effects, not only by HTTP cache headers.
- Existing production images may be large and are not automatically rewritten in this feature.
- Upload-time compression can be planned later if evidence still shows large original files are the dominant bottleneck after this fix.
