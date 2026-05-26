# Quickstart: Report Center Tabs

## Manual UI Verification

1. Start the app locally.
   ```bash
   npm run dev
   ```

2. Log in as an admin.

3. Open `/dashboard/admin/reports`.

4. Verify the page shows tabs for:
   - Analytics
   - Activity Monitoring
   - Integrity Reports
   - beIN Spend Report
   - Account Login Monitor, when enabled
   - Balance Alert Monitor, when enabled
   - Activity Logs

5. Open each tab and verify its current controls still work:
   - Analytics period filter
   - Activity monitoring filters
   - Integrity report scan/filter/pagination
   - beIN spend filters and operation table
   - Login monitor reset action
   - Balance monitor refresh/reactivate action
   - Logs search/filter/pagination

6. Verify deep links:
   ```text
   /dashboard/admin/reports?tab=analytics
   /dashboard/admin/reports?tab=activity
   /dashboard/admin/reports?tab=integrity
   /dashboard/admin/reports?tab=bein-spend
   /dashboard/admin/reports?tab=login-monitor
   /dashboard/admin/reports?tab=balance-monitor
   /dashboard/admin/reports?tab=logs
   /dashboard/admin/reports?tab=unknown
   ```

7. Verify old routes still load:
   ```text
   /dashboard/admin/analytics
   /dashboard/admin/users/activity
   /dashboard/admin/reports/integrity
   /dashboard/admin/reports/bein-spend
   /dashboard/admin/bein-accounts/login-failures
   /dashboard/admin/bein-accounts/low-balance
   /dashboard/admin/logs
   ```

8. Verify sidebar cleanup:
   - Sidebar shows one Reports Center entry for the grouped reports.
   - Legacy report URLs can still highlight the Reports Center entry.

## Automated Verification

Run focused tests and type checks:

```bash
npx tsx --test tests/unit/report-center-tabs.test.ts
npx tsc --noEmit --pretty false
npm run build
```

## Production Notes

No database migration is expected. Production deployment should use build and PM2 restart only unless later implementation adds schema changes.
