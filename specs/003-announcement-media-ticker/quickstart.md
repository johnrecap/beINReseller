# Quickstart: Announcement Media, Slider, and News Ticker

This quickstart is for the future implementer. It describes how to verify the feature after implementation.

## 1. Confirm Scope

Only announcement files should change. The implementation must not change:

- Wallet balance logic.
- Refund logic.
- Renewal flow.
- Verification flow.
- Worker queue.
- beIN account execution.
- beIN spend ledger.

## 2. Apply Migration Locally

Use the project's normal Prisma migration flow.

```powershell
npx prisma migrate dev
npx prisma generate
```

If the worker build uses its own Prisma schema copy, keep it synced:

```powershell
npx prisma generate --schema worker/prisma/schema.prisma
```

## 3. Run Announcement Simulations

```powershell
npx tsx scripts/announcement-media-ticker-simulations.ts
```

Expected checks:

- Legacy banner fallback works.
- Active slides are sorted.
- Disabled slides are hidden from public DTO.
- Unsafe links are rejected.
- Ticker disabled state hides ticker.
- Ticker enabled state returns ticker config.
- Image dimensions follow the configured rules.

## 4. Run Project Checks

Use available project scripts.

```powershell
npm run typecheck
npm run lint
npm run build
```

## 5. Manual Admin Verification

1. Open admin announcement settings.
2. Create a message-only announcement.
3. Add one main image.
4. Add 10 slider images.
5. Reorder slides.
6. Disable one slide.
7. Add title/description/link to one slide.
8. Enable ticker with Arabic text.
9. Test desktop preview.
10. Test mobile preview.
11. Save as inactive first.
12. Activate only after preview is correct.

## 6. Manual Customer Verification

Check customer dashboard at:

- 360px width.
- 768px width.
- 1280px width.
- 1536px width.

Confirm:

- No horizontal overflow.
- Slider controls work.
- Ticker can show/hide.
- Image cards look polished.
- Text does not overlap.
- Dismissal works when enabled.

## 7. Production Gate

Before production:

1. Test with a copy of production announcement rows.
2. Confirm existing announcements render without edits.
3. Enable a simple one-image announcement first.
4. Add slider after the simple case is confirmed.
5. Enable ticker last.
6. Keep rollback ready by disabling slider/ticker and using legacy image/message.
