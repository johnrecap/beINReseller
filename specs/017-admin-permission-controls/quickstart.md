# Quickstart: Admin Permission Controls

## Goal

Verify that admins can block user creation and restrict actions by role or specific account without breaking unrelated workflows.

## Preflight Checks

1. Confirm at least one active admin exists:

```sql
SELECT id, username, role, is_active, deleted_at
FROM users
WHERE role = 'ADMIN' AND is_active = true AND deleted_at IS NULL;
```

2. Choose one protected admin account for rollout.

3. Register at least one protected admin before changing `permissions.manage`:

```sql
INSERT INTO protected_admins (id, user_id, protected, created_at, updated_at)
VALUES (gen_random_uuid()::text, '<admin-user-id>', true, NOW(), NOW())
ON CONFLICT (user_id) DO UPDATE
SET protected = true, updated_at = NOW();
```

4. Confirm current manager create-user and balance flows work before enabling restrictions.

## Manual Verification Flow

1. Log in as protected admin.
2. Open admin permission settings.
3. Enable global panel user creation freeze.
4. Attempt to create a user from admin users page.
5. Attempt to create a user from manager dashboard.
6. Confirm both requests fail with a clear disabled message.
7. Disable global freeze.
8. Open `/dashboard/admin/permissions`.
9. Deny manager create-user permission at role level.
10. Log in as manager and confirm create-user is unavailable and API rejects direct submit.
11. Add a user-specific deny override for balance withdraw.
12. Confirm only that account is blocked from withdraw while another account with same role follows role rules.
13. Try to remove permission-management access from the last protected admin and confirm the system rejects it.

## Verification Commands

```bash
npx tsx --test tests/unit/permission-evaluator.test.ts
npx tsx --test tests/integration/admin-permissions.test.ts
npx tsx --test tests/integration/manager-permission-enforcement.test.ts
npx tsc --noEmit
npm run build
```

## Production Deployment Notes

Use migration deploy, not schema push:

```bash
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout 017-admin-permission-controls
git pull --ff-only origin 017-admin-permission-controls
npm ci
npm --prefix worker ci
npx prisma migrate deploy
npx prisma generate
npm run build
cd worker && npm run build && cd ..
pm2 restart all
pm2 status
pm2 logs --lines 20
```

## Rollback Safety

- Turning off global freeze restores creation if role/user permissions allow it.
- Removing a role setting restores static defaults for that permission.
- Removing a user override restores role/default behavior.
- Do not delete audit events.
