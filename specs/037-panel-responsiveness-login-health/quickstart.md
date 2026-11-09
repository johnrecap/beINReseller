# Implementation and Verification Runbook

Current delivery: documentation only. The commands in the runtime sections are future verification steps, NOT_RUN for 037. Use the repository's installed dependencies; no installation or production connection is authorized by this runbook alone.

## Resume

Read spec, plan, contracts, research consumer matrix, analysis and the next unchecked task. The accepted 037 design supersedes only the future login-threshold behavior, not 027/036 financial or historical evidence rules. Start with T001, then test-first work in task order. Reopen any changed source before trusting an old observation.

## Q01 — Planning and original-template evidence

Run the installed Spec Kit CLI version/features and integration status. This checkout has an ignored local 1.2.5 runtime under `.tools/specify-runtime`; its launcher needs that directory on PYTHONPATH. Preserve six modified managed files; do not force-init/upgrade.

Use the original `.specify/templates` with the installed `always-on-agent-discipline/scripts/verify_contract.py` and this feature's `evidence/template-contract.json`. The checker command is `python <skill-root>/scripts/verify_contract.py specs/037-panel-responsiveness-login-health/evidence/template-contract.json --root . --report <new-report-path>` with a working Python interpreter. Use the companion `evidence/validate-plan.mjs --implementation` during authorized runtime work for task detail labels derived from the original fenced task template, requirement coverage, dependency order and links. Preserve earlier reports; hashes must refer to current files. `evidence/plan-guard.json` now holds the distinct lifecycle task-evidence schema; its empty task map preserves all 24 unchecked tasks and grants no runtime acceptance.

## Q02 — Focused behavior and contracts (after tests are authored)

Node 22 or the existing supported Node runtime, tsx and installed dependencies are prerequisites. Planned new files are named by their tasks; they do not exist yet. Existing baseline login suites can be invoked as follows without provider access:

```powershell
node --import tsx --test worker/tests/login-failure-classification.test.ts worker/tests/login-tracking-recovery.test.ts worker/tests/keepalive-login-recovery.test.ts worker/tests/login-retry-consumers.test.ts
```

Add and explicitly run the new command-state, balance-refresh and terminal-login cases named in tasks. Capture meaningful red failures before changing behavior. Match predicates/results, not only source substrings. Synthetic fixtures cannot establish provider acceptance.

## Q03 — Native concurrency and financial invariants

Use disposable PostgreSQL and Redis only with test-owned namespaces/schemas; refuse business/production connections. Existing isolated test fixtures are the starting point; never run all integration files blindly against an ambient DATABASE_URL. Exercise atomic admission, duplicate workers, queue/result failure, expiration and delayed completion. For login, exercise a real old-revision failure racing ADMIN recovery and verify no lost update; include generic pool-error transport handling. For UI financial cases, capture request counts and assert no additional debit/refund through mocked or disposable route fixtures. Missing native services mean NOT_VERIFIED, not an automatic pass or permission to install them.

## Q04 — Browser interaction and semantic review

Use the existing panel fixture harness, which mocks provider/network routes. Existing supported scope selection:

```powershell
$env:PANEL_QA_SCOPE = 'bein-dialogs'
node tests/browser/panel-ui-repairs.cjs
```

Repeat the relevant scopes command, dialogs, financial, operation-dialogs, active, proxies, review, users, stats, installments, eid and acceptance after extending their cases. The harness requires Chrome plus the existing Playwright/esbuild setup; PLAYWRIGHT_MODULE may point to an already installed module. Do not install new dependencies as a silent test fallback.

First prove C01 with a held fetch/body, then all C01–C07 at 360/768/1280 and ar/en/bn. Check real mouse click and keyboard action on a second resource before releasing the held response, Hide/X/Escape cleanup, elementFromPoint, focus restoration, latest navigation, reload, actor switch and result arriving after navigation. Capture screenshots and explicit observations of enabled independent controls and correct pending/uncertain text. Browser mocks do not prove actual App Router navigation; additionally run the existing app in an isolated fixture environment and delay real route data while preserving the shell. Never use live provider purchases to test responsiveness.

### Q04b — Browser to balance worker

With a disposable loopback Redis on port 16379, set `BALANCE_REFRESH_TEST_REDIS_URL=redis://127.0.0.1:16379/15` and set `PLAYWRIGHT_MODULE` to the installed Playwright module if needed. From the root run `node --import tsx tests/browser/balance-background.cjs`. Chrome uses native fetch. A real BullMQ consumer calls the production dispatcher against disposable Prisma/PGlite and an HTTP test provider. The fixture supplies an ADMIN identity and follows actual links between two test documents. Receipts and screenshots appear under `output/panel-ui/037-background`.

## Q05 — Integrated checks

From the repository root after implementation, with isolated build/test configuration and no running server using the same build directory:

```powershell
npm run check:schema-sync
npm run test:unit
npm run test:worker
npx tsc --noEmit
npx tsc --noEmit -p worker/tsconfig.json
npm run lint
npm run build
npm run worker:build
git diff --check
```

Read build scripts first: root prebuild generates Prisma client; build may require local configuration. Do not run on production or overwrite artifacts in use. Report scoped and full lint separately; historical lint failures are not assumed unchanged. Inspect changed text for added BOM or mojibake. Preserve precise test counts, skips and command exits; no full suite is claimed by this planning delivery.

## Q06 — Release readiness, not deployment

Validate all new request types with both web and Worker versions, legacy jobs/clients and failure projection. Identify actual worker/keepalive topology and source/build parity before any later authorized deployment. Coordinate compatible Worker consumers before enabling the new web client; drain active work, preserve owned locks, stop web before replacing .next, and avoid migration commands because 037 has no migration. Rollback must drain new jobs and preserve quarantined accounts; it restores old threshold semantics only deliberately. Preserve current production financial proof and recovery gates.

Record post-release authenticated navigation/command responsiveness, refresh job progress, safe failure reasons and first-terminal quarantine only during later authorized operational verification. A synthetic test, commit or push does not establish those outcomes. No live account reset, provider login, money change or deployment is part of the current request.

## Evidence and handoff

Keep command receipts, sanitized screenshots and semantic review distinct. Check tasks only after their exact acceptance is evidenced. Re-run analyze for changed contracts and use implement/converge only in a later runtime implementation phase. Current historical gaps: missing 027 plan-guard.json and existing 027/036 production/provider release evidence; do not relabel these as complete through 037.
