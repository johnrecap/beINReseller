# Quickstart: Fix Points Recipient Routing

## Test Matrix

| User ownership case | Expected recipients |
|---------------------|---------------------|
| User under agent | USER + AGENT |
| User under manager | MANAGER only |
| User direct under admin creator | ADMIN only |
| User without valid owner | No recipients |
| User with manager and agent | MANAGER only |

## Verification Commands

```bash
npx tsx --test tests/unit/points-operation-awards.test.ts
npx tsx --test tests/unit/points-analysis.test.ts
npx tsc --noEmit
npm run build
```

## Manual Production Check After Deploy

1. Pick a direct admin-created user with no active agent assignment and no manager link.
2. Complete a small test subscription operation after the points feature start date.
3. Open Points Analysis.
4. Confirm the user has no new `OPERATION_SPEND` points.
5. Confirm the admin has the new `OPERATION_SPEND` points.
6. Pick an agent-owned user and confirm USER + AGENT still both get points.
7. Pick a manager-owned user and confirm MANAGER only gets points.

## Historical Audit Workflow

1. Run the read-only candidate audit or SQL/report query.
2. Split candidates into:
   - Safe available-only reversal candidates.
   - Converted review-required candidates.
   - Ambiguous ownership candidates.
3. Apply reversals only after review.
4. Do not run `prisma db push` in production.

## Production Deployment

No schema migration is expected for the forward fix.

```bash
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout 020-fix-points-routing
git pull --ff-only origin 020-fix-points-routing
npm ci
npm --prefix worker ci
npx prisma generate
npm run build
cd worker && npm run build && cd ..
pm2 restart all
pm2 status
pm2 logs --lines 20
```

If implementation later adds an index migration for the historical audit, run `npx prisma migrate deploy` before `npx prisma generate`.
