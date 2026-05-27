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

### Dry-run candidate query shape

Use this only as a review query before any correction script. It intentionally reads
candidate rows and does not update balances or ledger entries.

```sql
SELECT
  ple.id AS ledger_entry_id,
  ple.operation_id,
  ple.owner_user_id AS wrong_owner_user_id,
  u.username AS wrong_owner_username,
  ple.points,
  ple.status,
  ple.created_at,
  CASE WHEN pcr.id IS NULL THEN false ELSE true END AS converted_risk
FROM point_ledger_entries ple
JOIN users u ON u.id = ple.owner_user_id
LEFT JOIN point_cash_redemptions pcr ON pcr.ledger_entry_id = ple.id
WHERE ple.source_type = 'OPERATION_SPEND'
  AND ple.owner_role_at_time = 'USER'
  AND ple.points > 0;
```

Review each candidate against current `manager_users`, active `agent_assignments`,
and `users.created_by_id`. Safe correction must create `POINT_REVERSAL` rows for
wrong available user awards and matching `OPERATION_SPEND` owner rows only after
manual approval. Converted candidates stay review-required and must not be
auto-debited.

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
