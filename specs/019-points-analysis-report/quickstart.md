# Quickstart: Points Analysis Report

## Preconditions

- Logged in as admin.
- Database has point ledger entries from at least one of:
  - operation spend points
  - Eid rewards
  - point cash redemption
  - point reversal
  - legacy/manual point sources

## Manual Smoke Flow

1. Start the app locally.
2. Open `/dashboard/admin/reports?tab=points-analysis`.
3. Confirm the Points Analysis tab appears in the Reports Center.
4. Confirm summary cards show earned, available, converted, reversed, pending, cancelled, and legacy/manual totals.
5. Search for a known owner username.
6. Open the owner detail view.
7. Confirm the owner timeline explains each row source and current status.
8. Apply a date filter and confirm displayed dates are in Egypt time.
9. Apply source type and status filters.
10. Confirm no buttons on this report can mutate points or balance.

## API Smoke Flow

```bash
curl -i "http://localhost:3000/api/admin/reports/points-analysis?page=1&limit=25"
```

Expected:

- Admin session returns `200`.
- Non-admin or no session returns `401` or `403`.
- Response contains `summary`, `rows`, `pagination`, and `settings`.

## Verification Commands

```bash
npx tsx --test tests/unit/points-analysis.test.ts
npx tsx --test tests/unit/report-center-tabs.test.ts
npx tsc --noEmit
npm run build
```

## Production Deployment Note

This implementation does not add a Prisma migration. It adds read-only APIs and UI only, so deploy with Prisma client generation and build:

```bash
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout 019-points-analysis-report
git pull --ff-only origin 019-points-analysis-report
npm ci
npm --prefix worker ci
npx prisma generate
npm run build
cd worker && npm run build && cd ..
pm2 restart all
pm2 status
pm2 logs --lines 20
```

If a later performance pass adds an index migration, run `npx prisma migrate deploy` before `npx prisma generate`.
