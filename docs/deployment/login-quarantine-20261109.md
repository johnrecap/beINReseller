# Login quarantine repair — publication handoff

2026-11-11 follow-up: the same authorized branch now carries complete challenge handling across primary callers, safe solver failure handling and session continuity fixes. Current local verification is in [the follow-up evidence](../../specs/037-panel-responsiveness-login-health/evidence/implementation.md#login-flow-and-session-continuity-follow-up--2026-11-11). The commands below remain applicable; no dependencies or migrations were added. Production recovery is not yet verified.

The user authorized pushing the tested correction to `codex/037-panel-responsiveness-login-health`, then will execute the server commands. This is not evidence of production deployment. Current local acceptance and limits remain in [implementation evidence](../../specs/037-panel-responsiveness-login-health/evidence/implementation.md#false-login-quarantine-repair--2026-11-09). Scope: publish the reviewed diff, verify the remote head, and hand over these commands; do not change task acceptance or live data.

Run in Bash as the existing PM2 owner after current operations finish. These commands use the supplied production path and ten-worker topology. Dependencies must already be installed; this repair changes no package lockfile, schema or migration. A different server baseline may require its normal dependency installation. No backup, Git cleanup, reset, database push or lock deletion is included. The subshell stops at the first failure; retain the error instead of continuing manually past a failed build.

```bash
(
set -e
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout codex/037-panel-responsiveness-login-health
git pull --ff-only origin codex/037-panel-responsiveness-login-health
npx prisma migrate deploy
npx prisma generate
pm2 stop bein-web
rm -rf -- .next
npm run build
pm2 restart bein-web --update-env
npm --prefix worker run build
pm2 restart bein-maintenance bein-worker-{1..10} --update-env
if pm2 describe bein-keepalive >/dev/null 2>&1; then
  pm2 restart bein-keepalive --update-env
else
  PANEL_WORKER_COUNT=10 pm2 start ecosystem.config.js --only bein-keepalive
fi
if pm2 describe bein-customer >/dev/null 2>&1; then
  pm2 restart bein-customer --update-env
fi
git log -1 --oneline
pm2 status
pm2 logs bein-keepalive --lines 80 --nostream
)
```

The customer process is restarted only if registered because it imports the same HTTP queue processor. Existing process names are restarted directly, preserving their topology; only a missing KeepAlive is started from the ecosystem. No claim is made about the current server inventory or Linux build execution. Source review: root/Worker package scripts, `ecosystem.config.js`, `deployment/panel-workers.cjs`, `worker/src/customer-index.ts` and repository production notes.

After successful deployment, use the existing guarded ADMIN reset-and-activate action for the intended account if still disabled. A busy response requires waiting for its owner; never delete the lock or mass-activate accounts. Confirm fresh login and active status through two full configured KeepAlive cycles. Repository publication alone does not prove recovery.
