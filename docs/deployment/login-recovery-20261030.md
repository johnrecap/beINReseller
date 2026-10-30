# Login recovery publication and server cutover

The user authorized committing/pushing the local fix on `codex/027-login-recovery` and requested commands to execute personally on `/www/wwwroot/deshpanel.com`. This handoff is not evidence of production execution. Local acceptance remains in [027 verification](../../specs/027-bein-connection-mode/evidence/verification.md); the missing historical 036 plan-guard remains open.

Before running the block, close new financial admission through the site's reviewed ingress controls, suspend external cron producers, and let current provider handlers finish. Keep pending confirmation, review and uncertain-payment records intact. `maintenance_mode` alone does not block ADMIN/direct API clients. If work cannot reach a safe boundary, stop here. These are operator preconditions; the block does not claim to infer or enforce them.

The guarded block targets the last supplied topology: ten panel workers, web, maintenance and customer, with KeepAlive either present or absent. It rejects a different topology, local Git edits, divergent source history, dependency/schema/migration differences, or unapplied migrations before stopping services. For a different inventory or failed preflight, retain the output and adapt from actual evidence; do not remove the guards. Current dependencies must already be installed. Existing worker concurrency/environment is preserved by restarting registered names. Only a missing KeepAlive is created from the ecosystem; [PM2 documents the targeted `--only` behavior](https://pm2.keymetrics.io/docs/usage/application-declaration/).

Run in Bash as the same production user that owns the existing PM2 daemon. The fixed paths are this project's actual deployment paths. The block temporarily stops the web app, preserves the old build in a private root-owned directory, and stops on any command failure. No queue, lock, account, balance or invoice is deleted.

```bash
bash <<'DEPLOY'
set -euo pipefail
umask 077
cd /www/wwwroot/deshpanel.com
test -z "$(git status --porcelain)" || { echo 'STOP: working tree has local changes'; exit 1; }
git fetch origin refs/heads/codex/027-login-recovery:refs/remotes/origin/codex/027-login-recovery
target=$(git rev-parse FETCH_HEAD)
old=$(git rev-parse HEAD)
git merge-base --is-ancestor "$old" "$target"
git diff --quiet "$old" "$target" -- prisma worker/prisma package.json package-lock.json worker/package.json worker/package-lock.json || { echo 'STOP: schema, migration or dependency changes need review'; exit 1; }
test -x node_modules/.bin/prisma
test -x worker/node_modules/.bin/tsc
npx prisma migrate status
backup=$(mktemp -d /root/deshpanel-login-release.XXXXXXXX)
printf '%s\n' "$old" > "$backup/previous-sha"
pm2 jlist | node -e '
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
 const a=JSON.parse(s), names=["bein-web","bein-maintenance","bein-customer",...Array.from({length:10},(_,i)=>`bein-worker-${i+1}`)];
 const workers=a.filter(p=>/^bein-worker-/.test(p.name));
 if(workers.length!==10 || names.some(n=>a.filter(p=>p.name===n).length!==1)) throw Error("STOP: PM2 inventory differs from reviewed 10-worker topology");
 if(a.filter(p=>p.name==="bein-keepalive").length>1) throw Error("STOP: duplicate KeepAlive");
 for(const p of a.filter(p=>names.includes(p.name)||p.name==="bein-keepalive")) {
  const path=require("node:path").posix, worker=p.name!=="bein-web"&&p.name!=="bein-maintenance", cwd=path.resolve(p.pm2_env.pm_cwd);
  if(cwd!=="/www/wwwroot/deshpanel.com"+(worker?"/worker":"")) throw Error("STOP: unexpected cwd for "+p.name);
  if(worker){const entry=p.name==="bein-customer"?"customer-index":p.name==="bein-keepalive"?"keepalive":"index"; if(![`${cwd}/dist/${entry}.js`,`${cwd}/dist/worker/src/${entry}.js`].includes(p.pm2_env.pm_exec_path)) throw Error("STOP: unexpected entry for "+p.name);}
  console.error(JSON.stringify({name:p.name,status:p.pm2_env.status,cwd,script:p.pm2_env.pm_exec_path}));
  console.log(p.name);
 }
});' > "$backup/process-names"
mapfile -t services < "$backup/process-names"
printf 'Previous build backup: %s\n' "$backup"
pm2 stop "${services[@]}"
if test -d .next; then mv .next "$backup/web.next"; fi
cp -a worker/dist "$backup/worker-dist"
git checkout codex/027-login-recovery
git merge --ff-only "$target"
test "$(git rev-parse HEAD)" = "$target"
npx prisma migrate deploy
npm run build
npm --prefix worker run build
test -f worker/dist/worker/src/customer-index.js
node -e 'require("fs").writeFileSync("worker/dist/customer-index.js", "require(\"./worker/src/customer-index.js\")\n")'
pm2 restart "${services[@]}"
if ! grep -qx 'bein-keepalive' "$backup/process-names"; then
  PANEL_WORKER_COUNT=10 pm2 start ecosystem.config.js --only bein-keepalive
fi
git rev-parse HEAD
cat .next/BUILD_ID
sha256sum worker/dist/worker/src/http/HttpClientService.js worker/dist/worker/src/http-queue-processor.js worker/dist/shared/bein/login-failure.js
pm2 status
printf 'Keep admission closed until process checks pass. Backup: %s\n' "$backup"
DEPLOY
```

The customer shim is a generated artifact pointing to the current compiled entry. The existing Worker build emits only the index/KeepAlive root shims; this explicit step makes the configured customer entry use the same build. Both build scripts generate their respective Prisma clients. No dependency files or migration files are changed by the incident, so dependency reinstallation is unnecessary for this guarded same-dependency path. `migrate deploy` runs only after the earlier clean-status and unchanged-schema checks; do not substitute `db push` or resolve historical failures blindly.

After builds, verify each registered service's `cwd`/script, start time, status and recent logs against this checkout. Expected entry points are web in the root; maintenance at root `src/scripts/operation-maintenance.ts`; panel workers at `worker/dist/index.js`; customer at `worker/dist/customer-index.js`; KeepAlive at `worker/dist/keepalive.js`. Direct compiled equivalents under `worker/dist/worker/src/` are acceptable. An unexpected entry point or a process older than the build keeps admission closed. PM2 name/status alone does not prove artifact parity. Do not start a second ecosystem or change worker count/concurrency.

In the authenticated ADMIN panel, confirm **Emergency: use server IP** is selected if the proxies still fail. In beIN accounts, locate username **Bn-xtr-544** (labels are not unique), then click **تصفير وتفعيل الحساب** once. The login-monitor action **تصفير عداد الدخول** does not reactivate it. A 409 means an owner/reservation still exists: wait for the operation's safe end, without deleting locks or repeating reset in a loop. Reopen admission gradually after process checks; observe fresh login, the current report route and continued active state through two full configured KeepAlive cycles. Check both other accounts remain separate.

```bash
pm2 logs bein-web --nostream --lines 60
pm2 logs bein-keepalive --nostream --lines 100
pm2 logs --nostream --lines 80 2>&1 | grep -E 'Bn-xtr-544|PROXY_PAYMENT_REQUIRED|LOGIN_|AUTO-DISABLED|mode=server_ip|routeKey=direct' | tail -n 80
```

Distinguish old log timestamps from post-release attempts. Do not assume the configured KeepAlive interval equals the default; its startup log reports it. Only after the complete process inventory is healthy and accepted, run `pm2 save` to retain that topology. Successful build/status is not evidence that beIN accepts the direct IP.

If a build fails, keep services/admission stopped and retain the displayed backup path and error. Before any new-version financial work, rollback can restore the recorded previous source and both saved artifacts together after checking compatibility; the dependency/schema guard above preserves that narrow rollback boundary. After new financial work, use the [existing rollback limits](audit-remediation-release.md#rollback-limits). Never restore a stale business database, delete a reservation, or replay Pay as recovery.

Verification of this handoff: commands and paths reviewed against both package scripts, both PM2 ecosystems, the worker factory and the ADMIN recovery handler. Bash syntax and synthetic PM2 preflight checks are performed locally; Linux/PM2 execution remains pending the user's server run. No automatic ingress or drain guarantee is claimed.
