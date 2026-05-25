# Quickstart: Eid Rewards

## 1. Assets

Place and track these files:

```text
public/assets/eid-rewards/animation2.json
public/assets/eid-rewards/animation1.json
public/assets/eid-rewards/animation3.json
```

Usage:

- `animation2.json`: envelope before opening.
- `animation1.json`: opening/reveal moment.
- `animation3.json`: celebration behind/after result.

If any file is missing or fails to parse, the component must fallback to CSS envelope/open/confetti/count-up.

## 2. Admin Setup

1. Open `/dashboard/admin/eid-rewards`.
2. Confirm existing Points Settings conversion is valid at `/dashboard/admin/points`.
3. Configure:
   - `eventKey`, e.g. `eid-2026`
   - start/end date
   - claim policy
   - min/max points
   - optional weighted tiers
   - minimum redeem points
   - popup copy and behavior
4. Save settings.
5. Enable the event.

## 3. User Flow

1. Log in as any role.
2. Open `/dashboard`.
3. If eligible, Eid popup appears.
4. Click `افتح العيدية الآن`.
5. Wait for animation and API result.
6. Click `تحويل النقاط إلى رصيد` if conversion is available, or `لاحقا`.

## 4. Manual Verification

After claiming:

- `eid_reward_claims` has one row for the user and claim scope.
- `point_ledger_entries` has one `EID_REWARD` positive row with `status=AVAILABLE`.
- `/api/eid-rewards/status` returns `alreadyClaimed=true`.

After redeeming:

- `point_ledger_entries` has a negative `POINT_CASH_REDEMPTION` row.
- `point_cash_redemptions` has a redemption row.
- `transactions` has a `DEPOSIT` row.
- `users.balance` increased by the server-calculated amount.

## 5. Verification Commands

```bash
node scripts/check-prisma-schema-sync.js
npx prisma generate
npx tsx --test tests/unit/eid-rewards*.test.ts
npx tsx --test tests/integration/eid-rewards*.test.ts
npm run build
npm --prefix worker run build
```

## 6. Production Deployment Notes

Use migrations, not `db push`:

```bash
cd /www/wwwroot/deshpanel.com
git pull --ff-only origin codex/016-eid-rewards
npx prisma migrate deploy
npx prisma generate
npm run build
cd worker && npm run build && cd ..
pm2 restart all
```
