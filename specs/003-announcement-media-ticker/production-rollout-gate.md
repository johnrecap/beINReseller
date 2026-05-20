# Production Rollout Gate: Announcement Media, Slider, and News Ticker

Date: 2026-05-14

## Verified Locally

- Announcement simulations passed: 10/10.
- TypeScript check passed with `npx tsc --noEmit`.
- Feature-scoped lint passed for announcement API, admin UI, public renderer, upload input, shared helpers, schema, constants, and simulation script.
- Production build passed with `npm run build` after allowing network access for Google Fonts.
- Build emitted local Redis `ECONNREFUSED` warnings because Redis is not running locally. The build exit code was 0.

## Full Lint Status

`npm run lint` is not clean for the whole repository yet.

The failures are outside the announcement feature and include existing issues in scripts, mobile/store routes, manager components, and renewal UI. Do not use a clean full-lint claim for this branch until those unrelated errors are fixed.

## Scope Check

The announcement feature files are limited to:

- `prisma/schema.prisma`
- `worker/prisma/schema.prisma`
- `prisma/migrations/20260514110000_add_announcement_media_ticker/migration.sql`
- `scripts/announcement-media-ticker-simulations.ts`
- `src/app/api/admin/announcement/route.ts`
- `src/app/api/admin/announcement/[id]/route.ts`
- `src/app/api/admin/upload/route.ts`
- `src/app/api/announcement/active/route.ts`
- `src/app/globals.css`
- `src/components/admin/AnnouncementSettings.tsx`
- `src/components/AnnouncementBanner.tsx`
- `src/components/announcements/AnnouncementBannerView.tsx`
- `src/components/ui/ImageUpload.tsx`
- `src/lib/announcement/constants.ts`
- `src/lib/announcement/helpers.ts`
- `src/lib/announcement/schema.ts`
- `specs/003-announcement-media-ticker/*`

The current working tree also contains unrelated financial, renewal, refund, worker, and ledger changes from other phases. For an announcement-only production release, deploy only the announcement feature changes or split this work before deployment.

## Required Production-Like Test

Before production deployment, test against a local or staging copy of real `AnnouncementBanner` rows.

Required checks:

1. Existing announcement rows render without editing them.
2. Existing rows keep `sliderEnabled = false` and `tickerEnabled = false` unless an admin explicitly enables them.
3. A message-only announcement still renders.
4. A single-image announcement still renders through the legacy fallback.
5. A slider with 1 to 10 active slides renders correctly.
6. A disabled slide does not appear publicly.
7. Ticker disabled means no ticker appears.
8. Ticker enabled appears only after admin approval.

## Rollout Order

1. Apply the additive database migration.
2. Deploy app code with slider and ticker disabled on existing announcements.
3. Confirm the old announcement display still works.
4. Enable one main-image announcement first.
5. Enable a small slider next, starting with 1 to 3 slides.
6. Enable ticker last.
7. Monitor public dashboard layout and admin save errors after each step.

## Rollback

Fast rollback without deleting data:

1. Disable ticker for the active announcement.
2. Disable slider for the active announcement.
3. Keep or restore legacy `imageUrl`, `imageAlt`, and `message`.
4. Leave slide records in the database for later review.
5. If app code must be reverted, keep the additive migration in place; old code ignores the new columns.

## Do Not Deploy If

- Full production-like announcement data has not been tested.
- The release package accidentally includes unrelated financial, wallet, refund, renewal, verification, worker, queue, or beIN ledger changes when the intent is announcement-only.
- Admin cannot save an inactive announcement safely.
- Public `/api/announcement/active` exposes admin-only fields.
- Legacy image fallback does not work.
