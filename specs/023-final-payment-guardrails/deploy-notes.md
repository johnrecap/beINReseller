# Deploy Notes: Final Payment Guardrails

## Migration Impact

No database migration is required. The final-payment markers, delayed verification evidence, and review closure details are stored in existing operation `responseData`, transactions, dispatch rows, and beIN spend ledger rows.

## Deployment Order

Deploy the web app, worker, and maintenance processes from the same branch. Do not run a mixed web/worker version for this feature because final confirmation now writes evidence that the worker expects before Pay.

Use the production order from `AGENTS.md`:

```bash
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout 023-final-payment-guardrails
git pull --ff-only origin 023-final-payment-guardrails
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

## Post-Deploy Checks

- Confirm a test renewal deducts reseller balance once at final confirmation.
- Confirm a delayed or unclear provider result goes to financial review without auto-refund.
- Confirm a resolved financial review item leaves the unresolved list.
- Check recent worker logs for `FINAL_PAY_SUBMITTED`, `POST_FINAL_PAY_REVIEW`, and refund-block messages.
