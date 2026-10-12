# Project Guide

**Smartcard loading repair, 2026-10-13:** The provider's actual type labels include `Smartcard:`. The previous strict bare-label comparison rejected both CISCO and IRDETO before package loading. Loading and cart validation now share an explicit label/value resolver (CISCO `8`, IRDETO `1`), with duplicate, selection and field-capacity checks. A current read-only browser trace also confirms the second serial POST omits disabled type/first-serial controls; the worker now mirrors that behavior. Unsupported forms return a translated error tied to the operation reference. Package, cart, invoice, promo and financial fences remain in place. Serial conversions are unchanged; live IRDETO input mapping, later checkout and deployed compatibility remain unverified. No package/cart/sale/payment action was performed. See the [HTTP field map and current evidence](../specs/036-audit-remediation/evidence/package-identity-repair.md#current-live-http-field-map--read-only-2026-10-13).

**beIN Provider Reports, 2026-10-13:** Admin Reports now includes **beIN Provider Reports** (`/dashboard/admin/reports?tab=bein-provider`). Search the saved account list, select one username, and read its Sold Packages Details through the HTTP Worker. The default range is seven Cairo calendar days; any inclusive range up to 31 days, including an earlier month, is supported. Refresh applies changed dates. Invoice-descending results support card/invoice search and 50-row pages. Contract start is not a sale timestamp; provider package, offer and amount text remains unchanged. The surface and report-center navigation use English, Arabic and Bengali tokens.

The reader uses only the selected eligible account, its route/session, account lock and reservation/execution-lease guards. Busy accounts are rejected, never substituted. One login attempt is allowed for expiry; CAPTCHA/login failure and incomplete scans have explicit errors. Admission is deduplicated per account and paced at 30 seconds, polling is local every two seconds, total queue/read wait is five minutes, and active HTTP is cancelled after at most one minute. Completed/failed results expire after five minutes in Redis. This display never changes operations, balances or financial-review decisions and requires no database migration.

**Local verification only:** API/auth negatives, native temporary Redis/BullMQ with simulated HTTP, parser/identity regressions and three-language browser QA pass. Live beIN compatibility is a separate check, not established by these simulations. Deploy web and **every** panel Worker from the same source version before enabling the tab; older Workers do not recognize `READ_PROVIDER_REPORT`. This work was not deployed. See [verification and cleanup evidence](../specs/036-audit-remediation/evidence/provider-report-browser-20261013.md).

**Renewal language and worker capacity, 2026-10-12:** The renewal page and its signal/installment components use the selected English, Arabic or Bengali catalog, including confirmation, cooldown and terminal feedback. English is the initial document language; the persisted selection controls language and direction after hydration. Provider package names and exported provider records retain their original values.

The prepared panel profile is `PANEL_WORKER_COUNT=20`, with four concurrent jobs and two PostgreSQL connections per worker, unique `bein-worker-1` through `bein-worker-20` / `worker-1` through `worker-20`, and a five-minute PM2 drain window. Export the count in the shell that loads PM2; adding it to an environment file alone does not load that file into the ecosystem factory. The shared queue remains limited to 50 jobs/minute. Ten eligible provider accounts still limit provider concurrency; neither 20 processes nor 80 job slots creates additional provider capacity. This is a test target, not production acceptance. See the [release and connection budget](deployment/audit-remediation-release.md).

**Measured capacity:** The local 200-user comparison does not support adopting 20 workers as a performance fix. Both sustained runs produced five verified synthetic renewal invoices and about 258 seconds p95 queue wait; 20 workers used roughly twice the Worker memory. Both failed the two-second start target in a 200-renewal burst; the 20-worker burst repeatedly rejected nine starts with database transaction-acquisition HTTP 500 errors. Fast status reads do not establish smooth operation. See the [full comparison and safety evidence](../specs/036-audit-remediation/evidence/localization-capacity-20261012.md). The next capacity work is admission/backpressure, continuation scheduling and account wait/deadline behavior, with the existing identity and payment guards retained; it is not implemented by this configuration change.

**Card cooldown, 2026-10-12:** Package-renewal attempts now pause further package renewals for the same card for five minutes from their first completed, failed, cancelled, expired or review-required outcome. The shared database deadline is immutable per operation; denied requests, reloads, late Reports evidence and later status/refund writes do not restart it. A different attempt gets its own deadline when it ends. Pending financial review and active-operation reservations remain independent blocks after the countdown ends. Card checks, signal refresh and installments do not create this cooldown. Historical attempts are not backfilled from unreliable update timestamps.

The renewal page shows a card-specific countdown in Arabic, English and Bengali. The existing authenticated `GET /api/operations/start-renewal?cardNumber=...` returns only the card, deadline, server time and remaining seconds. It is read-only, requires renewal permission and is rate-limited. A blocked creation returns HTTP 409 with `RENEWAL_CARD_COOLDOWN`; the shared guard runs under the existing card transaction lock before creating or reserving an operation. The UI polls every 30 seconds and on focus, ticks locally each second, and never starts a purchase when the timer expires.

**Deployment prerequisite:** Apply `20261012120000_renewal_card_cooldown` with migration deploy, including its PostgreSQL trigger, before starting the new application; generate both Prisma clients and follow the coordinated [release procedure](deployment/audit-remediation-release.md). Schema push alone omits the trigger. The migration has been exercised in PGlite and the later native disposable PostgreSQL runtime, never on a business database. Full deployed-schema upgrade/provenance acceptance remains open. Local evidence and remaining production/concurrency boundaries are in the [current register](../specs/036-audit-remediation/audit-register.md#supplemental-card-cooldown--2026-10-12).

Focused checks: `node --import tsx --test tests/unit/renewal-card-cooldown.test.ts tests/unit/renewal-card-cooldown-sql.test.ts` (14 cases) and `node tests/browser/renewal-card-cooldown.cjs` (29 mocked scenarios after the localization extension; set `PLAYWRIGHT_MODULE` to an installed Playwright module when it is outside this repository). The SQL test uses the PGlite dependency already pinned through Prisma, without a database URL, credentials or provider traffic.

**Exact renewal package repair, 2026-10-12:** The worker now parses the observed Shopping Cart and actual Reports controls. It binds quote/revision/promo, full/provider serial and type, requires matching cart line/amounts, and correlates a new Reports invoice with supplementary same-invoice contract dates. Unchanged/unbound promo responses and missing next-stage controls stop execution. Local verification: 826 root tests; 287 Worker passes with five Redis skips; types, isolated worker build and scoped lint passed. **Not deployed:** later confirmation layouts, real promo outcomes, service races and incident/server attribution remain unverified. See [implementation and verification boundaries](../specs/036-audit-remediation/evidence/package-identity-repair.md). Tests made no provider calls or business-money changes. Earlier dated counters are historical.

**Panel web completion, 2026-09-08:** The approved FIX-01..FIX-07 batches are saved on `codex/panel-ui-repairs` in source commit `e663e14`, verified on GitHub; checkpoint `4a2833e` is preserved. Current changes scope uncertain saves to action/entity, guard active-operation details and command deadlines, and localize operational/report/review copy in ar/en/bn while retaining provider/API/financial/export contracts. Latest combined browser evidence has 1170 passes without page errors; focused evidence includes 826 unit passes, 42 active-operation, 126 operational-dialog, 166 user-dialog, 84 report and 51 short-window/layout cases, plus six actual PDF comparisons; cohorts overlap. Repository-wide lint has 7 errors/29 warnings in unchanged mobile/worker code, so full CI/release is not approved. The final isolated Next build and root types pass; see [current execution, artifacts and remaining acceptance](PANEL_UI_REPAIRS.md) for the saved commit and exact limitations. Counters remain 14/14 previous repairs, 7/12 WEB acceptance and 45/57 Spec 036. No subagents; native app/store, admin Eid settings, deferred installment settlement, provider/live data and production deployment remain outside these batches.

**Audit remediation, 2026-09-08:** Current scope is 45/57 tasks accepted. Export-table geometry, manager dashboard DTO/query, maintenance lifecycle and worker exception handling are repaired. See [extended verification](../specs/036-audit-remediation/evidence/extended-quality-verification.md) for exact current checks and remaining lint/database/provider gates. Production remains unaccepted.

PM2 now requires `PANEL_WORKER_COUNT` (1..32); both ecosystem profiles derive the same panel worker IDs from `deployment/panel-workers.cjs`. Select the count from authorized live evidence, never assume 8 or 10. Root `bein-maintenance` owns periodic recovery/effects, uses per-cycle leader tokens and drains current work on SIGINT/SIGTERM with a configured five-minute PM2 kill window; do not configure duplicate cron scheduling. Existing customer process definitions remain outside this change.

Local verification entry points: `node scripts/run-audit-gates.cjs unit`, `worker`, or `database`. Worker requires explicit isolated Redis; database additionally requires the repository's disposable PostgreSQL flags. Required skips/TODO fail these gates. Source-only `npx tsx scripts/preflight-audit-remediation.ts` reports blockers and exits 2; it does not approve a release. Its optional `--database --confirm-read-only` requires separately authorized database scope. Never substitute a production URL for a test URL.

## Start Here
0. Active remediation: `specs/036-audit-remediation/README.md` and `tasks.md` (45/57 accepted). Start with `evidence/extended-quality-verification.md` and the independent WEB tracker in `docs/PANEL_UI_REPAIRS.md`. Deferred installment settlement and production release remain unaccepted. Store/phone modifications are excluded. Synthetic verification never uses the restored snapshot or interactive work clone.
1. Project memory: read `PROJECT_MEMORY.md` first for the source map, current work, decisions, risks, and exact authoritative source pointers.
2. Main web app: `src/app`, with reusable UI in `src/components` and domain logic in `src/lib`.
3. Database: PostgreSQL through Prisma; the schema is `prisma/schema.prisma`. On localhost:5433, `deshpanel_snapshot_20260907` preserves the backup and `deshpanel_work_20260907` has the nine pending migrations applied. The current local trial uses the work clone through process-only environment overrides; project .env files are unchanged.
4. Background processing: the separate package under `worker` uses Redis/BullMQ.
5. Install: `npm ci` for the web app and `npm --prefix worker ci` when worker dependencies are needed.
6. Current isolated trial: open http://127.0.0.1:3000/login and use existing panel credentials from the backup. Root Prisma generation is complete; separate Memurai listens on 6389. Node external sockets are blocked and provider workers are stopped. This manual dev session does not restart after Windows reboot. See the local trial evidence before restarting; ordinary npm run dev does not carry these process-only safeguards.
7. Verify: run focused tests with `npx tsx --test <test files>`, then `npx tsc --noEmit --pretty false` and `npm run lint`.
8. Important boundary: admin user ownership prefers current manager links and active agent assignments, with a legacy creator fallback only for unassigned manager-owned users; historical agent assignments must not appear as current ownership.

## Current Snapshot

**2026-09-08:** Review repairs complete in the current task without subagents. Exact parked-lock handoff enables cross-worker continuation; positively proven pre-sale quote conflicts close without refund; current identity guards protect operation routes; outbox recovery handles all admitted types and rejects unsupported CHECK_BALANCE before debit. Promo network/body deadlines retain retry identity; review notes match API rules. No migration, store/phone source or production change.

Verification: 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests, 10 mocked-browser scenario groups; root/worker TypeScript and focused lint pass. All 71 synthetic business tables are empty. Full build/CI/live provider acceptance remains open. See [evidence](../specs/036-audit-remediation/evidence/review-repairs.md) and [release gates](deployment/audit-remediation-release.md).

**Historical snapshots below:** dated approval/status paragraphs retain past evidence; they do not supersede the current 18/54 acceptance or reintroduce store/phone scope. Local listeners mentioned below are past observations, not a current health guarantee.

**Latest T015 execution (2026-09-07):** User-approved synthetic PostgreSQL run completed: 1 pass / 6 reproduced pre-fix failures, no skips, all 71 business tables empty before and after. T015 test authoring is accepted; active progress is 8/46. JSONB key-order replay rejection is confirmed and tracked under T016. T016/T017 runtime changes remain blocked by T012/T007. Earlier denial/count paragraphs below are historical. [Evidence](../specs/036-audit-remediation/evidence/phase-4-verification.md).


**Phase 4 / T015 partial (2026-09-07):** Ten isolated unit cases executed (4 pass, 6 expected pre-fix failures). Seven DB cases authored but not run after automatic approval review denied saved synthetic credential access. T016/T017 remain blocked by T012/T007; no runtime code was changed and active progress remains 7/46. [Evidence](../specs/036-audit-remediation/evidence/phase-4-verification.md).


**Latest scope — panel only (2026-09-07):** Store and phone-app modifications are excluded. Active feature 036 has 46 tasks / 7 accepted, 25 requirements and 14 audit items. Panel UI, responsive browser behavior and required shared services/workers remain. T009's prior completion is preserved historically outside active progress; no code or migration is reverted. Phase 4 now contains T015-T017. [Scope amendment](../specs/036-audit-remediation/evidence/panel-only-scope-amendment.md). Earlier scope/count paragraphs below are historical.

Latest scope amendment (2026-09-07): feature 036 targets the web panel/store and shared backend only. Phone-app tasks T046/T047 are removed; 56 active tasks, 8 accepted. Responsive web remains required; app source/version/access does not gate web release. Existing application code and historical results are unchanged. See [scope amendment](../specs/036-audit-remediation/evidence/web-only-scope-amendment.md).

Spec Kit 036 Phase 3 is PARTIAL: T006/T009/T011 accepted, 8/56 total. Financial components and 144 combined focused tests pass, but T007 still needs an attributable installment receipt/rejection parser backed by sanitized original HTTP fixtures. Current installment HTTP results remain under review even when a debit is observed. Do not deploy this slice as a completed installment feature. See [Phase 3 evidence](../specs/036-audit-remediation/evidence/phase-3-verification.md) and [tasks](../specs/036-audit-remediation/tasks.md). Production and existing local data were untouched.

This is a Next.js role-based reseller panel with separate admin, manager, agent, and user workflows. The web app uses Prisma/PostgreSQL for durable data and an HTTP intermediary worker for actual beIN operations. Phase 2 source inspection counts 67 Prisma models and 37 migration directories (36 SQL files; one pre-existing directory lacks SQL). Page/API counts are historical discovery, not current runtime coverage. `PROJECT_MEMORY.md` is a derived index; source, schemas, tests and authorized evidence remain authoritative.

## Recent Changes

- 2026-10-13 — Fixed the prefixed smartcard-label regression in the real HTTP loader and its cart identity reader. Added 23 loader cases, including fourteen live-shaped package rows and native disabled-field omission, corrected the observed fixture, preserved consumer financial-message precedence and clarified queue-completion logs. Verification: 129 focused Worker cases, six consumer-state cases, 32 mocked browser scenarios; root/Worker types and isolated emission. The user clarified the live scope as HTTP observation only; no renewal or deployment was performed. Later checkout/IRDETO mapping remains unverified.
- 2026-09-08 — Completed review repair tasks T059-T066 and reaccepted T016/T017 after regression verification. Core changes cover account handoff, quote-conflict closure, operation authentication, durable dispatch, ambiguous-request retry and review-note validation. Existing installment adapter remains UNKNOWN without attributable provider settlement; final-cart evidence, migration history and production cutover remain explicit gates. See `specs/036-audit-remediation/evidence/review-repairs.md`.
- 2026-09-07 - Completed Phase 2 T003-T005 acceptance: 20 focused tests passed without skips (9 unit/guard, 11 PostgreSQL), with observed pre-foundation failure, deterministic refund lock contention and zero fixture residue. Fixed synthetic dealer-context hashing and card length only; focused types have zero diagnostics and all migration bytes remain unchanged. Test target: deshpanel_audit_test_20260907_v2 on 5433, separate from work/snapshot databases. Fresh install failed because 0_init is empty; schema-only reference bootstrap enabled bounded acceptance, and T040/T052 retain the release-baseline gap. Evidence: `specs/036-audit-remediation/evidence/phase-2-runtime-verification.md`. No provider/worker or production execution; 5/58 original tasks accepted.
- 2026-09-07 - Fixed the user-reported local renewal P2010 error by casting the four existing PostgreSQL advisory-lock results to text, preserving keys/order/transaction scope. Real Prisma regression reproduced failure before and passed after with contention/release checks; eight related unit cases passed. Raised only the work clone's connection cap from 6 to 40 to resolve observed P2037. Tracked as supplemental LOCAL-001, separate from the original 2/58 progress. Actual provider renewal remains unavailable with workers stopped; see local trial evidence.
- 2026-09-07 - Started the explicitly requested local interactive trial against the migrated work clone with a restricted app role, isolated Redis and a Node socket egress guard. Login page/browser smoke, unauthenticated auth endpoints, Prisma user-model read and Redis PING passed. No panel credentials changed, external workers started or production accessed. Full authenticated/financial flows remain unverified; 2/58 tasks accepted. Runtime files and encrypted secrets remain outside Git; see `specs/036-audit-remediation/evidence/local-database-preparation.md#Local-interactive-trial--verified-2026-09-07`.
- 2026-09-07 - Restored the supplied backup to D:5433, preserved `deshpanel_snapshot_20260907` read-only, and applied nine existing migrations to `deshpanel_work_20260907` after the maintainer requested the database updates. The clone has 15 new tables and 36 completed migration records; all original data table counts match. Three missing historical unique guards were restored on the clone only. No app/worker execution, source SQL edits, production access or Phase 2 acceptance. Details and limits below and in `specs/036-audit-remediation/evidence/local-database-preparation.md`.
- 2026-09-07 - Installed local PostgreSQL 18.6 and pgAdmin after explicit authorization. New Windows service postgresql-x64-18 is running with automatic startup; listeners are localhost:5432 only. Installation: C:\Program Files\PostgreSQL\18. Administrator role / maintenance database: postgres / postgres; encoding UTF8. No pgAdmin connection profile configured.
  - Credentials: random password saved as a Windows DPAPI-encrypted PSCredential at C:\Users\SOUQ\AppData\Local\CodexPostgreSQL\postgres-admin.credential.xml. Load with Import-Clixml under the same Windows account for authorized local use without printing its password. Protected folder ACLs verified; plaintext installer options deleted.
  - Verification: signed EnterpriseDB installer matched package hash; saved credentials successfully reused, wrong password rejected, loopback listeners and pg_dump/pg_restore 18.6 verified.
  - Boundary: no project database created/restored, app environment changed, migrations applied, clients generated, app tests/builds or workers run, or provider/production access. Phase 2 acceptance stays pending. Inspect the supplied backup format/version before restore; preserve the original, separate restored data from synthetic tests, and isolate providers/queues before app execution.
- 2026-09-07 - Authored Spec Kit 036 Phase 2 foundation (T003-T005; runtime acceptance pending).
  - Data: six evidence/refund/adjudication/effect models, operation purpose, customer spend ownership, dispatch revision identity and fixed claim timestamps; three new unapplied migrations. Both schemas match byte-for-byte; previous SQL is preserved.
  - Compatibility: existing shared/mobile dispatch selectors explicitly use revision 0; report DTOs allow a null panel user. No new provider payment, customer-spend writer or repeated preparation is enabled.
  - Verification sources: seven unit cases, eight DB cases and eleven synthetic fixture variants; audit-only guard requires an explicitly confirmed local disposable PostgreSQL URL before database imports. Existing other suites keep their own guards.
  - Evidence: read-only source/TypeScript syntax/document checks and independent review only. Q02/Q04/Q06/Q09 are NOT_RUN; generated clients are not refreshed and migrations are not applied. Pending-refund veto integration remains T021, customer spend writers T010 and revision-aware jobs T016.
  - Follow-up: verify the foundation in an authorized isolated environment before task acceptance. Establish the missing historical SQL directory's provenance in T040/T052. Production remains UNKNOWN. Project memory is synchronized for this source-only delivery.
- 2026-09-07 - Completed Spec Kit 036 Phase 1 setup (T001-T002).
  - Evidence: froze 1,116 file hashes, reconciled 201 incoming Git changes with the original 188 plus 13 planning files, and confirmed no runtime drift since the reviewed snapshot.
  - Inventory: all 19 operation route files / 21 HTTP handlers, queue producers/consumers, spend and effect writers, and intersecting card/payment/refund locks. The reference index has 348 unique files; broad import/test entries are discovery only.
  - Follow-up: existing tasks now explicitly include the collection auth wrapper, unsupported legacy CHECK_BALANCE admission before debit, actual store/customer queue routing and the customer concurrency variable.
  - Verification: Q01 document/source checks only; no application test/build, database/provider access, service operation or deployment. All twenty repair findings remain open; the root project memory was synchronized.
- 2026-09-07 - Created Spec Kit 036 audit-remediation plan.
  - Scope: installments and provider spend, store selection/refunds, legacy review, current auth, dispatch/effects, account/attestation readiness, data compatibility, process topology, mobile and localized states.
  - Tracking: 20 audit items -> 31 requirements -> 8 stories -> 58 tasks with dependencies, owned paths and acceptance checks. Existing 034/035 history is preserved.
  - State: NO_RUNTIME_IMPACT; all implementation/release tasks remain unchecked. Only planning artifacts, active-document pointers and project memory changed.
  - Boundary: no application test, build, database/provider access, service change or deployment. Prior verification entries below are historical and are not current acceptance for the reviewed dirty tree.
- 2026-08-24 - Added proof-gated renewal completion and duplicate-charge safety.
  - Changed: renewal Worker orchestration, Sold Packages Report baseline/diff correlation, recovery, financial review, start guards, localized operation states, Prisma proof/verification/reservation storage, and a bounded reconciliation CLI under Spec Kit feature 035.
  - Behavior: a beIN balance decrease proves only `CHARGED`. The Worker records the card's Sold Report invoices before Pay, scans the complete report again afterward, and accepts only one new exact card/package/promotion/Decimal-amount/Cairo-date match whose non-empty Invoice also identifies one active contract. Only the unique composite claim can reach `COMPLETED` in `ENFORCE` mode.
  - Safety: default `REVIEW_ONLY` records attempts but never auto-claims proof or completes. Charged/no-proof, verification failure, report-only, contract-only, incomplete scans, stale baselines, and proof conflicts remain `REVIEW_REQUIRED`; final provider mutations are single-attempt and never repeat after the durable marker; success notifications and points remain behind durable fulfillment proof.
  - Isolation: one durable card reservation and one durable beIN-account reservation cover baseline, Pay, and verification. Each active Worker step also requires the exact fenced execution lease; login, CAPTCHA, session writes, final `OK`, Pay, and later verification abort on lease loss.
  - Recovery: deterministic read-only verification attempts can be recreated by maintenance after a database/queue crash, including a recorded `MATCHED` attempt that crashed before finalization. Balance-ledger evidence alone can never recover to completion.
  - Reconciliation: `npm run reconcile:renewal-fulfillment -- --from <ISO> --to <ISO> [--card <digits>]` is dry-run by default. Apply requires `--apply --confirm APPLY_FULFILLMENT_SAFETY_ISSUES` and only idempotently upserts integrity issues.
  - Boundary: this delivery covers the reseller web panel, Worker, database, admin review, and reconciliation only. Mobile/store/application execution is explicitly excluded and was not run or claimed. Local core code/build tests passed, but the incident query, authorized live beIN Invoice equality smoke, automation-exclusive account attestation, and disposable PostgreSQL/Redis concurrency checks remain unverified. No production migration, refund, provider Pay, service start, or live incident mutation was performed.
- 2026-08-23 - Expanded `PROJECT_MEMORY.md` into a whole-project system catalog.
  - Changed: `PROJECT_MEMORY.md` and this guide only; no runtime source, schema, migration, dependency, build, or deployment behavior changed.
  - Coverage: indexed all page and API families, service domains, Prisma models/enums/migrations, auth and ownership boundaries, queues/Workers/integrations, environment names, tests, PM2 variants, feature registry, impact map, and verified risks with exact source pointers.
  - Authority: preserved code, current Prisma schema, ordered migration directories, tests, and accepted project instructions as proof; broad prose remains a discovery source and documented drift is not copied as fact.
  - Safety: secret values, live data, generated files, implementation bodies, and unverified production/provider state remain excluded.
  - Verification: the 23-section ledger validates successfully against repository source pointers; final freshness, encoding, and documentation guard checks are part of this task handoff.
- 2026-08-23 - Corrected and personally installed the source-grounded Web Project Memory skill.
  - Changed: `PROJECT_MEMORY.md`, `.agents/skills/web-project-memory`, `tests/unit/web-project-memory.test.ts`, Spec Kit feature 034, `.gitignore`, and this guide; the byte-equivalent personal copy is installed at `%USERPROFILE%/.codex/skills/web-project-memory`.
  - Workflow: `$web-project-memory` and implicit selection use one generic package across web stacks; each repository keeps one project-specific root ledger with 23 sections, eight record states, separate feature status, exact source pointers, and Git/non-Git freshness metadata.
  - Safety: the memory is an index rather than proof; high-risk decisions require reopening complete authoritative sources, secret values are forbidden, and read-only work creates no ledger churn.
  - Scope: `NO_RUNTIME_IMPACT`; no application runtime, schema, migration, dependency, Worker, or production behavior changed.
  - Verification: the isolated multi-layer behavior test, real-ledger source validation, both Skill Creator validations, and four-file SHA-256 parity pass without starting services.
- 2026-08-07 - Added hierarchy-protected panel password recovery.
  - Changed: one transactional reset service, admin/manager/agent reset routes, effective permission capabilities, shared reset dialog, login guidance, locale catalogs, session guards, audit labels, and focused tests.
  - Behavior: admin can reset active manager/agent/user accounts except admins; managers and agents can reset only unambiguous current direct users.
  - Security: target ownership is locked and re-read before the password update, old panel web/mobile sessions are invalidated through passwordChangedAt, attempts are limited per actor/target, and password/hash values never enter responses or audit details.
  - Scope: no Prisma migration and no Worker change.
  - Verification: focused hierarchy and route/session tests passed; production and its live database were not used.
- 2026-08-06 - Added bounded maintenance finalization for stale operation-spend award runs.
  - Changed: the operation maintenance runner, a dedicated stale-run retry module, and focused source/bounds tests.
  - Behavior: each cycle selects only a capped, age-qualified batch of `CAPTURED` run operation ids and passes them to the immutable idempotent finalizer.
  - Safety: the retry path never rebuilds ownership, settings, rates, or recipients from current state; its health fields contain status counts and safe operation ids only.
  - Verification: focused tests, TypeScript, and targeted ESLint passed.
- 2026-07-15 - Added admin drill-down from an agent row to the agent's currently assigned users.
  - Changed: admin users UI, `GET /api/admin/users`, owner-filter helpers, translations, and focused tests.
  - Behavior: clicking or keyboard-activating an agent row opens the Users tab with a persistent agent filter; action buttons do not trigger row navigation.
  - API: `agentId` now filters `USER` accounts through active `AgentAssignment` rows; combining `agentId` and `managerId` returns `400` with `INVALID_OWNER_FILTER`.
  - Counting: agent totals include only non-deleted accounts whose role is `USER` and whose assignment is active.
  - Verification: focused tests, TypeScript, and targeted ESLint passed; database-gated integration cases were skipped because the integration flag was not enabled.

## Development Phases
Current development is incremental within the existing Next.js, Prisma, and worker architecture. See `specs/` for active feature specifications and `docs/current-project-prd.md` for the broader behavior contract.

## Architecture Map
- `src/app`: Next.js pages and API route handlers.
- `src/components`: client and server UI components grouped by role and feature.
- `src/lib`: authentication, permissions, ownership, operation safety, accounting, and integration logic.
- `prisma`: PostgreSQL schema, migrations, and seed entry point.
- `worker`: independent queue worker package.
- `tests/unit` and `tests/integration`: Node test runner suites executed through `tsx`.
- `PROJECT_MEMORY.md`: derived, source-linked resumption index for the whole web system.
- `.agents/skills/web-project-memory`: version-controlled generic skill source containing the contract, schema, deterministic helper, and Codex UI metadata; the installed personal copy must remain byte-equivalent.

## Feature Inventory
- Admin user management supports distributors, agents, and users in separate tabs.
- Hierarchical password recovery supports ADMIN, MANAGER, and AGENT supervisors through the configurable users.reset_password permission.
- Every panel role retains self-service password change with its current password.
- Distributor rows drill down through manager ownership rules.
- Agent rows drill down through active `AgentAssignment` ownership rules.
- Search, pagination, refresh, and the selected owner filter compose in the Users tab until the filter is cleared.
- Development continuity is recorded through stable, record-state-labeled entries in the root project memory without replacing authoritative project sources.

## UI Map
- Provider report tab: `src/components/admin/report-center/BeinProviderReportPanel.tsx`, registered in the existing Reports Center; request cancellation and polling live in `src/hooks/useProviderReport.ts`.
- Admin user management: `src/components/admin/users/UsersTable.tsx`.
- Shared supervisor reset dialog: `src/components/users/ResetPasswordDialog.tsx`, reused by admin, manager, and agent user lists.
- Login forgot-password guidance directs panel users to their account supervisor and exposes no public reset form.
- Agent and distributor rows are mouse- and keyboard-activatable.
- The Users tab displays the selected owner name and a localized clear-filter control.
- User-facing admin copy is stored in `src/i18n/translations/ar.ts`, `en.ts`, and `bn.ts`.

## Data Model
- Renewal fulfillment uses `OperationFulfillmentBaseline`, `OperationFulfillmentVerification`, `OperationFulfillmentVerificationAttempt`, `OperationFulfillmentProof`, `OperationManualFulfillmentEvidence`, `CardLifecycleReservation`, and `ProviderAccountCausalReservation`. Composite context constraints bind operation, provider account, card, baseline, attempt, reservation generation, Invoice, and observation times; one proof is allowed per operation and per provider-account/Invoice, and blank Invoice values cannot become automatic proof. `BeinAccountSpendLedger` remains money-movement evidence and is not completion authority.
- Password recovery reuses User.passwordHash, User.passwordChangedAt, ManagerUser, AgentAssignment, and ActivityLog; no migration is required.
- `AgentAssignment` records agent-to-user ownership.
- Current agent ownership requires matching `agentId` and `isActive = true`.
- User listings additionally require `User.role = USER` and `User.deletedAt = null`.
- The existing `[agentId, isActive]` and `[userId, isActive]` indexes support these lookups; this feature requires no migration.

## APIs And Integrations
- Provider reports (ADMIN on every request): `GET /api/admin/bein-accounts?view=report-options` selects only id/username/label/eligibility metadata; `POST /api/admin/reports/bein-provider` accepts `{accountId, from, to}` and returns `{success:true,data:{requestId}}`; `GET /api/admin/reports/bein-provider/[requestId]?page=1&search=...` returns a cached, sanitized state/page. Errors contain stable translation codes; no passwords, proxies, sessions or raw HTML are returned. Unknown/expired request IDs return 404. Dates use ISO `YYYY-MM-DD` at the API boundary and the observed WebForms date controls at the provider boundary.
- `READ_PROVIDER_REPORT` jobs have one attempt, priority 10 and no business-operation payload. The Worker routes them to `worker/src/lib/provider-report-reader.ts` before financial operation dispatch. `shared/reports` owns the DTO/Redis admission contract. The existing Sold Report parser accepts optional dates/All criteria while financial callers keep their default criteria.
- Renewal APIs expose stable review/block codes while the Worker persists separate provider-payment and fulfillment states. Live admin verification must claim the same unique proof before completion; a no-refund decision without proof requires an explicit auditable `cardRenewed=true` confirmation.
- Supervisor reset endpoints are `POST /api/admin/users/:id/reset-password`, `POST /api/manager/users/:id/reset-password`, and `POST /api/agent/users/:id/reset-password`.
- Reset endpoints accept only newPassword, return stable result codes, and evaluate the existing users.reset_password permission before the transactional ownership check.
- `GET /api/admin/users` is ADMIN-protected and supports `roleFilter`, pagination, search, `managerId`, and `agentId`.
- `managerId` and `agentId` are mutually exclusive owner filters for `roleFilter=users`.
- Owner predicates live in `src/lib/admin/users-ownership-filter.ts` so API behavior is independently testable.

## Environment And Requirements
- Node.js and npm are required for the web app and worker.
- PostgreSQL is required for Prisma-backed runtime and database integration tests.
- Redis is required for queued worker flows.

## Local Database Snapshot

Verified on 2026-09-07. This preserves the supplied production backup for local read-only review; it does not establish current production health or application compatibility.

| Setting | Value |
| --- | --- |
| Endpoint | `127.0.0.1:5433` (IPv4/IPv6 loopback only) |
| Database | `deshpanel_snapshot_20260907` |
| Reader | `deshpanel_audit_reader` |
| Data directory | `D:/CodexPostgreSQL/audit18-data` |
| PostgreSQL / locale | 18.6 / builtin `C.UTF-8`; source dump is 18.0, source database locale is unknown |
| Startup | Separate manually started cluster; the original automatic Windows service on 5432 is unchanged |
| Reader credential | `C:/Users/SOUQ/AppData/Local/CodexPostgreSQL/snapshot-reader.credential.xml` |
| Local verification manifests | `D:/CodexPostgreSQL/restore-verification.json`; `D:/CodexPostgreSQL/reader-and-migration-verification.json` |

- Source: `D:/New folder (4)/deshpanel_2026-09-07_02-21-08_pgsql_data.sql` (3,001,942,175 bytes). Its SHA256 is `444a95dd70e75000391d90eb44f46292b21345a4d8c4bfe741936c91bf0b8595`, matching the fully decompressed adjacent `.sql.gz`. Both source files are unchanged.
- Restore: a fresh database, one transaction, stop on error, original schema/data/ownership retained. The streaming adapter omitted exactly 369 DROP/constraint-cleanup statements needed only when replacing existing objects. All 57 tables match source row counts (625,801 rows); zero invalid constraints/indexes. Initial database size was 2,978,813,631 bytes; remaining D space was approximately 13 GB.
- Access: database and reader default to read-only. Reader has SELECT on all 57 tables and no INSERT/UPDATE/DELETE/TRUNCATE; a zero-row UPDATE was denied with SQLSTATE 42501 even in a READ WRITE transaction. Encrypted saved credentials worked after a clean cluster restart. Use Import-Clixml under the SOUQ Windows account and keep its password in process memory; do not print or commit it. Data/log directories have protected ACLs; temporary plaintext initdb credentials were removed.
- History: 27 completed migration records, none unfinished or rolled back. All correspond to local SQL: 13 raw checksums match and 14 match after CRLF-to-LF normalization. This is line-ending variation, not evidence of changed SQL content. Nine additional local SQL migrations are absent from the snapshot history; the also-absent `20260616120000_unique_refund_transaction_per_operation` directory has no SQL. No historical files/checksums were rewritten and no new migrations were applied.
- Next: preserve this snapshot; the separate work clone below is now migrated. The empty directory's provenance is resolved by the historical test asserting no duplicate SQL file; the earlier refund-index migration exists but its three guards were absent from the actual snapshot. Source locale parity and wider schema drift remain unknown. No `.env`, app/worker/Redis/provider/payment execution, build, application test, production change, or Spec Kit acceptance occurred in this setup.

For a later authorized restart, use the installed `pg_ctl.exe` with `start -D D:/CodexPostgreSQL/audit18-data -l D:/CodexPostgreSQL/server.log -w`; `status -D D:/CodexPostgreSQL/audit18-data` checks this specific cluster. When launching through PowerShell Start-Process, use WindowStyle Hidden and wait for the pg_ctl process with WaitForExit, rather than Start-Process -Wait (which can wait for its long-running PostgreSQL descendants). The app is not configured to use this endpoint.

## Local Working Database

- `deshpanel_work_20260907` at `127.0.0.1:5433` is a separate writable clone on D. It has 72 public tables and 36 completed migration records. Prisma migrate deploy/status succeeded using the installed CLI and a protected isolated config at `D:/CodexPostgreSQL/migration-bundle-20260907/prisma.config.mjs`; there are no pending migrations in that 36-file bundle.
- The bundle preserves every existing SQL file byte-for-byte and omits only the empty duplicate-refund directory. Repository SQL/schema and recorded historical checksums were not edited. All 56 original data table counts remain equal to the snapshot (625,774 data rows); migration history alone gained nine rows. Original files and read-only snapshot remain intact.
- The original snapshot lacks three financial unique indexes despite listing their migration. On the clone only, zero-duplicate preflights preceded reasserting the exact existing SQL for `uq_transactions_refund_once`, `uq_transactions_deduct_once` and `uq_wallet_refund_once`. No financial data was rewritten. Wider schema drift still needs review; a production forward repair is separate work.
- All clone indexes are valid. `customers_store_credit_nonnegative_check` and `bein_spend_exactly_one_owner_check` retain the source's intentional NOT VALID state; full historical constraint validation and application acceptance remain pending. Migration status does not prove complete schema parity or financial correctness.
- Local manifests: `D:/CodexPostgreSQL/work-preparation.json` and `D:/CodexPostgreSQL/work-verification.json`; approximately 10 GB remained free on D. The existing encrypted local PostgreSQL administrator credential was used only in process memory. The app's DATABASE_URL was not changed, no app credentials were provisioned for this clone, and no application/worker, seed, generation, build or functional test ran.
- Spec Kit scope and results: `specs/036-audit-remediation/evidence/local-database-preparation.md`; accepted progress remains 2/58. Use separate synthetic databases for destructive tests; this clone contains production-derived sensitive data.

## Configuration And Secrets
Use `.env.example` and `worker/.env.example` as starting templates. Relevant web variables include `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `BEIN_USERNAME`, `BEIN_PASSWORD`, `NODE_ENV`, and `LOG_LEVEL`. The examples do not enumerate every code-consumed auth, crypto, cron, payment, database-pool, Worker, proxy, or maintenance name; use `PROJECT_MEMORY.md` record `ENV-005` and reopen the target source before deployment. Never commit secret values.

## Testing And Verification
- Provider-report tests: `node --import tsx --test tests/unit/provider-report-api.test.ts worker/tests/provider-report-browser.test.ts`; `node tests/browser/bein-provider-report.cjs` with `PLAYWRIGHT_MODULE` pointing to an installed Playwright module if necessary. For native Redis/BullMQ/HTTP verification, explicitly set `PROVIDER_REPORT_TEST_REDIS_URL` to a disposable loopback Redis database **15**, then run `node --import tsx --test tests/integration/provider-report-redis.test.ts`. That suite refuses a non-loopback URL, uses unique owned keys/queue names and removes only its own data; it never uses the provider or business PostgreSQL data. Without the explicit URL its three native cases skip and do not count as runtime acceptance.
- Renewal fulfillment safety: run the focused files listed in `specs/035-renewal-fulfillment-proof/quickstart.md`; database race/apply cases require an isolated PostgreSQL database and the repository integration-test flag.
- Latest core-only local record: 670 root unit/source-contract tests passed with zero failures; Worker tests passed 195 with four Redis-gated skips. Root and Worker TypeScript checks, schema parity, Prisma validation, both production builds, focused critical-file ESLint, diff/encoding checks, and focused fulfillment/maintenance/finalizer suites passed. The core database selection had three harness checks pass and 20 PostgreSQL-dependent cases skip because no explicitly disposable database was configured; four app/store cases were excluded from this count. The full changed-file lint still exposes 24 pre-existing `no-explicit-any` errors in `worker/src/http/HttpClientService.ts`; this is recorded debt, not a clean broad-lint claim.
- A Next production build is compile evidence only. No mobile/store/application service or user flow was started or validated for this delivery.
- Incident dry-run: `npm run reconcile:renewal-fulfillment -- --from 2026-08-23T18:35:00+03:00 --to 2026-08-23T18:45:00+03:00 --card 7517687161`.
- Password reset policy and wiring: `npx tsx --test tests/unit/hierarchical-password-reset.test.ts tests/unit/panel-password-self-service.test.ts`.
- Award-run maintenance: `npx tsx --test tests/unit/operation-spend-award-run-maintenance.test.ts`.
- Fast behavior tests: `npx tsx --test tests/unit/admin-users-ownership-filter.test.ts`.
- Assignment integration tests: set `RUN_DB_INTEGRATION=1` or `RUN_DB_INTEGRATION_TESTS=true`, then run `npx tsx --test tests/integration/admin-agent-assignments.test.ts` against an isolated test database.
- Static checks: `npx tsc --noEmit --pretty false` and `npm run lint`.
- Project memory behavior: `npx tsx --test tests/unit/web-project-memory.test.ts`.
- Project memory validation: `python .agents/skills/web-project-memory/scripts/project_memory.py validate PROJECT_MEMORY.md --repository .`.
- Project memory freshness: `python .agents/skills/web-project-memory/scripts/project_memory.py freshness . PROJECT_MEMORY.md`.

## Operational Notes
- Core rollout requires the ordered migrations `20260824090000_renewal_fulfillment_proof`, `20260824130000_sold_report_fulfillment_correlation`, `20260824150000_canonical_bein_account_identity`, and `20260824180000_fulfillment_proof_composite_integrity` before the updated web/Worker code. Until migration and code are deployed together, production does not have the composite proof/reservation boundaries.
- Keep `fulfillmentProofMode=REVIEW_ONLY` through migration, mixed-version exclusion, fixture smoke, and the authorized read-only Sold Report/contract Invoice equality smoke. `ENFORCE` remains blocked until provider accounts are attested as automation-exclusive, disposable PostgreSQL/Redis race suites pass, and post-completion effects have crash-durable convergence.
- Before migration/build, use an external mutation gate, drain work, and stop `bein-web`, `bein-maintenance`, `bein-keepalive`, and every `bein-worker-*`. Restart only new-version processes behind the gate; remove the gate after schema/config/queue checks prove no mixed version remains. Exact steps are in `specs/035-renewal-fulfillment-proof/quickstart.md`.
- The reconciliation CLI never sends provider Pay, changes operation status, refunds money, awards/reverses points, or sends notifications. Review its JSON dry-run before the explicit apply command; resolve money manually only from fresh provider/refund evidence.
- Hierarchical password reset has no database migration and no Worker deployment step; deploy only the web application changes.
- Stale award-run maintenance defaults to 25 runs older than five minutes per cycle. `MAINTENANCE_AWARD_RUN_LIMIT` can tune the batch up to the hard cap of 100, and `MAINTENANCE_AWARD_RUN_STALE_MS` sets the age threshold with a one-minute minimum.
- Apply production Prisma migrations with `npx prisma migrate deploy`; do not use `prisma db push` for normal deployments.
- Stop the serving web process before replacing `.next`, build the web app, then restart the web and worker PM2 processes.
- This agent-filter feature has no schema migration or data-cleanup step.
- The project-memory workflow has no application or production deployment step. The version-controlled source package installs separately into `%USERPROFILE%/.codex/skills/web-project-memory`; synchronize `PROJECT_MEMORY.md` only after saved material project changes, and reopen complete authoritative sources for security-, data-, migration-, finance-, or production-critical decisions.
- PM2 has two repository variants: root `ecosystem.config.js` defines eight reseller Workers plus web, keepalive, and maintenance; `worker/ecosystem.config.js` defines ten reseller Workers plus keepalive and the customer Worker. Production notes target the Worker/VPS variant, but exact restarts still require checking the deployed ecosystem and `pm2 status`.

## Where To Start
- Renewal completion source of truth: `worker/src/http/sold-packages-report.ts`, `worker/src/lib/fulfillment-baseline.ts`, `worker/src/lib/renewal-fulfillment-correlation.ts`, `worker/src/lib/fulfillment-finalization.ts`, `shared/operations/renewal-fulfillment.ts`, and the core feature-035 migrations.
- Verification retry/repair source of truth: `worker/src/lib/renewal-verification-retry.ts`, the verification handler in `worker/src/http-queue-processor.ts`, and `src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts`.
- Renewal recovery/admin/reconciliation safety: `src/lib/operations/recovery-proof.ts`, `src/lib/financial-review/manual-decisions.ts`, and `scripts/reconcile-renewal-fulfillment.ts`.
- Cross-system source map and current resume state: `PROJECT_MEMORY.md`.
- Memory maintenance contract and schema: `.agents/skills/web-project-memory/SKILL.md` and `.agents/skills/web-project-memory/references/project-memory-schema.md`; invoke manually with `$web-project-memory`.
- Hierarchical reset policy and transaction: `src/lib/users/password-reset.ts`.
- Role adapters: the admin, manager, and agent `users/[id]/reset-password/route.ts` files.
- Shared reset UI and copy: `src/components/users/ResetPasswordDialog.tsx` and `src/i18n/translations/{ar,en,bn}.ts`.
- Operation-spend maintenance retry: `src/lib/maintenance/operation-spend-award-run-maintenance.ts`, composed by `src/lib/maintenance/operation-maintenance-runner.ts`.
- Admin user list behavior: `src/components/admin/users/UsersTable.tsx`.
- Admin user query contract: `src/app/api/admin/users/route.ts`.
- Ownership predicates: `src/lib/admin/users-ownership-filter.ts` and `src/lib/users/ownership.ts`.
- Agent assignment schema: `prisma/schema.prisma`.
- Focused coverage: `tests/unit/admin-users-ownership-filter.test.ts` and `tests/integration/admin-agent-assignments.test.ts`.

## Next Tasks And Backlog
- Run all migration/proof/refund/reservation races against disposable PostgreSQL and the execution-lease/session races against disposable Redis; these are release blockers, not optional local skips.
- Before migration deploy, scan production for provider usernames that collide after trim/case normalization. `20260824150000_canonical_bein_account_identity` intentionally aborts on a collision and must not be forced through without resolving the duplicate accounts.
- With explicit authorization and a truly panel-dedicated beIN account, run the sanitized read-only correlation smoke and prove the same Invoice appears in the complete Sold Report diff and one active card contract. Stay `REVIEW_ONLY` on any mismatch or incomplete scan.
- Make post-completion account/user counters, activity, notification, cache cleanup, and follow-up effects converge idempotently after a crash before considering `ENFORCE`.
- Run the exact incident dry-run and manually inspect the two operation/provider records before any production apply or financial decision.
- Complete authenticated AR/EN/BN browser smoke checks for charged-verifying, charged-under-review, duplicate-blocked, and explicit admin-confirmation states.
- Before release, run an authenticated browser smoke test for the reset dialog in AR/EN/BN and an isolated PostgreSQL transfer-versus-reset concurrency case.
- Run the database-gated agent ownership integration test against an isolated PostgreSQL test database before release.
- Complete an authenticated Arabic/RTL browser smoke test for agent drill-down on desktop and mobile viewports.

## Known Gaps And Handoff Notes
- The two reported deductions for card `7517687161` have not been reconciled locally: the exact bounded query failed with `ECONNREFUSED` before reading or writing data. Production deployment state, provider contracts/invoices, and refund state remain `UNKNOWN` until authorized live evidence is collected.
- Safe rollout status is `REVIEW_ONLY`. The local code fails closed, but `ENFORCE` is not release-ready until the live Invoice equality/account-exclusivity evidence, disposable PostgreSQL/Redis races, and crash-durable post-completion effects are complete.
- The reseller core was verified without starting services. Mobile/store/application files and flows are outside this delivery and must not be inferred as working from the root compile.
- Local static checks do not prove production data consistency. Existing ownership conflict indicators must remain visible when legacy data contains competing current owners.
- `docs/current-project-prd.md` is a broad behavior/discovery contract, but some historical migration and optional test names do not match the current directories. Use `prisma/migrations`, `tests`, and `PROJECT_MEMORY.md` records `DATA-008` and `RISK-006` for exact inventory.
- `worker/src/customer-index.ts` globally disables TLS verification for its proxy path, and mobile API headers currently allow any CORS origin. Treat both as explicit deployment/security boundaries rather than implicit defaults.
