# Quickstart: Bulk Proxy Import

## Admin Flow

1. Open `/dashboard/admin/proxies`.
2. Click `استيراد بروكسيات`.
3. Paste rows like:

```txt
5.59.255.175:6567:exuirjdu:q91cpyieogqb
45.56.155.26:6557:exuirjdu:q91cpyieogqb
```

4. Keep default prefix `بروكسي`.
5. Click preview.
6. Confirm valid, duplicate, and invalid counts.
7. Click import.
8. Confirm the table contains `بروكسي 1`, `بروكسي 2`, etc.

## Expected Results

- Valid rows are imported.
- Duplicate `host:port` rows are skipped.
- Invalid rows are shown with row numbers.
- Passwords are not displayed after import.
- Manual add/edit/delete/test actions still work.

## Verification Commands

```bash
npx tsx --test tests/unit/proxy-bulk-import.test.ts
npx tsc --noEmit
npm run build
```

## Production Deployment

No schema migration is expected.

Use the safe Next.js deploy order from `AGENTS.md`:

```bash
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout 021-bulk-proxy-import
git pull --ff-only origin 021-bulk-proxy-import
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
