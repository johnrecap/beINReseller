# Quickstart: Maintenance Resume And Media Cache Fixes

## Automated Checks

Run the focused unit tests:

```bash
npx tsx --test tests/unit/maintenance-effective-status.test.ts tests/unit/media-cache-headers.test.ts tests/unit/image-upload-validation.test.ts
```

Run type and build checks:

```bash
npx tsc --noEmit --pretty false
npm run build
```

Run diff and encoding safety checks:

```bash
git diff --check
```

Then run the mojibake scan pattern listed in `AGENTS.md` against `src`, `tests`, and `specs/025-maintenance-media-cache`.

## Manual Maintenance Validation

1. Log in as admin.
2. Enable maintenance with a timed duration.
3. Log in as a non-admin user and open the renewal page before the end time.
4. Confirm the maintenance screen blocks the renewal flow.
5. Move the saved end time to a past value in a safe local/test environment or use a short test fixture if available.
6. Refresh the non-admin page.
7. Confirm the maintenance overlay disappears and renewal start is not blocked by maintenance.
8. Enable maintenance without a valid end time.
9. Confirm the user stays blocked until admin disables maintenance.

## Manual Image Cache Validation

1. Open Chrome DevTools Network tab.
2. Make sure "Disable cache" is not checked.
3. Open the dashboard page that shows the brand image and announcement images.
4. Navigate away and back, or rotate the announcement carousel.
5. Confirm repeated image entries do not transfer full image bodies.
6. Repeat once with "Disable cache" checked only to confirm it forces downloads and should not be used as the success signal.

## Manual Upload Validation

1. Upload a valid PNG, JPG, WebP, and GIF through the admin upload UI.
2. Confirm each upload returns a generated URL and displays correctly.
3. Try uploading an SVG file.
4. Confirm the upload is rejected.
5. Try uploading a file with a safe extension but invalid or mismatched bytes.
6. Confirm the upload is rejected.

## Deployment Notes

No schema migration is expected. Production deploy should still follow the safe Next.js order from `AGENTS.md`: fetch the intended branch, install only when needed, run Prisma deploy/generate if applicable, stop `bein-web`, remove `.next`, build, restart `bein-web`, build/restart worker processes, and check PM2 logs.
