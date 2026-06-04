# Quickstart: Points Settings Save And Manager-Owned User Points

## Focused Verification Commands

Run these after implementation:

```bash
npx tsx --test tests/unit/points-admin-settings-normalization.test.ts tests/integration/admin-points-settings-save.test.ts
npx tsx --test tests/unit/points-operation-awards.test.ts tests/unit/worker-points-awards.test.ts
npx prisma validate
npm run check:schema-sync
npx prisma generate
npm run build
npm --prefix worker run build
git diff --check
```

## Manual Admin Save Test

1. Open the admin Points Settings page.
2. Change these values:
   - normal user points per 1000 USD
   - manager-owned user points per 1000 USD
   - default agent points per 1000 USD
   - default manager points per 1000 USD
3. Add one agent override and one manager override.
4. Save.
5. Confirm the success message appears only after the page shows the saved values.
6. Refresh the browser.
7. Confirm all changed values remain visible.

## Manual Override Semantics Test

1. Clear one override input and save.
2. Refresh and confirm the row is blank and uses the default.
3. Enter `0` in the same override input and save.
4. Refresh and confirm the row shows `0`, not blank.

## Manual Manager-Owned User Points Test

1. Pick a test user linked under an active manager.
2. Disable manager-owned user points.
3. Complete a qualifying renewal operation for that user.
4. Confirm only the manager receives operation spend points.
5. Enable manager-owned user points and set a positive manager-owned user rate.
6. Complete another qualifying renewal operation for the same user.
7. Confirm the manager receives manager points and the user receives points at the manager-owned user rate.

## Production Deployment Notes

- Use `npx prisma migrate deploy`; do not use `npx prisma db push` for normal production deployment.
- Stop `bein-web` before removing `.next` and rebuilding.
- Build and restart the worker after web build so point-award logic is consistent.
- Check PM2 logs after deployment for points settings save errors and worker build/start errors.

## Rollback Notes

- The migration adds a disabled setting by default and does not modify ledger rows.
- If the feature must be disabled after deploy, turn off manager-owned user points from the admin screen.
- If a code rollback is needed, keep the database migration in place unless a DBA-approved rollback is prepared.
