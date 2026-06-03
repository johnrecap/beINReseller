# Quickstart: beIN Connection Mode

## Pre-Implementation Checks

1. Confirm current branch:

```bash
git status --short --branch
```

2. Confirm the current feature docs:

```bash
cat specs/027-bein-connection-mode/spec.md
cat specs/027-bein-connection-mode/plan.md
cat specs/027-bein-connection-mode/tasks.md
```

## Test-First Verification Targets

Create focused tests before implementation:

```bash
npx tsx --test tests/unit/bein-connection-mode-settings.test.ts
npx tsx --test worker/tests/bein-connection-route.test.ts
npx tsx --test worker/tests/session-cache-route-keys.test.ts
npx tsx --test worker/tests/operation-route-snapshot.test.ts
```

Initial tests should fail until helpers and route-aware behavior are implemented.

## Manual Admin Flow

1. Open admin settings.
2. Confirm the default mode displays as "Use assigned proxies".
3. Switch to "Emergency: use server IP".
4. Save settings.
5. Refresh settings and confirm the value remains selected.
6. Confirm saved beIN account proxy assignments are still visible.

## Worker Flow Verification

1. Start one low-risk renewal in assigned-proxy mode.
2. Confirm logs show assigned-proxy route and proxy id/label.
3. Switch to emergency server-IP mode.
4. Start one new low-risk renewal.
5. Confirm logs show server-IP route and no proxy config.
6. Confirm any operation that started before the switch continues on its original route.

## Build Verification

```bash
npm run build
cd worker && npm run build
```

## Production Rollout Notes

- Prefer letting active operations drain before toggling emergency mode.
- If urgent, route snapshots should protect operations started after this feature is deployed.
- Old operations without route snapshots continue under legacy assigned-proxy behavior.
- Test one low-risk beIN account before normal traffic.
- If beIN blocks the server IP, emergency mode will fail for all server-IP operations; switch back to assigned proxies when proxy provider recovers.
- Emergency mode uses the production server IP for affected beIN traffic. Confirm this IP is acceptable before broad use.
- Restart the web app, operation workers, and `bein-keepalive` after deployment so all processes load the new route and session-cache code.
- No schema migration is expected for this feature because it uses the existing settings table and Redis keys.
- On production, prefer `npx prisma migrate deploy` when migrations exist. Do not use `npx prisma db push` for normal rollout unless explicitly choosing a schema push workaround.
