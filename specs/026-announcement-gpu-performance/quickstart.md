# Quickstart: Announcement GPU Performance

## Automated Checks

Run focused tests:

```bash
npx tsx --test tests/unit/announcement-slider-performance.test.ts
```

Run targeted lint on edited files:

```bash
npx eslint src/components/announcements/AnnouncementBannerView.tsx src/components/providers/Providers.tsx src/components/effects/CursorEffects.tsx tests/unit/announcement-slider-performance.test.ts
```

Run type and build checks:

```bash
npx tsc --noEmit --pretty false
npm run build
```

Run diff and encoding safety checks:

```bash
git diff --check
# Run the mojibake scan pattern listed in AGENTS.md against src, tests, and this spec directory.
```

## Manual Slider Validation

1. Start the app locally from a built or dev server.
2. Open the dashboard with an active announcement that has one slide.
3. Confirm only one image is shown and no next/previous controls are visible.
4. Repeat with two active slides.
5. Press next and previous repeatedly.
6. Confirm the visible card changes without flicker, stacked image layers, or full redraw feeling.
7. Repeat with at least three active slides and autoplay enabled.
8. Confirm autoplay works and only one visible image is present at a time.
9. Open admin announcement preview and confirm it matches the live dashboard shape.

## Manual GPU Validation

1. Open browser task manager or a performance panel.
2. Open the dashboard before interacting.
3. Move the mouse continuously for 30 seconds.
4. Confirm no cursor particle effect appears and GPU/CPU activity is materially lower than before the change.
5. Leave announcement autoplay running for at least one minute.
6. Confirm activity remains stable and does not spike on each slide change.

## Manual Cache Validation

1. Make sure DevTools "Disable cache" is off.
2. Open a public uploaded announcement image once.
3. Request the same image again.
4. Confirm the second request uses cache or not-modified behavior rather than full body transfer.

## Deployment Notes

No schema migration is expected. No new dependency is expected. Production deploy should follow the safe Next.js order from `AGENTS.md`: fetch intended branch, install only if package files changed, run Prisma deploy/generate if applicable, stop `bein-web`, remove `.next`, build, restart `bein-web`, build/restart worker processes, and check PM2 logs.
