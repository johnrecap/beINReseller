# Quickstart: Eid Reward Audience And Copy

## 1. Prepare Database Locally

```bash
npx prisma migrate dev
npx prisma generate
node scripts/check-prisma-schema-sync.js
```

## 2. Run Focused Tests

```bash
npx tsx --test tests/unit/eid-rewards-audience.test.ts
npx tsx --test tests/unit/eid-rewards-popup-copy.test.ts
npx tsx --test tests/integration/eid-rewards-audience-status.test.ts
npx tsx --test tests/integration/eid-rewards-audience-claim.test.ts
npx tsx --test tests/integration/eid-rewards-admin-settings.test.ts
```

## 3. Run Build Checks

```bash
npm run build
npm --prefix worker run build
```

## 4. Manual Admin Flow

1. Log in as admin.
2. Open `/dashboard/admin/eid-rewards`.
3. Confirm all roles are selected by default.
4. Disable one role and save.
5. Add one allow exception and one deny exception.
6. Edit every popup text field and save.
7. Refresh the page and verify the saved values remain.
8. Try adding the same user twice and verify the page keeps one override only.
9. Try saving an unsupported placeholder such as `{bad}` in a button field and verify the save fails without clearing the form.

## 5. Manual User Flow

1. Log in as a user whose role is allowed.
2. Open `/dashboard`.
3. Confirm the Eid popup appears with edited text.
4. Claim the reward and confirm points and conversion preview use edited templates.
5. Log in as a denied user.
6. Confirm the popup does not appear.
7. Try claim directly and confirm it fails without creating points.

## 6. Production Safety

Production deploy must use migrations:

```bash
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout 028-eid-reward-audience-copy
git pull --ff-only origin 028-eid-reward-audience-copy
npm ci
npm --prefix worker ci
npx prisma migrate deploy
npx prisma generate
pm2 stop bein-web
rm -rf .next
npm run build
pm2 restart bein-web --update-env
cd worker && npm run build && cd ..
pm2 restart bein-maintenance bein-worker-1 bein-worker-2 bein-worker-3 bein-worker-4 bein-worker-5 bein-worker-6 bein-worker-7 bein-worker-8 bein-worker-9 bein-worker-10
pm2 status
pm2 logs bein-web --lines 80
```

Do not use `npx prisma db push` for normal production deployment.
