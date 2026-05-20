# Current Baseline: Announcement Media, Slider, and News Ticker

**Date**: 2026-05-14
**Phase**: Phase 1 - Setup and Baseline
**Scope**: Documentation and current-state review only. No runtime behavior changed.

## Baseline Summary

The current announcement feature is a single announcement banner system. It supports one text message, one optional image, scheduling, active/inactive state, text animation, gradient colors, text size, and position.

It does not currently support:

- Multiple announcement images.
- Slider cards.
- Per-image title, description, link, active flag, or ordering.
- A separate show/hide news ticker.
- Image dimension validation.
- Admin desktop/mobile preview modes.
- Customer dismissal behavior, even though the database already has `isDismissable`.

## T001: Admin Form Baseline

**File**: `src/components/admin/AnnouncementSettings.tsx`

Current saved fields:

- `message`
- `animationType`
- `colors`
- `textSize`
- `position`
- `isActive`
- `startDate`
- `endDate`
- `imageUrl`
- `imageAlt`

Current form behavior:

- Loads all banners from `GET /api/admin/announcement`.
- Creates with `POST /api/admin/announcement`.
- Updates with `PUT /api/admin/announcement/:id`.
- Toggles with `PATCH /api/admin/announcement/:id`.
- Deletes with `DELETE /api/admin/announcement/:id`.
- Uses `AnnouncementBannerView` for preview.
- Uses `ImageUpload` for one optional announcement image.

Current gaps:

- No UI for `isDismissable` despite the database field.
- No slider section.
- No ticker section.
- No image dimension guidance.
- No desktop/tablet/mobile preview mode.
- No per-slide editing.

## T002: Public Renderer Baseline

**File**: `src/components/announcements/AnnouncementBannerView.tsx`

Current render behavior:

- Renders one optional image.
- Renders one optional text message.
- Uses `animationType` to render text as gradient, typing, glow, slide, marquee, or static.
- Uses `position` to support top, bottom, or floating display.
- Uses `object-contain` for uploaded announcement image.
- In live mode, image max height is `70vh`.
- In preview mode, image max height is `200px`.

Current gaps:

- No slider support.
- No stable slide/card dimensions.
- No ticker strip separate from the main message.
- `marquee` is only a text animation, not a configurable news ticker.
- No dismiss button or local dismissal state.
- No reduced-motion handling for marquee/typing.

## T003: Public Fetch Wrapper Baseline

**File**: `src/components/AnnouncementBanner.tsx`

Current behavior:

- Client component.
- Fetches `/api/announcement/active` on mount.
- Expects `{ success: true, banner }`.
- Stores banner in local state.
- Renders nothing while loading or when no banner exists.
- Wraps `AnnouncementBannerView` in Framer Motion entrance animation.

Current gaps:

- No support for a richer public DTO with `slides` or `ticker`.
- No polling or refresh after initial load.
- No dismissal state.

## T004: Validation Schema Baseline

**File**: `src/lib/announcement/schema.ts`

Current validation:

- `message` max length: `MESSAGE_MAX_LENGTH`.
- `imageUrl` must be empty/null or start with `/uploads/`.
- `imageAlt` max length: `IMAGE_ALT_MAX_LENGTH`.
- `animationType` must be one of `ANIMATION_TYPES`.
- `textSize` must be one of `TEXT_SIZES`.
- `position` must be one of `POSITIONS`.
- `colors` defaults to empty array.
- `startDate` and `endDate` parse to `Date` or null.
- Create requires message or image.
- Create requires `endDate >= startDate` when both dates exist.
- Update allows partial fields.

Current gaps:

- No slide schema.
- No ticker schema.
- No safe link schema.
- No image dimension schema.
- No public DTO builder for the future shape.

## T005: Constants Baseline

**File**: `src/lib/announcement/constants.ts`

Current constants:

- `ANIMATION_TYPES`: `gradient`, `typing`, `glow`, `slide`, `marquee`, `none`.
- `TEXT_SIZES`: `small`, `medium`, `large`.
- `POSITIONS`: `top`, `bottom`, `floating`.
- `MESSAGE_MAX_LENGTH`: `500`.
- `IMAGE_ALT_MAX_LENGTH`: `120`.
- `DEFAULT_GRADIENT_COLORS`.
- `PRESET_GRADIENTS`.
- UI options for animation, text size, and position.
- CSS class map for text sizes.

Current gaps:

- No image dimension constants.
- No slider constants.
- No ticker constants.
- Existing Arabic labels in this file appear mojibake before this phase; Phase 1 did not modify them.

## T006: Helper Baseline

**File**: `src/lib/announcement/helpers.ts`

Current helpers:

- `normalizeOptionalText(value)`.
- `resolveUploadedImageSrc(url)`.
- `isValidUploadUrl(url)`.

Current gaps:

- No active slide selection helper.
- No legacy fallback helper.
- No public DTO helper.
- No safe link helper.
- No image dimension helper.
- No dismissal version helper.

## T007: Admin List/Create API Baseline

**File**: `src/app/api/admin/announcement/route.ts`

Current behavior:

- Requires admin role through `requireRoleAPIWithMobile`.
- `GET` returns all banners ordered by `createdAt desc`.
- `POST` validates with `createAnnouncementSchema`.
- If new banner is active, existing active banners are deactivated in the same transaction.
- Creates one `AnnouncementBanner` row.

Current gaps:

- No slides included in admin response.
- No ticker fields.
- No full transaction for slides because slides do not exist yet.
- No image dimension metadata.

## T008: Admin Detail/Update/Delete/Toggle API Baseline

**File**: `src/app/api/admin/announcement/[id]/route.ts`

Current behavior:

- Requires admin role.
- `GET` returns one banner by id.
- `PUT` validates partial update with `updateAnnouncementSchema`.
- `PUT` checks that message or image remains.
- If activating by update, it deactivates other active banners in a transaction.
- `PUT` deletes old uploaded image if replaced and not used by another banner.
- `DELETE` deletes one banner and then deletes its uploaded image if no other banner uses it.
- `PATCH` toggles active/inactive and deactivates other banners when activating.

Current gaps:

- No slide fetch/update/delete behavior.
- No ticker update behavior.
- No transaction that covers banner plus slides.
- File cleanup will need care when multiple slides can reference files.

## T009: Public Active API Baseline

**File**: `src/app/api/announcement/active/route.ts`

Current behavior:

- Public route, no auth.
- Finds first active banner inside date range.
- Date logic supports:
  - No date restrictions.
  - Start date only.
  - End date only.
  - Both start and end date.
- Orders by `createdAt desc`.
- Returns `{ success: true, banner }`.

Current gaps:

- Returns raw banner shape.
- Does not include slides.
- Does not filter public-only fields through a DTO helper.
- Does not include ticker object.

## T010: ImageUpload Component Baseline

**File**: `src/components/ui/ImageUpload.tsx`

Current behavior:

- Supports single or multiple image values.
- Accepts product, category, or announcement type.
- Client-side checks:
  - File MIME starts with `image/`.
  - File size is maximum 5MB.
- Sends file to `/api/admin/upload`.
- Shows preview grid.
- Uses `resolveUploadedImageSrc` for preview URL.
- Removes image from local form state only.

Current gaps:

- No purpose-specific image guidance.
- No dimension validation or warning.
- Multiple mode exists generally but announcement admin currently uses single-image mode.
- No metadata handling from upload response.

## T011: Upload API Baseline

**File**: `src/app/api/admin/upload/route.ts`

Current behavior:

- Requires admin role.
- Accepts `file` and `type`.
- Allowed MIME types:
  - `image/jpeg`
  - `image/jpg`
  - `image/png`
  - `image/webp`
  - `image/gif`
- Maximum file size: 5MB.
- Stores files under:
  - `public/uploads/products`
  - `public/uploads/categories`
  - `public/uploads/announcements`
- Returns `success`, `url`, `filename`, `size`, and `type`.
- Delete endpoint validates URL starts with `/uploads/` and resolves inside uploads root before unlink.

Current gaps:

- No `purpose` field for announcement main image vs slide image.
- No width/height detection.
- No dimension result in response.

## T012: Scope Safety Confirmation

Phase 1 confirms the announcement feature can be planned without changing these areas:

- Wallet balance logic.
- Refund logic.
- Renewal flow.
- Verification flow.
- Worker queue.
- beIN account execution.
- beIN spend ledger.
- Mobile app code.
- Store app code.

The later implementation should remain inside announcement, upload, and shared announcement helper files unless a task explicitly requires an additive Prisma schema update.

## Related Model Baseline

**Files**:

- `prisma/schema.prisma`
- `worker/prisma/schema.prisma`

Current `AnnouncementBanner` fields:

- `id`
- `message`
- `imageUrl`
- `imageAlt`
- `isActive`
- `animationType`
- `colors`
- `textSize`
- `position`
- `isDismissable`
- `startDate`
- `endDate`
- `createdAt`
- `updatedAt`

Both root and worker Prisma schemas currently contain the same announcement model.

## Baseline Risk Notes

1. Existing source files already contain mojibake in comments and Arabic labels. This phase did not edit those source files.
2. The public API currently returns the raw banner model. Future phases should introduce a safe public DTO before adding slides/ticker.
3. The current admin delete/update file cleanup only understands one image field. Future slider file cleanup must avoid deleting files still used by other slides or banners.
4. The current renderer has no fixed aspect-ratio wrapper for announcement images. Future image/slider work should add stable dimensions to prevent layout shift.
