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

The following original purchase-path scenarios are synthetic regression targets. They do not authorize a live purchase. For this incident's production acceptance, use the read-only login/report checks and two-cycle gate below.

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
- Old purchase continuations without snapshots retain assigned-proxy behavior; deferred verification reads use current mode once per job on the original account.
- Test one low-risk beIN account before normal traffic.
- If beIN blocks the server IP, emergency mode will fail for all server-IP operations; switch back to assigned proxies when proxy provider recovers.
- Emergency mode uses the production server IP for affected beIN traffic. Confirm this IP is acceptable before broad use.
- Restart the web app, operation workers, and `bein-keepalive` after deployment so all processes load the new route and session-cache code.
- No schema migration is expected for this feature because it uses the existing settings table and Redis keys.
- On production, prefer `npx prisma migrate deploy` when migrations exist. Do not use `npx prisma db push` for normal rollout unless explicitly choosing a schema push workaround.

## Incident release gate — 2026-10-30

Local implementation is separate from deployment. Record reviewed SHA and built artifacts for web, every panel worker, maintenance, customer and KeepAlive. Inventory actual PM2 names/count: the last user trace had ten panel workers; do not increase that number. Ecosystem loading requires the reviewed PANEL_WORKER_COUNT even with --only.

Stop new work using the existing maintenance control and drain active jobs/leases. Do not delete queues, reservations or locks. Retain previous artifacts and process definitions. Install dependencies only when changed; deploy existing migrations, generate Prisma, stop bein-web before replacing .next/build, then restart it. Build worker before restarting drained roles with consistent artifacts. Check PM2 status/logs before persisting topology; never pm2 save an incomplete inventory.

Use ADMIN reset-and-activate for the affected account once after release; busy conflict requires waiting for its owner. Counter-only reset does not enable. Verify fresh authentication, current v1/v2 read route, unchanged purchase evidence and active state through two full configured KeepAlive cycles. Check the other two accounts retain separate sessions. No test purchase or Pay replay is required or authorized here.

On failure pause admission, preserve pending/uncertain financial operations for review, restore prior web/worker artifacts together and restart inventoried roles after drain. Do not roll back financial rows, delete queues or blindly repeat payments. Record outcomes; provider direct access and production acceptance remain NOT_VERIFIED until observed.

### Read-only parity inventory before deployment

Run from `/www/wwwroot/deshpanel.com`; keep this output with the release record. Do not print PM2 environment variables or the full raw process JSON.

```bash
git rev-parse HEAD
pm2 jlist | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.table(JSON.parse(s).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,cwd:p.pm2_env.pm_cwd,script:p.pm2_env.pm_exec_path,started:p.pm2_env.pm_uptime}))))'
cat .next/BUILD_ID
sha256sum worker/dist/worker/src/http/HttpClientService.js worker/dist/worker/src/http-queue-processor.js worker/dist/shared/bein/login-failure.js
```

Inventory root versus worker ecosystem definitions and all running roles before choosing restart commands; a name alone does not prove the loaded artifact. After a successful drain/build, an absent KeepAlive process is restored from its ecosystem, not `pm2 start bein-keepalive` as a nonexistent script. If the reviewed inventory still has ten panel workers, the targeted command is `PANEL_WORKER_COUNT=10 pm2 start worker/ecosystem.config.js --only bein-keepalive`. This count permits config loading; `--only` does not increase or restart the panel-worker set. Existing processes use their reviewed restart commands. See `docs/deployment/audit-remediation-release.md` for admission/drain controls and compatible-artifact rollback.

### Repeat isolated acceptance

Use only a disposable loopback database named `bein_login_recovery_test` and Redis database 15. Set `BEIN_LOGIN_TEST_DATABASE_URL` and `BEIN_LOGIN_TEST_REDIS_URL` explicitly; the new fixture never loads production `.env` values. Run:

```bash
node --import tsx --test tests/integration/bein-login-recovery.test.ts
RUN_REDIS_INTEGRATION=1 TEST_REDIS_URL="$BEIN_LOGIN_TEST_REDIS_URL" node --import tsx --test worker/tests/*.test.ts
node scripts/run-audit-gates.cjs unit
```

The integration fixture creates/drops only its unique schema and test keys. A skip is not acceptance. Local evidence used PostgreSQL 17.11 and Memurai-for-Redis 8.2.0 (Redis API 8.2.10) on Windows; it does not certify Linux/PM2 or the production versions. Current results and source fingerprints: `evidence/verification.md`, `evidence/verification-results.json`.
