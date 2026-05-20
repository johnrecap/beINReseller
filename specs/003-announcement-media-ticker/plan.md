# Implementation Plan: Announcement Media, Slider, and News Ticker

**Branch**: `003-announcement-media-ticker`
**Spec**: `specs/003-announcement-media-ticker/spec.md`
**Date**: 2026-05-14

## Summary

Upgrade the current local announcement feature from a single image/message banner into a safer admin-managed announcement system with:

1. Better single-image announcement controls.
2. Multiple image slides displayed as responsive cards.
3. A separate show/hide news ticker strip.
4. Image dimension validation and preview guidance.
5. Backward compatibility with existing production announcement records.

This plan is documentation only. It defines what should be implemented later and in what order.

## Technical Context

**Application**: Next.js App Router with TypeScript and React client components
**Database**: Prisma schema with production database behind it
**Validation**: Zod-based announcement schema
**Styling**: Tailwind CSS and existing UI components
**Current Uploads**: `src/app/api/admin/upload/route.ts`
**Current Admin UI**: `src/components/admin/AnnouncementSettings.tsx`
**Current Public UI**: `src/components/announcements/AnnouncementBannerView.tsx`
**Current Public Fetch Wrapper**: `src/components/AnnouncementBanner.tsx`
**Current Admin API**:

- `src/app/api/admin/announcement/route.ts`
- `src/app/api/admin/announcement/[id]/route.ts`

**Current Public API**:

- `src/app/api/announcement/active/route.ts`

## Constitution Check

- Keep minimal diffs.
- Use additive database changes.
- Do not touch financial, balance, refund, renewal, verification, worker, queue, or beIN automation behavior.
- Preserve existing production records.
- Prefer existing local patterns over new frameworks.
- Validate and test before production rollout.
- Keep rollback simple: disabling slider/ticker must leave legacy banner display available.

## Current State Findings

The existing feature already supports:

- `AnnouncementBanner.message`
- `AnnouncementBanner.imageUrl`
- `AnnouncementBanner.imageAlt`
- `AnnouncementBanner.isActive`
- `AnnouncementBanner.animationType`
- `AnnouncementBanner.colors`
- `AnnouncementBanner.textSize`
- `AnnouncementBanner.position`
- `AnnouncementBanner.isDismissable`
- `AnnouncementBanner.startDate`
- `AnnouncementBanner.endDate`

Current weaknesses:

- Only one image is supported.
- `isDismissable` exists in the database but is not exposed clearly in the admin UI.
- The existing `marquee` animation applies to the main message, not a separate news ticker.
- Upload checks file type and size but not dimensions or aspect ratio.
- No slider/card system exists.
- No per-slide title, description, order, active flag, or link exists.
- No dedicated ticker settings exist.
- Public API returns only the current banner shape.
- Admin form is large and should be split into clearer sections.

## Detailed Modification Map

### Database and Prisma

**Files**:

- `prisma/schema.prisma`
- `worker/prisma/schema.prisma`
- `prisma/migrations/<timestamp>_add_announcement_media_ticker/migration.sql`

**Planned Changes**:

1. Add display settings to `AnnouncementBanner`:
   - `displayMode`
   - `imageFit`
   - `imageAspectRatio`
   - `sliderEnabled`
   - `sliderAutoplay`
   - `sliderIntervalMs`
   - `sliderCardsDesktop`
   - `sliderCardsTablet`
   - `sliderCardsMobile`
   - `tickerEnabled`
   - `tickerText`
   - `tickerSpeed`
   - `tickerDirection`
   - `tickerPosition`
   - `tickerBackgroundColor`
   - `tickerTextColor`
   - `dismissalVersion`
2. Add a new `AnnouncementSlide` model:
   - `id`
   - `bannerId`
   - `imageUrl`
   - `imageAlt`
   - `title`
   - `description`
   - `linkLabel`
   - `linkUrl`
   - `sortOrder`
   - `isActive`
   - `imageFit`
   - `createdAt`
   - `updatedAt`
3. Add relation from `AnnouncementBanner` to slides.
4. Add indexes for banner lookup and ordered active slides.
5. Keep `imageUrl` and `imageAlt` on `AnnouncementBanner` for backward compatibility.
6. Do not migrate/delete old image data automatically in a destructive way.

### Validation and Shared Helpers

**Files**:

- `src/lib/announcement/schema.ts`
- `src/lib/announcement/constants.ts`
- `src/lib/announcement/helpers.ts`

**Planned Changes**:

1. Extend validation for new banner display fields.
2. Add slide validation.
3. Add ticker validation.
4. Add safe link validation for slide URLs.
5. Add public DTO builder that removes admin-only fields.
6. Add fallback logic:
   - Use active slides if present.
   - Otherwise use legacy `imageUrl`.
7. Add image dimension constants:
   - Main banner recommended: 1600x400.
   - Main banner minimum: 1200x300.
   - Slide recommended: 1200x675.
   - Slide minimum: 800x450.

### Upload and Image Input

**Files**:

- `src/app/api/admin/upload/route.ts`
- `src/components/ui/ImageUpload.tsx`

**Planned Changes**:

1. Keep current file type and size validation.
2. Add optional upload purpose:
   - `announcement-main`
   - `announcement-slide`
3. Validate dimensions after upload or before save.
4. Show clear size guidance in admin UI.
5. Return image metadata:
   - width
   - height
   - size
   - mime type
6. Warn or block based on configured minimums.

### Admin UI

**Files**:

- `src/components/admin/AnnouncementSettings.tsx`
- Optional new components under `src/components/admin/announcements/`

**Planned Changes**:

1. Split the admin form into sections:
   - Basic content
   - Main image
   - Slider images
   - Ticker strip
   - Schedule and visibility
   - Preview
2. Add slider editor:
   - Add slide
   - Remove slide
   - Disable/enable slide
   - Reorder slide
   - Edit alt/title/description/link
3. Add ticker editor:
   - Enabled toggle
   - Text input
   - Speed select
   - Direction select
   - Color controls
   - Placement select
4. Add `isDismissable` toggle.
5. Add preview tabs or segmented controls:
   - Desktop
   - Tablet
   - Mobile
6. Keep save behavior transactional at API level so failed validation does not partially change the active banner.

### Public Rendering

**Files**:

- `src/components/announcements/AnnouncementBannerView.tsx`
- `src/components/AnnouncementBanner.tsx`
- `src/app/globals.css`

**Planned Changes**:

1. Render legacy single-image banner when no slides exist.
2. Render slider when active slides exist and slider is enabled.
3. Use stable aspect-ratio containers to avoid layout shift.
4. Add manual next/previous controls with icons.
5. Add optional autoplay with pause on hover/focus.
6. Add ticker strip independent from message.
7. Respect reduced motion.
8. Add dismissal behavior based on banner id and dismissal version.
9. Ensure mobile layout does not overflow.

### APIs

**Files**:

- `src/app/api/admin/announcement/route.ts`
- `src/app/api/admin/announcement/[id]/route.ts`
- `src/app/api/announcement/active/route.ts`

**Planned Changes**:

1. Admin list/create/update endpoints include slides and ticker settings.
2. Public active endpoint returns safe DTO only.
3. Writes should validate full payload before changing the database.
4. Slide create/update/delete should be done in a transaction.
5. Toggle active must not delete slide/ticker settings.

### Tests and Verification

**Files**:

- `scripts/announcement-media-ticker-simulations.ts`
- Existing test/build commands from project scripts

**Planned Changes**:

1. Add simulation checks for:
   - Legacy banner fallback
   - Active slide ordering
   - Disabled slides hidden from public DTO
   - Unsafe links rejected
   - Ticker disabled state
   - Ticker enabled state
   - Image dimension rules
2. Run type check, lint, and build.
3. Use browser verification for desktop and mobile layout before production rollout.

## Phases

### Phase 1 - Baseline and Safety

- Capture current announcement behavior.
- Confirm all touched files.
- Add non-production simulation plan.
- Confirm no financial/worker files are in scope.

### Phase 2 - Data Model and Contracts

- Add additive schema changes.
- Add API contracts.
- Add validation schema plan.
- Keep backward compatibility.

### Phase 3 - Admin Editing Experience

- Improve form structure.
- Add main image guidance.
- Add slider editor.
- Add ticker editor.
- Add preview.

### Phase 4 - Public Renderer

- Add legacy fallback.
- Add card slider.
- Add ticker.
- Add dismissal.
- Add accessibility and reduced motion.

### Phase 5 - Verification and Production Rollout

- Run simulations.
- Run build/type/lint.
- Test with production-like data copy.
- Deploy with rollback option.

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Old announcement records crash new renderer | Customers see broken dashboard | Keep legacy fallback and test old data |
| Admin uploads wrong image sizes | Bad visual layout | Dimension guidance plus validation |
| Ticker movement affects usability | Annoying or inaccessible UI | Reduced motion support and enable toggle |
| Slider loads too many heavy images | Slow dashboard | Limit file size, lazy-load images, stable dimensions |
| Unsafe slide links | Security risk | Allow only HTTPS or relative internal links |
| Partial save corrupts active banner | Production issue | Validate first and save in transaction |
| Migration affects worker Prisma schema | Build issue | Mirror schema changes to `worker/prisma/schema.prisma` |

## Production Rollout Plan

1. Implement behind additive fields and fallback rendering.
2. Deploy database migration first in a maintenance-safe window.
3. Deploy app code after migration is complete.
4. Keep slider/ticker disabled on existing announcements by default.
5. Test admin creation on a staging or local database copy.
6. Enable a new announcement with one slide first.
7. Add more slides after confirming public layout.
8. Enable ticker last.
9. Rollback path:
   - Disable ticker.
   - Disable slider.
   - Use legacy `imageUrl` and `message`.
   - Do not delete slide data unless confirmed.

## Post-Implementation Validation Commands

Use the project's actual scripts if names differ.

```powershell
npm run typecheck
npm run lint
npm run build
node scripts/announcement-media-ticker-simulations.ts
```

## Acceptance Gate

Implementation is not ready for production until:

- Legacy records render correctly.
- Slider with 10 images renders correctly.
- Ticker can be enabled and disabled.
- Bad image/link payloads are rejected.
- Public API exposes no admin-only fields.
- No wallet, refund, renewal, verification, worker, queue, or beIN ledger files are changed for this feature.
