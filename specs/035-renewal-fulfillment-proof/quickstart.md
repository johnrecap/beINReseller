# Quickstart: Renewal Fulfillment Proof

## Safety Boundary

- Use an isolated test PostgreSQL database for migration and concurrency tests.
- Do not run reconciliation `--apply` against production during implementation verification.
- Do not submit real provider Pay requests.
- Do not use `prisma db push` for deployment.
- Keep proof mode `REVIEW_ONLY` until an authorized sanitized report/contract Invoice smoke passes.
- Never capture or commit subscriber, country, raw provider HTML, cookies, ViewState, credentials, or live session material.

## Amendment Note

Sections and results written before the Sold Report amendment validate the superseded contract-only implementation only. They are not release evidence for baseline/diff correlation.

## 1. Schema And Migration

```text
npm run check:schema-sync
npx prisma format
npx prisma validate
npx prisma generate
```

On an isolated PostgreSQL database, apply the ordered migration and verify:

- one proof per operation;
- one proof per provider-account/invoice;
- blank invoice rejection;
- two concurrent operations racing for one invoice produce one proof and one conflict.

## 2. Focused Worker Payment Tests

Run the payment classifier and renewal queue tests. Expected behavior:

- expected balance decrease maps to `providerPaymentState=CHARGED` only;
- complete report/contract verification runs for balance-success and explicit-success cases;
- no composite proof means review, not completion, except explicit no-charge plus complete `VALID_NO_MATCH`;
- one new report invoice plus the same active-contract invoice means composite proof before completion;
- retry after `FINAL_PROVIDER_MUTATION_STARTED` or legacy `FINAL_PAY_REQUEST_STARTED` never calls final `OK`, Pay, or another sale mutation; the legacy value is not treated as evidence that Pay ran;
- installment regression behavior remains unchanged.

## 2A. Sold Report Fixtures And Parser

Use sanitized fixtures for initial page, Apply result, valid empty result, reordered headers, alternating rows, split ViewState, login redirect, malformed/missing grid, and multi-page GridView postbacks.

Expected behavior:

- successful controls preserve every required page-local field;
- Subscriber and Country are discarded;
- headers map by normalized names rather than fixed indexes;
- invoice/card/package/item/amount/dates normalize deterministically;
- preserve the Dealer selected by the fresh provider page; its safe context hash must remain stable across baseline, post-scan, and every page;
- never post a fabricated `ALONE` value: the observed `Alone`/`Including Sub-Dealers` labels belong to report-summary counts, and any dealer-context change or unexpected dealer group is incomplete/conflicting evidence;
- first-page watermark re-read detects insertion, duplicate pages, and unstable pagination;
- page cycles, the default 100-page cap, login redirects, and malformed grids are `INCOMPLETE_SCAN`/`CHECK_FAILED`, never empty valid results;
- one read retry restarts the entire scan from a fresh GET and never replays stale Apply/pager state;
- report ViewState never overwrites renewal ViewState.

## 2B. Baseline/Diff Correlation

Cover old same-day invoice, one exact new invoice, blank invoice, two matching invoices, mismatched package/promotion/Decimal amount, unrelated account-wide sale, report-only, contract-only, reused invoice, and failover generation mismatch.

Only `one exact new report invoice + same-invoice active contract + unique composite claim` is `MATCHED`.

## 2C. Mutation Replay And Final Marker

Executable transport tests inject ECONNRESET, timeout, and 500/502/503 for final `OK`, Pay, signal activation, and installment payment. Each provider mutation request count must equal one. A failed report scan may restart once from fresh GET; no individual report POST is replayed.

The durable final-provider-mutation marker must be observed before `OK`, including the direct-contract-success branch.

## 3. Recovery Tests

Expected matrix:

- spend ledger/balance proof only -> review;
- unique `SOLD_REPORT_CONTRACT_CORRELATION` proof in `ENFORCE` -> completion eligibility;
- invoice/context conflict -> review;
- proof created before crash -> idempotent recovery completion;
- explicit deterministic no-charge plus complete report/contract `VALID_NO_MATCH` -> one safe refund;
- `REVIEW_ONLY` plus any result, including matched candidate -> review with no proof claim.

## 4. Admin Decision Tests

Expected matrix:

- charged only + no-refund + no explicit renewal -> rejected;
- `ENFORCE` composite proof + no-refund -> accepted;
- complete structured manual invoice/account/card/package/Decimal amount/currency/source/note/actor/time evidence + no-refund -> labeled manual completion in either mode, uniquely attributable, with points/notification only once after commit;
- explicit `cardRenewed=true` without that structure -> rejected;
- action selection alone never creates card-renewed evidence;
- live verification claims proof before completion.

## 5. Start-Renewal Guard Tests

Check both the normal and card-lock-contention branches:

- open `REVIEW_REQUIRED` renewal blocks the card;
- open/acknowledged fulfillment-safety issue blocks the card;
- resolved/false-positive/ignored issue does not block;
- an unrelated issue type does not block.
- concurrent inserts create one active `CardLifecycleReservation` winner;
- `REVIEW_REQUIRED` retains the reservation;
- successful/safely failed or explicitly resolved review releases it once.

## 5A. Account Lease Tests

- a second operation cannot create a durable causal reservation for the same account, including gaps between delayed attempts;
- a new verification job may acquire a short execution lease only for the same durable reservation generation;
- same-worker identity cannot acquire/release another operation's lease;
- missing owner fails;
- stale fencing/invocation cannot mutate or release;
- heartbeat renews only exact ownership;
- fenced session-cache writes reject stale lease generations;
- renewal, installment, signal, balance, report, and keepalive/session consumers serialize or skip;
- only accounts explicitly marked `automationExclusive=true` are eligible;
- failover is allowed only before uncertain provider mutation and supersedes reservation/baseline/session/package/promotion controls.

## 6. Reconciliation Tool

Dry-run the incident filter against an isolated database:

```text
npx tsx scripts/reconcile-renewal-fulfillment.ts --from 2026-08-23T18:35:00+03:00 --to 2026-08-23T18:45:00+03:00 --card 7517687161
```

Expected: JSON summary, `mutated=false`, and no transaction/operation/point/notification changes.

Apply only on fixtures:

```text
npx tsx scripts/reconcile-renewal-fulfillment.ts --from 2026-08-23T18:35:00+03:00 --to 2026-08-23T18:45:00+03:00 --card 7517687161 --apply --confirm APPLY_FULFILLMENT_SAFETY_ISSUES
```

Run the same command twice. Expected: stable issue count, no duplicate issues, and no financial mutation.

## 7. Localization And UI

Check English, Arabic RTL, and Bengali for:

- provider charged; verifying fulfillment;
- provider charged but fulfillment unconfirmed; admin review;
- renewal blocked because an unresolved fulfillment review exists;
- admin explicit-renewal confirmation control.

Confirm active-operation polling and financial-review screens show payment and fulfillment separately.

## 8. Full Verification

```text
npm run check:schema-sync
npx prisma validate
npx prisma generate
npm run lint
npm run build
npm --prefix worker run build
```

Also run focused root/Worker tests, `git diff --check`, BOM detection, and scoped mojibake scan for `â`, `Ã`, `Â`, and `ï؟½` in changed text files.

Run disposable PostgreSQL and Redis concurrency suites. They must cover proof versus reseller/customer/admin/Worker/cleanup refund writers, same invoice/two operations, same card/two starts, durable same-account reservation across delayed-job gaps, and stale session-cache fencing.

## 8A. Authorized Provider Correlation Smoke

With explicit authorization and a panel-dedicated account, choose one known successful renewal and save only sanitized evidence:

1. Complete Sold Report scan shows its invoice, exact card, package, item, amount, and dates.
2. Card contract page shows one active contract with the identical invoice.
3. The adapter reports a complete scan and the matcher produces one candidate.

If invoice equality, form controls, pagination, or session behavior is not proven, remain `REVIEW_ONLY`. Never fall back to report-only, contract-only, or balance-only completion.

## 9. Production Deployment Order

1. Fetch/pull the intended branch and install dependencies only when package files changed or a clean install is needed.
2. Enable an external maintenance/traffic gate that blocks renewal start/confirm, admin verify/decision, refunds, recovery/cleanup cron, and every financial/provider mutation path.
3. Drain active provider mutations, then stop `bein-web`, `bein-maintenance`, `bein-keepalive`, and every `bein-worker-*`; verify process/log/queue state proves no legacy finalizer can run.
4. Run `npx prisma migrate deploy` and `npx prisma generate` while all application/finalization processes remain stopped.
5. Build the new Worker and, with `bein-web` already stopped, remove old `.next` and build the new web app. Do not restart an individual old/new process during this build window.
6. Start only the new `bein-web` with the external mutation gate still active; verify schema/client/config compatibility and admin mutation endpoints remain blocked.
7. Start only the new `bein-maintenance`, `bein-keepalive`, and all new `bein-worker-*`; verify proof mode and that only `automationExclusive=true` accounts are eligible.
8. Run fixture smoke, confirm attempt-only `REVIEW_ONLY`, inspect PM2 versions/logs/queues, and prove no mixed-version process exists.
9. Remove the external mutation gate only after all new processes pass checks.
10. Enable `ENFORCE` only after the separately authorized live invoice-equality smoke passes.

## Release Gate

- Zero automated `RENEW` completion without an `ENFORCE` unique composite proof; zero manual completion without one complete uniquely claimed structured manual evidence row.
- Zero automatic refund with confirmed provider charge.
- Zero duplicate final `OK`, Pay, or sale mutation after the final-provider-mutation barrier.
- Zero invoice reuse across operations on the same provider account.
- Historical apply remains opt-in, idempotent, and financially non-mutating.
- Zero mutation transport replays on timeout/network/5xx.
- Zero completion from baseline-old, report-only, contract-only, incomplete-scan, or legacy proof.
- One active card reservation, one durable provider-account causal reservation, and one fenced execution lease during each active job.
- Authorized sanitized report/contract invoice equality evidence exists before `ENFORCE`.

## Pre-Amendment Local Verification Record — 2026-08-24

- Schema parity, Prisma validation/generation, the Next.js production build, the Worker TypeScript check, and the Worker production build passed locally.
- Feature-focused and connected Node suites: 117 passed, 0 failed, 6 database/Redis-gated tests skipped.
- Targeted ESLint for changed production files passed with zero errors and three pre-existing hook-dependency warnings in the active-operations page. Repository-wide ESLint remains red from unrelated existing files.
- Direct root `tsc --noEmit` is blocked only by the pre-existing untracked `tests/unit/web-project-memory.test.ts` use of the regular-expression `s` flag under the configured target; the Next.js production build passed its own TypeScript stage.
- The exact incident dry-run for card `7517687161` was attempted and failed before any query or mutation with PostgreSQL `ECONNREFUSED`. No `--apply`, refund, Pay, status, points, or notification mutation ran.
- Isolated migration, proof-concurrency, reconciliation-apply, authenticated browser, live provider, and production deployment checks remain pending and must not be inferred from local static/build success. No Playwright dependency or browser-control tool is installed in this workspace, and the changed routes require authenticated database-backed state.
- These results predate Sold Report baseline/diff, strict lease, card reservation, mutation no-retry, and composite proof work and do not satisfy the amended release gate.

## Amended Core Local Verification Record — 2026-08-25

- Scope was explicitly limited to the reseller web panel, Worker, database/admin/reconciliation paths. Mobile/store/application execution was excluded; no related service or user flow was started or claimed.
- The root unit/source-contract run completed with 670 passing tests and zero failures. `npm run test:worker` completed with 195 passing tests, zero failures, and four Redis-gated skips.
- Root and Worker TypeScript checks passed. `npm run check:schema-sync`, Prisma validation, the Worker build, and the root Next production build passed. The root build is compile evidence only and is not an application-flow validation.
- Focused critical-file ESLint passed. Broad changed-file core lint still reports 24 pre-existing `no-explicit-any` errors in `worker/src/http/HttpClientService.ts`; this remains explicit lint debt.
- Focused fulfillment, finalizer, provider retry, login/lease, verification retry, and maintenance tests passed, including recovery of a missing due verification job and a stranded latest `MATCHED` attempt.
- The core database selection completed three non-database harness checks and skipped 20 PostgreSQL-dependent cases because no explicitly disposable PostgreSQL database was configured; four app/store cases were excluded. Redis race cases also skipped without a disposable Redis endpoint. These skips remain release blockers.
- Worker finalization now locks and verifies the exact latest attempt/baseline/Invoice/account/card/reservation generation and, for `CHARGED`, the matching provider spend-ledger account before claiming proof. Verification jobs bypass generic payment/refund failure handling, and maintenance recreates deterministic read-only verification work after DB/queue or post-`MATCHED` crash windows.
- No production migration/deploy, live beIN correlation, incident apply, refund, Pay, process start, or financial mutation was performed.
- Release mode remains `REVIEW_ONLY`. `ENFORCE` is blocked until an authorized sanitized same-Invoice Sold Report/active-contract smoke passes on automation-exclusive accounts, disposable PostgreSQL/Redis concurrency passes, and post-completion side effects gain crash-durable idempotent convergence.
