# Feature Specification: Announcement Media, Slider, and News Ticker

**Feature Branch**: `003-announcement-media-ticker`
**Created**: 2026-05-14
**Status**: Draft
**Input**: Improve the local announcement area so admins can publish polished image/text ads, validate image sizing, show/hide a news-style ticker, and display multiple uploaded images as a controlled slider without breaking the current production site.

## User Scenarios and Testing

### User Story 1 - Safe, Better Single Announcement (Priority: P1)

An admin can create or edit the current announcement with a cleaner form, upload one main image with size guidance, add text, schedule it, preview it, and publish it without breaking the public dashboard layout.

**Why this priority**: This preserves the current feature while improving the weak areas first.

**Independent Test**: Create an announcement with one image and text, open the customer dashboard on desktop and mobile widths, and confirm the image/text render cleanly with no overflow.

**Acceptance Scenarios**:

1. Given an admin uploads an image below the minimum accepted size, when the admin saves, then the system blocks save or shows a clear warning based on the configured rule.
2. Given an admin uploads a recommended image, when the announcement is active, then customers see it in a stable, responsive layout.
3. Given an existing announcement has only `imageUrl` and `message`, when the new renderer loads, then it still displays correctly.
4. Given `isDismissable` is enabled, when a customer dismisses the banner, then it stays hidden for that customer until the dismissal version or banner changes.

---

### User Story 2 - Multi-Image Slider Cards (Priority: P1)

An admin can upload multiple images, sort them, add optional title/text/link for each image, and show them as a card slider on the customer dashboard.

**Why this priority**: The user specifically requested uploading 10 or more images and showing them as a slider/card sequence.

**Independent Test**: Add 10 slides, reorder them, disable one slide, and verify the public dashboard shows only active slides in the saved order.

**Acceptance Scenarios**:

1. Given an admin adds 10 slides, when the announcement is active, then the customer sees a polished horizontal slider rather than a broken vertical list.
2. Given a slide is disabled, when the public announcement is loaded, then that slide is not returned or displayed.
3. Given a slide has a link, when clicked, then only safe internal or HTTPS links are allowed.
4. Given a customer is on mobile, when the slider renders, then it shows one focused card with controls and does not overflow the screen.

---

### User Story 3 - Show/Hide News Ticker (Priority: P1)

An admin can add a separate moving text strip like TV news channels, control whether it is visible, and change its text, speed, direction, and colors.

**Why this priority**: The ticker is a distinct requested feature and should not be mixed with the current main message animation.

**Independent Test**: Enable ticker, set Arabic text, choose direction, then disable it and confirm it disappears while the announcement image/slider remains visible.

**Acceptance Scenarios**:

1. Given ticker is disabled, when the announcement is active, then no ticker strip appears.
2. Given ticker is enabled with Arabic text, when the dashboard loads, then the text moves smoothly in the selected direction.
3. Given ticker text is empty, when saving, then the system either disables ticker or blocks save with a clear validation message.
4. Given the user prefers reduced motion, when the ticker renders, then motion is reduced or paused.

---

### User Story 4 - Admin Preview and Production Safety (Priority: P2)

An admin can preview desktop and mobile layouts before publishing, and the rollout keeps current production announcements working.

**Why this priority**: The site is live, so the feature must be additive and backward-compatible.

**Independent Test**: Load an existing production-like announcement record with no slides or ticker fields and verify the admin screen and public screen do not crash.

**Acceptance Scenarios**:

1. Given old data exists, when the migration runs, then no old announcement is deleted or deactivated.
2. Given a banner has both legacy image data and new slides, when public data is built, then slides take priority and legacy image remains fallback only.
3. Given invalid ticker colors or slide link values are submitted, when the API validates, then the save is rejected without changing the previous live announcement.

---

### Edge Cases

- No image, message only.
- Images only, no message.
- Ticker only with no images.
- Very long ticker text.
- Ten or more slides.
- Disabled slides mixed with active slides.
- Expired or future scheduled announcements.
- Existing legacy announcement records from production.
- Failed upload after some slides were already saved.
- Admin opens two tabs and saves conflicting changes.
- Customer has slow network and images load late.
- Customer uses mobile viewport narrower than 360px.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST keep existing announcement records working without requiring manual data repair.
- **FR-002**: The system MUST support a main announcement image and text as it does today.
- **FR-003**: The system MUST support multiple announcement slides attached to one announcement.
- **FR-004**: Each slide MUST support image URL, alt text, optional title, optional description, optional link label, optional link URL, active flag, and sort order.
- **FR-005**: The public announcement API MUST return only active slides sorted by sort order.
- **FR-006**: The admin announcement API MUST return all slides so admins can edit disabled and active slides.
- **FR-007**: The admin UI MUST allow adding, deleting, disabling, and reordering slides.
- **FR-008**: The slider MUST display as responsive cards and avoid layout overflow on desktop, tablet, and mobile.
- **FR-009**: The slider MUST support manual next/previous controls.
- **FR-010**: The slider SHOULD support optional autoplay with a configurable interval.
- **FR-011**: Autoplay MUST pause on hover/focus and MUST respect reduced motion preferences.
- **FR-012**: The system MUST validate uploaded announcement image file type and file size.
- **FR-013**: The system MUST validate or warn about image dimensions before publishing.
- **FR-014**: Recommended main banner image size MUST be documented as 1600x400 pixels with 4:1 aspect ratio.
- **FR-015**: Minimum main banner image size MUST be documented as 1200x300 pixels.
- **FR-016**: Recommended slide image size MUST be documented as 1200x675 pixels with 16:9 aspect ratio.
- **FR-017**: Minimum slide image size MUST be documented as 800x450 pixels.
- **FR-018**: The system MUST provide clear admin guidance when images do not match recommended dimensions.
- **FR-019**: The admin UI MUST provide a preview for desktop and mobile announcement layouts.
- **FR-020**: The system MUST support a separate ticker area independent from the main announcement message.
- **FR-021**: Ticker settings MUST include enabled flag, text, speed, direction, background color, text color, and placement.
- **FR-022**: Ticker text MUST support Arabic and other RTL text.
- **FR-023**: Ticker must be hidden when disabled even if ticker text exists.
- **FR-024**: The public renderer MUST sanitize or safely render text and links.
- **FR-025**: Slide links MUST reject JavaScript URLs and unsafe protocols.
- **FR-026**: The admin UI MUST keep the current active/schedule controls.
- **FR-027**: `isDismissable` MUST become visible and configurable in the admin UI because it already exists in the data model.
- **FR-028**: Customer dismissal MUST not hide future edited versions forever; changing banner version/content must allow it to reappear.
- **FR-029**: The public route MUST not expose admin-only metadata.
- **FR-030**: Failed validation MUST not partially overwrite the live announcement.
- **FR-031**: The migration MUST be additive and safe for production.
- **FR-032**: No renewal, verification, wallet balance, refund, worker queue, beIN account, or ledger behavior may be changed by this feature.

### Non-Functional Requirements

- **NFR-001**: The public announcement render must not block renewal or verification flows.
- **NFR-002**: The feature must be usable from mobile admin screens.
- **NFR-003**: The feature must avoid heavy layout shift while images load.
- **NFR-004**: Images must include dimensions or stable aspect containers in the renderer.
- **NFR-005**: The admin form should be split into understandable sections instead of one long unclear form.
- **NFR-006**: New code must follow the existing Next.js, Prisma, Zod, Tailwind, and component patterns.
- **NFR-007**: The rollout must include a rollback path that disables new slider/ticker display while leaving old announcements intact.

## Key Entities

- **AnnouncementBanner**: Existing announcement container with message, colors, schedule, active state, legacy image fields, and new display/ticker settings.
- **AnnouncementSlide**: New ordered image card item attached to one announcement.
- **TickerSettings**: Ticker visibility and display configuration stored on the banner.
- **PublicAnnouncementDTO**: Safe data returned to customers.
- **AdminAnnouncementDTO**: Full editable data returned to admins.

## Success Criteria

- **SC-001**: Existing announcement records render after migration without manual edits.
- **SC-002**: Admin can publish a slider with 10 images in under 5 minutes.
- **SC-003**: Public dashboard shows no horizontal overflow at 360px, 768px, 1280px, and 1536px widths.
- **SC-004**: Ticker can be toggled off without changing the image/slider content.
- **SC-005**: Unsafe slide links are rejected before save.
- **SC-006**: A failed save leaves the previously active announcement unchanged.
- **SC-007**: Build, type check, lint, and announcement simulation tests pass before production rollout.

## Assumptions

- The current upload route remains local-file based unless a later feature moves media to external storage.
- Existing active announcement behavior is single active or latest active announcement, as implemented today.
- The first implementation should avoid touching financial, worker, and beIN automation code.
- Admin-only configuration remains under the existing admin settings area.

## Out of Scope

- External CDN integration.
- Image editing/cropping inside the browser.
- Paid ad analytics.
- Per-user targeting.
- Changes to renewal, verification, balance, refund, worker, or beIN account execution logic.
