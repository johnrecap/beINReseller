# PROJECT MEMORY — beIN Reseller Panel

> Source of truth: source code, schemas, ordered migrations, accepted specifications, tests, explicit maintainer decisions, and authorized operational evidence.
> Memory role: derived index and resumption state; use it to locate evidence, never as proof.
> Record states: VERIFIED | INFERRED | PLANNED | PARTIAL | STALE | CONFLICT | DEPRECATED | UNKNOWN
> Feature states: PLANNED | PARTIAL | WORKING | BLOCKED | DEPRECATED | BROKEN | UNKNOWN
> Last synchronized: 2026-10-13
> Last synchronized commit: 6b6a095697bce646493e646b51a7053b1db49a3f
> Working tree at synchronization: DIRTY
> Working tree fingerprint: SHA256:db9567d31b40eaa3a5cfbffefb4b7c19ec21b1e6c59dc3520149e69e3fa210f4

## 1. Project Identity

- Product: Role-based beIN reseller web panel with admin, manager, agent, panel-user, customer/store, queued operation, accounting, rewards, and reporting surfaces.
- Repository boundary: Next.js web/API package at root, shared Prisma/PostgreSQL data, and a separate BullMQ Worker package under `worker/`.
- Documentation language: English for durable project artifacts; runtime UI supports Arabic, English, and Bengali where catalog coverage exists.
- Authority order: current runtime source and configuration; Prisma schema plus ordered migrations; accepted Spec Kit artifacts and explicit maintainer decisions; tests and verified results; authorized environment evidence.
- Excluded as authority: `node_modules/`, `.next/`, `worker/dist/`, generated Prisma clients, temporary files, copied environment values, and unverified production state.
- Ledger scope: compact cross-layer source discovery, resumption state, decisions, risks, and material deltas. It does not replace `docs/current-project-prd.md`, `docs/PROJECT_GUIDE.md`, or `specs/`.

## 2. Current System Snapshot

- Current administrative release, 2026-10-13: `UPD-20261013-012` implements the explicit ADMIN override for all current blockers of one card, including cooldown, despite unknown/conflicting evidence. Durable stop/drain/archive freezes old execution and financial writes, preserves invoices/status/issues and admits only a subsequent new attempt. Local SQL/Axios/browser verification passes within documented limits; native contention, full historical migration chain and deployment remain unknown. Resume at `docs/PROJECT_GUIDE.md#admin-card-release--delivery-register-2026-10-13`.

- Current renewal hold repair, 2026-10-13: `UPD-20261013-011` atomically closes proven pre-payment local issues/reservations, repairs eligible replay, limits automatic review closure to newly versioned v2 attempts, and exposes terminal blockers/reasons/actions through the existing admin review surface. Local SQL replay/rollback, root/Worker/browser/types/build checks pass within the recorded limits; historical production reviews and native service races remain unknown. Resume at `docs/PROJECT_GUIDE.md#renewal-hold-repair--current-delivery-register-2026-10-13`.

- Current precision repair, 2026-10-13: `UPD-20261013-010` reads the original package name and exact price from header-mapped cells, retains optional text/decimal snapshots across Workers and compares known Reports display variants without losing duration/offer or rounding amounts. Local mocked journeys reach one receipt/completion/release, including a lost Pay reply. No provider or production execution, schema change or historical resettlement. Resume at `docs/PROJECT_GUIDE.md#recent-changes`.

- Current pre-final selection repair, 2026-10-13: `UPD-20261013-009` reserves the chosen beIN account before a v2 quote is shown, makes promo revisions use their actual response, and distinguishes Add/Sell/STB preparation from final OK/Pay. A verified no-debit preparation failure closes FAILED and releases the account; final-payment markers or sale evidence still hold for review. Local tests/types/build pass, while the incident's actual Sell HTML, production process versions and historical operation remain unverified/unchanged. Resume at `docs/PROJECT_GUIDE.md#project-guide` and the linked Worker tests.

- Production migration incident, 2026-10-13: `UPD-20261013-008` records the user's P3018/55P04 failure while applying the same-day report migration. The published migration is unchanged; an earlier enum-only migration commits its three values before the original constraint SQL. Local PGlite reproduces the defect and verifies the ordered repair. The failed production record, actual schema, restart and native Prisma retry remain NOT_VERIFIED. Resume at `docs/deployment/audit-remediation-release.md#same-day-report-migration-recovery--2026-10-13`.

- Current v2 renewal change, 2026-10-13: `UPD-20261013-007` binds newly created package renewals to one operation-scoped Sell Packages page across promo, selection and Add; it removes post-selection Check/reload/promo reapply and uses one exact unclaimed invoice from the executing account's Cairo Pay-day Sold Report, with a saved owner/admin receipt. Local source/tests/types/build pass; disposable PostgreSQL/Redis migration/races, real checkout and production cutover are NOT_VERIFIED. Historical v1 operations retain baseline/contract verification. Resume at `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`.

- Current account lifecycle repair, 2026-10-13: `UPD-20261013-006` removes provider-account cooldowns while retaining the card cooldown and ownership/financial guards. Late jobs cannot reopen terminal reservations; signal-check completion releases its hold atomically; bounded maintenance repairs eligible terminal holds using existing completion evidence and without financial/status writes. Local regression/types pass; native concurrency, the three reported paid renewals' evidence and deployed Worker versions remain unverified. Resume at `specs/036-audit-remediation/audit-register.md#account-availability-continuation--2026-10-13`.

- Current CISCO serial clarification, 2026-10-13: `UPD-20261013-005` retracts the prior assistant request for approval based on treating a nine-digit provider field as an incomplete/different card. The native browser and current Worker submit the full nine-digit field value, including its prefilled first digit, in both Load steps; the customer's ten-digit card remains separate. This is a documentation correction, not a runtime repair. The current live promo response and later checkout remain unverified. Resume at `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`.

- Current dynamic-promo renewal repair, 2026-10-13: `UPD-20261013-004` uppercases arbitrary submitted codes, derives the promo POST from the current bound WebForms form, and refuses changed card/type/state or stale selection. The legacy v1 path rechecks card/STB before Add; v2 retains its initial card-paired page and does not repeat Check after selection. Unlabelled or ambiguous receiver values and a changed pairing stop before cart mutation. Known direct identifier/page-snippet logs were removed. Root/Worker unit suites and both TypeScript checks pass locally. The live Sell Packages pre-Load form was inspected, but the browser approval review blocked the first Load; actual promo response, checkout, new invoice and deployed Worker parity remain unverified. No beIN purchase, payment, deployment or subagent. Resume at `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`.

- Current read-only flow review, 2026-10-13: `UPD-20261013-003` traces card entry to quote, cart, final confirmation and same-account Sold Report proof. The live signed-in report's criteria/grid shape is observed; supplied logs identify the pre-repair loading failure, while deployed Worker parity remains unknown. Scheduled-start and outside-sale correlation holds and STB/logging improvements are documented without a runtime change. No provider sale/payment or subagent. Resume at `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`.

- Current smartcard repair, 2026-10-13: `UPD-20261013-002` fixes the bare-label rejection using the provider's observed `Smartcard:` prefix and exact CISCO/IRDETO values. Current read-only browser HTTP confirms both CISCO serial steps and the second POST's omission of disabled controls, now mirrored by the worker. Actual-loader/identity/promo/Reports and translated failure-state tests pass locally. Latest user clarification prohibits renewal; only HTTP observation is authorized. No package selection, cart, sale, payment, deployment or subagents. Live IRDETO input mapping and later checkout remain unverified. Resume at `specs/036-audit-remediation/evidence/package-identity-repair.md`.

- Current provider-report supplement, 2026-10-13: `UPD-20261013-001` adds the admin account-scoped Sold Packages report browser via existing HTTP Workers, temporary Redis results and localized UI. Verified locally with 855 root / 306 Worker cases, three native Redis/BullMQ/HTTP cases and nineteen mocked-browser scenarios; isolated builds/types pass and temporary resources are removed. That implementation run had no live beIN access; the later `UPD-20261013-003` browser read confirms the provider report's date/Dealer/All/grid structure only. No schema or financial-state change, deployment or subagents. Resume from `specs/036-audit-remediation/evidence/provider-report-browser-20261013.md`; live panel-adapter compatibility and synchronized production Worker versions remain unverified.

- Current localization/capacity supplement, 2026-10-12: `UPD-20261012-003` localizes the renewal surface, prepares an explicit 20 × 4 / pool-2 profile and repairs two baseline/session defects. The completed 200-user local comparison finds no renewal-throughput/queue-wait improvement and nine repeated burst admission errors with twenty workers. Focused fault checks preserve identity/payment/cooldown fences. Test processes, ports and temporary data/tools are cleaned up. Resume from `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; production, complete OS egress isolation, historical migration and live provider acceptance remain unverified.

- Current cooldown, 2026-10-12: `UPD-20261012-002` adds a five-minute card hold from the first ended package-renewal attempt, including failure, plus a localized countdown. Immutable DB deadline and shared admission guard prevent refresh/rejected clicks/late Reports from extending it. Review blocks remain independent. Local SQL/API/browser tests pass; the migration, native concurrent-worker acceptance and deployment remain unverified. Resume at `specs/036-audit-remediation/audit-register.md#supplemental-card-cooldown--2026-10-12` and `docs/deployment/audit-remediation-release.md`.

- Current repair, 2026-10-12: `UPD-20261012-001` implements the observed cart/Reports contracts and quote/promo/full-provider serial binding. Local tests pass; unknown later-stage or promo outcomes stop safely. Provider acceptance, real-service races and incident/server attribution remain INCOMPLETE. No provider calls, deployment, subagents or business-money changes in this continuation. Resume at `specs/036-audit-remediation/evidence/package-identity-repair.md`, not historical UI acceptance counts.

- Current product shape: Next.js 16/React 19/TypeScript panel and APIs, Prisma 7/PostgreSQL, Redis/BullMQ, and separate HTTP automation workers.
- High-risk domains: operation state transitions, beIN account/session evidence, balances/refunds/ledgers, points/rewards, ownership/permissions, credential changes, queue dispatch/recovery, and production migration/build order.
- Latest active work: `WORK-007` / `FEAT-023`: approved FIX-01..FIX-07 source changes are saved in `e663e14` and verified on GitHub; accepted WEB completion is 7/12 accepted; 42 panel tables opt into common tokens, provider/document exceptions are preserved, 15 modal shells migrated and actual isolated AuthJS cookie behavior verified. Five tasks retain page/action/localization acceptance work. `WORK-006` UI repairs remain 14/14 with GitHub checkpoint 4a2833e verified. `WORK-005` / 036 remains 45/57 accepted; no production/provider acceptance. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.
- Historical discovery inventory (2026-08-25; not recounted or runtime-validated during 036 planning): Git reports 998 tracked paths; the live source tree contains 40 App Router pages, 205 API route handlers, 133 component files, 131 `src/lib` files, 61 Prisma models, 35 Prisma enums, 34 ordered migration directories, 48 Worker source files, 88 unit tests, 30 integration tests, 21 Worker test files, and 25 feature-spec directories. These counts are discovery only; the current delivery explicitly excludes mobile/store/application execution and does not claim those flows were validated.
- Completeness rule: this ledger records every material subsystem, feature family, contract boundary, data family, job, integration, operational topology, risk, and authoritative discovery path. It deliberately does not copy implementation bodies, generated output, live data, or secret values because those remain source evidence and would defeat token-efficient retrieval.
- Start project work by locating a `FEAT-*` or layer record, then open its linked runtime, data, auth, job, test, spec, and operations sources.
- Production database contents, deployed migration set, running process health, and external-provider state are `UNKNOWN` unless freshly verified with authorization.
- Authorized local environment: `OPS-009` preserves the supplied backup on D:5433; `OPS-010` records migrations and guard repairs on a separate writable clone. `OPS-011` records the subsequently authorized loopback web trial, isolated Redis, generated root client and bounded startup/dependency smoke. No full functional tests, provider execution or task acceptance followed.

## 3. Technology Stack

- Web: Next.js 16.1.1, React 19.2.3, TypeScript, App Router, and Node package scripts from `package.json`.
- Data and jobs: Prisma 7 with PostgreSQL plus Redis/BullMQ shared by the root app and `worker/` package.
- Verification and operations: Node test runner through `tsx`, ESLint, Next/Worker builds, Prisma schema sync, and PM2 process definitions.
- Sources: `package.json`; `worker/package.json`; `prisma/schema.prisma`; `ecosystem.config.js`; `tsconfig.json`; `eslint.config.mjs`

## 4. Architecture Map

### APP-001 — Next.js web and API runtime

- State: VERIFIED
- Sources: `package.json`; `src/app`; `next.config.ts`; `ecosystem.config.js#bein-web`
- Current state: Next.js 16.1.1 serves App Router pages and route handlers with React 19.2.3; PM2 names the production web process `bein-web`.
- Connections: `APP-002`, `APP-003`, `API-001`, `FE-001`, `AUTH-001`, `OPS-001`

### APP-002 — PostgreSQL through Prisma

- State: VERIFIED
- Sources: `prisma/schema.prisma`; `prisma/migrations`; `prisma.config.ts`; `src/lib/prisma.ts`
- Current state: Durable panel, operation, accounting, permission, notification, beIN account, and store/customer state is modeled in one PostgreSQL schema.
- Connections: `DATA-001`, `DATA-002`, `DATA-003`, `DATA-004`, `OPS-002`

### APP-003 — Redis and BullMQ

- State: VERIFIED
- Sources: `src/lib/queue.ts`; `src/lib/redis.ts`; `worker/src/lib/redis.ts`; `package.json`; `worker/package.json`
- Current state: Redis backs reseller/customer BullMQ queues, worker coordination, locks, rate limits, and cached automation sessions.
- Connections: `JOB-001`, `JOB-002`, `JOB-003`, `ENV-001`

### APP-004 — Operation Worker processes

- State: VERIFIED
- Sources: `worker/src/index.ts#main`; `worker/src/http-queue-processor.ts`; `worker/package.json`; `ecosystem.config.js#createWorkers`
- Current state: An explicit `PANEL_WORKER_COUNT` drives the shared PM2 factory; the prepared example selects twenty processes at concurrency four/pool two. They consume the `operations` queue, use the HTTP automation path, share account-pool coordination and write durable results through Prisma. This is a candidate topology, not a verified production count or capacity improvement. Sources: `deployment/panel-workers.cjs`; `deployment/panel-workers.env.example`; `UPD-20261012-003`.
- Connections: `APP-002`, `APP-003`, `JOB-003`, `INT-001`, `FEAT-001`

### APP-005 — Session keepalive process

- State: VERIFIED
- Sources: `worker/src/keepalive.ts#main`; `worker/src/lib/session-keepalive.ts`; `ecosystem.config.js#bein-keepalive`
- Current state: A separate PM2 process refreshes eligible beIN sessions on a database-configured interval and stores coordination/metrics through Redis; operation workers do not duplicate keepalive.
- Connections: `APP-002`, `APP-003`, `JOB-004`, `INT-001`

### APP-006 — Operation maintenance process

- State: VERIFIED
- Sources: `ecosystem.config.js#bein-maintenance`; `src/scripts/operation-maintenance.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`
- Current state: A separate PM2 process runs bounded maintenance and recovery-oriented operation checks outside request handling.
- Connections: `JOB-005`, `DATA-002`, `OPS-003`

## 5. Source Map

### SRC-001 — Repository instructions and constitution

- State: VERIFIED
- Sources: `AGENTS.md`; `.specify/memory/constitution.md`; `.specify/extensions.yml`
- Use: Skills-first routing, encoding rules, Spec Kit gates, production boundaries, deployment order, and current feature pointers.

### SRC-002 — Product and durable handoff documentation

- State: VERIFIED
- Sources: `docs/current-project-prd.md`; `docs/PROJECT_GUIDE.md`
- Use: Broad product contract, operation/worker/accounting/auth/API/data summaries, setup, current handoff, known gaps, and where-to-start pointers; verify final behavior against runtime sources.

### SRC-003 — Web pages, layouts, components, and localization

- State: VERIFIED
- Sources: `src/app`; `src/components`; `src/styles`; `src/i18n`; `components.json`
- Use: App shell, 40 page entry points, role dashboards, forms/tables/dialogs, shared UI primitives, styles, Arabic/English/Bengali catalogs, and client interaction states.

### SRC-004 — App Router API surface

- State: VERIFIED
- Sources: `src/app/api`; `src/lib/api-response.ts`; `src/lib/api-middleware.ts`; `src/lib/validators.ts`
- Use: 205 route-handler files across admin, manager, agent, panel user, operations, mobile, store, auth, settings, notifications, rewards, reporting, cron, and uploads.

### SRC-005 — Domain and shared service layer

- State: VERIFIED
- Sources: `src/lib`; `src/lib/operations`; `src/lib/financial-review`; `src/lib/permissions`; `src/lib/points`; `src/lib/credit-requests`; `src/lib/users`
- Use: Auth, permissions, ownership, operations, accounting evidence, recovery, points, credit, notifications, maintenance, queue, pricing, uploads, and cross-route invariants.

### SRC-006 — Data schema and migration history

- State: VERIFIED
- Sources: `prisma/schema.prisma`; `prisma/migrations`; `prisma/seed.ts`; `scripts/check-prisma-schema-sync.js`
- Use: Current model/enumeration definitions, 28 ordered migration directories, seeds, indexes/constraints, and root/Worker schema-parity checks.

### SRC-007 — Worker automation implementation

- State: VERIFIED
- Sources: `worker/src/index.ts`; `worker/src/http-queue-processor.ts`; `worker/src/pool`; `worker/src/lib`; `worker/src/keepalive.ts`
- Use: Queue consumption, beIN HTTP automation, account allocation/locking, session/cache behavior, evidence writing, errors, retries, and keepalive.

### SRC-008 — Tests and verification evidence

- State: VERIFIED
- Sources: `tests/unit`; `tests/integration`; `worker/tests`; `package.json#scripts`; `docs/PROJECT_GUIDE.md#Testing-And-Verification`
- Use: 96 root unit/integration files plus Worker tests, focused commands, database-gated coverage, and known verification limits. Actual pass state requires a current test run.

### SRC-009 — Feature intent and delivery artifacts

- State: VERIFIED
- Sources: `specs`; `.specify/feature.json`; `.specify/templates`; `.agents/skills/speckit-analyze/SKILL.md`; `.agents/skills/speckit-implement/SKILL.md`
- Use: Accepted outcomes, clarifications, architecture decisions, contracts, tasks, checklists, and feature-specific verification for features 011 through 034.

### SRC-010 — Runtime configuration and deployment

- State: VERIFIED
- Sources: `.env.example`; `worker/.env.example`; `package.json`; `worker/package.json`; `next.config.ts`; `prisma.config.ts`; `ecosystem.config.js`; `AGENTS.md#Production-Server-Notes`
- Use: Configuration names, build entry points, CORS/cache headers, Prisma commands, PM2 topology, and production deployment order. Values and live state are never copied here.

### SRC-011 — Repository-wide bounded inventory

- State: VERIFIED
- Sources: `command:git ls-files`; `src/app`; `src/components`; `src/lib`; `prisma/schema.prisma`; `prisma/migrations`; `worker/src`; `tests/unit`; `tests/integration`; `worker/tests`; `specs`
- Use: Whole-project coverage baseline: 998 tracked paths, 40 page entries, 205 route handlers, 133 components, 118 root service/library files, 52 models, 25 enums, 28 migrations, 38 Worker source files, 105 test files across the three test roots, and 24 feature-spec directories.
- Boundary: Counts describe the inspected worktree on 2026-08-23 and are discovery aids, not substitutes for reopening target files after later changes.

## 6. Frontend

### FE-001 — Role-based dashboard route tree

- State: VERIFIED
- Sources: `src/app/dashboard`; `src/app/login/page.tsx`; `src/components/layout`; `docs/current-project-prd.md#Global-Navigation`
- Current state: Separate admin, manager, agent, and shared panel-user dashboards cover users, operations, renewal, history, transactions, credit requests, notifications, rewards, profile, reports, settings, and operational health.
- Connections: `API-001`, `AUTH-001`, `AUTH-004`, `FEAT-001`, `FEAT-002`, `FEAT-003`

### FE-002 — Shared component and style system

- Web completion 2026-09-08: 42 shared panel Table instances in 30 files opt into inherited root/compact padding, border/heading/hover tokens and keyboard scroll. Two native provider/document consumers retain their visual contract. Fifteen legacy modal shells use PanelDialog, including opener focus restoration without a Radix trigger; default Dialog/Table consumers keep prior behavior. Sources: `docs/PANEL_UI_REPAIRS.md`; `src/components/ui/dialog.tsx`; `src/components/ui/table.tsx`; `UPD-20260908-005`.

- State: VERIFIED
- Sources: `src/components/ui`; `src/components/shared`; `src/styles`; `components.json`; `package.json`
- Current state: Tailwind 4, shadcn/Radix primitives, shared dialogs/forms/tables, Lucide icons, Sonner feedback, charts, and existing motion packages support role and feature components.
- Connections: `SRC-003`, `FE-003`, `TEST-001`

### FE-003 — Localization and RTL-aware content

- Hold repair: `renewalHold` ar/en/bn catalogs provide reason, specific issue, stage, last-update and pagination copy without changing the flat operation-message contract. Sources: `src/i18n/translations`; `UPD-20261013-011`.

- Provider reports 2026-10-13: `providerReport`/`reportCenter` tokens and reused existing labels cover the new panel and report-center navigation in en/ar/bn. Provider package/offer strings remain unchanged. Sources: `src/i18n/translations`; `src/components/admin/report-center`; `UPD-20261013-001`.

- Web completion 2026-09-08 / FIX-05: operational permissions/agents/credit forms, report panels and financial-review UI copy use existing ar/en/bn catalogs. Native/provider text and API/stored payment-status values stay unchanged. Balance PDF retains its English document contract independently of page language. The report records residual API-derived/other-page localization limits; do not claim whole-project text completion. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.

- Panel repairs 2026-09-08: Panel login/history/transactions/sidebar copy uses matching ar/en/bn panelUi catalogs; logical input/table/dialog positioning is verified in 33 mocked browser groups. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- Local backlog 2026-09-08: Changed review/readiness/progress messages use ar/en/bn catalogs; 22 mocked-browser groups pass with narrow RTL and keyboard focus. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: New unsupported-operation and review-note messages use ar/en/bn catalogs; remaining legacy hardcoded review copy stays under T045. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `src/i18n/config.ts`; `src/i18n/translations/ar.ts`; `src/i18n/translations/en.ts`; `src/i18n/translations/bn.ts`; `src/components/LanguageSwitcher.tsx`
- Current state: User-facing catalogs exist for Arabic, English, and Bengali; Arabic behavior requires RTL-aware layout and copy verification when affected.
- Connections: `FE-001`, `FE-002`, `TEST-001`

### FE-004 — Client form and state primitives

- Web completion 2026-09-08 / FIX-02: usePanelRequest returns acceptance success for explicit nonfinancial reloads. usePanelCommand retains action/entity uncertainty across child close/selection changes, includes response-body delivery in its 45-second deadline, and exposes scoped admission plus explicit nonfinancial reconciliation. Financial callers do not infer non-execution from GET or replay automatically. Its fence lasts only for the mounted owner, not across reloads/tabs. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.

- Panel repairs 2026-09-08: usePanelRequest owns a cancellable request generation, a 15-second whole-response deadline and explicit HTTP/auth failure state; affected lists reject obsolete responses and do not present failures as empty balances. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `package.json`; `src/store`; `src/hooks`; `src/components`
- Current state: React Hook Form/Zod, Zustand, role/feature components, and route-local fetch behavior coexist; inspect the target feature before adding state, form, or client layers.
- Connections: `API-002`, `FE-002`

### FE-005 — Complete web page surface

- State: VERIFIED
- Sources: `src/app`; `docs/current-project-prd.md#User-Facing-Web-Pages`; `docs/current-project-prd.md#Manager-Pages`; `docs/current-project-prd.md#Admin-Pages`
- Current state: Forty page entries exist: `/`, `/login`, `/dashboard`, `/dashboard/renew`, `/dashboard/operations/active`, `/dashboard/operations/bulk`, `/dashboard/history`, `/dashboard/transactions`, `/dashboard/credit-requests`, `/dashboard/notifications`, `/dashboard/profile`, `/dashboard/rewards`, `/dashboard/manager`, `/dashboard/manager/users`, `/dashboard/manager/deleted-users`, `/dashboard/agent`, and 24 admin pages under `/dashboard/admin`.
- Admin page catalog: overview; agents; analytics; beIN accounts plus login-failure and low-balance views; beIN config; credit requests; deleted users; Eid rewards; financial review; logs; permissions; points; proxies; recovery health; reports plus beIN-spend and integrity views; rewards; settings plus announcements; users plus activity.
- Connections: `FE-001`, `API-005`, `AUTH-001`, `FEAT-008`–`FEAT-018`

### FE-006 — Component ownership map

- Extended quality 2026-09-08: Export table reuses stable JSX and untransformed height; browser resize/row-update/fallback checks pass. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/components`; `src/components/admin`; `src/components/ui`; `src/components/manager`; `src/components/renewal`; `src/components/dashboard`; `src/components/effects`; `src/components/layout`; `src/components/profile`
- Current state: The 133 component files are organized primarily as admin 47, shared UI primitives 22, manager 8, auth 6, renewal 6, dashboard 6, effects 5, layout 4, profile 4, and smaller credit-request, history, transaction, reward, announcement, agent, operation, brand, provider, and shared groups.
- Boundary: Reuse the owning group and existing UI primitives; localization and role guards remain separate connected concerns.
- Connections: `FE-002`, `FE-003`, `FE-004`, `FEAT-003`, `FEAT-007`, `FEAT-008`–`FEAT-018`

### FE-007 — Reseller operational workspace

- Administrative release: packages polling and heartbeat show a neutral stop/archive result instead of reopening old selection; known completed results retain success and receipts. History keeps the archived attempt and disables stale cancellation. Sources: `src/app/api/operations/[id]/packages/route.ts`; `src/app/dashboard/renew/page.tsx`; `src/components/history/OperationsTable.tsx`; `UPD-20261013-012`.

- Hold repair: active rows show a bounded cause/stage/update and an admin-only review link. Financial review includes terminal blockers, 100-row cursor navigation and operation/card search prefill. Existing action capabilities govern terminal repair buttons. Sources: `src/app/dashboard/operations/active/page.tsx`; `src/components/admin/financial-review/FinancialReviewClient.tsx`; `UPD-20261013-011`.

- Pre-final selection 2026-10-13: The quote UI hides packages when a promo revision fails, shows a translated no-new-charge preparation failure only with no deduction/final Pay marker, and displays provider currency. The customer still explicitly chooses from the current quote before Add/Sell. Sources: `src/app/dashboard/renew/page.tsx`; `shared/operations/consumer-progress.ts`; `src/i18n/translations`; `UPD-20261013-009`.

- Dynamic promo 2026-10-13: The API normalizes submitted codes to uppercase; the UI's existing quote revision and selection reset remain the customer authority after apply/remove. No new UI text or endpoint was added. Source: `src/app/api/operations/[id]/apply-promo/route.ts`; `src/app/dashboard/renew/page.tsx`; `UPD-20261013-004`.

- Read-only flow review 2026-10-13: The UI sends full card/type, displays the revision-bound quote and selected confirmation, and treats confirmed API dispatch as processing until fulfillment polling resolves. Source: `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`; `UPD-20261013-003`.

- Smartcard failure 2026-10-13: Unsupported provider forms map to `operations.providerSmartcardFormUnsupported` in en/ar/bn and show the existing operation reference. Refund/review evidence retains message precedence. Sources: `shared/operations/consumer-progress.ts`; `src/app/dashboard/renew/page.tsx`; `src/i18n/translations`; `UPD-20261013-002`.

- Localization 2026-10-12: Renewal, signal and installment feedback use the selected en/ar/bn tokens, including dynamic terminal results and language-switch accessibility text. The initial document is en/ltr; persisted locale controls hydrated direction. Provider names and document exports stay original. Sources: `src/app/dashboard/renew/page.tsx`; `src/components/renewal`; `src/i18n/translations`; `UPD-20261012-003`.

- Cooldown 2026-10-12: Renewal entry/result displays the current card's server deadline via `src/hooks/useRenewalCardCooldown.ts` and `src/components/renewal/CardCooldownNotice.tsx`, with ar/en/bn catalog text. Refresh preserves remaining time; a 409 updates a stale page; expiry enables an explicit retry without auto-starting. Ten mocked browser scenarios pass at 360/1280 widths. Source: `tests/browser/renewal-card-cooldown.cjs`; `UPD-20261012-002`.

- Web completion 2026-09-08 / FIX-03/04: active installment details check current selection/list state, complete server data and future confirmation expiry; old or unauthorized responses cannot reopen confirmation. Confirm/cancel keep quoteRevision and use operation-scoped uncertainty/deadlines with safe dismissal and history follow-up. Forty-two active cases pass; the separate installment suite has 40. T007/T008 provider settlement remains deferred. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.

- Panel repairs 2026-09-08: History/transactions sort the full web query server-side with an ID tie-breaker and show actual totals. History consumes projected settlement/nextAction/messageKey without inferring refunds from terminal status. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- Local backlog 2026-09-08: Server review capabilities drive actions; legacy retry preserves a decision key/source reference; required notes and focus behavior verified. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Promo fetch/body waits have a real deadline; ambiguous retry preserves request identity and stale packages stay disabled. Review closure notes are required, trimmed and bounded to 2000; follow-up notes remain optional. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `src/app/dashboard/renew/page.tsx`; `src/components/renewal`; `src/app/dashboard/operations/active/page.tsx`; `src/app/dashboard/history/page.tsx`; `src/app/dashboard/transactions/page.tsx`; `docs/current-project-prd.md#/dashboard/renew`
- Current state: The shared user workspace supports renewal, installment, signal operations, active-operation resume, heartbeat/polling, captcha/package/final-confirm states, history filters, transaction history, result/retry states, and maintenance interruption handling.
- Connections: `FLOW-001`, `API-006`, `FEAT-010`, `FEAT-011`, `FEAT-012`, `AUTH-001`
- Phase 4: Quote-state polling, draft/applied-code separation, explicit removal, keyboard controls and stale-result fencing implemented; both panel final-confirm consumers send quoteRevision. Mocked 360/768/1280 and Arabic RTL passed. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### FE-008 — Role operations and administration workspace

- Administrative release: global/per-operation preview, required reason/risk acknowledgement, draining status and an archive tab reuse the existing review surface in ar/en/bn. Actor/reason/time and late observations remain visible. Sources: `src/components/admin/financial-review/CardReleaseDialog.tsx`; `src/components/admin/financial-review/FinancialReviewClient.tsx`; `UPD-20261013-012`.

- Provider reports 2026-10-13: `?tab=bein-provider` lazy-loads the exact-account report panel. Seven-day Cairo default, max 31-day range, searchable accounts, 50-row invoice-descending pages and cached card/invoice search; changing accounts aborts obsolete polling/results. Sources: `src/components/admin/report-center/BeinProviderReportPanel.tsx`; `src/hooks/useProviderReport.ts`; `UPD-20261013-001`.

- Web completion 2026-09-08: User/admin/manager/agent/report tables now share panel tokens. Deleted-user reads have explicit HTTP errors and page clamping; report failures cannot appear as successful zero totals. Operational lists reject obsolete/refused responses; credit pagination is wired and permission initialization avoids duplicate reads. Integrity summary/list commits together and checks rejected actions. Remaining role/action matrices and custom forms stay open in WEB-05/06/09/10/12. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`. Earlier dated results are historical.

- Panel repairs 2026-09-08: Admin/manager search encodes special characters and clamps pages; manager deleted-user filtering precedes count/pagination. Panel edit/beIN dialogs and mobile sidebar focus/viewport behavior are repaired. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/app/dashboard/admin`; `src/app/dashboard/manager`; `src/app/dashboard/agent`; `src/components/admin`; `src/components/manager`; `src/components/agent`
- Current state: Admin surfaces operate users, permissions, finance, provider accounts, proxies, content, reports, and recovery; manager surfaces operate owned users and two-sided balances; the agent surface operates assigned users, credit requests, and authorized password support.
- Connections: `AUTH-004`, `AUTH-005`, `API-007`, `API-008`, `FEAT-003`, `FEAT-005`, `FEAT-007`, `FEAT-013`–`FEAT-018`

## 7. Backend

### BE-001 — Shared server domain services

- Extended quality 2026-09-08: Manager page/API reuse src/lib/manager-dashboard.ts; guarded caller supplies current actor, serializable DTO includes operationsCount. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/lib`; `src/lib/permissions`; `src/lib/points`; `src/lib/credit-requests`; `src/lib/financial-review`; `src/lib/users`
- Current state: Server-only modules own shared authorization, ownership, accounting evidence, points, credit, notifications, pricing, maintenance, and cross-route invariants.
- Connections: `API-001`, `API-002`, `DATA-001`, `DATA-003`, `AUTH-004`, `FEAT-003`, `FEAT-004`, `FEAT-005`

### BE-002 — Operation domain and recovery services

- Administrative release: scoped idempotent decision under the existing card lock; saved stop precedes HTTP drain, then archive/reservation release commits atomically without settlement. Recovery excludes stopped operations. Sources: `shared/operations/admin-card-release.ts`; `src/lib/operations/recovery.ts`; `UPD-20261013-012`.

- Hold repair: positive unsubmitted-payment assessment is shared across web/Worker/quote closure and admin capabilities. Atomic closure clears disproven local fulfillment issues, cancels unattempted final dispatches and releases reservations; ambiguous payment and cross-operation conflicts remain protected. Sources: `shared/operations/renewal-pre-payment.ts`; `src/lib/operations/pre-mutation-renewal-finalization.ts`; `worker/src/lib/pre-mutation-renewal-finalization.ts`; `UPD-20261013-011`.

- Cooldown 2026-10-12: `src/lib/operations/renewal-card-cooldown.ts` reads the latest unexpired card deadline without writes or identity disclosure. `src/lib/operations/renewal-creation-guard.ts` checks it under the existing transaction/card lock before package-renewal creation or continuation. Existing unresolved review/reservation checks take precedence; installment attempts bypass only this new cooldown. Source: `UPD-20261012-002`.

- Local backlog 2026-09-08: Canonical review finalizers support affirmative unsent and evidenced legacy receipt completion; installment and unevidenced legacy refund actions stay held. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Watchdog includes all admitted outbox types; exhaustion changes only its current stage/revision. Unsupported card CHECK_BALANCE is rejected before funding. Safe pre-sale quote closure releases reservations atomically without refund; unknown states stay held. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `src/lib/operations`; `src/lib/operation-dispatch.ts`; `src/lib/operation-safety.ts`; `src/lib/operation-final-confirmation.ts`; `src/lib/refund.ts`
- Current state: Shared services own durable dispatch, operation evidence, finalization, timeout, recovery, lock release, review, and refund behavior used by routes and maintenance.
- Connections: `API-003`, `DATA-002`, `JOB-002`, `JOB-005`, `FEAT-001`, `RISK-001`
- Phase 4: Panel apply/select/final-confirm bind server quote and applied code; writes re-read under canonical card/operation locks. No financial finalizer changed. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### BE-003 — HTTP/API server primitives

- Provider report browser: `shared/reports/bein-provider.ts` defines display-only criteria/DTOs; `shared/reports/bein-provider-store.ts` atomically admits, claims and completes temporary reads. It creates no Operation or financial proof and needs no schema change. Sources: `shared/reports`; `UPD-20261013-001`.

- State: VERIFIED
- Sources: `src/lib/api-response.ts`; `src/lib/api-middleware.ts`; `src/lib/auth-utils.ts`; `src/lib/validators.ts`; `src/lib/rate-limiter.ts`
- Current state: Route handlers share success/error envelopes, Zod validation errors, web-session/mobile-token identity resolution, role and permission wrappers, and Redis sliding-window rate limits with an in-memory fallback.
- Contract: Successful helpers return `{ success: true, data?, message? }`; errors return `{ error, code?, details? }`, with production-safe generic handling for unexpected failures.
- Connections: `API-002`, `API-010`, `AUTH-001`, `AUTH-002`, `SEC-003`

### BE-004 — Finance, credit, points, and reward services

- State: VERIFIED
- Sources: `src/lib/financial-review`; `src/lib/credit-requests`; `src/lib/points`; `src/lib/refund.ts`; `src/lib/bein-spend-ledger.ts`
- Current state: Evidence classification/manual decisions, debt/capacity, ownership-aware credit approval, Telegram/WhatsApp handoff, point calculation/award/reversal/cash conversion, rewards, refunds, and beIN spend accounting are server-owned and transaction-sensitive.
- Connections: `DATA-002`, `DATA-003`, `FLOW-003`, `FLOW-004`, `FEAT-004`, `FEAT-005`, `SEC-005`

### BE-005 — Customer commerce services

- State: VERIFIED
- Sources: `src/lib/customer-auth.ts`; `src/lib/store-auth.ts`; `src/lib/store-pricing.ts`; `src/lib/store-subscription.ts`; `src/app/api/mobile`; `src/app/api/store`
- Current state: Separate customer access/refresh and store tokens, OTP/reset helpers, markup/currency conversion, Stripe configuration lookup, subscription recovery/status sync, catalog/order/address/shipping, wallet, and payment APIs share the root runtime without using panel-role sessions.
- Connections: `API-004`, `API-009`, `DATA-004`, `FLOW-005`, `AUTH-003`, `INT-003`

### BE-006 — Configuration, maintenance, and observability services

- Local backlog 2026-09-08: Readiness checks accounts/reservations before financial admission; maintenance exposes bounded effect backlog/age/exhaustion. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/lib/config.ts`; `src/app/api/settings/route.ts`; `src/lib/maintenance`; `src/lib/activity-logger.ts`; `src/lib/activity-log-redaction.ts`; `src/lib/auth/login-diagnostics.ts`; `src/lib/operation-detail-audit.ts`
- Current state: Runtime settings, effective maintenance state, bounded maintenance cycles, activity/audit writing, login diagnostics, and operation-detail redaction are shared server concerns used by routes, cron, PM2 maintenance, and admin monitoring.
- Connections: `JOB-005`, `ENV-006`, `OPS-004`, `SEC-002`, `FEAT-016`, `FEAT-017`

## 8. API Contracts

### API-001 — App Router route families

- State: VERIFIED
- Sources: `src/app/api`; `docs/current-project-prd.md#API-Route-Contract-Summary`
- Current state: Route handlers expose admin, manager, agent, panel-user, operation, mobile, store/customer, auth, reporting, settings, reward, notification, upload, webhook, and cron surfaces.
- Connections: `API-002`, `AUTH-001`, `AUTH-002`, `AUTH-003`, `DATA-001`, `DATA-002`, `DATA-004`

### API-002 — Shared route, validation, and response primitives

- State: VERIFIED
- Sources: `src/lib/api-response.ts`; `src/lib/api-middleware.ts`; `src/lib/auth-utils.ts`; `src/lib/permissions/guards.ts`; `src/lib/validators.ts`; `src/lib/rate-limiter.ts`
- Current state: Authentication/role/permission guards, common response helpers, validation, and rate limiting are shared primitives; new endpoints must inspect and reuse them before introducing alternatives.
- Connections: `AUTH-001`, `AUTH-002`, `AUTH-004`, `TEST-001`

### API-003 — Operation orchestration and recovery services

- Dynamic promo 2026-10-13: `POST /api/operations/[id]/apply-promo` trims and uppercases the variable code before its idempotent revision/dispatch identity is persisted. Existing ownership, reservation and error-key behavior is unchanged. Source: `src/app/api/operations/[id]/apply-promo/route.ts`; `tests/unit/promo-package-quote-contract.test.ts`; `UPD-20261013-004`.

- Local backlog 2026-09-08: Attempt-CAS dispatch and financial evidence locks are active; late phase writes cannot erase Pay markers. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/lib/operation-dispatch.ts`; `src/lib/operation-safety.ts`; `src/lib/operation-final-confirmation.ts`; `src/lib/operations`; `src/lib/refund.ts`
- Current state: Operation state, evidence, dispatch, completion, timeout, recovery, lock release, review, and refund behavior is centralized in shared services used by route and maintenance entry points.
- Connections: `DATA-002`, `JOB-002`, `JOB-005`, `FEAT-001`, `RISK-001`

### API-004 — Store and mobile customer surfaces

- State: VERIFIED
- Sources: `src/app/api/mobile`; `src/app/api/store`; `src/lib/customer-auth.ts`; `src/lib/store-auth.ts`; `src/lib/store-subscription.ts`; `src/lib/store-pricing.ts`
- Current state: Customer auth, catalog, address, order, subscription, wallet/payment, and mobile profile flows are separate from panel account flows but share the root runtime and data schema.
- Connections: `AUTH-003`, `DATA-004`, `INT-002`, `FEAT-006`

### API-005 — Complete route-handler inventory

- State: VERIFIED
- Sources: `src/app/api`; `command:Get-ChildItem src/app/api -Recurse -Filter route.ts`
- Current state: 205 route-handler files export 121 `GET`, 93 `POST`, 21 `PUT`, 15 `PATCH`, 15 `DELETE`, and 2 `OPTIONS` handlers; one file may export multiple methods.
- Top-level families: admin 95; mobile 27; store 26; operations 19; manager 8; user 6; cron 3; Eid rewards 3; agent 2; auth 2; points 2; rewards 2; and one each for announcement, credit debts, credit requests, maintenance status, notifications, permissions, prices, settings, transactions, and uploads.
- Connections: `SRC-004`, `API-006`, `API-007`, `API-008`, `API-009`, `TEST-001`, `TEST-002`

### API-006 — Operation route contract catalog

- Local backlog 2026-09-08: 19 panel operation routes /21 handlers use current identity; detail/collection/packages add safe progress without GET financial recovery. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: All 20 panel operation action handlers and collection GET use current identity validation before existing role/ownership checks. Disabled, deleted and revoked actors cannot use stale sessions. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `src/app/api/operations`; `docs/current-project-prd.md#Exact-Operation-State-Machines`
- Current state: Nineteen route files cover `GET /api/operations`, `POST /api/operations/create`, `/bulk`, `/start-renewal`, `/start-installment`, `/signal-refresh`, `/signal-check`, `/signal-activate`; `GET /api/operations/:id`, `/:id/packages`, `/:id/installment`; `GET/POST /:id/captcha`, `/:id/heartbeat`; and `POST /:id/select-package`, `/apply-promo`, `/confirm-purchase`, `/confirm-installment`, `/cancel-confirm`, `/cancel`.
- Boundary: Panel apply/select/final-confirm use durable dispatch; inspect each other route for its current dispatch and compensation contract.
- Connections: `FE-007`, `API-003`, `DATA-002`, `FLOW-001`, `JOB-001`, `JOB-002`, `FEAT-010`, `FEAT-011`, `FEAT-012`
- Phase 4: Apply requires actionRevision/APPLY/REMOVE; packages exposes safe revision/state/applied-code rows. Select requires current quoteRevision/index, optional scoped packageKey; final confirm requires accepted revision. Conflicts fail before debit/dispatch. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### API-007 — Admin route contract catalog

- Administrative release: ADMIN-only read-only preview/progress GET and existing decision POST with `ADMIN_ARCHIVE_AND_UNLOCK_CARD`, reason, stable key, scope fingerprint and risk acknowledgement. Writer rechecks active ADMIN; stale preview is 409, draining 202, completed 200; responses include scoped operation IDs. Sources: `src/app/api/admin/financial-review/card-release/route.ts`; `src/app/api/admin/financial-review/[operationId]/decision/route.ts`; `tests/unit/admin-card-release-api.test.ts`; `UPD-20261013-012`.

- Account cooldown removal: list/detail retain compatibility fields as null/zero; obsolete cooldown config controls, allowlist and seeds are removed. Authorization remains unchanged. Sources: `src/app/api/admin/bein-accounts`; `src/app/api/admin/bein-config/route.ts`; `src/components/admin/BeINConfigForm.tsx`; `tests/unit/account-cooldown-removal.test.ts`; `UPD-20261013-006`.

- Provider reports 2026-10-13: ADMIN-only `POST /api/admin/reports/bein-provider` accepts exact account/from/to and queues one read; `GET /api/admin/reports/bein-provider/[requestId]` returns cached status/page. `GET /api/admin/bein-accounts?view=report-options` returns minimal username/label/eligibility DTOs without credentials, proxies or sessions. Sources: `src/app/api/admin/reports/bein-provider`; `src/app/api/admin/bein-accounts/route.ts`; `tests/unit/provider-report-api.test.ts`; `UPD-20261013-001`.

- Local backlog 2026-09-08: Admin capabilities and decisions revalidate current ADMIN, canonical deduction and evidence under financial locks. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Financial review decision API validates required/optional note and 2000-character bound before effects; panel form uses the same rule. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `src/app/api/admin`; `docs/current-project-prd.md#Admin-Pages`; `docs/current-project-prd.md#API-Route-Contract-Summary`
- Current state: Ninety-seven admin route files are grouped as users 12; beIN accounts 11; reports 13; mobile-app compatibility 8; permissions 8; store compatibility 7; credit requests 4; proxies 4; financial review 3; rewards 3; Eid rewards 3; analytics 2; announcement 2; notification settings 2; points 2; user ownership 2; and one each for assignments, agents, beIN config, dashboard, keepalive stats, logs, recovery health, seed-pool settings, sidebar settings, upload, and Worker status.
- Boundary: Admin route presence does not waive each handler's role, effective-permission, protected-admin, ownership, validation, financial, and audit checks.
- Connections: `FE-008`, `AUTH-004`, `AUTH-005`, `DATA-003`, `FEAT-005`, `FEAT-007`, `FEAT-013`–`FEAT-018`

### API-008 — Panel role, shared-user, public, and cron contracts

- Panel repairs 2026-09-08: Panel web operations/transactions validate sort/page/limit with stable ID ordering while bearer ordering is preserved. Manager users use the same deletedAt:null predicate for list/count; notification reads/mutations remain owner-scoped after fresh web identity validation. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- Extended quality 2026-09-08: Manager dashboard keeps role/rate/owner semantics, returns operationsCount plus legacy _count, excludes soft-deleted linked users from list/count/balance while retaining inactive users and action history. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/app/api/manager`; `src/app/api/agent`; `src/app/api/user`; `src/app/api/auth`; `src/app/api/cron`; `src/app/api/announcement`; `src/app/api/maintenance-status`; `src/app/api/notifications`; `src/app/api/transactions`
- Current state: Manager routes cover dashboard/actions plus owned-user create/list/edit/delete/balance/stats/reset/deleted flows; agent routes cover dashboard and assigned-user reset; shared user routes cover stats, recent operations, profile, password, activity/history; public/shared routes cover login-attempt status, active announcement, maintenance status, prices, uploads, notifications, transactions, credit, points, rewards, and Eid rewards.
- Cron boundary: timeout, dispatch, and stuck-operation cleanup routes are server automation surfaces; authorization and recovery semantics must be reopened before any change.
- Connections: `FE-005`, `FE-008`, `AUTH-001`, `AUTH-004`, `JOB-005`, `FEAT-008`, `FEAT-009`, `FEAT-017`, `SEC-003`

### API-009 — Mobile and store compatibility contracts

- State: VERIFIED
- Sources: `src/app/api/mobile`; `src/app/api/store`; `src/app/api/admin/mobile-app`; `src/app/api/admin/store`
- Current state: Mobile has 27 route files: auth 6, login 1, profile 4, store 5, subscriptions 7, wallet 4. Store has 26: auth 6, addresses 2, categories 1, orders 3, products 2, shipping 1, subscriptions 10, Stripe webhook 1. Admin additionally has eight mobile-app and seven store-management compatibility routes.
- Boundary: These are API/data/Worker compatibility surfaces without corresponding customer storefront pages in `src/app`; they use customer/store authentication and the isolated `customer-operations` queue rather than panel UI role assumptions.
- Connections: `API-004`, `BE-005`, `DATA-004`, `AUTH-003`, `JOB-001`, `INT-003`, `FEAT-006`

### API-010 — Shared response, validation, and throttling contract

- State: VERIFIED
- Sources: `src/lib/api-response.ts`; `src/lib/api-middleware.ts`; `src/lib/validators.ts`; `src/lib/rate-limiter.ts`
- Current state: Common Zod schemas validate cards, operations, users, balances, passwords, settings, and beIN configuration. Default limits are login 5/15 minutes, operations 15/minute, general API 100/minute, admin 50/minute, manager 60/minute, password change 3/hour, and financial actions 5/minute.
- Boundary: The separate login guidance/cooldown and abuse controls in `AUTH-006` are additional to the generic rate-limit catalog.
- Connections: `BE-003`, `AUTH-006`, `SEC-003`, `TEST-001`

### API-011 — Renewal payment and fulfillment evidence contract

- Hold repair: start errors add `blockReason`; owner-scoped operation reads add `hold`, with an admin-only review URL. Admin financial review adds cursor/nextCursor pages and terminal blockers. `RESOLVE_PRE_MUTATION` positively rechecks terminal leftovers, execution ownership and canonical settlement; administrative replay records an audited note. Sources: `src/app/api/admin/financial-review`; `shared/operations/renewal-hold.ts`; `UPD-20261013-011`.

- Precision 2026-10-13: Numeric public `price` stays compatible; internal optional `priceText`/`priceDecimal` remain server-owned quote/session JSON and older numeric quotes need no page reconstruction. Search and transactional report proof use the same narrow display-name and exact decimal rules. Sources: `shared/operations/package-quote.ts`; `shared/operations/provider-price.ts`; `worker/src/lib/same-day-report-fulfillment.ts`; `UPD-20261013-010`.

- Pre-final selection 2026-10-13: The existing promo/selection/operation endpoints retain their contracts. A failed v2 promo revision publishes no selectable prior packages; exact safe Add/Sell/STB failure becomes FAILED without wallet debit, while ambiguous final mutation or sale evidence remains review-required. The consumer projection gates the localized no-charge message on absent debit/refund and absent final Pay. Sources: `src/app/api/operations/[id]/apply-promo/route.ts`; `shared/operations/package-quote.ts`; `shared/operations/consumer-progress.ts`; `UPD-20261013-009`.

- Version 2, 2026-10-13: New renewals require one exact same-day Sold Report invoice after final mutation; `GET /api/operations/[id]` returns an owner/admin-only confirmed `receipt`, and list rows expose `receiptAvailable`. The receipt does not expose raw proof or provider credentials. Old v1 baseline/contract and `REVIEW_ONLY` behavior below is version-specific. Sources: `src/app/api/operations/[id]/route.ts`; `src/app/api/operations/route.ts`; `src/lib/operations/receipt.ts`; `UPD-20261013-007`.

- Cooldown 2026-10-12: The existing start-renewal route adds a read-only authenticated/permission/rate-limited GET with cardNumber, cooldownUntil, serverNow and remainingSeconds. Guarded mutations return 409/RENEWAL_CARD_COOLDOWN with the same snapshot and message key; no history/user/account identity is exposed. This does not replace fulfillment review errors. Sources: `src/app/api/operations/start-renewal/route.ts`; `src/lib/operations/renewal-creation-guard.ts`; `tests/unit/renewal-card-cooldown.test.ts`; `UPD-20261012-002`.

- Local backlog 2026-09-08: Safe progress distinguishes refund pending/refunded/unconfirmed; legacy receipt authority preserves original mutation history. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `shared/operations/renewal-fulfillment.ts`; `src/app/api/operations/start-renewal/route.ts`; `src/app/api/operations/[id]/packages/route.ts`; `src/app/api/admin/financial-review`; `worker/src/http/sold-packages-report.ts`; `worker/src/lib/renewal-fulfillment-correlation.ts`; `worker/src/lib/fulfillment-finalization.ts`; `worker/src/http-queue-processor.ts`
- Current state: Renewal responses distinguish provider payment from fulfillment. A confirmed beIN debit is `CHARGED` evidence only; automatic completion requires one complete post-Pay Sold Report diff candidate and one active contract with the identical unique non-empty Invoice, all bound to the exact baseline, provider-account reservation generation, card, amount, package, and latest recorded verification attempt.
- Boundary: Default `REVIEW_ONLY` persists evidence/attempts but never auto-claims proof or completes. Charged/no-proof, report-only, contract-only, incomplete/check-failed, stale/replayed/conflicting evidence remains review-required and blocks another renewal for the card. The compatibility final-pay classification name `CONFIRMED_SUCCESS` remains in the HTTP layer and must not be consumed as fulfillment authority.
- Connections: `API-003`, `DATA-002`, `DATA-010`, `FLOW-007`, `FEAT-010`, `FEAT-015`, `RISK-009`
- Phase 4: Final confirmation compares the accepted current quote under canonical lock before deriving debit. Concurrent requests produce one deduction/dispatch; consent-less old snapshots fail closed. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

## 9. Database

### DATA-001 — Panel identities and hierarchy

- State: VERIFIED
- Sources: `prisma/schema.prisma#model-User`; `prisma/schema.prisma#model-ManagerUser`; `prisma/schema.prisma#model-AgentProfile`; `prisma/schema.prisma#model-AgentAssignment`; `src/lib/users/ownership.ts`
- Current state: `User` roles are `ADMIN`, `MANAGER`, `AGENT`, and `USER`; manager links and active agent assignments model current ownership used by list, transfer, permission, and credential flows.
- Connections: `AUTH-001`, `AUTH-004`, `AUTH-005`, `FEAT-002`, `FEAT-003`

### DATA-002 — Operations, dispatch, accounting, and integrity

- Administrative release: additive release/request records and Operation stop/archive/context fields; SQL fences prohibit late financial/lifecycle mutation after stop. Unresolved issues and all original money/invoice evidence stay unchanged. Sources: `prisma/migrations/20261013190000_admin_card_release/migration.sql`; `shared/operations/admin-card-release.ts`; `UPD-20261013-012`.

- Hold repair: existing JSON stores `prePaymentClosurePolicyVersion: 1`; no schema/migration change. Local issue resolution, confirmation-dispatch cancellation and reservation release share the settlement transaction; replay retains the original cooldown and cannot create a second refund. Sources: `shared/operations/renewal-pre-payment.ts`; `UPD-20261013-011`.

- Precision 2026-10-13: Optional original price text and canonical decimal travel inside existing package/session JSON, with no schema change. The Decimal(18,2) proof capacity is checked before persistence; an unsupported amount reviews instead of being silently rounded. Sources: `shared/operations/provider-price.ts`; `worker/src/lib/same-day-report-fulfillment.ts`; `UPD-20261013-010`.

- Cooldown 2026-10-12: Both schemas add nullable Operation.renewalCooldownUntil and a card/deadline index. A database trigger stamps the first ended non-installment RENEW outcome and preserves it through every later update. Pending and historical rows are not backfilled. Sources: `prisma/migrations/20261012120000_renewal_card_cooldown/migration.sql`; `worker/prisma/schema.prisma`; `UPD-20261012-002`.

- Local backlog 2026-09-08: Dispatch nextAttemptAt and due/stale indexes added; immutable completion effects commit with completion and apply atomically. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `prisma/schema.prisma#model-Operation`; `prisma/schema.prisma#model-OperationDispatch`; `prisma/schema.prisma#model-Transaction`; `prisma/schema.prisma#model-BeinAccountSpendLedger`; `prisma/schema.prisma#model-OperationIntegrityIssue`; `src/lib/operation-dispatch.ts`
- Current state: Operation lifecycle, durable dispatch, transactions, beIN spend evidence, refunds, integrity issues, and award runs share financially sensitive consistency and recovery paths.
- Connections: `API-003`, `JOB-002`, `JOB-003`, `JOB-005`, `FEAT-001`, `RISK-001`
- Phase 2 authored, unverified: optional operation purpose, installment evidence and customer spend ownership; NOT VALID XOR on new/updated spend rows, existing user FK remains RESTRICT. Cross-row ownership and customer writers remain T010. Source: `prisma/migrations/20260907090000_audit_financial_context/migration.sql`.
- Phase 4: Quote revision/state/requested/applied code and selected consent use existing operation JSON. No schema/migration change; financial dispatch revisions remain zero. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### DATA-003 — Permissions, audit, points, credit, and rewards

- State: VERIFIED
- Sources: `prisma/schema.prisma#model-RolePermissionSetting`; `prisma/schema.prisma#model-UserPermissionOverride`; `prisma/schema.prisma#model-GlobalPermissionSetting`; `prisma/schema.prisma#model-PermissionAuditEvent`; `prisma/schema.prisma#model-PointLedgerEntry`; `prisma/schema.prisma#model-CreditRequest`; `prisma/schema.prisma#model-Reward`
- Current state: Effective permissions and audit records coexist with credit/debt, points ledger, cash redemption, reward, Eid reward, and notification records.
- Connections: `AUTH-004`, `FEAT-004`, `FEAT-005`, `FEAT-007`

### DATA-004 — Customer commerce and subscriptions

- State: VERIFIED
- Sources: `prisma/schema.prisma#model-Customer`; `prisma/schema.prisma#model-Product`; `prisma/schema.prisma#model-Order`; `prisma/schema.prisma#model-StoreSubscription`; `prisma/schema.prisma#model-Payment`; `prisma/schema.prisma#model-WalletTransaction`
- Current state: Customer identities/addresses, catalog, orders/items, subscriptions, payments, shipping regions, store settings, and wallet transactions support store/mobile APIs.
- Connections: `API-004`, `AUTH-003`, `INT-002`, `FEAT-006`
- Phase 2 authored, unverified: nullable fixed claim timestamps/key plus selection revision, and dormant canonical refund settlement/request/observation records. Original funding and request identities are immutable; safe financial activation remains T021/T023. Source: `specs/036-audit-remediation/data-model.md`.

### DATA-005 — Migration and schema-parity boundary

- Extended quality 2026-09-08: Source history confirms empty 0_init. The absent refund SQL directory is intentional, not unknown provenance; fresh baseline and upgrade/drift rehearsal remain open. No schema/migration changes this extension. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Schemas byte-identical; new scheduling migration applied only to synthetic audit DB. Historical SQL unchanged; initial/missing SQL provenance open. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `prisma/migrations`; `prisma/schema.prisma`; `scripts/check-prisma-schema-sync.js`; `package.json#check:schema-sync`; `worker/package.json#build`
- Current state: The repository contains 37 ordered migration directories (36 SQL files); web and Worker builds enforce the same Prisma schema. Core feature 035 adds `20260824090000`, `20260824130000`, `20260824150000`, and `20260824180000`; the intervening store/Stripe migrations remain source-catalog entries outside this reseller-core validation scope. Which migrations are deployed in production is `UNKNOWN` here.
- Phase 2: three unchanged migrations applied on a separate synthetic baseline and all six model families exercised; schema parity and migration hashes verified. Empty 0_init makes clean deployment fail with missing OperationStatus; reference-schema-only bootstrap enabled bounded acceptance while T040/T052 retain fresh-install readiness. Source: `specs/036-audit-remediation/evidence/phase-2-runtime-verification.md`.
- Supplied backup evidence: `OPS-009` has 27 completed migration records matching local SQL after line-ending normalization; nine further SQL files and the empty directory are absent from its history. `OPS-010` has all 36 SQL migrations applied on a separate clone. The empty directory is an intentionally omitted duplicate, per `tests/unit/refund-unique-index-migration.test.ts` and commit 1c96b47; the original refund-index SQL exists. Three actual missing historical guards were restored only on the clone. Full schema drift/constraint validation and current production history remain unverified. Sources: `docs/PROJECT_GUIDE.md#Local-Working-Database`; `specs/036-audit-remediation/evidence/local-database-preparation.md`.
- Connections: `APP-002`, `OPS-001`, `OPS-002`, `RISK-001`

- Phase 3: no schema/history changes; all 36 saved SQL hashes match and schemas remain byte-equal. Synthetic verification only. Source: `specs/036-audit-remediation/evidence/phase-3-verification.md`.

### DATA-006 — Complete Prisma model catalog

- State: VERIFIED
- Sources: `prisma/schema.prisma`
- Identity/hierarchy: `User`, `ManagerUser`, `AgentProfile`, `AgentAssignment`.
- Credit/points/rewards/notifications: `CreditRequest`, `CreditRequestStatusHistory`, `CreditDebtLedgerEntry`, `PointRule`, `PointProgramSettings`, `PointLedgerEntry`, `OperationSpendAwardRun`, `PointCashRedemption`, `Reward`, `RewardRedemption`, `EidRewardSettings`, `EidRewardTier`, `EidRewardClaim`, `EidRewardAudienceOverride`, `WhatsAppNotificationLog`, `NotificationSetting`, `WhatsAppHandoffSnapshot`, `UserAction`.
- Operations/security/config/provider: `Operation`, `OperationDispatch`, `Transaction`, `OperationIntegrityIssue`, `OperationFulfillmentProof`, `ProviderInvoiceClaim`, `OperationManualFulfillmentEvidence`, `OperationFulfillmentVerification`, `OperationFulfillmentBaseline`, `OperationFulfillmentVerificationAttempt`, `CardLifecycleReservation`, `ProviderAccountCausalReservation`, `Setting`, `RolePermissionSetting`, `UserPermissionOverride`, `GlobalPermissionSetting`, `ProtectedAdmin`, `PermissionAuditEvent`, `ActivityLog`, `Notification`, `BeinAccount`, `BeinAccountSession`, `Proxy`, `BeinAccountSpendLedger`, `AnnouncementBanner`, `AnnouncementSlide`.
- Customer commerce: `Customer`, `CustomerAddress`, `ProductCategory`, `Product`, `SubscriptionPackage`, `Order`, `OrderItem`, `StoreSubscription`, `StoreCreditLedgerEntry`, `Payment`, `ShippingRegion`, `StoreSetting`, `WalletTransaction`; these customer/store records are cataloged but not validated by `WORK-004`.
- Connections: `DATA-001`, `DATA-002`, `DATA-003`, `DATA-004`, `DATA-007`, `DATA-008`
- Phase 2 catalog additions (source only; total 67 models): `OperationInstallmentEvidence`, `RenewalRefundSettlement`, `RenewalRefundRequest`, `RenewalRefundObservation`, `OperationReviewAdjudication`, `OperationCompletionEffect`. No financial integration or deployment is implied.

### DATA-007 — Complete Prisma enum and state catalog

- State: VERIFIED
- Sources: `prisma/schema.prisma`
- Panel/operations: `Role={ADMIN,MANAGER,AGENT,USER}`; `OperationType={RENEW,CHECK_BALANCE,SIGNAL_REFRESH}`; `OperationStatus={PENDING,PROCESSING,AWAITING_CAPTCHA,AWAITING_PACKAGE,AWAITING_FINAL_CONFIRM,COMPLETING,REVIEW_REQUIRED,COMPLETED,FAILED,CANCELLED,EXPIRED}`; provider-payment `{NOT_SUBMITTED,CHARGED,NOT_CHARGED,UNKNOWN}`; fulfillment `{UNVERIFIED,VERIFYING,VERIFIED,NOT_FOUND,CHECK_FAILED,PROOF_CONFLICT}`; verification outcomes `{MATCHED,VALID_NO_MATCH,REPORT_ONLY,CONTRACT_ONLY,INCOMPLETE_SCAN,CHECK_FAILED,PROOF_CONFLICT}`; proof mode `{REVIEW_ONLY,ENFORCE}`; authority `{NONE,AUTOMATED_COMPOSITE,MANUAL_PROVIDER_CONFIRMATION}`; `TransactionType={DEPOSIT,WITHDRAW,REFUND,OPERATION_DEDUCT,CORRECTION}`.
- Integrity/wallet/credit: `IntegrityIssueType={NO_BEIN_BALANCE_CHANGE,BEIN_DEBIT_NO_USER_DEDUCT,BEIN_DEBIT_USER_UNDERDEDUCTED,TELEMETRY_MISSING,PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED,FULFILLMENT_PROOF_CONFLICT,DUPLICATE_RENEWAL_CHARGE_BURST}`; severity `{LOW,MEDIUM,HIGH}`; status `{OPEN,ACKNOWLEDGED,RESOLVED,FALSE_POSITIVE,IGNORED}`; wallet types `{CREDIT,DEBIT,REFUND}`; credit request `{PENDING,APPROVED,REJECTED,CANCELLED}`; debt entry `{CREDIT_APPROVED,PAYMENT_RECORDED}`.
- Points/rewards: owner types `{USER_GLOBAL,AGENT_DEFAULT,AGENT_OVERRIDE,MANAGER_DEFAULT,MANAGER_OVERRIDE,MANAGER_OWNED_USER_DEFAULT}`; point sources `{CREDIT_REQUEST,MANAGER_TOPUP,REWARD_REDEMPTION,ADMIN_RELEASE,ADMIN_ADJUSTMENT,OPERATION_SPEND,EID_REWARD,POINT_CASH_REDEMPTION,POINT_REVERSAL}`; point status `{PENDING,AVAILABLE,REDEEMED,CANCELLED}`; award-run status `{CAPTURED,AWARDED,SKIPPED,LEGACY_REVIEW_REQUIRED}`; reward redemption `{PENDING,APPROVED,REJECTED,CANCELLED}`; Eid policy `{ONCE_PER_EVENT,ONCE_PER_DAY}`; audience effect `{ALLOW,DENY}`.
- Notifications/commerce: providers `{WHAPI,TELEGRAM,MANUAL}`; notification events `{CREDIT_REQUEST_CREATED,CREDIT_REQUEST_ESCALATED}`; targets `{GROUP,TELEGRAM_CHAT,WHATSAPP_GROUP,WHATSAPP_PHONE}`; delivery status `{PENDING,SENT,FAILED,DISABLED}`; order status `{PENDING,PAID,PROCESSING,SHIPPED,DELIVERED,CANCELLED,REFUNDED}`; subscription status `{PENDING,AWAITING_PACKAGE,AWAITING_PAYMENT,PAID,PROCESSING,AWAITING_CAPTCHA,COMPLETING,COMPLETED,FAILED,REFUNDED,CANCELLED}`; payment status `{PENDING,PROCESSING,SUCCEEDED,FAILED,CANCELLED,REFUNDED,PARTIALLY_REFUNDED}`; payment type `{ORDER,SUBSCRIPTION}`.
- Connections: `FLOW-001`, `FLOW-003`, `FLOW-004`, `FLOW-005`, `FEAT-001`, `FEAT-004`, `FEAT-005`, `FEAT-006`
- Phase 2 additions: `OperationPurpose={RENEWAL,INSTALLMENT,LEGACY_UNKNOWN}`; `ProviderMutationStage` adds `INSTALLMENT_PAY`. New producers remain deferred to T007; historical purpose is nullable.

### DATA-008 — Complete ordered migration catalog

- Extended quality 2026-09-08: Refund unique-index SQL remains in 20260216193000; commit 1c96b47 explicitly requires no SQL in 20260616120000. Historical checksums unchanged; empty initial baseline remains unresolved. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: 38 migration directories now include 20260908120000_dispatch_retry_schedule; initial/missing historical SQL still blocks fresh deployment. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `prisma/migrations`; `command:Get-ChildItem prisma/migrations -Directory`
- Migrations 1–10: `0_init`; `20260216193000_add_review_required_and_financial_guards`; `20260217160000_add_operation_integrity_issues`; `20260217173000_add_integrity_snapshot_columns`; `20260218103000_add_user_purged_columns`; `20260218190000_add_announcement_image_fields`; `20260306120000_add_bein_login_failure_tracking`; `20260513000000_add_user_balance_non_negative_check`; `20260513001000_add_active_operation_card_guard`; `20260513002000_add_operation_dispatch_outbox`.
- Migrations 11–20: `20260514090000_add_bein_operation_ledger`; `20260514110000_add_announcement_media_ticker`; `20260522090000_add_credit_agent_points`; `20260523120000_telegram_wa_manual_credit`; `20260523190000_credit_request_hardening`; `20260525130000_add_bein_spend_card_search_index`; `20260525143000_points_rewards_spend_ledger`; `20260526003000_agent_assignment_whatsapp_group`; `20260526013000_eid_rewards`; `20260526090000_add_admin_permission_controls`.
- Migrations 21–29: `20260604120000_eid_reward_audience_copy`; `20260604130000_points_manager_owned_user_rate`; `20260608120000_credit_request_owner_snapshot`; `20260614120000_credit_request_debt_limits`; `20260616120000_unique_refund_transaction_per_operation`; `20260616143000_allow_contract_verified_bein_spend`; `20260806120000_make_agent_assignment_source_group_optional`; `20260806123000_operation_spend_award_runs`; `20260824090000_renewal_fulfillment_proof`.
- Migrations 30–34: `20260824130000_sold_report_fulfillment_correlation`; `20260824150000_canonical_bein_account_identity`; `20260824160000_store_subscription_credit_ledger`; `20260824170000_stripe_renewal_refund_conflict`; `20260824180000_fulfillment_proof_composite_integrity`. `WORK-004` verifies the reseller-core 30, 31, and 34 source contract only; 32 and 33 are excluded customer/store work.
- Boundary: This directory list is authoritative for repository migration names; do not use migration names appearing only in older prose without a matching directory.
- Connections: `DATA-005`, `DATA-009`, `OPS-002`, `RISK-006`
- Migrations 35-37, authored/unapplied: `20260907090000_audit_financial_context`; `20260907100000_audit_dispatch_claim_identity`; `20260907110000_audit_refund_review_effects`. Existing directory 25 has no local SQL; its original history remains UNKNOWN.

### DATA-009 — Database-enforced safety and uniqueness

- Cooldown 2026-10-12: `operations_preserve_renewal_card_cooldown` provides one database UTC deadline across Worker/finalizer writers; the application guard enforces admission. Exact SQL passed in-memory PostgreSQL tests, including rollback and immutable later writes; target migration and native concurrency remain NOT_VERIFIED. Sources: `prisma/migrations/20261012120000_renewal_card_cooldown/migration.sql`; `tests/unit/renewal-card-cooldown-sql.test.ts`; `UPD-20261012-002`.

- State: VERIFIED
- Sources: `prisma/migrations/20260216193000_add_review_required_and_financial_guards/migration.sql`; `prisma/migrations/20260513000000_add_user_balance_non_negative_check/migration.sql`; `prisma/migrations/20260513001000_add_active_operation_card_guard/migration.sql`; `prisma/migrations/20260513002000_add_operation_dispatch_outbox/migration.sql`; `prisma/migrations/20260523190000_credit_request_hardening/migration.sql`; `prisma/migrations/20260616120000_unique_refund_transaction_per_operation`; `prisma/migrations/20260824090000_renewal_fulfillment_proof/migration.sql`; `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql`; `prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql`; `prisma/migrations/20260824180000_fulfillment_proof_composite_integrity/migration.sql`
- Current state: Database guards enforce non-negative user balance, one active operation per card, unique operation/job dispatch, one operation deduction and refund per operation, one active card/provider-account reservation, canonical provider login identity, unique spend ledger per operation, one fulfillment proof/manual evidence claim per operation, one provider-account/Invoice claim, non-blank automatic proof invoices, and composite operation/account/card consistency across proof, claim, verification, baseline, and latest attempt.
- Boundary: Application checks supplement these constraints but do not replace them; migrations must be deployed before relying on the database guard in production.
- Connections: `DATA-002`, `DATA-003`, `FEAT-001`, `FEAT-003`, `FEAT-004`, `FEAT-005`, `OPS-002`, `SEC-005`
- Phase 2 SQL only: owner XOR NOT VALID, revision-zero financial identity, fixed claim shape/deadline, per-source money bounds and identity-immutability triggers, unique settlement/request/event/effect records. Cancellation requires zero reserved/confirmed legs; cross-request totals, ownership and pending-refund veto remain T021 transaction duties. No constraints were applied/tested. Source: `specs/036-audit-remediation/data-model.md`.

### DATA-010 — Renewal fulfillment proof source of truth

- Version 2, 2026-10-13: `renewal_flow_version` keeps historical operations on v1; new operations store the Pay-request day and may claim `SOLD_REPORT_SAME_DAY`/`AUTOMATED_REPORT` without a baseline or contract. The published constraint migration remains unchanged; `20261013115959_same_day_report_enum_values` must first commit its enum values. PGlite reproduces the original 55P04 defect and verifies the ordered SQL; the production retry is NOT_VERIFIED. Sources: `prisma/migrations/20261013115959_same_day_report_enum_values/migration.sql`; `prisma/migrations/20261013120000_same_day_report_renewal/migration.sql`; `tests/unit/same-day-report-migration-sql.test.ts`; `UPD-20261013-008`.

- State: VERIFIED
- Sources: `prisma/schema.prisma#model-OperationFulfillmentProof`; `prisma/schema.prisma#model-OperationFulfillmentBaseline`; `prisma/schema.prisma#model-OperationFulfillmentVerificationAttempt`; `prisma/migrations/20260824090000_renewal_fulfillment_proof/migration.sql`; `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql`; `prisma/migrations/20260824180000_fulfillment_proof_composite_integrity/migration.sql`; `worker/src/lib/fulfillment-baseline.ts`; `worker/src/lib/fulfillment-finalization.ts`; `tests/integration/renewal-fulfillment-finalization-claim-guard-db.test.ts`
- Current state: A baseline stores the complete pre-Pay Invoice set for the reserved provider account/card. Ordered verification attempts store the post-Pay Sold Report/contract outcome. The finalizer locks the operation and exact latest attempt, requires the active baseline, candidate Invoice, observation times, reservation generation, card/account context and, for `CHARGED`, matching provider spend-ledger account before atomically claiming one composite proof and completion.
- Boundary: `BeinAccountSpendLedger` records observed provider money movement only. Expected package price or balance delta alone is never automatic fulfillment proof.
- Production state: UNKNOWN until ordered migration deploy, disposable PostgreSQL concurrency, and authorized sanitized provider Invoice equality checks pass.
- Connections: `DATA-002`, `DATA-009`, `FLOW-007`, `FEAT-010`, `FEAT-015`, `TEST-008`, `RISK-009`

## 10. Data Flows

### FLOW-001 — Reseller operation execution flow

- Administrative release: current scope -> ADMIN stop/audit -> registered HTTP drain or bounded deadline -> atomic archive/release -> new attempt under normal protections. Actual start-renewal prechecks and the durable guard both ignore only completed archives. Old cooldown timestamps and other-card issues remain. Sources: `shared/operations/admin-card-release.ts`; `src/lib/operations/renewal-creation-guard.ts`; `src/app/api/operations/start-renewal/route.ts`; `UPD-20261013-012`.

- Cooldown 2026-10-12: Ended package attempt -> immutable database deadline -> authenticated countdown -> guarded next admission after expiry. Reloads/rejected starts/follow-up proof do not reset it, and unresolved financial review can block admission longer than five minutes. Sources: `src/lib/operations/renewal-card-cooldown.ts`; `src/hooks/useRenewalCardCooldown.ts`; `UPD-20261012-002`.

- State: VERIFIED
- Sources: `src/app/api/operations`; `src/lib/operation-dispatch.ts`; `prisma/schema.prisma#model-Operation`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`
- Current state: Web/API requests persist operation and dispatch intent, BullMQ workers perform provider automation and persist evidence, and maintenance/recovery paths reconcile incomplete execution.
- Connections: `FEAT-001`, `API-003`, `BE-002`, `DATA-002`, `JOB-001`, `JOB-002`, `JOB-003`, `JOB-005`, `INT-001`
- Phase 4: Revisioned promo preparation → READY quote → locked selection → unique fresh provider rematch → locked final consent/debit. Changed name/price holds review without substitution. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### FLOW-002 — Hierarchical password reset flow

- State: VERIFIED
- Sources: `src/components/users/ResetPasswordDialog.tsx`; `src/lib/users/password-reset-route.ts`; `src/lib/users/password-reset.ts`; `prisma/schema.prisma#model-User`; `tests/unit/hierarchical-password-reset.test.ts`
- Current state: An authorized UI/API caller resolves an eligible owned target, revalidates ownership near mutation, changes the password timestamp, invalidates prior sessions, and records audit evidence.
- Connections: `FEAT-002`, `FE-001`, `API-001`, `BE-001`, `DATA-001`, `AUTH-001`, `AUTH-004`, `AUTH-005`, `TEST-001`

### FLOW-003 — Credit request, debt, and financial-review flow

- State: VERIFIED
- Sources: `src/app/api/credit-requests`; `src/app/api/admin/credit-requests`; `src/lib/credit-requests`; `src/app/api/admin/financial-review`; `src/lib/financial-review`; `src/lib/refund.ts`
- Current state: An eligible agent-owned user creates one pending credit request with ownership/group snapshots; admin decisions write history and, on approval, a deposit/balance effect plus debt/transaction linkage and handoff evidence. Uncertain provider money outcomes enter financial review, where trusted evidence or explicit manual card verification governs completion, refund, or continued review.
- Connections: `BE-004`, `DATA-002`, `DATA-003`, `AUTH-004`, `INT-004`, `FEAT-005`, `SEC-005`

### FLOW-004 — Points, rewards, Eid, and cash-conversion flow

- State: VERIFIED
- Sources: `src/lib/points`; `src/app/api/points`; `src/app/api/rewards`; `src/app/api/eid-rewards`; `src/app/api/admin/points`; `src/app/api/admin/rewards`; `src/app/api/admin/eid-rewards`
- Current state: Settings and ownership snapshots determine earning; completed operation or credit events create idempotent point ledger records; reversals counter prior entries; reward/Eid redemption changes ledger state; cash conversion atomically creates a negative point entry, balance deposit transaction, and redemption record.
- Connections: `BE-004`, `DATA-003`, `AUTH-004`, `FEAT-004`, `TEST-001`, `TEST-002`

### FLOW-005 — Customer commerce, subscription, payment, and wallet flow

- State: VERIFIED
- Sources: `src/app/api/store`; `src/app/api/mobile/store`; `src/app/api/mobile/subscriptions`; `src/app/api/mobile/wallet`; `src/lib/store-pricing.ts`; `src/lib/store-subscription.ts`; `src/app/api/store/webhooks/stripe/route.ts`; `worker/src/customer-index.ts`
- Current state: Customer/store auth identifies the customer; catalog/address/shipping routes feed orders; subscription selection uses marked-up provider pricing and payment intent/webhook state; the isolated customer queue executes provider work; failed shared flows may credit/refund the customer wallet under separate wallet ledger rules.
- Connections: `BE-005`, `API-009`, `DATA-004`, `AUTH-003`, `JOB-001`, `INT-003`, `FEAT-006`

### FLOW-006 — Announcements, notifications, and operational visibility

- State: VERIFIED
- Sources: `src/app/api/announcement`; `src/app/api/notifications`; `src/app/api/admin/announcement`; `src/app/api/admin/notification-settings`; `src/lib/notification.ts`; `src/lib/credit-requests/notifications.ts`; `src/lib/activity-logger.ts`; `src/app/api/admin/logs`
- Current state: Active announcements and ordered slides feed dashboard content; in-panel notifications support inbox/read state; credit events can create Telegram and manual WhatsApp handoff evidence; activity and Worker/maintenance diagnostics feed admin monitoring with redaction boundaries.
- Connections: `BE-006`, `DATA-003`, `INT-004`, `OPS-004`, `FEAT-016`, `FEAT-017`

### FLOW-007 — Proof-gated reseller renewal

- Hold repair: no post-selection Check/reload/promo changes. Proven pre-payment failure closes local holds; post-final and conflicting evidence stay reviewable. Newly admitted policy-tagged v2 reviews can recover after their worker owner drains; historical unresolved monetary cases require an admin. Sources: `src/lib/maintenance/renewal-hold-maintenance.ts`; `UPD-20261013-011`.

- Precision 2026-10-13: Header-mapped original name/price/currency/control stay on the same saved operation page. After consent, report matching strips only supported display differences; exact duration, offer, amount and currency are rechecked inside finalization. Same-operation proof reuse occurs before testing already-released reservations and creates no second receipt/effect. No added Check/reload/promo replay. Sources: `worker/src/http/HttpClientService.ts`; `worker/src/lib/report-package-identity.ts`; `worker/src/lib/same-day-report-fulfillment.ts`; `UPD-20261013-010`.

- Pre-final selection 2026-10-13: In v2, Add then Sell confirms the selected cart, then both STB fields are prepared; OK/Pay and customer wallet deduction occur only after final consent. START_RENEWAL reserves its account before the quote is published, and selection continues from its saved page. Safe preparation errors/replays do not resend Add/Sell and close without financial review; final mutation markers or sale evidence still require it. Promo apply/remove invalidates the old quote and records the POST barrier before submission. Sources: `worker/src/http-queue-processor.ts`; `worker/src/lib/pre-mutation-renewal-finalization.ts`; `worker/src/lib/promo-quote.ts`; `UPD-20261013-009`.

- Version 2, 2026-10-13: Initial card-paired Check and package load establish the operation page; promo apply/remove posts on that same page. Selection uses the saved card/type/cookies/ViewState/revision and unique offer before Add, without another Check, reload, promo reapply or account failover. Final OK/Pay is marked once; a complete same-account, Cairo-day Sold Report with exactly one unclaimed card/type/full-offer/amount/currency invoice can complete atomically without a contract Check. Missing/multiple/late evidence holds review and never replays Pay. The older baseline/contract description below applies to v1 only. Sources: `worker/src/http-queue-processor.ts`; `worker/src/lib/promo-quote.ts`; `worker/src/lib/same-day-report-fulfillment.ts`; `UPD-20261013-007`.

- Dynamic promo 2026-10-13: Promo POST uses enabled controls from the exact loaded card/type/ViewState form and its actual submit value. Missing/ambiguous/stale form or unchanged/unbound offer fails before a new quote. The v1 path rechecks card/STB and offer before Add; v2 keeps the card-paired page from initial preparation and does not Check or reload after selection. After Sell it posts the same STB in both later receiver fields and retains their verified echo for final OK. The v1 cart and same-invoice Reports/contract gates remain; v2 uses the same-day report rule above. Source: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http-queue-processor.ts`; `UPD-20261013-004`; `UPD-20261013-009`.

- Read-only provider comparison 2026-10-13: Live CISCO preparation and the Dealer-scoped nine-column Sold Report match the known form/grid structure. A Check contract does not prove a sale by the selected Dealer. Exact baseline/new-invoice/contract gates remain; scheduled start and outside account sale conservatively hold for review. Later checkout and production parity are unverified. Source: `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`; `UPD-20261013-003`.

- Smartcard preparation 2026-10-13: Fresh type selection accepts only the observed explicit prefix/value pair and verifies postback selection before serial submission. The second POST omits disabled type/first-serial controls as the browser does, retaining identity checks before/after. Field-length conflicts stop instead of trimming an unverified format. Existing quote/cart/invoice and financial proof fences remain unchanged. The worker may skip the STB lookup using its card-scoped one-hour cache but still posts the STB in both checkout fields; the latter is source evidence, not a live sale observation. Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/package-cache.ts`; `UPD-20261013-002`.

- Runtime smoke 2026-10-12: The temporary real web/queue/Worker/PostgreSQL flow revealed a nonexistent baseline SQL column and missing account identity in HTTP session export. Both are repaired without weakening proof/cache fences. Synthetic promo renewal reached matching Reports/contract invoice completion; live provider compatibility is still unverified. Sources: `worker/src/lib/fulfillment-baseline.ts`; `worker/src/http/HttpClientService.ts`; `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`.

- Package identity 2026-10-12: Immutable quote/revision/key/promo is bound to the observed cart and full/provider serial/type. Pre-mutation controls and STB echoes must exist; the verification worker requires that persisted cart before attributing a new Reports invoice. Source: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http-queue-processor.ts`; `shared/operations/package-quote.ts`; `UPD-20261012-001`. Unknown later layouts remain blocked.

- State: VERIFIED
- Sources: `shared/operations/renewal-fulfillment.ts`; `worker/src/http/sold-packages-report.ts`; `worker/src/lib/fulfillment-baseline.ts`; `worker/src/lib/renewal-fulfillment-correlation.ts`; `worker/src/lib/fulfillment-finalization.ts`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts`; `src/lib/operations/recovery-proof.ts`; `src/lib/financial-review/manual-decisions.ts`; `src/app/api/operations/start-renewal/route.ts`
- Current state: While holding the card and provider-account causal reservations, the Worker captures a complete Sold Report baseline, reloads renewal preparation, records the mutation barrier before final `OK`/Pay, then performs read-only full-report/contract verification. One exact new report Invoice plus the same active-contract Invoice can become composite proof in `ENFORCE`; every other charged/unknown/incomplete/conflicting outcome fails closed to review without automatic refund.
- Retry/recovery: Provider mutations are single-attempt and fenced before/after each stateful POST. `FINAL_PROVIDER_MUTATION_STARTED` and legacy `FINAL_PAY_REQUEST_STARTED` forbid another mutation. Verification-only attempts use deterministic identities; maintenance recreates missing due jobs and advances a stranded latest `MATCHED` crash window. Recovery completes only with the exact durable composite proof; balance-only recovery reviews. Open fulfillment safety issues retain the card reservation and block a later renewal.
- Admin: No-refund closure requires proof or an explicit audited manual renewal confirmation; choosing the action never synthesizes `cardRenewed=true`.
- Rollout: `REVIEW_ONLY` records attempts but cannot auto-complete. `ENFORCE` remains blocked by `RISK-009`.
- Connections: `API-011`, `DATA-010`, `JOB-003`, `FEAT-001`, `FEAT-010`, `FEAT-015`, `IMPACT-008`, `RISK-009`
- Phase 4: Quote conflict retains evidence/reservations in fenced review. Persistent hold-write failure fails the job without cart replay/financial closure; proof barriers unchanged. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

## 11. Authentication and Authorization

### AUTH-001 — Panel web credentials and database-backed JWT sessions

- Web completion 2026-09-08: Actual synthetic Next/AuthJS requests reproduced cookie restoration after sign-out through public login media/session refetches. Middleware now matches dashboard pages only and login mounts an anonymous SessionProvider. Five real HTTP cases pass for login/logout, inactive/deleted/password-changed revocation and lookup outage; public media cannot rotate a JWT. Sources also include `src/middleware.ts`, `src/components/providers/Providers.tsx` and `tests/browser/panel-auth-http.cjs`. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`. Earlier dated results are historical.

- Panel repairs 2026-09-08: Login server entry checks current user before redirect; revoked sessions clear through official POST sign-out once before the form. Database lookup failure is recoverable, not treated as revocation. Transactions/notifications refresh the existing web identity before domain access, preserving the bearer branch. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- Local backlog 2026-09-08: Persisted role/owner/revocation cases pass; malformed panel IDs fail before Prisma; four existing ADMIN exceptions remain. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Operation routes now use getAuthenticatedUser and persisted deletedAt is rejected alongside inactive/reset actors; collection opts into currentUser middleware. Current role and existing ownership exceptions are retained. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `src/lib/auth.ts`; `src/lib/auth.config.ts`; `src/lib/auth-utils.ts#getAuthUser`; `src/lib/auth-utils.ts#getDbAuthenticatedUser`
- Current state: NextAuth credentials authorize active panel users with bcrypt-backed hashes; JWT sessions are resolved against current database account state and `passwordChangedAt` before protected behavior.
- Connections: `DATA-001`, `API-002`, `FEAT-002`

### AUTH-002 — Panel mobile bearer tokens

- State: VERIFIED
- Sources: `src/lib/mobile-auth.ts`; `src/lib/auth-utils.ts#getAuthenticatedUser`; `src/app/api/mobile/login/route.ts`
- Current state: Mobile panel bearer tokens share the server secret boundary and are re-resolved through the current database user, including token issue time versus password-change time.
- Connections: `AUTH-001`, `API-002`, `FEAT-002`

### AUTH-003 — Customer and store authentication boundary

- State: VERIFIED
- Sources: `src/lib/customer-auth.ts`; `src/lib/store-auth.ts`; `src/app/api/mobile/auth`; `src/app/api/store/auth`
- Current state: Customer registration/login/verification/reset and store auth are separate from panel-role authentication; inspect their own guards and lifecycle before changing shared auth concepts.
- Connections: `DATA-004`, `API-004`, `FEAT-006`

### AUTH-004 — Effective permission evaluation

- State: VERIFIED
- Sources: `src/lib/permissions/catalog.ts`; `src/lib/permissions/evaluator.ts#evaluatePermission`; `src/lib/permissions/guards.ts`; `prisma/schema.prisma#model-PermissionAuditEvent`
- Current state: Evaluation fails inactive/deleted accounts, applies applicable global blocks, then account overrides, role settings, and catalog defaults; server guards remain authoritative over UI visibility.
- Connections: `DATA-003`, `API-002`, `FEAT-002`, `FEAT-007`

### AUTH-005 — Hierarchical resource ownership

- State: VERIFIED
- Sources: `src/lib/users/ownership.ts`; `src/lib/users/ownership-transfer.ts`; `src/lib/agents/assignment-transfer.ts`; `src/lib/admin/users-ownership-filter.ts`; `prisma/schema.prisma#model-AgentAssignment`
- Current state: Manager links and active agent assignments drive direct ownership, transfers, filtering, and sensitive actions; ambiguous or stale ownership requires explicit conflict handling in high-risk paths.
- Connections: `DATA-001`, `FEAT-002`, `FEAT-003`, `RISK-003`

### AUTH-006 — Exact login identity, cooldown, and abuse controls

- Panel repairs 2026-09-08: Failure increment/TTL is atomic using Redis Lua; memory fallback updates synchronously per process. Status reads no longer delete a concurrently replaced record. Thirty concurrent attempts and cooldown TTL/clear passed on a new isolated Redis process; fallback remains non-distributed. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/lib/auth.ts`; `src/lib/auth/login-attempts.ts`; `src/lib/auth/login-diagnostics.ts`; `src/app/api/auth/login-attempt-status/route.ts`; `tests/unit/login-attempt-guidance.test.ts`; `tests/unit/login-diagnostics-redaction.test.ts`
- Current state: Login trims only outer whitespace and performs exact case-sensitive username/email lookup. Three failed attempts inside 120 seconds trigger a 120-second cooldown keyed by a digest of submitted identity plus request context; a separate IP abuse key limits 60 attempts per 60 seconds, and public feedback does not reveal account existence or status.
- Connections: `AUTH-001`, `API-008`, `API-010`, `SEC-002`, `SEC-003`, `FEAT-008`

### AUTH-007 — Permission catalog and protected-admin controls

- State: VERIFIED
- Sources: `src/lib/permissions/catalog.ts`; `src/lib/permissions/evaluator.ts`; `src/lib/permissions/guards.ts`; `src/lib/permissions/protected-admin.ts`; `src/lib/permissions/audit.ts`
- Current state: Sixteen catalog capabilities cover permission management, user creation/edit/activation/delete/reset, balance add/withdraw, agent transfer, announcements, points settings, rewards, credit approval, financial review, and admin settings. Evaluation order is account state, applicable global block, user override, role setting, then catalog default; protected-admin checks prevent lockout-sensitive changes and audit records preserve changes.
- Connections: `AUTH-004`, `DATA-003`, `API-007`, `FEAT-007`, `SEC-001`, `RISK-003`

### AUTH-008 — Customer, store, and panel-mobile token lifecycles

- State: VERIFIED
- Sources: `src/lib/customer-auth.ts`; `src/lib/store-auth.ts`; `src/lib/mobile-auth.ts`; `src/app/api/mobile/auth`; `src/app/api/store/auth`
- Current state: Customer access tokens default to 15 minutes, refresh tokens to 30 days, OTPs are six digits for 10 minutes, and reset tokens expire after one hour. Store tokens default to 30 days. Panel-mobile tokens default to seven days and remain tied to current panel user/password-change state through shared auth utilities.
- Boundary: Secret lookup has separate customer/store names with deliberate fallbacks; token types and guards are not interchangeable even though they share JWT libraries.
- Connections: `AUTH-002`, `AUTH-003`, `API-009`, `DATA-001`, `DATA-004`, `ENV-005`, `FEAT-006`

### AUTH-009 — Current ownership resolution precedence

- State: VERIFIED
- Sources: `src/lib/users/ownership.ts`; `src/lib/admin/users-ownership-filter.ts`; `src/lib/users/ownership-transfer.ts`; `src/lib/agents/assignment-transfer.ts`
- Current state: Current `ManagerUser` links are evaluated first, active `AgentAssignment` rows define agent ownership, and a legacy active admin creator fallback applies only where current assignment/link evidence allows it; mixed current owners produce explicit conflicts instead of silent selection.
- Connections: `AUTH-005`, `DATA-001`, `FEAT-002`, `FEAT-003`, `FEAT-005`, `IMPACT-002`, `RISK-003`

## 12. External Integrations

### JOB-001 — Reseller and customer BullMQ queues

- State: VERIFIED
- Sources: `src/lib/queue.ts`; `worker/src/index.ts`; `worker/src/customer-index.ts`
- Current state: `operations` and `customer-operations` queues use bounded retry/backoff and stable operation/type job IDs; reseller work has higher priority.
- Connections: `APP-003`, `JOB-002`, `JOB-003`, `DATA-002`

### JOB-002 — Durable operation dispatch outbox

- Local backlog 2026-09-08: Five delivery attempts at 5/30/120/600s; claim/ack/failure compare attempt generation. Stable final identity and Pay fence preserved. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Watchdog retries all admitted types; bounded exhaustion marks current pending promo FAILED without overwriting newer quotes. Final-pay recovery/identities are unchanged. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `src/lib/operation-dispatch.ts`; `prisma/schema.prisma#model-OperationDispatch`; `prisma/migrations/20260513002000_add_operation_dispatch_outbox`
- Current state: Operation dispatch intent is persisted and retried before/around BullMQ handoff; duplicate job IDs are treated as dispatched, and exhausted confirm-purchase dispatch enters recovery.
- Connections: `API-003`, `DATA-002`, `JOB-001`, `JOB-005`, `FEAT-001`
- Phase 2 compatibility: new schema identity is operation/job/revision; shared and mobile compound lookups explicitly use revision 0. T016 activates revisioned preparation; old-consumer cutover remains a release duty. Source: `src/lib/mobile-renewal-payment-finalization.ts`; `prisma/migrations/20260907100000_audit_dispatch_claim_identity/migration.sql`.
- Phase 4: actionRevision active for APPLY_PROMO only; semantic JSONB equality preserves values/array order and normalizes omitted/explicit zero. Final-payment job IDs remain stable. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### JOB-003 — HTTP operation worker

- Administrative release: operation context installs request admission/observation interceptors on clients, including recreated session transports. Old jobs stop before HTTP; late success is observation only. Sources: `worker/src/http-queue-processor.ts`; `worker/src/http/HttpClientService.ts`; `worker/tests/admin-card-release-http.test.ts`; `UPD-20261013-012`.

- Pre-final selection 2026-10-13: v2 START_RENEWAL converts the queue lock into an operation account reservation and fenced lease before provider reads/quote publication. Promo apply/remove marks its POST once and cannot replay an uncertain revision; Add/Sell/STB preparation failures close only when final-payment and sale evidence are absent. Sources: `worker/src/http-queue-processor.ts`; `worker/src/lib/promo-quote.ts`; `worker/src/lib/pre-mutation-renewal-finalization.ts`; `UPD-20261013-009`.

- Capacity supplement 2026-10-12: Shared panel factory prepares concurrency 4, DB pool 2, five-minute drain and an explicit 20-process example; global queue and provider limits remain unchanged. Operation/keepalive HTTP clients bind account identity before cache export/import. Sources: `deployment/panel-workers.cjs`; `deployment/panel-workers.env.example`; `worker/src/http-queue-processor.ts`; `worker/src/lib/session-keepalive.ts`; `UPD-20261012-003`.

- Extended quality 2026-09-08: Regular worker exception boundaries narrow unknown rejections safely; no new financial authority or provider mutation/retry policy. Existing typed BullMQ/ioredis boundary preserves the connection. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Review repair 2026-09-08: START_RENEWAL parks its exact legacy owner after all provider/session work and before exposing packages; different-worker continuation requires this marker and an execution lease. Only fenced, contradiction-free pre-cart quote failure closes safely. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `worker/src/index.ts`; `worker/src/http-queue-processor.ts`; `worker/src/pool`; `worker/src/lib/final-pay-evidence.ts`
- Current state: Workers allocate/lock beIN accounts, execute the HTTP flow, persist evidence/results, notify admins on failed jobs, and close clients/connections on shutdown.
- Connections: `APP-004`, `DATA-002`, `INT-001`, `FEAT-001`
- Phase 4: Exact card/type reload for apply/remove, unverified fallback rejected, fresh package must uniquely match name/price. Publication is fenced; promo errors bypass financial closure. Explicit null means removal. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### JOB-004 — beIN session keepalive

- State: VERIFIED
- Sources: `worker/src/keepalive.ts`; `worker/src/lib/session-keepalive.ts`; `worker/src/lib/session-cache.ts`
- Current state: The standalone keepalive process refreshes sessions at a bounded configured interval, skips accounts in use, and stores safe metrics/coordination in Redis.
- Connections: `APP-005`, `INT-001`, `ENV-002`

### JOB-005 — Maintenance, timeout, and recovery

- Administrative release: bounded resume handles saved draining decisions and retryable owner-lock cleanup. Stopped operations cannot re-enter verification, recovery, awards, completion effects or reservation refresh. Sources: `src/lib/maintenance/operation-maintenance-runner.ts`; `shared/operations/admin-card-release.ts`; `UPD-20261013-012`.

- Hold repair: a bounded rotating scan repairs positively proven terminal leftovers and only policy-tagged new v2 reviews. It rechecks evidence and Redis execution/legacy ownership inside the finalizer; unknown, duplicate/Stripe and historical unresolved review cases remain held. Sources: `src/lib/maintenance/renewal-hold-maintenance.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`; `UPD-20261013-011`.

- Extended quality 2026-09-08: Maintenance has fresh per-cycle tokens, one active local cycle and signal drain before closing dependencies; cross-process safety still requires row fences and idempotency. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Effect capture/replay is durable, bounded and atomic; points reuse captured runs. Redis atomic release preserves successor lease; no historical backfill. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/scripts/operation-maintenance.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`; `src/lib/maintenance/operation-spend-award-run-maintenance.ts`; `src/lib/operations/recovery.ts`; `src/app/api/cron`
- Current state: Maintenance and cron surfaces cover stuck/timeout operations, dispatch, effective state, recovery, and bounded stale award-run finalization.
- Connections: `APP-006`, `API-003`, `DATA-002`, `JOB-002`, `RISK-001`

### INT-001 — beIN HTTP/provider automation

- Precision 2026-10-13: Available packages require unique Package Name / Full Price headers and valid same-row checkbox/name/one-price cells, before/after arbitrary promo. Reports accepts Add/Renewal prefixes, only redundant matching duration suffixes and event Full Payment spelling differences; it never uses fuzzy words or cent rounding. New diagnostics omit private identifiers and raw HTML. Sources: `worker/src/http/HttpClientService.ts`; `worker/src/lib/report-package-identity.ts`; `shared/operations/provider-price.ts`; `UPD-20261013-010`.

- Pre-final selection 2026-10-13: The Add cart still requires its observed strict table; later Sell/STB confirmation accepts a compact table only with one exact package, amount/currency, displayed total, card/type and accepted promo identity. Structural/parser reasons are recorded without page HTML; commercial mismatch still blocks. Promo quotes use the response's current package price/currency. The reported live Sell response was not captured, so compatibility is NOT_VERIFIED. Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/lib/promo-quote.ts`; `UPD-20261013-009`.

- CISCO serial clarification 2026-10-13: The selected provider input is prefilled with `7` and has a total maxlength of nine; its complete value, not only manually typed digits, is sent in native and Worker Load POSTs. The CISCO Worker derives it from the first nine digits of the ten-digit customer card. The previous approval request based on an incomplete-card interpretation is withdrawn. Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/tests/smartcard-loading.test.ts`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `UPD-20261013-005`.

- Dynamic promo 2026-10-13: The signed-in pre-Load form fields and prior authorized two-step CISCO Load request trace inform the Worker form-bound promo submission. The actual live promo POST/response was not captured because browser approval rejected Load. Explicit card-labelled STB extraction replaces the former arbitrary-number fallback; known direct identifier logs in HTTP/cache/queue paths were removed. Source: `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`; `UPD-20261013-004`.

- Read-only comparison 2026-10-13: Signed-in report Apply used the live Dealer/All/date criteria and returned `ContentPlaceHolder1_GridView1` with nine expected headers and one dealer group. Check and this report are separate authorities. The actual panel HTTP report adapter, post-sale screens and IRDETO continuation remain unverified live. `checkCard`'s unanchored 15-digit STB fallback and identifier-rich logs merit a separate safety/privacy repair. Source: `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`; `UPD-20261013-003`.

- Smartcard labels 2026-10-13: Original and current browser receipts confirm `Smartcard: CISCO` / `8` and `Smartcard: Irdeto` / `1`. One shared resolver enforces these identities in loading and cart reads; duplicate/unknown controls fail closed. Current HTTP/DOM confirms CISCO nine-character serial submission/echo and IRDETO maxlength 10. IRDETO's actual input mapping remains NOT_VERIFIED because no serial was submitted for that type. Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/tests/fixtures/smartcard-observed.ts`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `UPD-20261013-002`.

- Provider browser 2026-10-13: The existing report parser optionally applies fresh WebForms date controls and All items while preserving Dealer/full-scan guards; financial default criteria are unchanged. A dedicated account-bound HTTP client restricts requests to report/login, uses cancellation and allows one fresh login, with explicit CAPTCHA/incomplete errors. Sources: `worker/src/http/sold-packages-report.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/lib/provider-report-reader.ts`; `UPD-20261013-001`.

- Package guard 2026-10-12: `worker/src/http/renewal-purchase-guard.ts` uses the inspected cart grid/footer; `worker/src/http/sold-packages-report.ts` recognizes actual criteria and explicit rowspans. Promo echo alone cannot certify an unchanged quote. `worker/src/lib/session-cache.ts` keeps prepared proof only in fenced operation sessions. Later-stage and real promo response compatibility remain open. Source: `specs/036-audit-remediation/evidence/package-identity-repair.md`; `UPD-20261012-001`.

- Extended quality 2026-09-08: HTTP failure handling no longer throws on null/non-Error rejections; provider outcome classifications and original settlement/cart evidence deferrals are unchanged. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `worker/src/http/HttpClientService.ts`; `worker/src/http-queue-processor.ts`; `worker/src/utils`; `worker/src/pool`
- Current state: HTTP clients, cookies/sessions, proxy/account selection, CAPTCHA/TOTP helpers, selectors, retries, and provider evidence implement beIN-side automation. Credentials and runtime responses are excluded from memory.
- Connections: `JOB-003`, `JOB-004`, `ENV-001`, `RISK-001`

### INT-002 — Store payments and customer notifications

- State: VERIFIED
- Sources: `package.json`; `src/app/api/store/webhooks/stripe/route.ts`; `src/app/api/mobile/wallet`; `src/lib/notification.ts`; `src/lib/credit-requests/telegram.ts`; `src/lib/credit-requests/whatsapp-handoff.ts`
- Current state: Stripe-backed store/payment routes and Telegram/WhatsApp-oriented notification/handoff modules exist; inspect signatures, idempotency, secrets, and environment separation before changing them.
- Connections: `API-004`, `DATA-004`, `ENV-001`, `FEAT-005`, `FEAT-006`

### JOB-006 — beIN account pool, locking, and rate control

- Review repair 2026-09-08: Optional handoffReady marker is explicit permission to transfer same-operation legacy ownership; raw-owner CAS and remaining TTL reject active/foreign/stale contenders. Real Redis exercised the actual reservation orchestrator. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `worker/src/pool/account-pool-manager.ts`; `worker/src/pool/account-locking.ts`; `worker/src/pool/account-queue-manager.ts`; `worker/src/pool/rate-limiter.ts`; `worker/src/pool/health-checker.ts`; `prisma/schema.prisma#model-BeinAccount`
- Current state: Workers select eligible active accounts, isolate `customerOnly` traffic, serialize concurrent use with Redis locks, queue when capacity is exhausted, and retain rate limits and configured auto-disable. Provider-account cooldowns are disabled; old DB/Redis values are ignored. Account lock TTL is five minutes and route/session evidence remains account-aware.
- Lifecycle repair 2026-10-13: reservation acquisition/transfer locks and rechecks the operation; hard-terminal states cannot reacquire/renew/use it. Completed signal checks release in the completion transaction. Bounded maintenance releases eligible terminal leftovers after Redis execution drains; uncertain review retains causal ownership. Sources: `worker/src/lib/provider-account-reservation.ts`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/provider-reservation-maintenance.ts`; `UPD-20261013-006`.
- Connections: `JOB-003`, `JOB-007`, `INT-001`, `DATA-002`, `FEAT-014`

### JOB-007 — Redis coordination, session, and cache contract

- Report browser: `bein:report-browser:*` keys hold five-minute active admission, 30-second pacing, ten-minute pending metadata and five-minute terminal results. Lua execution/terminal tokens prevent duplicate reads or stale completion. Polling reads cache only. Sources: `shared/reports/bein-provider-store.ts`; `tests/integration/provider-report-redis.test.ts`; `UPD-20261013-001`.

- State: VERIFIED
- Sources: `src/lib/redis.ts`; `src/lib/queue.ts`; `worker/src/lib/redis.ts`; `worker/src/lib/session-cache.ts`; `worker/src/lib/package-cache.ts`; `worker/src/pool/account-locking.ts`; `docs/current-project-prd.md#Redis-Keys-And-Caches`
- Current state: Redis stores BullMQ state; shared beIN sessions keyed by account and route; operation sessions; login, keepalive, account, and recovery locks; package and STB caches; operation heartbeats; rate-limit windows; and maintenance health. Package cache is 10 minutes and STB cache one hour; feature code owns other TTLs.
- Boundary: Key names, TTLs, and route scoping are cross-process contracts; renaming without migration/compatibility can split locks or reuse the wrong provider session.
- Connections: `APP-003`, `JOB-001`, `JOB-004`, `JOB-005`, `JOB-006`, `INT-001`, `IMPACT-005`

### JOB-008 — Worker job and outcome catalog

- Read-only exception 2026-10-13: `READ_PROVIDER_REPORT` carries only requestId, uses priority 10/one attempt and branches in `worker/src/index.ts` before operation dispatch. It uses the selected eligible account's lock, heartbeat, reservations and execution-lease exclusion, with five-minute total and one-minute active deadlines. No alternative account, business-operation record, balance/status write or automatic replay. Sources: `worker/src/index.ts`; `worker/src/lib/provider-report-reader.ts`; `src/app/api/admin/reports/bein-provider/route.ts`; `UPD-20261013-001`.

- State: VERIFIED
- Sources: `src/lib/queue.ts`; `worker/src/http-queue-processor.ts`; `docs/current-project-prd.md#Worker-Architecture`; `docs/current-project-prd.md#Queue-And-Dispatch-Contract`
- Current state: Job types are `START_RENEWAL`, `COMPLETE_PURCHASE`, `CONFIRM_PURCHASE`, `CANCEL_CONFIRM`, `APPLY_PROMO`, `SIGNAL_REFRESH`, `SIGNAL_CHECK`, `SIGNAL_ACTIVATE`, `START_INSTALLMENT`, `CONFIRM_INSTALLMENT`, and `CHECK_ACCOUNT_BALANCE`. Worker outcomes update operation phases/status, provider/account evidence, transactions/refunds, spend ledger, points, and review state.
- Retry contract: Reseller jobs default to three attempts with exponential 2-second backoff and stable `${type}--${operationId}` IDs; customer jobs use three attempts, 3-second backoff, lower priority, and `customer--${type}--${operationId}` IDs.
- Connections: `JOB-001`, `JOB-002`, `JOB-003`, `DATA-002`, `FEAT-010`, `FEAT-011`, `FEAT-012`

### INT-003 — Stripe payment intent and webhook integration

- State: VERIFIED
- Sources: `package.json`; `src/lib/store-pricing.ts`; `src/app/api/mobile/subscriptions/create-payment-intent/route.ts`; `src/app/api/store/subscriptions/[id]/confirm-payment/route.ts`; `src/app/api/store/webhooks/stripe/route.ts`; `prisma/schema.prisma#model-Payment`
- Current state: Store subscription/order payment flows use Stripe secret configuration, currency conversion for Saudi Arabia/Egypt, durable `Payment` state, payment-intent identifiers, and webhook verification through the Stripe webhook secret.
- Boundary: Payment idempotency, signature verification, amount/currency conversion, subscription linkage, and refund state are security/financial boundaries; no secret values belong in this ledger.
- Connections: `BE-005`, `API-009`, `DATA-004`, `FLOW-005`, `ENV-005`, `RISK-001`

### INT-004 — Telegram and manual WhatsApp handoff integration

- State: VERIFIED
- Sources: `src/lib/credit-requests/telegram.ts`; `src/lib/credit-requests/notifications.ts`; `src/lib/credit-requests/whatsapp-handoff.ts`; `src/app/api/admin/notification-settings`; `prisma/schema.prisma#model-WhatsAppNotificationLog`; `prisma/schema.prisma#model-WhatsAppHandoffSnapshot`
- Current state: Credit request creation/escalation can call Telegram Bot API when configured; WhatsApp behavior creates a destination/message snapshot and `wa.me` or group handoff rather than silently claiming a direct provider send. Delivery attempts and settings are recorded separately.
- Connections: `FLOW-003`, `FLOW-006`, `DATA-003`, `FEAT-005`, `ENV-006`, `SEC-002`

### INT-005 — CAPTCHA, TOTP, proxy, and provider-route helpers

- State: VERIFIED
- Sources: `worker/src/utils/captcha-solver.ts`; `worker/src/utils/totp-generator.ts`; `worker/src/utils/proxy-manager.ts`; `worker/src/lib/bein-connection-mode.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http-queue-processor.ts`
- Current state: Worker automation supports manual/automatic CAPTCHA resolution, TOTP generation, assigned-proxy or direct-server routing, proxy agents, route snapshots, cookie/ViewState preservation, retries, and provider selector settings.
- Boundary: CAPTCHA answers, TOTP secrets, proxy credentials, cookies, and provider responses are sensitive runtime data and are excluded from memory.
- Connections: `INT-001`, `JOB-003`, `JOB-006`, `JOB-007`, `ENV-005`, `SEC-004`, `RISK-007`

## 13. Environment Variables

### ENV-001 — Core server configuration names

- State: VERIFIED
- Sources: `.env.example`; `worker/.env.example`; `src/lib/config.ts`; `prisma.config.ts`
- Current state: Core names include `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `BEIN_USERNAME`, `BEIN_PASSWORD`, `NODE_ENV`, and `LOG_LEVEL`. Values are deliberately not recorded.
- Boundary: Database, Redis, auth, provider, and payment secrets remain server/Worker-only; inspect code for additional domain names when changing a feature.

### ENV-002 — Worker and maintenance process configuration

- Prepared candidate 2026-10-12: `deployment/panel-workers.env.example` records the reviewed count; it must be exported before loading PM2. Worker pool/concurrency/drain settings live in the shared factory. This is a local test target and does not attest to any running production count. Sources: `deployment/panel-workers.cjs`; `docs/deployment/audit-remediation-release.md`; `UPD-20261012-003`.

- Local backlog 2026-09-08: PANEL_WORKER_COUNT mandatory 1..32 in both PM2 profiles; actual production count remains UNKNOWN. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `ecosystem.config.js`; `worker/src/index.ts`; `worker/src/keepalive.ts`; `src/lib/maintenance/operation-spend-award-run-maintenance.ts`
- Current state: PM2 supplies Worker identity/concurrency/rate and automation timeout settings; keepalive and maintenance also read database/environment settings with bounded defaults.
- Connections: `APP-004`, `APP-005`, `APP-006`, `JOB-003`, `JOB-004`, `JOB-005`

### ENV-003 — Web response and mobile API headers

- State: VERIFIED
- Sources: `next.config.ts#headers`; `package.json#browserslist`
- Current state: Mobile API routes receive configured CORS headers, images receive bounded cache headers, and most other web responses are forced no-store; target browser support is declared in `package.json`.
- Connections: `APP-001`, `API-001`, `OPS-001`

### ENV-004 — Version-controlled project-memory artifacts

- State: VERIFIED
- Sources: `.gitignore`; `.agents/skills/web-project-memory/SKILL.md`; `.agents/skills/web-project-memory/agents/openai.yaml`; `docs/PROJECT_GUIDE.md`
- Current state: Narrow ignore exceptions expose only the version-controlled `web-project-memory` source package and project guide while adjacent local agent and documentation artifacts remain ignored; the personal copy is installed separately and checked for byte parity.
- Connections: `DEC-001`, `WORK-001`, `TEST-004`

### ENV-005 — Complete discovered environment-name inventory

- State: VERIFIED
- Sources: `.env.example`; `worker/.env.example`; `src`; `worker/src`; `ecosystem.config.js`; `worker/ecosystem.config.js`; `prisma.config.ts`
- Data/auth/runtime names: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `NEXTAUTH_URL`, `CUSTOMER_JWT_SECRET`, `CUSTOMER_REFRESH_SECRET`, `STORE_JWT_SECRET`, `NODE_ENV`, `PORT`, `LOG_LEVEL`, `BCRYPT_ROUNDS`, `SESSION_MAX_AGE`, `CRON_SECRET`.
- Provider/crypto/integration names: `BEIN_USERNAME`, `BEIN_PASSWORD`, `BEIN_TOTP_SECRET`, `BEIN_ENCRYPTION_KEY`, `BEIN_ALLOW_PLAINTEXT_CREDENTIALS`, `CAPTCHA_2CAPTCHA_KEY`, `CAPTCHA_TIMEOUT`, `SESSION_TIMEOUT_MINUTES`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TELEGRAM_TIMEOUT_MS`.
- Worker/database/proxy names: `WORKER_ID`, `WORKER_CONCURRENCY`, `WORKER_RATE_LIMIT`, `CUSTOMER_WORKER_CONCURRENCY`, `CUSTOMER_WORKER_RATE_LIMIT`, `USE_HTTP_CLIENT`, `BROWSER_IDLE_TIMEOUT`, `SESSION_CLEANUP_INTERVAL`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT`, `DB_POOL_CONNECTION_TIMEOUT`, `PROXY_ENABLED`, `PROXY_HOST`, `PROXY_PORT`, `PROXY_USERNAME`, `PROXY_PASSWORD`, `WORKER_ALLOW_INSECURE_PROXY_TLS`; customer worker code also sets `NODE_TLS_REJECT_UNAUTHORIZED`.
- Maintenance names: `MAINTENANCE_STALE_LIMIT`, `MAINTENANCE_MAX_DISPATCH_ATTEMPTS`, `MAINTENANCE_AWARD_RUN_LIMIT`, `MAINTENANCE_AWARD_RUN_STALE_MS`, `MAINTENANCE_INTERVAL_MS`.
- Boundary: This is names-only discovery; required/optional status and safe defaults are feature-specific. `.env.example` files cover only a subset, recorded in `RISK-005`.
- Connections: `ENV-001`, `ENV-002`, `AUTH-008`, `JOB-003`, `JOB-005`, `INT-003`, `INT-005`, `RISK-005`, `RISK-007`

### ENV-006 — Database-backed settings registry

- Retired 2026-10-13: `pool_cooldown_after_failures` and `pool_cooldown_duration_seconds` no longer control any Worker, admission or UI path; stored values need no deletion. Sources: `worker/src/pool/account-pool-manager.ts`; `src/app/api/admin/bein-config/route.ts`; `scripts/seed-pool-settings.ts`; `UPD-20261013-006`.

- State: VERIFIED
- Sources: `prisma/schema.prisma#model-Setting`; `src/app/api/settings/route.ts`; `src/app/api/admin/bein-config/route.ts`; `src/lib/maintenance/effective-status.ts`; `src/lib/points/settings.ts`; `docs/current-project-prd.md#Settings-Environment-And-Secrets-Contract`
- Current state: Durable setting keys include operation prices; beIN login/renew/check/signal/installment URLs and selectors; Worker session/retry/headless/keepalive options; `maintenance_mode`, message and pause; `bein_connection_mode`; login-failure threshold; installment development mode; sidebar visibility flags; announcement/store/notification settings; and point-program settings in dedicated models.
- Boundary: Secrets must stay encrypted or in server configuration even when a settings UI manages adjacent non-secret values.
- Connections: `BE-006`, `FEAT-004`, `FEAT-014`, `FEAT-016`, `FEAT-017`, `SEC-004`

## 14. Security

### SEC-001 — Server-enforced identity and secret boundaries

- State: VERIFIED
- Sources: `src/lib/auth.ts`; `src/lib/auth-utils.ts`; `src/lib/permissions/guards.ts`; `.env.example`; `worker/.env.example`
- Current state: Protected behavior resolves current database identity and server-side permissions; environment examples define names while credential, token, session, provider, database, and payment values stay outside memory and client bundles.
- Connections: `AUTH-001`, `AUTH-002`, `AUTH-003`, `AUTH-004`, `ENV-001`, `API-002`, `RISK-001`

### SEC-002 — Audit, diagnostic, and redaction boundary

- Hold repair: new diagnostics expose operation/stage/decision, fixed reasons and resolution/release counts only. `hold` projects allowlisted causes/issue types/stages/update times; ordinary owners receive no admin review URL or provider session material. Sources: `shared/operations/renewal-hold.ts`; `shared/operations/renewal-pre-payment.ts`; `UPD-20261013-011`.

- Local backlog 2026-09-08: Maintenance logs omit raw provider/connection exceptions; preflight/effect health uses aggregate metadata. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/lib/activity-logger.ts`; `src/lib/activity-log-redaction.ts`; `src/lib/auth/login-diagnostics.ts`; `src/lib/operation-detail-audit.ts`
- Current state: Activity, login, and operation diagnostics have dedicated evidence and redaction paths; any new field requires feature-specific privacy review before logging.
- Connections: `OPS-004`, `AUTH-001`, `DATA-003`, `TEST-001`

### SEC-003 — Validation, throttling, and public error controls

- Provider browser: Every request requires ADMIN; dates are strict/inclusive/max31days. Only metadata/allowlisted rows and stable error codes leave the API. Per-account admission/pacing and exact-account lock/lease checks protect provider sessions. Sources: `shared/reports`; `worker/src/lib/provider-report-reader.ts`; `tests/unit/provider-report-api.test.ts`; `UPD-20261013-001`.

- State: VERIFIED
- Sources: `src/lib/validators.ts`; `src/lib/api-response.ts`; `src/lib/api-middleware.ts`; `src/lib/rate-limiter.ts`; `src/lib/auth/login-attempts.ts`; `src/lib/auth/login-diagnostics.ts`
- Current state: Zod input validation, server-side auth/role/permission checks, per-domain Redis rate limits with fallback, login cooldown/abuse controls, generic public auth failures, and production-safe error envelopes reduce malformed-input, enumeration, and burst risks.
- Connections: `BE-003`, `API-010`, `AUTH-006`, `FEAT-002`, `FEAT-008`, `TEST-001`

### SEC-004 — Credential encryption and log-secret exclusion

- State: VERIFIED
- Sources: `src/lib/crypto.ts`; `worker/src/lib/crypto.ts`; `src/lib/activity-log-redaction.ts`; `src/lib/auth/login-diagnostics.ts`; `src/lib/operation-detail-audit.ts`; `scripts/backfill-credential-encryption.ts`; `scripts/encrypt-bein-passwords.ts`
- Current state: beIN credential storage supports encryption through `BEIN_ENCRYPTION_KEY`, plaintext fallback is an explicit compatibility flag, migration scripts backfill encrypted credentials, and redaction removes password/hash/token/TOTP/session/cookie/authorization/provider-credential fields from diagnostic surfaces.
- Connections: `ENV-005`, `INT-001`, `INT-005`, `OPS-006`, `RISK-005`

### SEC-005 — Financial integrity, idempotency, and fail-safe review

- Explicit override: ADMIN may waive operational blockers despite unresolved evidence after risk acknowledgement. This does not authorize financial completion/refund or prove old non-execution; SQL fences retain that distinction. Other cards/new attempts are outside the saved scope. Sources: `shared/operations/admin-card-release.ts`; `prisma/migrations/20261013190000_admin_card_release/migration.sql`; `UPD-20261013-012`.

- Local backlog 2026-09-08: Legacy receipt invoice claims and immutable decisions preserve canonical deduction/refund vetoes; unknown installment/legacy refunds stay held. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/lib/operation-safety.ts`; `src/lib/refund.ts`; `worker/src/lib/final-pay-evidence.ts`; `src/lib/financial-review`; `src/lib/bein-spend-ledger.ts`; `prisma/migrations/20260216193000_add_review_required_and_financial_guards/migration.sql`; `prisma/migrations/20260513000000_add_user_balance_non_negative_check/migration.sql`
- Current state: Non-negative balance and unique deduct/refund guards, idempotent dispatch/ledger keys, evidence-qualified provider spend, final-pay phase tracking, ownership revalidation, and `REVIEW_REQUIRED` prevent uncertain outcomes from becoming automatic completion or refund.
- Connections: `DATA-002`, `DATA-009`, `FLOW-001`, `FLOW-003`, `FEAT-001`, `FEAT-004`, `FEAT-005`, `RISK-001`

### SEC-006 — Cross-origin and transport configuration boundary

- State: VERIFIED
- Sources: `next.config.ts`; `worker/src/customer-index.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/utils/proxy-manager.ts`
- Current state: `/api/mobile/:path*` receives wildcard origin CORS with broad common methods/headers; customer Worker startup globally disables Node TLS verification for its proxy path, while HTTP client code also exposes an explicit insecure-proxy TLS flag.
- Boundary: Any deployment or hardening change must verify actual mobile origins, proxy certificate behavior, Stripe/auth traffic isolation, and whether TLS bypass can be narrowed before altering compatibility.
- Connections: `API-009`, `ENV-003`, `ENV-005`, `INT-003`, `INT-005`, `RISK-007`

## 15. Testing and Quality

### TEST-001 — Fast unit and source-contract suites

- Administrative release: 903 root passes, 490 Worker passes/five native Redis skips and 92 mocked review-browser cases; actual Prisma/PGlite migration and archive rollback plus Axios adapter late-response tests. Root/Worker types/builds and scoped lint pass. Native service races/full migration provenance remain unverified; full lint has unrelated baseline errors. Sources: `tests/unit/admin-card-release.test.ts`; `tests/unit/admin-card-release-api.test.ts`; `worker/tests/admin-card-release-http.test.ts`; `docs/PROJECT_GUIDE.md`; `UPD-20261013-012`.

- Account lifecycle 2026-10-13: 872 distinct root cases pass, including the separate successful rerun of the filesystem-blocked temporary-Git test. Worker suite: 347 pass / five Redis-dependent skips. Both TypeScript checks and scoped lint pass; one existing unused-import warning remains. Seven lifecycle tests first reproduce late-acquisition/renewal defects, then pass. Sources: `tests/unit/provider-reservation-maintenance.test.ts`; `tests/unit/account-cooldown-removal.test.ts`; `worker/tests/provider-reservation-lifecycle.test.ts`; `worker/tests/account-cooldown-removal.test.ts`; `UPD-20261013-006`.

- Provider browser 2026-10-13: Current full root gate passes 855 cases / 106 files without skips/failures; nine report API/auth/metadata cases included. Source: `specs/036-audit-remediation/evidence/provider-report-browser-20261013.md`; `UPD-20261013-001`.

- Localization/capacity 2026-10-12: Final root gate passes 844 cases/105 files, no failures/skips. Worker suite passes 293 including native Redis tests, without skips. The current renewal browser suite passes 29 scenarios; installment and provider-export suites pass 40 and 15. Sources: `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`. Earlier counts remain historical.

- Cooldown 2026-10-12: Current full unit gate passes 843 cases/105 files, zero skips/failures, including 14 cooldown cases. Ten mocked browser scenarios pass; Worker tests pass 287 with five Redis skips. Root/Worker types, schema parity and focused lint pass. PGlite executes the actual additive migration against a synthetic table; it does not prove a full-schema native DB upgrade or multi-worker races. Source: `specs/036-audit-remediation/audit-register.md#supplemental-card-cooldown--2026-10-12`; `UPD-20261012-002`.

- Web completion 2026-09-08: Final full unit gate passes 826 cases across 103 files with no skips/TODO; focused auth/list rerun passes 28. This does not close database/provider/production gates. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`. Earlier dated results are historical.

- Extended quality 2026-09-08: 802 distinct unit cases passed (801 full-suite plus one later PM2 case); final manager/maintenance set 12/12. No PostgreSQL tests in this extension. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Final gate passes 790 tests/100 files, zero skips/TODO, including actual API and maintenance privacy regressions. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: 149 focused unit/API/worker/source-contract tests passed, zero skips. Obsolete installment HTTP-success assertion now verifies UNKNOWN observation and finalizer order; actual settlement semantics also verified in PostgreSQL. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.


- State: VERIFIED
- Sources: `tests/unit`; `package.json`; `docs/PROJECT_GUIDE.md#Testing-And-Verification`
- Current state: Unit/source-contract coverage spans auth, permissions, ownership, operation recovery/evidence, accounting, points, credit, announcements, uploads, login safety, and feature-specific invariants. Run focused files through `npx tsx --test`.
- Limitation: File presence does not imply current pass state; record actual runs in the relevant update/work record.
- Phase 2: nine unit/guard and eleven PostgreSQL cases passed with no skips after observed pre-foundation failure. Eleven variants, actual lock contention, immutable evidence, valid fixture card/hash values and cleanup on success/failure verified. Focused types have zero diagnostics. Sources: `tests/unit/audit-financial-context.test.ts`; `tests/integration/audit-financial-model-db.test.ts`; `tests/helpers/audit-operation-fixtures.ts`; `specs/036-audit-remediation/evidence/phase-2-runtime-verification.md`.

- Phase 3: 144 combined focused tests pass with no skips; includes actual fake-transport HTTP lease fences, refund rollback/replay/points, customer completion and reports, latest verification and existing fulfillment guards. Sources: `specs/036-audit-remediation/evidence/phase-3-verification.md`; `specs/036-audit-remediation/evidence/phase-3-focused.log`.
- Phase 4 test evidence: T015 test authoring accepted after explicit user approval of synthetic Q04; Q02 4 pass / 6 fail, Q04 1 pass / 6 fail, zero skips. All failures are pre-fix evidence, not accepted runtime behavior. All 71 synthetic business tables were empty before/after. Source: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `UPD-20260907-013`.
- Phase 4: 76 focused unit/worker cases pass with zero skips, including actual isolated API/HTTP/orchestrator and connected proof/source-contract cases. Earlier T015 red evidence is historical. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### TEST-002 — Database-gated integration suites

- Capacity supplement 2026-10-12: Fourteen focused native disposable PostgreSQL cases cover baseline capture, card/account reservations, provider identity and proof constraints. The bootstrap uses current schema plus required constraints/triggers and does not validate historical migration provisioning or the complete DB gate. Sources: `tests/integration/renewal-baseline-capture-db.test.ts`; `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`.

- Local backlog 2026-09-08: 22-file DB gate passed 171 cases plus seven distinct new integration follow-ups (178 total); 71 business tables empty after cleanup. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: 55 combined synthetic PostgreSQL tests passed, zero skips; 71 business tables empty afterwards. Snapshot/work databases were not used. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `tests/integration`; `tests/helpers`; `docs/PROJECT_GUIDE.md#Testing-And-Verification`
- Current state: PostgreSQL integration coverage exists for assignments, permissions, ownership concurrency, operation dispatch/recovery/accounting, points, rewards, and admin flows; several suites require explicit isolated-database flags.
- Limitation: Do not point integration tests at production; unrun database-gated cases remain unverified.
- Phase 4: 14 synthetic PostgreSQL cases pass with zero skips, including final-confirm concurrency and applied-code removal. All 71 business tables empty afterwards; no restored/interactive/provider access. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### TEST-003 — Static, schema, build, and Worker checks

- Provider browser 2026-10-13: 306 Worker cases / 31 files pass with isolated Redis and zero skips. Three native report queue/HTTP cases and nineteen mocked-browser scenarios pass, alongside root/Worker types, schema parity, scoped lint and isolated builds. Temporary server/build copy/binaries are removed; production/full CI remain unverified. Sources: `tests/integration/provider-report-redis.test.ts`; `tests/browser/bein-provider-report.cjs`; `specs/036-audit-remediation/evidence/provider-report-browser-20261013.md`; `UPD-20261013-001`.

- Localization/capacity 2026-10-12: Root/Worker types, schema parity, focused lint and isolated Next/Worker builds pass for the saved runtime changes. Current mobile confirmation/pending-settlement screenshots were inspected separately from automated assertions. Whole-project lint/CI and production acceptance are not inferred. Source: `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`.

- Web completion 2026-09-08 / FIX-06: latest combined component-browser gate has 1170 passes and zero page errors; bounded cohorts include 826 unit passes without skips, 42 active-operation cases, 126 operational-dialog cases, 166 general dialog cases, 84 report cases, 51 short-window/200%-equivalent layout cases and six corrected-reference actual PDF comparisons. Overlapping cohorts are not additive. Repository-wide lint reports 7 errors/29 warnings in unchanged source; no full CI success. Current combined/browser/build state and later results are authoritative in the report. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.

- Panel repairs 2026-09-08: Panel repair verification includes successful isolated Next/Turbopack compilation/types/page generation, root types, scoped lint and 33 browser groups. Build used placeholder endpoints and socket guard; expected blocked Redis logs do not establish live connectivity. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- Extended quality 2026-09-08: 221 distinct worker cases pass after all five Redis skips were executed; 4 browser scenarios and isolated web/worker builds/types pass. Full lint: 819 files, 7 excluded errors/41 warnings; no package upgrade. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: 218 worker tests, isolated web build/worker emit and root/worker types pass. Focused lint zero errors/four warnings; full lint/CI open. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Root and worker noEmit checks now pass; focused ESLint has zero errors/warnings. Five financial/promo integration suites added to CI selection; clean migrate deploy and full builds/CI remain unaccepted. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `package.json#scripts`; `worker/package.json#scripts`; `scripts/check-prisma-schema-sync.js`; `eslint.config.mjs`; `tsconfig.json`
- Current state: Schema sync, Prisma generation, ESLint, Next build, Worker build, and TypeScript checks form the broader local verification surface. Use the feature plan's safe subset.
- Limitation: Next production build order must respect `OPS-002`; do not start services merely to validate documentation/skill changes.
- Phase 4: Worker/focused web types pass; lint zero errors, three existing Active Operations hook warnings. Full web types retain four out-of-slice errors (generated RouteContext and audit-financial-context NODE_ENV); full build open. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### TEST-004 — Web Project Memory behavior contract

- State: VERIFIED
- Sources: `tests/unit/web-project-memory.test.ts`; `specs/034-web-project-memory/quickstart.md`; `.agents/skills/web-project-memory/scripts/project_memory.py`; `.agents/skills/web-project-memory/agents/openai.yaml`
- Current state: Three focused behavior tests pass against a temporary Git-backed frontend/API/service/database/auth/test project, including exact package metadata, twenty-three sections, source validation, overwrite and secret rejection, stale detection, connected impact, and narrower second reads.
- Connections: `WORK-001`, `DEC-001`, `FRESH-001`

### TEST-005 — Complete automated test-file inventory

- State: VERIFIED
- Sources: `tests/unit`; `tests/integration`; `worker/tests`; `command:Get-ChildItem tests,worker/tests -Recurse`
- Current state: 79 root unit/source-contract tests, 22 PostgreSQL integration tests, and 11 Worker `*.test.ts` files exist. Unit concentration includes operations, points, Eid, credit, user, beIN, financial review, auth/login/permissions/ownership, reports, media, maintenance, proxies, announcements, memory, and renewal fulfillment safety.
- Integration catalog: assignments/user creation, financial-review decisions, permissions/settings, Eid claim/audience, operation account/dispatch/recovery/points/spend, cash redemption, and ownership-transfer concurrency.
- Worker catalog: account locks, connection routes, contract verification, error/refund safety, final-pay timing/classification, queue state, route snapshots, and session-cache route keys.
- Limitation: Counts and presence are verified; current pass status is recorded only after execution.
- Connections: `TEST-001`, `TEST-002`, `JOB-003`, `FEAT-001`–`FEAT-007`

### TEST-006 — Simulation, audit, and repair utilities

- State: VERIFIED
- Sources: `scripts`; `package.json`; `worker/package.json`
- Current state: Repository scripts cover operation-spend cutover/audit, ownership-conflict audit, credential encryption/backfill, session-data purge, beIN ledger and final-payment/refund/cancellation simulations, schema parity, account/settings seed, and Worker build/schema copy.
- Boundary: Audit/simulation scripts are evidence tools; data-mutating repair/backfill/purge scripts require explicit target review, backup/rollback planning, and must never be aimed at production by assumption.
- Connections: `OPS-006`, `DATA-005`, `DATA-008`, `SEC-004`, `RISK-001`

### TEST-007 — Manual and environment-dependent verification boundary

- State: PARTIAL
- Sources: `docs/PROJECT_GUIDE.md#Next-Tasks-And-Backlog`; `tests/integration`; `specs/033-hierarchical-password-reset/quickstart.md`
- Current state: Authenticated multilingual/RTL browser smoke, responsive role flows, isolated PostgreSQL concurrency, live Redis/Worker/provider behavior, payment webhooks, and production process/migration state are not proven by file inventory or static checks alone.
- Connections: `TEST-002`, `RISK-001`, `RISK-004`, `FEAT-002`, `FEAT-003`, `FEAT-006`, `FEAT-010`–`FEAT-018`

### TEST-008 — Renewal fulfillment safety verification

- Hold repair: 890 root cases, 489 Worker passes/five Redis skips and 82 review browser scenarios; both types/builds and changed-file lint pass. Actual Prisma SQL through an in-memory PostgreSQL transport checks replay/rollback/refund-once, separate operations, bounded maintenance, admin terminal repair and unchanged cooldown admission. Native multi-process PostgreSQL/Redis races remain NOT_VERIFIED; full lint retains unrelated errors. Sources: `tests/unit/renewal-hold-persistence.test.ts`; `tests/unit/renewal-hold-safety.test.ts`; `worker/tests/renewal-hold-closure.test.ts`; `docs/PROJECT_GUIDE.md`; `UPD-20261013-011`.

- Precision 2026-10-13: Three original failures reproduced before repair. Root 887 pass; Worker 488 pass/five Redis skips; both types/builds and scoped lint pass. Four complete mocked journeys use actual HTTP methods, session JSON restoration, confirmation API, report scanner and proof finalizer; storage/cookie/concurrency dependencies are synthetic. Broad lint has seven errors in four unchanged tracked mobile/customer files plus 171 ignored-artifact errors; native service races and live checkout remain NOT_VERIFIED. Sources: `worker/tests/precise-package-report.test.ts`; `worker/tests/precise-renewal-journey.test.ts`; `docs/PROJECT_GUIDE.md`; `UPD-20261013-010`.

- Pre-final selection 2026-10-13: Local synthetic identity/parser tests cover compact Sell, altered commercial terms, promo echo and POST barrier. New pre-final closure tests cover safe no-charge failure versus final mutation timestamp/stage, and root consumer tests cover localized projection. Full root/Worker unit suites, both TypeScript checks, schema sync, scoped lint and local web/Worker builds passed; real Sell HTML, disposable service race, production parity and a live purchase remain NOT_VERIFIED. Sources: `worker/tests/renewal-package-identity.test.ts`; `worker/tests/pre-final-selection-closure.test.ts`; `tests/unit/operation-consumer-state-contract.test.ts`; `UPD-20261013-009`.

- Migration recovery 2026-10-13: The focused PGlite test first reproduces 55P04 when the published migration adds and uses an enum label in one transaction, then passes with an earlier committed enum migration and validates both legacy and same-day constraints. Native Prisma deploy against the production schema remains NOT_VERIFIED. Sources: `tests/unit/same-day-report-migration-sql.test.ts`; `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`; `UPD-20261013-008`.

- Version 2, 2026-10-13: Synthetic same-page promo, session, exact cart/Pay, daily-report matching, receipt projection and route-owner checks pass. Full Worker suite: 356 pass/0 fail/5 Redis skips; root suite: 877 pass/0 fail/0 skips in a permitted local run after the sandbox blocked its temporary Git fixture. Both TypeScript checks, Prisma validate/schema parity, scoped lint and local web/Worker builds pass. Disposable PostgreSQL migration/concurrency, Redis recovery, authenticated browser and live beIN checkout remain NOT_VERIFIED. Sources: `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`; `worker/tests/same-day-report-fulfillment.test.ts`; `tests/unit/renewal-receipt-route.test.ts`; `UPD-20261013-007`.

- Dynamic promo 2026-10-13: Focused actual-route/HTTP-client synthetic cases cover uppercase code, bound form controls, stale state, other card/type, old checked row, renamed offer at the same price, labelled STB, stale receiver clearing, dual receiver-field POST/echo, cart and report/contract mismatch. Full root and Worker unit suites exit zero with a workspace-owned test temp and bundled Python; root/Worker TypeScript checks pass. This does not verify live promo acceptance, Check response compatibility or a new sale. Source: `tests/unit/promo-package-quote-contract.test.ts`; `worker/tests/renewal-package-identity.test.ts`; `worker/tests/promo-package-refresh.test.ts`; `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`; `UPD-20261013-004`.

- Review verification 2026-10-13: Four focused Worker suites pass 95/95 without skips, covering the current smartcard loader and synthetic observed report/correlation behavior. The live report's table/criteria shape was inspected separately; no live sale, parser replay of raw provider HTML or production end-to-end proof was tested. Source: `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`; `UPD-20261013-003`.

- Smartcard regression 2026-10-13: The real loader's prefixed-label case failed before the fix; all 23 dedicated cases now pass, including fourteen observed package rows and disabled controls. Six focused Worker suites pass 129 cases. Consumer contracts pass six cases and mocked browser QA passes 32 scenarios with zero external requests or real operations. Root/Worker types, isolated emission, schema sync and scoped lint pass with six existing warnings. These tests do not establish live IRDETO, checkout or production acceptance. Sources: `worker/tests/smartcard-loading.test.ts`; `worker/tests/fixtures/smartcard-observed.ts`; `tests/unit/operation-consumer-state-contract.test.ts`; `tests/browser/renewal-card-cooldown.cjs`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `UPD-20261013-002`.

- Capacity supplement 2026-10-12: Real local Next/AuthJS/PostgreSQL/Memurai/BullMQ/Worker runs with only provider HTTP simulated compare 10 × 8 against 20 × 4. Both mixed runs verify five matching renewal invoices with no observed wrong package or duplicate debit, but accumulate work; both fail burst admission latency, and the twenty-worker burst repeatedly has nine transaction-acquisition HTTP 500 errors. Native targeted DB/Redis checks now have evidence; full migration history, live provider/incident evidence and production acceptance remain open. Sources: `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`.

- Package repair 2026-10-12: Root gate 826 passes/zero skips; Worker 287 passes/zero failures/five Redis skips, including 70 dedicated identity/observed-shape/actual-worker cases. Types, isolated worker emission, schema parity and scoped lint pass; seven existing warnings remain. Final affected root rerun 14/14. Current receipts: `worker/tests/renewal-package-identity.test.ts`; `worker/tests/provider-observed-identity.test.ts`; `worker/tests/renewal-worker-evidence.test.ts`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `UPD-20261012-001`. Later provider stages and real PostgreSQL/Redis races remain unverified. Earlier counts below are historical.

- State: PARTIAL
- Sources: `specs/035-renewal-fulfillment-proof/quickstart.md#Amended-Core-Local-Verification-Record--2026-08-25`; `worker/tests/sold-packages-report.test.ts`; `worker/tests/fulfillment-correlation.test.ts`; `worker/tests/account-lease-concurrency.test.ts`; `worker/tests/fulfillment-finalization-guard.test.ts`; `worker/tests/renewal-verification-job-retry.test.ts`; `tests/unit/renewal-fulfillment-verification-maintenance.test.ts`; `tests/integration/renewal-fulfillment-finalization-claim-guard-db.test.ts`
- Verified locally: Root unit/source-contract suite 670 passed with zero failures. Worker suite 195 passed, zero failed, four Redis-gated skipped; root/Worker TypeScript, schema sync, Prisma validate, both builds, focused critical-file ESLint, diff/encoding, and focused parser/correlation/finalizer/retry/maintenance suites passed. The core database selection completed three harness checks and skipped 20 PostgreSQL-dependent cases because no explicitly disposable database was configured; four app/store cases were excluded.
- Boundary: A root Next production build compiles the repository but does not prove application/mobile/store behavior. `WORK-004` explicitly excluded and did not start those flows. Broad changed-file core lint still exposes 24 pre-existing `no-explicit-any` errors in `worker/src/http/HttpClientService.ts`.
- Pending: disposable PostgreSQL migration/proof/refund/reservation races, disposable Redis lease/session races, authorized Sold Report/contract same-Invoice smoke, automation-exclusive account attestation, crash-durable post-completion effects, exact incident result, and production deployment. These block `ENFORCE`.
- Connections: `TEST-001`, `TEST-002`, `TEST-003`, `DATA-010`, `FEAT-020`, `RISK-009`

## 16. Build Deployment and Operations

### OPS-001 — Local install, generation, and build

- Local backlog 2026-09-08: Isolated source-copy builds pass using existing dependencies and socket isolation, without touching serving artifacts; no clean-install proof. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `package.json#scripts`; `worker/package.json#scripts`; `docs/PROJECT_GUIDE.md#Start-Here`
- Current state: Install root and Worker dependencies as needed, verify schema parity, generate Prisma, then build Next.js and Worker packages. Focused tests use the Node test runner through `tsx`.
- Connections: `DATA-005`, `TEST-001`, `TEST-003`

### OPS-002 — Production migration and web build order

- Administrative release: coordinated migration/client/web/Workers/maintenance/KeepAlive cutover is mandatory before using the button. No automatic runtime-version attestation; old consumers cannot run after an archive. Deployment and historical card decisions are user-owned and unexecuted here. Sources: `docs/deployment/audit-remediation-release.md#admin-card-release--2026-10-13`; `UPD-20261013-012`.

- Failed deploy 2026-10-13: User-supplied production output shows P3018/55P04 at `20261013120000_same_day_report_renewal` after PM2 stop. Pull the ordered enum migration, inspect the failed history/schema, mark only the verified failed attempt rolled back, then deploy and build/restart uniformly. Do not mark it applied or replay payments; target state and resumed processes remain UNKNOWN. Sources: `docs/deployment/audit-remediation-release.md`; `UPD-20261013-008`.

- Provider browser 2026-10-13: Deploy all panel Workers and web from the same source before enabling the new job/tab; old consumers do not support `READ_PROVIDER_REPORT`. No feature migration and no deployment performed; existing combined-checkout migration gates remain. Sources: `docs/deployment/audit-remediation-release.md`; `UPD-20261013-001`.

- Capacity supplement 2026-10-12: The release guide adds per-service DB budgets, actual pool-count/headroom verification, memory thresholds and complete old-worker drain/replacement before starting 20 matching build instances. PM2 does not create the extra processes by restarting existing names. Sources: `docs/deployment/audit-remediation-release.md`; `UPD-20261012-003`.

- Cooldown 2026-10-12: Apply `20261012120000_renewal_card_cooldown` before starting new application code, regenerate both clients, and synchronize web/Worker/maintenance versions through the existing drain/fence procedure. Schema push omits the required trigger. Keep the additive DB objects during an application rollback unless a coordinated DB rollback is explicitly reviewed; old application code cannot enforce the new admission guard. Source: `docs/deployment/audit-remediation-release.md`; `UPD-20261012-002`.

- Local backlog 2026-09-08: Runbook covers ingress fencing including ADMIN, safe drain, stopped old writers, migration/generation, stop-before-build and matching restart. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `AGENTS.md#Production-Server-Notes`; `ecosystem.config.js`; `prisma.config.ts`
- Current state: Use `prisma migrate deploy`, generate the client, stop `bein-web` before removing/rebuilding `.next`, restart web, build Worker, restart maintenance/Worker processes, then inspect PM2 status/logs. Do not use normal production `db push`.
- Connections: `APP-001`, `APP-002`, `APP-004`, `APP-005`, `APP-006`, `RISK-001`

### OPS-003 — PM2 process and log topology

- Extended quality 2026-09-08: bein-maintenance now declares kill_timeout 300000. Apply ecosystem configuration during authorized release; no current PM2 process was restarted. Forced termination beyond the bound still requires recovery. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Both PM2 profiles derive panel workers from deployment/panel-workers.cjs; root maintenance is periodic owner; actual topology unverified. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `ecosystem.config.js`; `worker/ecosystem.config.js`; `AGENTS.md#Production-Server-Notes`; `docs/current-project-prd.md#VPS-Deployment`
- Current state: Root ecosystem defines `bein-web`, `bein-keepalive`, `bein-maintenance`, and `bein-worker-1` through `bein-worker-8`. Worker/VPS ecosystem defines `bein-worker-1` through `bein-worker-10`, `bein-keepalive`, and `bein-customer`; project production notes target the ten-worker variant, but deployed PM2 state still requires fresh verification.
- Connections: `APP-001`, `APP-004`, `APP-005`, `APP-006`, `RISK-002`

### OPS-004 — Application evidence and diagnostics

- State: VERIFIED
- Sources: `src/lib/activity-logger.ts`; `src/lib/activity-log-redaction.ts`; `src/lib/auth/login-diagnostics.ts`; `src/lib/operation-detail-audit.ts`; `src/app/api/admin/logs`; `src/app/api/admin/worker-status`
- Current state: Activity, login, operation, Worker, and admin health/log surfaces exist with redaction helpers; inspect each feature's privacy boundary before expanding logged fields.
- Connections: `AUTH-001`, `JOB-003`, `TEST-001`

### OPS-005 — Root and Worker build/process variants

- Local backlog 2026-09-08: Shared panel profiles tested for 8/10/invalid count; excluded process definitions preserved. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `package.json`; `worker/package.json`; `ecosystem.config.js`; `worker/ecosystem.config.js`; `worker/tsconfig.json`
- Current state: Root prebuild checks Prisma schema parity and generates the client before Next build. Worker build verifies/copies the root schema, generates its client, compiles TypeScript, and writes wrappers for main, keepalive, and customer entry points.
- Process variants: Root ecosystem runs web, keepalive, maintenance, and eight reseller workers. Worker/VPS ecosystem runs ten reseller workers, keepalive, and `bein-customer`; production notes target the ten-worker variant.
- Connections: `OPS-001`, `OPS-002`, `OPS-003`, `APP-004`, `APP-005`, `APP-006`, `JOB-001`, `RISK-002`

### OPS-006 — Maintenance, audit, seed, and migration utilities

- Local backlog 2026-09-08: Source-only preflight exits BLOCKED; optional explicit read-only DB inspection is bounded/resumable and has no apply mode. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `scripts`; `src/scripts/operation-maintenance.ts`; `prisma/seed.ts`; `prisma.config.ts`; `package.json#scripts`
- Current state: Operational utilities include schema sync, Prisma seed, account/settings seed, operation maintenance, cutover/preflight/audit, credential encryption, legacy session purge, ownership audit, and focused safety simulations.
- Boundary: Commands with database writes, encryption rotation, purging, backfill, refund review, migration, or production-process effects require explicit environment verification and authorization.
- Connections: `JOB-005`, `DATA-005`, `DATA-008`, `SEC-004`, `TEST-006`, `RISK-001`

### OPS-007 — Renewal fulfillment reconciliation utility

- State: VERIFIED
- Sources: `scripts/reconcile-renewal-fulfillment.ts`; `src/lib/renewal-fulfillment/reconciliation.ts`; `package.json#reconcile:renewal-fulfillment`; `specs/035-renewal-fulfillment-proof/contracts/admin-reconciliation.md`
- Current state: A bounded, card-filterable dry-run detects completed charged renewals without proof, short-window duplicate charge bursts, and invoice conflicts. Apply requires exact confirmation and idempotently upserts only fulfillment-safety integrity issues.
- Forbidden effects: The utility does not send provider Pay, refund balances, change operation status, mutate points, or send notifications.
- Incident evidence: The 2026-08-23 18:35–18:45 Cairo query for card `7517687161` failed before reading or writing data with PostgreSQL `ECONNREFUSED`; no apply ran.
- Rollout boundary: Run the exact incident dry-run only with an authorized database connection. Do not use `--apply` until its sanitized JSON is reviewed; even apply only records idempotent safety issues and never settles money.
- Connections: `DATA-010`, `FEAT-015`, `FEAT-020`, `TEST-008`, `RISK-009`

### OPS-008 — Local Windows PostgreSQL installation

- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md`; `runtime:2026-09-07 local PostgreSQL installation and authentication verification`
- Current state: PostgreSQL 18.6 and pgAdmin installed; automatic service postgresql-x64-18 runs on localhost:5432 only. Saved DPAPI-encrypted credentials work, wrong passwords are rejected, and pg_dump/pg_restore report 18.6. Credentials stay outside the repository; temporary plaintext installer options were deleted.
- Boundary: The initial 5432 installation remains separate from the later backup restoration in `OPS-009`. No app environment changes, new project migrations, generation, app tests/builds, worker startup or provider/production access. Restored data and synthetic tests require separate databases and external-effect isolation. Phase 2 acceptance remains pending.
- Connections: `OPS-001`, `ENV-001`, `WORK-005`

### OPS-009 — Preserved local database snapshot on D

- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md#Local-Database-Snapshot`; `external:D:/CodexPostgreSQL/restore-verification.json`; `external:D:/CodexPostgreSQL/reader-and-migration-verification.json`; `runtime:2026-09-07 snapshot restore, reader write-denial and restart verification`
- Current state: Separate manual PostgreSQL 18.6 cluster at localhost:5433, database deshpanel_snapshot_20260907, data on D; original 5432 service unchanged. Supplied SQL matches the adjacent gzip payload. Single-transaction restore omitted 369 cleanup statements for the fresh database; all 57 table counts match (625,801 rows), with valid constraints/indexes.
- Access: Database defaults read-only; deshpanel_audit_reader can SELECT every table and cannot write even when session read-only is disabled. Saved DPAPI-encrypted credentials and clean restart verified; credentials/data/logs stay outside the repository with protected ACLs.
- Compatibility: 27 completed migration records; 13 raw checksum matches and 14 CRLF/LF-only differences. Nine additional local SQL migrations and one missing-SQL directory are absent from snapshot history. Builtin C.UTF-8 is local; source locale and current production state remain unknown.
- Boundary: Backup for review, not a disposable/app database. Preserve original files and snapshot; use a separate writable database for later authorized migration/tests. No app env edits, new migrations, builds/tests, providers, workers or production access. Phase 2 remains unaccepted.
- Connections: `OPS-008`, `DATA-005`, `RISK-010`, `WORK-005`

### OPS-010 — Migrated local work clone and canonical guard repair

- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md#Local-Working-Database`; `specs/036-audit-remediation/evidence/local-database-preparation.md`; `external:D:/CodexPostgreSQL/work-preparation.json`; `external:D:/CodexPostgreSQL/work-verification.json`; `tests/unit/refund-unique-index-migration.test.ts`
- Current state: Separate writable deshpanel_work_20260907 on localhost:5433 has 72 public tables and 36 completed migration records. Installed Prisma deploy/status succeeded against a protected explicit 36-file bundle without app/dotenv/seed loading. Nine migrations created 15 tables; all 56 original data table counts match the snapshot. Repository SQL/schema bytes and snapshot history/data were preserved.
- Guard repair: Snapshot lacks three unique financial guards despite recorded history. Zero-duplicate checks preceded restoring only the canonical original SQL for uq_transactions_refund_once, uq_transactions_deduct_once and uq_wallet_refund_once on the clone; all clone indexes are valid. No original financial row was rewritten.
- Remaining limits: Two intentional NOT VALID constraints remain; full historical validation, schema-drift analysis, source locale parity, application/financial tests and deployment are not proved. No app DATABASE_URL change, client generation, seed, build, app/worker/provider startup or task acceptance. A production forward repair must be planned independently.
- Connections: `OPS-009`, `DATA-005`, `RISK-010`, `WORK-005`, `FEAT-021`

### OPS-011 — Isolated local interactive panel trial

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/local-database-preparation.md`; `docs/PROJECT_GUIDE.md`; `external:D:/CodexPostgreSQL/local-panel/runtime-status.json`; `src/lib/prisma.ts`; `src/lib/auth.ts`
- Current state: Authorized Next dev server at http://127.0.0.1:3000/login uses deshpanel_work_20260907 through a restricted local DML role and isolated authenticated Memurai on 6389. Root Prisma generation, full user-model read, Redis PING, login browser rendering and three unauthenticated HTTP endpoint checks passed.
- Isolation: Process-only environment overrides, DPAPI-protected local credentials and a probed Node socket egress guard; project .env unchanged. No provider/maintenance/keepalive workers or source account changes. Browser networking is not sandboxed by the Node guard. Manual processes are not reboot-persistent.
- Limits: Existing panel credentials are needed for user testing. No authenticated journey, real beIN/payment, full schema or financial validation, production access or task acceptance is proved; local interactions can modify the work clone.
- Follow-up LOCAL-001: User reached authenticated pages but renewal start failed P2010 on void advisory-lock results. Four existing result casts repair the shared web/refund/worker defect without changing lock identity/order/lifetime. Real Prisma regression failed before and passed after with exclusion/release checks; eight related unit cases passed. Local database connection cap changed 6 to 40 (cluster max 100) after observed P2037. No provider worker started or full financial acceptance granted.
- Connections: `APP-001`, `APP-002`, `APP-003`, `AUTH-001`, `OPS-010`, `WORK-005`

### OPS-012 — Phase 2 synthetic verification and clean-install gap

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/phase-2-runtime-verification.md`; `external:D:/CodexPostgreSQL/phase2-verification-20260907/final-metadata.json`; `prisma/migrations/0_init/migration.sql`
- Current state: Dedicated deshpanel_audit_test_20260907_v2 on loopback 5433 contains schema/migration metadata only after fixture cleanup: 72 tables, 36 migrations, zero business rows, zero invalid indexes. Dedicated non-superuser role and external socket guard isolate tests from the work clone/snapshot/provider.
- Evidence: First clean baseline deployment failed because 0_init is empty. Schema-only reference bootstrap plus six pre-foundation migrations allowed eight expected missing-purpose failures, followed by three unchanged foundation migrations. Two fixture defects were corrected; final 20 tests pass with no skips and real contention/release evidence.
- Limits: Full historical-data/upgrade/fresh-install release proof is T040/T052; full Q06 and financial/provider flows remain later tasks. No production schema/history was altered.
- Connections: `DATA-005`, `TEST-001`, `OPS-009`, `OPS-011`, `WORK-005`, `RISK-010`

### OPS-013 — Phase 3 financial component verification

- Local backlog 2026-09-08: Synthetic PG5433 and dedicated Redis6390 used; owned Redis stopped and business tables empty. No restored/interactive DB or provider-worker tests. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Review repair verification adds real Redis ownership races, 55 synthetic DB cases, 149 focused cases and ten mocked-browser groups. Full release and attributable installment adapter remain incomplete. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/phase-3-verification.md`; `specs/036-audit-remediation/evidence/phase-3-focused.log`; `specs/036-audit-remediation/evidence/phase-3-database-metadata.json`
- Current state: 144 focused tests passed, zero skips; worker/focused web types and scoped lint passed. Dedicated synthetic DB has 72 tables, 36 migrations, zero business rows, zero invalid indexes. Source schemas/history unchanged; generated local worker client only.
- Limits: T007 lacks real attributable installment HTML fixtures/parser; Phase 3 remains PARTIAL. No production, real provider call, worker daemon, full build or deployment.
- Connections: `OPS-012`, `TEST-001`, `FEAT-021`, `WORK-005`, `RISK-010`

## 17. Feature Registry

### FEAT-001 — Reseller operation lifecycle

- Localization/capacity 2026-10-12: Renewal surface follows en/ar/bn including review/pending settlement. A prepared twenty-worker profile preserves all provider/queue limits; the measured 200-user workload is not smooth and the additional workers do not improve verified renewal throughput. This is not a production capacity acceptance. Source: `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`.

- Cooldown 2026-10-12: Five-minute package-renewal card hold and localized remaining-time display implemented and locally tested. It applies from first end, success or failure, and is independent of active/review safety. Native concurrency, migration rollout and live behavior remain unverified. Sources: `docs/PROJECT_GUIDE.md`; `UPD-20261012-002`.

- State: VERIFIED
- Status: WORKING
- Sources: `docs/current-project-prd.md#Operation-Lifecycle`; `src/app/api/operations`; `src/lib/operation-safety.ts`; `src/lib/operation-dispatch.ts`; `worker/src/http-queue-processor.ts`; `prisma/schema.prisma#model-Operation`
- Current state: Panel renewal, installment/due-payment, signal-refresh, cancellation, heartbeat, timeout, review, recovery, refund, dispatch, and finalization paths cross the web/API, shared services, PostgreSQL evidence, BullMQ, Worker/provider, tests, and maintenance.
- Entry points: `FE-001`, `API-001`, `JOB-005`
- Connections: `API-003`, `DATA-002`, `AUTH-001`, `JOB-001`, `JOB-002`, `JOB-003`, `INT-001`, `TEST-001`, `RISK-001`
- Impact: runtime, API, data, money, provider, operations

### FEAT-002 — Hierarchical panel password recovery

- State: VERIFIED
- Status: WORKING
- Sources: `specs/033-hierarchical-password-reset/spec.md`; `src/lib/users/password-reset.ts`; `src/lib/users/password-reset-route.ts`; `src/app/api/admin/users/[id]/reset-password/route.ts`; `src/components/users/ResetPasswordDialog.tsx`; `tests/unit/hierarchical-password-reset.test.ts`
- Current state: Admin can reset eligible non-admin accounts; managers/agents can reset unambiguous current direct users when effective permission allows. Target/ownership is revalidated transactionally, sessions are invalidated through password-change time, and UI reuses localized reset controls.
- Entry points: `FE-001`, `API-001`
- Connections: `DATA-001`, `AUTH-001`, `AUTH-002`, `AUTH-004`, `AUTH-005`, `TEST-001`
- Impact: auth, API, data, UI, audit

### FEAT-003 — User ownership and agent assignment

- State: VERIFIED
- Status: WORKING
- Sources: `specs/015-agent-user-management`; `src/lib/users/ownership.ts`; `src/lib/agents/assignment-transfer.ts`; `src/app/api/admin/agent-assignments/route.ts`; `tests/integration/admin-agent-assignments.test.ts`
- Current state: Admin/manager/agent user surfaces use manager links and active agent assignments for ownership, filtering, transfers, balances, and sensitive actions; historical assignments must not be treated as current.
- Entry points: `src/app/dashboard/admin/users/page.tsx`; `src/app/dashboard/manager/users/page.tsx`; `src/app/dashboard/agent/page.tsx`
- Connections: `DATA-001`, `AUTH-004`, `AUTH-005`, `TEST-002`, `RISK-003`
- Impact: API, data, permissions, UI

### FEAT-004 — Points and rewards accounting

- State: VERIFIED
- Status: WORKING
- Sources: `specs/014-points-rewards-spend-ledger`; `specs/032-unify-points-awards`; `src/lib/points`; `src/app/api/points`; `src/app/api/rewards`; `prisma/schema.prisma#model-PointLedgerEntry`
- Current state: Points settings/calculation, operation awards, reversals, routing/audit, cash redemption, rewards, and Eid rewards use durable ledger/settings records and operation/ownership evidence.
- Entry points: `src/app/dashboard/rewards/page.tsx`; `src/app/dashboard/admin/points/page.tsx`; `src/app/api/points`; `src/app/api/rewards`
- Connections: `DATA-002`, `DATA-003`, `AUTH-004`, `TEST-001`, `RISK-001`
- Impact: money-like ledger, API, data, UI, audit

### FEAT-005 — Credit requests and financial review

- State: VERIFIED
- Status: WORKING
- Sources: `specs/022-credit-notification-handoff`; `specs/030-financial-review-evidence`; `specs/031-admin-credit-ownership-transfer`; `src/lib/credit-requests`; `src/lib/financial-review`; `src/app/api/admin/credit-requests`; `src/app/api/admin/financial-review`
- Current state: Credit request status, debts, ownership snapshots/transfers, escalation/decision, notifications/handoff, evidence provenance, manual review, and point awards share sensitive accounting and authorization paths.
- Entry points: `src/app/dashboard/credit-requests/page.tsx`; `src/app/dashboard/admin/credit-requests/page.tsx`; `src/app/dashboard/admin/financial-review/page.tsx`
- Connections: `DATA-003`, `AUTH-004`, `INT-002`, `TEST-001`, `RISK-001`
- Impact: money, API, data, ownership, notifications, audit

### FEAT-006 — Customer store, subscriptions, payments, and wallet

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/api/mobile`; `src/app/api/store`; `src/lib/customer-auth.ts`; `src/lib/store-subscription.ts`; `prisma/schema.prisma#model-Order`; `prisma/schema.prisma#model-StoreSubscription`; `src/app/api/store/webhooks/stripe/route.ts`
- Current state: Customer auth/profile/address, catalog/order/shipping, subscription lifecycle, wallet, payment intent/webhook, and operation-status routes form a separate consumer surface on shared infrastructure.
- Entry points: `API-004`
- Connections: `DATA-004`, `AUTH-003`, `JOB-001`, `INT-002`, `TEST-002`
- Impact: customer auth, API, data, payments, provider

### FEAT-007 — Admin permission controls

- State: VERIFIED
- Status: WORKING
- Sources: `specs/017-admin-permission-controls`; `src/app/api/admin/permissions`; `src/components/admin/permissions`; `src/lib/permissions`; `prisma/schema.prisma#model-RolePermissionSetting`; `tests/integration/admin-permissions.test.ts`
- Current state: Catalog defaults, role settings, account overrides, global controls, protected admins, effective evaluation, and audit events drive admin-configurable panel authorization.
- Entry points: `src/app/dashboard/admin/permissions/page.tsx`; `src/app/api/admin/permissions`
- Connections: `DATA-003`, `AUTH-004`, `API-002`, `TEST-002`
- Impact: auth, API, data, UI, audit

### FEAT-008 — Public shell, login, session, and dashboard entry

- Web completion 2026-09-08: Real loopback AuthJS cookie transport and API denial were verified with disposable users, restricted synthetic DB, own ephemeral Redis/Next and an egress guard. Public login asset cookie rotation is repaired; live production behavior remains unverified. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`. Earlier dated results are historical.

- Panel repairs 2026-09-08: Revoked-cookie redirect loops, unsafe login callbacks, configuration-error mislabeling and password toggle overlap are repaired. Guidance request and cookie cleanup waits are bounded to five seconds; synthetic server/browser verification only. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/page.tsx`; `src/app/login/page.tsx`; `src/app/dashboard/page.tsx`; `src/app/dashboard/layout.tsx`; `src/lib/auth.ts`; `src/lib/auth/login-attempts.ts`; `src/app/api/auth/login-attempt-status/route.ts`
- Current state: Public entry redirects into exact-identity credential login; authenticated JWT/database identity enters a role-aware dashboard with announcement, stats, recent operations, quick actions, credit summary, maintenance state, and logout/session boundaries.
- Connections: `FE-005`, `AUTH-001`, `AUTH-006`, `API-008`, `FLOW-006`, `SEC-003`
- Impact: auth, UI, API, session, content

### FEAT-009 — Panel profiles, user administration, balances, and ledgers

- Web completion 2026-09-08: panel table/modal adoption preserves API/financial contracts. Current acceptance tests cover retained failed input, duplicate admission, cross-user reads, stale/forbidden response hiding and scoped unknown outcomes. These are isolated synthetic client tests, not production/provider acceptance. Admin Eid settings remain deferred. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.

- Panel repairs 2026-09-08: User query encoding/page bounds, deleted-user pagination, transaction failure states/server sorting/real totals and themed edit dialogs are repaired without changing money policy. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/profile/page.tsx`; `src/app/dashboard/transactions/page.tsx`; `src/app/dashboard/admin/users`; `src/app/dashboard/manager/users`; `src/app/api/user`; `src/app/api/admin/users`; `src/app/api/manager/users`; `prisma/schema.prisma#model-Transaction`
- Current state: Role-scoped account create/edit/activate/delete/restore/purge, profile/password change, balance add/withdraw/correction, user stats/activity, transaction history, and manager two-sided transfers share identity, permission, ownership, non-negative balance, and audit rules.
- Connections: `DATA-001`, `DATA-003`, `DATA-009`, `AUTH-004`, `AUTH-005`, `AUTH-009`, `FEAT-002`, `FEAT-003`, `FEAT-013`
- Impact: UI, API, auth, ownership, money, audit

### FEAT-010 — Subscription renewal wizard

- Pre-final selection 2026-10-13: Newly created v2 attempts bind account/page before quote display. Add/Sell/STB prepare the chosen package without wallet debit, and a failed promo or safely failed preparation no longer presents an old selectable quote or an automatic financial-review message. Final OK/Pay stays behind customer consent. Sources: `src/app/dashboard/renew/page.tsx`; `shared/operations/consumer-progress.ts`; `worker/src/http-queue-processor.ts`; `UPD-20261013-009`.

- Version 2, 2026-10-13: Newly created package renewals keep the selected provider page across Workers and promo changes, then wait for exact same-day report proof. A confirmed receipt appears in the renewal result/history after completion. The v1 behavior in the older current-state line below is retained for operations already created. Sources: `src/app/dashboard/renew/page.tsx`; `src/components/history/OperationsTable.tsx`; `worker/src/http-queue-processor.ts`; `UPD-20261013-007`.

- Local backlog 2026-09-08: Readiness, safe progress and bounded polling extend accepted promo fencing; provider final-cart evidence remains deferred. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Local handoff, pre-sale quote-conflict closure and transport-deadline gaps fixed; synthetic panel confirmation/retry passes. Final Add/Sell cart/total needs authentic provider evidence under T038/T053. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/renew/page.tsx`; `src/components/renewal`; `src/app/api/operations/start-renewal/route.ts`; `src/app/api/operations/[id]`; `worker/src/http-queue-processor.ts`; `src/lib/operation-final-confirmation.ts`
- Current state: Card input starts a guarded operation; Worker/account pool obtains packages through CAPTCHA/session/provider state; selection validates but defers deduction; package preparation enters final confirmation; confirmation atomically deducts and dispatches final pay; only unique durable contract proof completes/awards, confirmed non-charge may refund, and charged/unverified, check-failed, or conflicting evidence enters review and blocks a new renewal for the card.
- Connections: `FEAT-001`, `FE-007`, `API-006`, `DATA-002`, `JOB-002`, `JOB-003`, `JOB-008`, `SEC-005`
- Impact: UI, API, queue, provider, balance, evidence, points
- Phase 4: Quote/promo implementation locally verified, not deployed: pending/failed offers blocked, draft never changes applied code, explicit removal reloads ordinary quote, provider drift requires review. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### FEAT-011 — Installment and due-payment flow

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/renew/page.tsx`; `src/app/api/operations/start-installment/route.ts`; `src/app/api/operations/[id]/installment/route.ts`; `src/app/api/operations/[id]/confirm-installment/route.ts`; `worker/src/http-queue-processor.ts`
- Current state: Installment reuses `Operation.type=RENEW`; Worker loads subscriber and due-installment evidence; owner/admin confirmation deducts dealer price and directly queues payment; queue failure compensates immediately, while uncertain provider charge moves to review.
- Connections: `FEAT-001`, `API-006`, `DATA-002`, `JOB-008`, `SEC-005`, `RISK-001`
- Impact: UI, API, balance, queue, provider, review

### FEAT-012 — Signal check, activation, and refresh

- Extended quality 2026-09-08: Signal-check export table has stable identity and correct scaled height; 850px export copy preserved, including no-ResizeObserver compatibility. Provider signal execution is not newly certified. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/renew/page.tsx`; `src/app/api/operations/signal-check/route.ts`; `src/app/api/operations/signal-activate/route.ts`; `src/app/api/operations/signal-refresh/route.ts`; `worker/src/http-queue-processor.ts`
- Current state: Signal check creates a guarded operation and returns card/contracts/status evidence with optional activation; activation validates ownership and prior awaiting state; one-step refresh remains a compatibility path with the same active-card collision boundary.
- Connections: `FEAT-001`, `API-006`, `DATA-002`, `JOB-002`, `JOB-008`, `AUTH-004`
- Impact: UI, API, queue, provider, permission

### FEAT-013 — Balance movements, activity, analytics, and reports

- Provider browser 2026-10-13: Admin can select a beIN username and fetch its Sold Packages Details, including external sales, by date through the existing HTTP worker. Results are display-only, not failure history or fulfillment proof. Local tests pass; the later browser inspection confirms the provider report page/grid shape, but does not test the panel adapter against the live provider. Sources: `src/components/admin/report-center/BeinProviderReportPanel.tsx`; `src/app/api/admin/reports/bein-provider`; `worker/src/lib/provider-report-reader.ts`; `UPD-20261013-001`; `UPD-20261013-003`.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/admin/analytics`; `src/app/dashboard/admin/reports`; `src/app/dashboard/admin/logs`; `src/app/api/admin/analytics`; `src/app/api/admin/reports`; `src/app/api/admin/logs`; `src/lib/activity-logger.ts`
- Current state: Admin reporting covers dashboard analytics, activity/inactivity, integrity scanning/backfill, beIN spend and operations, points/owner analysis, balance movements with export bounds, login/low-balance monitoring, and redacted activity logs.
- Connections: `API-007`, `DATA-002`, `DATA-003`, `OPS-004`, `SEC-002`, `FEAT-009`, `FEAT-015`
- Impact: UI, API, data aggregation, audit, exports

### FEAT-014 — beIN accounts, sessions, proxies, and automation configuration

- 2026-10-13: provider cooldown controls/badge retired; API legacy fields return no effective cooldown. Ended-account reservation repair is independent of the permanent active flag; disabled accounts are never auto-enabled by maintenance. Admin legacy lock presentation still does not describe DB reservation ownership. Sources: `src/app/dashboard/admin/bein-accounts/page.tsx`; `src/components/admin/BeINConfigForm.tsx`; `src/lib/maintenance/provider-reservation-maintenance.ts`; `UPD-20261013-006`.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/admin/bein-accounts`; `src/app/dashboard/admin/proxies`; `src/app/dashboard/admin/bein-config`; `src/app/api/admin/bein-accounts`; `src/app/api/admin/proxies`; `src/app/api/admin/bein-config`; `worker/src/pool`; `worker/src/utils/proxy-manager.ts`
- Current state: Admin can manage provider accounts, encrypted credentials, activity/customer-only state, sessions/failures/locks/balance alerts, proxy assignment/import/test/state, connection mode, provider URLs/selectors, retry/session/keepalive options, and sidebar alerts.
- Connections: `DATA-002`, `JOB-004`, `JOB-006`, `JOB-007`, `INT-001`, `INT-005`, `ENV-006`, `SEC-004`
- Impact: admin UI, API, secrets, provider, Worker, Redis

### FEAT-015 — Financial review, spend ledger, and integrity monitoring

- Administrative override 2026-10-13 supersedes the evidence requirement only for scoped archive/unlock: all current blockers can be waived after old execution drains, with no financial classification change. Normal completion/refund rules remain. Local unit/SQL/browser/HTTP/build checks are bounded; native races and production remain unverified. Sources: `docs/PROJECT_GUIDE.md#admin-card-release--delivery-register-2026-10-13`; `UPD-20261013-012`.

- Hold repair: terminal blocking issues/reservations remain discoverable independently of history age or a zero displayed amount. Only positive pre-payment/canonical-settlement capabilities allow closure; other financial evidence still uses existing review decisions. Sources: `src/lib/financial-review/capabilities.ts`; `src/app/api/admin/financial-review/route.ts`; `UPD-20261013-011`.

- Local backlog 2026-09-08: Capabilities, attributable legacy receipt and pre-mutation review implemented; unknown legacy refunds/installments retain holds. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Closure-note UI/API contract is aligned and locally verified; general legacy review adjudication remains open. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/admin/financial-review`; `src/app/dashboard/admin/reports/bein-spend`; `src/app/dashboard/admin/reports/integrity`; `src/lib/financial-review`; `src/lib/bein-spend-ledger.ts`; `src/lib/integrity/detector.ts`; `prisma/schema.prisma#model-OperationIntegrityIssue`
- Current state: Provider/user evidence is classified into separate money and fulfillment states; live verification claims a unique invoice proof before completion; no-refund requires proof or explicit audited manual renewal confirmation; refund remains blocked by trusted provider debit; spend and integrity reports expose linked account/card/balance evidence under redaction and decision guards.
- Connections: `FEAT-001`, `FEAT-005`, `DATA-002`, `FLOW-003`, `SEC-005`, `RISK-001`
- Impact: finance, data, provider evidence, admin decisions, audit

### FEAT-016 — Announcements, notifications, uploads, and settings

- Panel repairs 2026-09-08: Notification popup anchors within RTL/LTR viewport; failed mutations preserve unread state and report failure; mutation admission cancels old polling and disables duplicates. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/notifications`; `src/app/dashboard/admin/settings`; `src/app/dashboard/admin/settings/announcements`; `src/app/api/announcement`; `src/app/api/notifications`; `src/app/api/admin/announcement`; `src/app/api/uploads`; `src/lib/announcement`; `src/lib/uploads`
- Current state: Admin settings and announcement banner/slide media control dashboard content; upload validation and cache headers serve media; users receive paginated/read-state notifications; notification provider settings and tests support credit workflows.
- Connections: `FLOW-006`, `DATA-003`, `API-007`, `API-008`, `ENV-006`, `INT-004`, `TEST-001`
- Impact: content, UI, API, media, notifications, configuration

### FEAT-017 — Maintenance, recovery health, and process monitoring

- Extended quality 2026-09-08: Maintenance overlap and premature dependency shutdown fixed; local lifecycle/PM2 contract cases pass. Current server topology and actual runtime health remain unknown. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Durable effects, indexed dispatch retry and bounded privacy-safe maintenance verified locally; live capacity/backlog not measured. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/admin/recovery-health`; `src/app/api/admin/recovery-health`; `src/app/api/admin/worker-status`; `src/app/api/admin/keepalive-stats`; `src/app/api/cron`; `src/lib/maintenance`; `src/lib/operations/recovery.ts`; `ecosystem.config.js`
- Current state: Effective maintenance can block/pause user operations; cron and standalone maintenance reconcile dispatch/timeouts/locks/stale award runs; admin views inspect recovery health, Worker status, keepalive metrics, failures, and logs.
- Connections: `APP-005`, `APP-006`, `JOB-004`, `JOB-005`, `OPS-003`, `OPS-004`, `RISK-001`, `RISK-002`
- Impact: availability, API, Redis, database, operations, admin UI

### FEAT-018 — Manager and agent operational dashboards

- Extended quality 2026-09-08: Manager dashboard no longer self-fetches via Host/cookies, exposes operation counts and filters deleted links consistently. Synthetic query/page contract tests pass; no real manager database read. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/manager`; `src/app/dashboard/agent`; `src/app/api/manager`; `src/app/api/agent`; `src/components/manager`; `src/components/agent`
- Current state: Manager overview/users/deleted-users cover owned-account creation, editing, balance transfer, stats, reset and deletion under permissions; agent dashboard covers current assignments, credit requests, refresh, and permitted direct-user password support.
- Connections: `FE-008`, `API-008`, `AUTH-004`, `AUTH-009`, `FEAT-002`, `FEAT-003`, `FEAT-005`, `FEAT-009`
- Impact: UI, API, auth, ownership, balance, credit

### FEAT-019 — Bulk and active-operation management

- State: VERIFIED
- Status: WORKING
- Sources: `src/app/dashboard/operations/active/page.tsx`; `src/app/dashboard/operations/bulk/page.tsx`; `src/app/api/operations/bulk/route.ts`; `src/app/api/operations/route.ts`; `src/app/api/operations/[id]/cancel/route.ts`
- Current state: Users can list/resume active operations across pre-terminal statuses, confirm or cancel permitted steps, filter history, and submit bulk operation requests through a separate page/API while retaining per-card active-operation and authorization rules.
- Connections: `FEAT-001`, `FE-007`, `API-006`, `DATA-009`, `AUTH-001`, `JOB-001`
- Impact: UI, API, queue volume, collision guards, recovery

### FEAT-020 — Renewal fulfillment proof and duplicate-charge containment

- Precision 2026-10-13: Same-day proof now tolerates only explicit provider display variants and compares decimals without rounding. Finalization repeats the comparison under transaction and can reuse its own completed invoice after release. Existing day/account/card/type/unique unclaimed invoice rules and ambiguous financial review stay intact. Sources: `worker/src/lib/same-day-report-fulfillment.ts`; `worker/src/lib/report-package-identity.ts`; `UPD-20261013-010`.

- Pre-final selection 2026-10-13: The v2 preparation marker distinguishes Add/Sell/STB from final OK/Pay. A verified no-debit preparation stop releases the account/card reservation and keeps the existing five-minute card cooldown; a final mutation marker, debit or sale evidence still blocks safe closure and requires review. Historic stuck operations require case-specific admin evidence before any decision, with no direct status edit. Sources: `worker/src/lib/pre-mutation-renewal-finalization.ts`; `src/lib/operations/pre-mutation-renewal-finalization.ts`; `src/lib/financial-review/capabilities.ts`; `UPD-20261013-009`.

- Version 2, 2026-10-13: New operations use same-day unique report proof rather than the v1 baseline/active-contract proof; marker, invoice uniqueness, no repeat Pay, review hold and atomic completion/release remain. A same-day identical prior outside sale can still be misattributed because Reports has no sale timestamp. Local code is PARTIAL pending native migration/race and provider compatibility evidence. Sources: `worker/src/lib/same-day-report-fulfillment.ts`; `prisma/migrations/20261013120000_same_day_report_renewal/migration.sql`; `UPD-20261013-007`.

- Runtime verification 2026-10-12: Disposable service smoke and mixed load exercise exact promo/cart/Reports/contract completion after correcting baseline SQL and exported account binding. Native reservation/proof constraints and Redis fences pass focused checks. These narrow results supersede earlier absence of native evidence, not the unresolved live compatibility, full migration, settlement and production gates. Source: `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`.

- Package repair 2026-10-12: Quote -> observed cart -> new Reports invoice is checked, with same-invoice active contract dates supplementary. Commercial offers remain strict; a plain contract may omit a recognized percentage only after the report proves it. The overall feature stays PARTIAL pending later-stage/promo compatibility, service races and live deployment/incident evidence. Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/lib/renewal-fulfillment-correlation.ts`; `UPD-20261012-001`.

- State: VERIFIED
- Status: PARTIAL
- Sources: `specs/035-renewal-fulfillment-proof`; `shared/operations/renewal-fulfillment.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/fulfillment-proof.ts`; `prisma/schema.prisma#model-OperationFulfillmentProof`; `scripts/reconcile-renewal-fulfillment.ts`
- Current state: Implemented locally for reseller web-panel/Worker/database/admin/reconciliation paths. Complete Sold Report baseline/diff plus same-Invoice active contract correlation, card/account reservations, fenced provider mutations, exact latest-attempt finalization, read-only retry repair, and composite database constraints now gate completion. A provider debit alone never closes renewal; charged/unfulfilled cases review without automatic refund, and unresolved safety issues block repeat renewal.
- UI/API: English, Arabic, and Bengali messages distinguish charged/verifying from charged/unconfirmed review; admin no-refund without proof exposes an explicit confirmation control.
- Delivery boundary: Default/safe mode is `REVIEW_ONLY`. Targeted disposable PostgreSQL/Redis and provider-simulation checks now pass; complete migration/recovery acceptance, production deployment, authorized live Invoice equality, account exclusivity, crash-durable post-completion effects and the reported card's live reconciliation remain pending. Overall feature status stays `PARTIAL`; mobile/store/application execution is excluded.
- Connections: `FEAT-001`, `FEAT-004`, `FEAT-005`, `FEAT-010`, `FEAT-015`, `DATA-010`, `FLOW-007`, `TEST-008`, `OPS-007`, `RISK-009`
- Impact: finance, provider, Worker, recovery, database uniqueness, admin review, UI/localization, deployment

### FEAT-022 — Bounded panel UI and login repair delivery

- State: VERIFIED
- Status: WORKING
- Sources: `docs/PANEL_UI_REPAIRS.md`; `src/components/auth`; `src/hooks/usePanelRequest.ts`; `src/components/ui/PanelTableControls.tsx`; `src/components/layout/SidebarFrame.tsx`; `tests/unit/panel-ui-repairs.test.ts`; `tests/browser/panel-ui-repairs.cjs`
- Current state: UI-01 through UI-14 are locally implemented and verified within the report's scope. Current appearance and excluded consumer defaults are preserved; real production sessions/provider actions are unverified.
- Connections: `AUTH-001`, `AUTH-006`, `FE-002`, `FE-003`, `FE-007`, `FE-008`, `API-008`, `WORK-006`, `RISK-011`

### FEAT-023 — Web completion tables, forms and HTTP acceptance

- State: VERIFIED
- Status: PARTIAL
- Sources: `docs/PANEL_UI_REPAIRS.md`; `src/components/ui/table.tsx`; `src/components/ui/dialog.tsx`; `src/hooks/usePanelRequest.ts`; `src/middleware.ts`; `tests/browser/panel-ui-repairs.cjs`; `tests/browser/panel-auth-http.cjs`
- Current state: WEB-01/02/03/04/08/11 are accepted; remaining six tasks have implementation but incomplete positive-data, role/action, localization and export/state acceptance. Mobile uses internal table scrolling; provider document output, deferred settlement and excluded native/store implementation are preserved. No release approved/deployed.
- Connections: `WORK-007`, `FE-002`, `FE-003`, `FE-004`, `FE-007`, `FE-008`, `AUTH-001`, `TEST-003`, `RISK-011`

### FEAT-021 — Audit remediation and release-readiness plan

- Extended quality 2026-09-08: 45/57 tasks accepted locally; T067-T069 complete. 802 distinct unit and 221 distinct worker cases pass; four export browser scenarios and isolated builds/types pass. In-scope lint has zero errors; full lint retains seven excluded mobile/customer errors and 41 warnings. Fresh database baseline, provider evidence and release gates remain open. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: 42/54 tasks accepted; T012/T024-T036/T039-T045/T048-T050 completed; deferred evidence and T051-T058 stay open/partial. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Current progress is 18/54 active tasks; T059-T066 complete and T016/T017 reaccepted. T007, original broader acceptance and provider/migration/build/release gates remain open. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.


- State: VERIFIED
- Status: PARTIAL
- Sources: `specs/036-audit-remediation/README.md`; `specs/036-audit-remediation/spec.md`; `specs/036-audit-remediation/plan.md`; `specs/036-audit-remediation/tasks.md`; `specs/036-audit-remediation/audit-register.md`
- Current state: 45/57 tasks accepted locally; open IDs T007/T008, T037/T038, T051-T058. Source: `specs/036-audit-remediation/evidence/extended-quality-verification.md`.
- Boundary: Authorized synthetic tests, mocked-browser checks and isolated builds ran. Live provider, production, commit/push and full release acceptance remain excluded.
- Connections: `FEAT-020`, `WORK-005`, `RISK-010`, `IMPACT-009`, `DEC-007`
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED; installment adapter records debit but holds UNKNOWN settlement. Do not release it as complete.
- Historical panel-only scope (2026-09-07): 46 active tasks / 10 accepted, 25 requirements and 14 audit items. Store and phone-app modifications are excluded; existing code, migrations and prior test results remain. T009 is historically completed outside current progress. Source: `specs/036-audit-remediation/evidence/panel-only-scope-amendment.md`; `UPD-20260907-011`.
- Phase 4 test evidence: T015 test authoring accepted after explicit user approval of synthetic Q04; Q02 4 pass / 6 fail, Q04 1 pass / 6 fail, zero skips. All failures are pre-fix evidence, not accepted runtime behavior. All 71 synthetic business tables were empty before/after. Source: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `UPD-20260907-013`.
- Phase 4: T015-T017 accepted, 10/46 total. Source dependency review permits T016 after T005/T015 and T017 after T016; T012 remains T050 release gate. Phase 3 PARTIAL. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

## 18. Dependency and Impact Map

### IMPACT-009 — Planned audit remediation across financial and consumer boundaries

- Extended quality 2026-09-08: Extended scope T067-T069 covers export geometry, manager DTO/query and maintenance shutdown; T051 repairs in-scope quality, T052 source-history correction. Phone/store and historical SQL remain unchanged. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Panel-only auth/review/queue/effects/readiness/UI/schema/topology change; excluded source and historical SQL hashes preserved. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Repair connects current panel identity, outbox, parked Redis handoff, pre-sale closure, UI deadline/notes and CI. Schema/migration/store/phone source unchanged. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- Promo extension: renew UI, packages/apply/select/confirm contracts, selection planner, HTTP adapter/types, worker rematch and existing proof correlation are connected. T016/T017 preserve payment identities and require canonical closure before a fresh-operation restart; no schema/store/app changes. Source: `specs/036-audit-remediation/evidence/phase-4-promo-name-review.md`.

- State: PARTIAL
- Sources: `specs/036-audit-remediation/plan.md`; `specs/036-audit-remediation/data-model.md`; `specs/036-audit-remediation/contracts`; `specs/036-audit-remediation/audit-register.md`
- Current state: Phase 3 connects installment claim/finalization, provider ledger ownership, reports, recovery and latest-attempt no-charge settlement. Synthetic component evidence is verified in `specs/036-audit-remediation/evidence/phase-3-verification.md`; installment HTTP observation wiring remains PARTIAL. Later work is narrowed to panel offers/auth/reviews/release.
- Phase 1 evidence: `specs/036-audit-remediation/evidence/consumer-inventory.md` distinguishes the collection auth wrapper, actual store/customer queue routing, unsupported legacy CHECK_BALANCE admission and existing lock orders. T028, T030-T031 and T041 own panel follow-up; T021 store orchestration is retired.
- Connections: `IMPACT-001`, `IMPACT-002`, `IMPACT-003`, `IMPACT-004`, `IMPACT-005`, `IMPACT-006`, `IMPACT-007`, `IMPACT-008`, `FEAT-021`, `WORK-005`
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED; see `specs/036-audit-remediation/evidence/phase-2-verification.md`.
- Historical panel-only scope (2026-09-07): 46 active tasks / 10 accepted, 25 requirements and 14 audit items. Store and phone-app modifications are excluded; existing code, migrations and prior test results remain. T009 is historically completed outside current progress. Source: `specs/036-audit-remediation/evidence/panel-only-scope-amendment.md`; `UPD-20260907-011`.
- Phase 4 test evidence: T015 test authoring accepted after explicit user approval of synthetic Q04; Q02 4 pass / 6 fail, Q04 1 pass / 6 fail, zero skips. All failures are pre-fix evidence, not accepted runtime behavior. All 71 synthetic business tables were empty before/after. Source: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `UPD-20260907-013`.
- Phase 4: Panel renew/Active Operations, quote APIs, shared dispatch/queue, HTTP worker and ar/en/bn catalogs integrated; 76 focused +14 DB cases and six mocked browser groups pass. No schema/store/phone edits. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### IMPACT-001 — Operation lifecycle shared blast radius

- Cooldown 2026-10-12: Shared schema/trigger affects every operation writer; the guard affects all callers of guarded renewal creation/continuation. Only the panel renewal page adds countdown UI. Provider requests, financial finalizers and permissions are reused unchanged. Root/Worker clients and deployment must move together. Source: `UPD-20261012-002`; `docs/deployment/audit-remediation-release.md`.

- State: VERIFIED
- Sources: `src/app/api/operations`; `src/lib/operations`; `src/lib/operation-dispatch.ts`; `prisma/schema.prisma#model-Operation`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`
- Current state: Operation contract or state changes can affect API callers, durable dispatch, transactions/refunds, Worker/provider execution, maintenance/recovery, accounting evidence, notifications, and release checks.
- Connections: `FEAT-001`, `FLOW-001`, `API-003`, `BE-002`, `DATA-002`, `JOB-001`, `JOB-002`, `JOB-003`, `JOB-005`, `INT-001`, `TEST-001`, `RISK-001`

### IMPACT-002 — Identity ownership and permission blast radius

- Web completion 2026-09-08: Middleware scope and login SessionProvider affect JWT rotation and cleanup across login assets, protected dashboard pages and API clients. Real HTTP revocation tests cover the change; API authorization/ownership policies and bearer implementation were not changed in this continuation. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`. Earlier dated results are historical.

- Panel repairs 2026-09-08: Current-session helper is exported/reused only in the identified web branches; revoked identities deny before data access. Default bearer paths, ownership policy, schema and financial behavior remain. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/lib/auth-utils.ts`; `src/lib/permissions`; `src/lib/users/ownership.ts`; `prisma/schema.prisma#model-AgentAssignment`; `tests/unit/hierarchical-password-reset.test.ts`; `tests/integration/admin-permissions.test.ts`
- Current state: Identity, assignment, ownership, or effective-permission changes can affect user listings, credential reset, transfers, balances, financial review, audit behavior, and database-gated authorization tests.
- Connections: `FEAT-002`, `FEAT-003`, `FEAT-005`, `FEAT-007`, `FLOW-002`, `DATA-001`, `DATA-003`, `AUTH-001`, `AUTH-004`, `AUTH-005`, `SEC-001`, `TEST-001`, `TEST-002`, `RISK-003`

### IMPACT-003 — Shared Prisma schema and migration blast radius

- State: VERIFIED
- Sources: `prisma/schema.prisma`; `prisma/migrations`; `scripts/check-prisma-schema-sync.js`; `package.json`; `worker/package.json`
- Current state: A schema/model/enum/constraint change can affect root API/services, Worker-generated client, migrations and deploy order, seeds, reports, tests, compatibility routes, and production data; the root alone owns the schema contract.
- Connections: `APP-002`, `APP-004`, `DATA-005`, `DATA-006`, `DATA-007`, `DATA-008`, `DATA-009`, `OPS-001`, `OPS-002`, `DEC-003`

### IMPACT-004 — Customer commerce and payment blast radius

- State: VERIFIED
- Sources: `src/app/api/mobile`; `src/app/api/store`; `src/lib/customer-auth.ts`; `src/lib/store-pricing.ts`; `src/lib/store-subscription.ts`; `worker/src/customer-index.ts`; `prisma/schema.prisma#model-Customer`
- Current state: Customer auth, catalog/pricing, orders, subscriptions, Stripe, wallet, isolated queue, and admin compatibility are one connected surface; changing a shared operation/refund model can also affect panel financial review.
- Connections: `FEAT-006`, `FLOW-005`, `API-009`, `BE-005`, `DATA-004`, `AUTH-003`, `JOB-001`, `INT-003`, `SEC-006`

### IMPACT-005 — Redis, account pool, and provider-route blast radius

- 2026-10-13: deploy all Workers and web/maintenance together for removal of account cooldowns and terminal reacquisition fencing. The recovery scan never deletes an active Redis owner or changes the operation/account attribution, money or card hold. Sources: `worker/src/lib/provider-account-reservation.ts`; `src/lib/maintenance/provider-reservation-maintenance.ts`; `UPD-20261013-006`.

- Provider reports share the queue limit and account lock/route/session boundaries with customer work, but keep display results outside financial proof. Synchronized Worker deployment is required for the added job type. Sources: `shared/reports`; `worker/src/lib/provider-report-reader.ts`; `UPD-20261013-001`.

- State: VERIFIED
- Sources: `src/lib/queue.ts`; `worker/src/lib/session-cache.ts`; `worker/src/pool`; `worker/src/utils/proxy-manager.ts`; `worker/src/http-queue-processor.ts`
- Current state: Queue names/job IDs, Redis keys/TTLs, account eligibility/locks, proxy route snapshots, session cache, and provider automation are cross-process invariants; drift can duplicate work, deadlock accounts, mix sessions, or invalidate recovery evidence.
- Connections: `JOB-001`, `JOB-006`, `JOB-007`, `JOB-008`, `INT-001`, `INT-005`, `FEAT-010`, `FEAT-011`, `FEAT-012`, `FEAT-014`

### IMPACT-006 — Content, localization, and notification blast radius

- Web completion 2026-09-08 / FIX-05: new operational/report/review labels, placeholders and fallback messages use matching three-language catalogs. Provider/API enum and financial-status payloads remain exact; existing PDF document copy stays stable. Whole-repository localization remains partial. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.

- Panel repairs 2026-09-08: Panel-only opt-in primitives avoid CSS changes to excluded default consumers. All new copy is catalog-backed; provider payload text is unchanged. Sources: `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-004`. Earlier dated results are historical.

- State: VERIFIED
- Sources: `src/i18n`; `src/lib/announcement`; `src/lib/notification.ts`; `src/lib/credit-requests/notifications.ts`; `src/components`; `src/app/api/announcement`; `src/app/api/notifications`
- Current state: User-facing copy or content changes can affect AR/EN/BN catalogs, RTL layout, page/component states, announcement media, in-panel notifications, provider templates, accessibility labels, tests, and API error/message tokens.
- Connections: `FE-003`, `FE-006`, `FLOW-006`, `FEAT-008`, `FEAT-016`, `INT-004`, `TEST-001`

### IMPACT-007 — Runtime configuration and deployment blast radius

- State: VERIFIED
- Sources: `.env.example`; `worker/.env.example`; `next.config.ts`; `ecosystem.config.js`; `worker/ecosystem.config.js`; `AGENTS.md#Production-Server-Notes`
- Current state: Environment names, database settings, CORS/cache headers, build scripts, PM2 topology, migrations, and `.next` replacement order affect web, Worker, customer queue, maintenance, provider/payment connections, and release recovery.
- Connections: `ENV-005`, `ENV-006`, `OPS-002`, `OPS-003`, `OPS-005`, `SEC-006`, `RISK-001`, `RISK-002`, `RISK-005`, `RISK-007`

### IMPACT-008 — Renewal fulfillment proof blast radius

- State: VERIFIED
- Sources: `specs/035-renewal-fulfillment-proof/plan.md`; `worker/src/http/sold-packages-report.ts`; `worker/src/lib/fulfillment-baseline.ts`; `worker/src/lib/fulfillment-finalization.ts`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts`; `src/lib/operations/recovery.ts`; `src/lib/financial-review`; `src/app/api/operations/start-renewal/route.ts`; `prisma/schema.prisma#model-OperationFulfillmentProof`
- Current state: Changing renewal completion evidence affects Sold Report WebForms/pagination, provider session and mutation retry safety, account/card reservations, contract matching, verification retry/maintenance, operation status, refunds, spend-ledger provenance, recovery, points, success notifications, duplicate guards, admin decisions, localized UI, historical reconciliation, schema deployment, database concurrency, and mixed-version rollout.
- Release rule: Web and Worker code must not be deployed ahead of the proof migration; financial settlement requires fresh provider/refund evidence and remains outside the reconciliation utility.
- Explicit exclusion: Mobile/store/application payment execution is outside `WORK-004`; its dirty sources cannot be used as evidence for this reseller-core feature.
- Connections: `IMPACT-001`, `IMPACT-003`, `IMPACT-005`, `IMPACT-006`, `DATA-010`, `FLOW-007`, `FEAT-020`, `OPS-002`, `RISK-009`

## 19. Technical Decisions

### DEC-011 — Let ADMIN waive every current card block without financial settlement

- State: VERIFIED
- Sources: `user:explicit approved administrative archive and full cooldown waiver`; `shared/operations/admin-card-release.ts`; `docs/PROJECT_GUIDE.md#admin-card-release--delivery-register-2026-10-13`
- Decision: Scope covers every currently blocking attempt for the chosen card, including unknown/conflicting evidence and the existing five-minute wait. A reason and duplicate-purchase risk acknowledgement precede stopping old execution; archive preserves actual money/status/evidence and never declares non-payment. New attempts and other cards remain normally protected.
- Connections: `FEAT-015`, `SEC-005`, `DATA-002`, `UPD-20261013-012`

### DEC-010 — Keep v2 on the selected page and prove from the Pay-day report

- State: VERIFIED
- Date: 2026-10-13
- Sources: `user:approved same-page/same-day renewal plan`; `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`; `worker/src/lib/same-day-report-fulfillment.ts`
- Decision: Newly started package renewals use the operation's saved provider page and one exact unclaimed invoice in the executing account's Cairo Pay-day Sold Report; old v1 attempts retain their initial policy. No pre-sale baseline, post-selection Check/reload/promo reapply, contract Check after Pay, repeated Pay or automatic absence-based refund. The report criterion's same-day attribution limitation is explicitly accepted.
- Boundary: Local implementation only; migration, native races, live provider and mixed-version release are not accepted.
- Connections: `FLOW-007`, `DATA-010`, `FEAT-010`, `FEAT-020`, `RISK-009`, `WORK-004`

### DEC-009 — Bind a changing promo to the provider's current WebForms quote

- State: PARTIAL
- Date: 2026-10-13
- Sources: `worker/src/http/renewal-purchase-guard.ts`; `src/app/api/operations/[id]/apply-promo/route.ts`; `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`
- Decision: Uppercase the supplied code but never bake in a campaign or discount. Derive the promo POST from the same card/type/form state that produced the displayed list. Any missing or conflicting field stops; a changed quote needs an explicit new package selection. Invoice/contract proof and review-only financial uncertainty remain independent of code acceptance.
- Boundary: Local tests only. The actual provider promo response and deployed mixed-Worker state have not been verified.

### DEC-008 — Start the card cooldown at attempt end

- State: VERIFIED
- Date: 2026-10-12
- Sources: `user:five-minute card cooldown request and explicit end-of-attempt clarification`; `prisma/migrations/20261012120000_renewal_card_cooldown/migration.sql`; `src/lib/operations/renewal-creation-guard.ts`
- Decision: Five minutes from the first ended package-renewal attempt regardless of success. A rejected click, refresh or later Reports result does not restart it. Only another ended attempt receives its own window. Existing unresolved financial review remains a separate block; countdown expiry does not resolve it.
- Boundary: Local implementation/testing only, no provider actions, deployment or subagents. Historical end times are not fabricated from mutable timestamps.

### DEC-007 — Plan remediation separately from implementation and release

- Review repair 2026-09-08: User approved preceding review fixes without subagents. T059-T066 allow isolated local/synthetic verification; real provider and production remain excluded. Exactly observed zero-effect pre-sale closure supersedes unconditional quote holds; uncertainty is preserved. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.

- Promo identity decision: use server quote revision/snapshot and applied code; retain provider display names. Row index/WebForms control or similar text is not a proven cross-response product ID. Preserve uncertainty/proof barriers and immutable COMPLETE_PURCHASE identity. Source: `specs/036-audit-remediation/contracts/consumer-api.md`; `UPD-20260907-014`.

- State: VERIFIED
- Sources: `specs/036-audit-remediation/spec.md`; `specs/036-audit-remediation/plan.md`; `specs/036-audit-remediation/quickstart.md`; `user:2026-09-07 explicit Spec Kit planning request`
- Initial planning decision: Feature 036 owns the cross-system audit remediation plan. Preserve the dirty branch and prior 034/035 work. The initial request allowed planning pointers/docs only; subsequent execution updates below define the currently authorized source slice. Application execution, database/provider access, commit, push, fetch and deployment remain prohibited.
- Consequence: Planning-quality checks and future task acceptance are separate; external/live release evidence remains pending with explicit tasks. Reuse existing services; retain payment/proof/ownership guards.
- Execution update: On 2026-09-07 the maintainer accepted Phase 1 / T001-T002 only. Source baseline and consumer inventory are complete; the same no-runtime/no-service boundary applies. Source: `user:2026-09-07 Phase 1 Setup request`; `specs/036-audit-remediation/spec.md`; `specs/036-audit-remediation/evidence/phase-1-verification.md`.
- Connections: `FEAT-021`, `WORK-005`, `RISK-010`
- Phase 2 execution update: `user:2026-09-07 Phase 2 Foundation request` authorizes T003-T005 source authoring and narrow schema compatibility. Earlier planning-only source prohibition is superseded for this slice; execution/service/Git prohibitions persist. Authored dependencies may feed source authoring while task check-off waits for Q02/Q04. Source: `specs/036-audit-remediation/spec.md`.
- Latest completion update: The explicit request to finish Phase 2 supersedes earlier Q02/Q04 prohibitions for a separate synthetic local database and necessary foundation fixes. T003-T005 are now accepted from recorded execution; T006 onward and provider/production operations remain separate. Source: `specs/036-audit-remediation/evidence/phase-2-runtime-verification.md`.

- Phase 3 execution update: User explicitly requested US1. Implemented its financial components and isolated checks. T007 remains open because generic HTTP success/balance is not attributable settlement; no invented receipt or live provider call is authorized. Source: `specs/036-audit-remediation/evidence/phase-3-verification.md`.
- Historical panel-only scope (2026-09-07): 46 active tasks / 10 accepted, 25 requirements and 14 audit items. Store and phone-app modifications are excluded; existing code, migrations and prior test results remain. T009 is historically completed outside current progress. Source: `specs/036-audit-remediation/evidence/panel-only-scope-amendment.md`; `UPD-20260907-011`.
- Phase 4 test evidence: T015 test authoring accepted after explicit user approval of synthetic Q04; Q02 4 pass / 6 fail, Q04 1 pass / 6 fail, zero skips. All failures are pre-fix evidence, not accepted runtime behavior. All 71 synthetic business tables were empty before/after. Source: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `UPD-20260907-013`.
- Phase 4: Explicit Phase 4 request authorizes local implementation/synthetic tests. Independent source review removed only artificial T012→T016 serial gate; T012 still gates release. No external/provider/production action. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### DEC-001 — One derived root project-memory ledger

- State: VERIFIED
- Sources: `specs/034-web-project-memory/spec.md#Clarifications`; `specs/034-web-project-memory/research.md#Decision-1-Use-One-Root-Ledger`; `.agents/skills/web-project-memory/SKILL.md`; `.agents/skills/web-project-memory/agents/openai.yaml`
- Decision status: Accepted on 2026-08-23 and corrected for personal installation on the same date.
- Decision: Keep one repository-root `PROJECT_MEMORY.md` per project, one version-controlled generic source package, and one byte-equivalent personal Codex installation; sources remain authoritative and high-risk work reopens complete connected sources.
- Scope: All future repository planning, analysis, implementation, debugging, refactoring, operations, and handoff work.

### DEC-002 — Production uses migration deploy and stop-before-build order

- State: VERIFIED
- Sources: `AGENTS.md#Production-Server-Notes`; `.specify/memory/constitution.md`
- Decision status: Accepted project rule.
- Decision: Normal production deployment uses `prisma migrate deploy`; stop `bein-web` before replacing/building `.next`, then restart and verify processes/logs.
- Scope: `OPS-002`, `DATA-005`, production deployments.

### DEC-003 — Web and Worker share one Prisma schema contract

- State: VERIFIED
- Sources: `package.json#check:schema-sync`; `worker/package.json#build`; `scripts/check-prisma-schema-sync.js`
- Decision status: Implemented repository rule.
- Decision: Worker generation copies the root Prisma schema after schema-parity validation; do not evolve an independent Worker schema.
- Scope: `APP-002`, `APP-004`, `DATA-005`, `OPS-001`.

### DEC-004 — Runtime and ordered migrations outrank broad prose inventories

- State: VERIFIED
- Sources: `PROJECT_MEMORY.md#Project-Identity`; `prisma/migrations`; `docs/current-project-prd.md#Source-Files-Used`; `AGENTS.md#Skills-First-Rule`
- Decision status: Applied during the 2026-08-23 whole-project memory expansion.
- Decision: Use runtime source, current schema, and actual ordered migration directories for exact inventory. Keep the PRD as a broad behavior/discovery contract and explicitly record any drift rather than silently copying it.
- Scope: `SRC-002`, `DATA-008`, `RISK-006`, all future memory synchronization.

### DEC-005 — Preserve current mixed dispatch contract until deliberately migrated

- State: VERIFIED
- Sources: `src/lib/operation-dispatch.ts`; `src/app/api/operations/[id]/select-package/route.ts`; `src/app/api/operations/[id]/confirm-installment/route.ts`; `src/app/api/operations/[id]/cancel-confirm/route.ts`; `docs/current-project-prd.md#Queue-And-Dispatch-Contract`
- Decision status: Existing implemented architecture.
- Decision: Some jobs use `OperationDispatch` and others direct BullMQ submission with route-specific compensation. Do not claim a universal outbox or consolidate it without preserving idempotency, evidence, retry, and recovery semantics.
- Scope: `API-006`, `JOB-001`, `JOB-002`, `JOB-008`, `FEAT-010`, `FEAT-011`.

### DEC-006 — Panel, panel-mobile, customer, and store auth remain explicit boundaries

- State: VERIFIED
- Sources: `src/lib/auth.ts`; `src/lib/mobile-auth.ts`; `src/lib/customer-auth.ts`; `src/lib/store-auth.ts`; `src/lib/auth-utils.ts`
- Decision status: Existing implemented architecture.
- Decision: Reuse shared primitives where safe but do not collapse token types, session lifecycles, role models, ownership rules, or secret names into one assumed identity contract.
- Scope: `AUTH-001`, `AUTH-002`, `AUTH-003`, `AUTH-008`, `API-009`, `FEAT-006`.

## 20. Known Issues and Technical Debt

### RISK-001 — Live production and external state are unverified

- Administrative release: local simulation cannot guarantee cancellation of a request already accepted by beIN. Native PostgreSQL/Redis contention, full historical migration installation and coordinated production process parity remain unverified. Admin deliberately accepts duplicate-sale risk; old money/evidence remains available. Sources: `docs/PROJECT_GUIDE.md`; `docs/deployment/audit-remediation-release.md`; `UPD-20261013-012`.

- Account incident 2026-10-13: supplied output establishes three active accounts held by ended paid renewals plus 42 inactive accounts; zero cooldown dates. Live proof/reservation chronology and deployed code remain UNKNOWN. Do not infer release eligibility from COMPLETED or reactivate all accounts. The local repair deliberately retains unproven paid holds and unresolved review. Sources: `specs/036-audit-remediation/audit-register.md#account-availability-continuation--2026-10-13`; `UPD-20261013-006`.

- Dynamic promo 2026-10-13: The current browser's pre-Load WebForms controls were read, but the automatic approval review blocked the serial Load, so no live promo response or checkout was observed. Local form/identity/report tests cannot prove beIN acceptance or deployed Worker parity; unknown provider layouts now fail closed and require review. Source: `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`; `UPD-20261013-004`.

- Provider report browser 2026-10-13: Local simulated HTTP and native Redis tests do not prove live panel-adapter operation, historical coverage or production load. The subsequent read-only browser visit confirmed Dealer/All/date controls and the report grid, not the panel adapter or a new-sale correlation. No deployment occurred. Sources: `specs/036-audit-remediation/evidence/provider-report-browser-20261013.md`; `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`; `UPD-20261013-003`.

- Cooldown 2026-10-12: Source and PGlite/UI behavior are verified locally, but the actual server needs the trigger migration and matching processes. Native multi-connection tests and full deployed-schema migration rehearsal remain unverified; no live activation is claimed. Sources: `docs/deployment/audit-remediation-release.md`; `UPD-20261012-002`.

- State: UNKNOWN
- Sources: `AGENTS.md#Production-Server-Notes`; `docs/PROJECT_GUIDE.md#Known-Gaps-And-Handoff-Notes`
- Severity: High when a task depends on current production data, deployed migrations, balances, queue state, beIN provider state, payments, or process health.
- Issue status: Open boundary; verify only with explicit authorization and fresh evidence.
- Affected: `DATA-002`, `DATA-005`, `INT-001`, `INT-002`, `OPS-002`, `FEAT-001`, `FEAT-004`, `FEAT-005`, `FEAT-006`

### RISK-002 — PM2 has root/local and Worker/VPS topology variants

- State: VERIFIED
- Sources: `ecosystem.config.js`; `worker/ecosystem.config.js`; `deployment/panel-workers.cjs`; `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `docs/deployment/audit-remediation-release.md`
- Severity: High for adopting the candidate as a capacity fix; medium for restart topology.
- Issue status: Both ecosystem entry points now share an explicit count. The prepared twenty-worker profile has not improved measured renewal throughput under 200 mixed local users and repeats nine admission failures in the burst. Global queue/account limits, continuation deadlines and transaction acquisition need separate capacity work. Keep identity/payment fences and limits intact; deployment/process count must be inventoried from the actual server. PM2/Linux drain/restart and real capacity remain unverified.
- Affected: `APP-004`, `JOB-001`, `JOB-003`, `OPS-002`, `OPS-003`, `OPS-005`, `FEAT-017`, `WORK-004`

### RISK-003 — Ownership conflicts require fail-closed handling

- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md#Known-Gaps-And-Handoff-Notes`; `src/lib/users/ownership.ts`; `specs/033-hierarchical-password-reset/spec.md#Edge-Cases`
- Severity: High for credential, balance, transfer, and permission-sensitive actions.
- Issue status: Current feature-specific paths must preserve conflict indicators and revalidate ownership close to mutation.
- Affected: `DATA-001`, `AUTH-005`, `FEAT-002`, `FEAT-003`, `FEAT-005`

### RISK-004 — Browser and isolated-database release checks remain manual

- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md#Next-Tasks-And-Backlog`
- Severity: Medium for release confidence in recent ownership/password UI flows.
- Issue status: Authenticated AR/EN/BN browser smoke coverage and isolated PostgreSQL concurrency/integration checks remain required before relevant release decisions.
- Affected: `FEAT-002`, `FEAT-003`, `TEST-002`

### RISK-005 — Environment examples do not enumerate all consumed configuration names

- State: VERIFIED
- Sources: `.env.example`; `worker/.env.example`; `src`; `worker/src`; `ecosystem.config.js`; `worker/ecosystem.config.js`
- Severity: Medium for onboarding and deployment; High when an omitted crypto, auth, cron, payment, database-pool, or maintenance name is assumed unnecessary.
- Issue status: Example files document core legacy names but omit several code-consumed names such as encryption, customer/store secrets, cron, Stripe, database pool, customer Worker, maintenance, and insecure-proxy controls. Use `ENV-005` plus target source until examples are deliberately reconciled.
- Affected: `AUTH-008`, `INT-003`, `INT-005`, `ENV-001`, `ENV-002`, `OPS-001`, `OPS-002`, `SEC-004`

### RISK-006 — Broad PRD contains historical inventory drift

- State: CONFLICT
- Sources: `docs/current-project-prd.md#Important-Migration-Level-Guards-To-Preserve`; `docs/current-project-prd.md#Verification-Evidence-And-Required-Checks`; `prisma/migrations`; `tests/unit`
- Severity: Medium for planning and clone/reference work.
- Issue status: The PRD names historical migrations such as `20260514100000_add_integrity_monitoring`, `20260515110000_harden_credit_requests`, and `20260515120000_add_points_system` that are not current migration directories, and conditionally mentions a cancel-confirm test not present by that name. Runtime source and the exact inventories in this ledger outrank those prose names.
- Affected: `SRC-002`, `DATA-005`, `DATA-008`, `TEST-005`, `DEC-004`

### RISK-007 — Customer Worker globally disables TLS verification

- State: VERIFIED
- Sources: `worker/src/customer-index.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/utils/proxy-manager.ts`; `worker/ecosystem.config.js`
- Severity: High for customer Worker transport security.
- Issue status: Customer Worker startup sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for the Bright Data/self-signed proxy path, while HTTP client code also supports a narrower insecure-proxy flag. Treat this as an explicit security boundary and verify certificate/proxy scope before deployment or hardening.
- Affected: `API-009`, `JOB-001`, `INT-003`, `INT-005`, `ENV-005`, `SEC-006`, `FEAT-006`

### RISK-008 — Mobile API CORS currently allows any origin

- State: VERIFIED
- Sources: `next.config.ts#headers`; `src/app/api/mobile`
- Severity: Medium; impact depends on bearer-token storage, mobile/web clients, and deployment origins.
- Issue status: `/api/mobile/:path*` sets `Access-Control-Allow-Origin: *` with GET/POST/PUT/PATCH/DELETE/OPTIONS and authorization/content headers. Preserve compatibility only with an explicit threat/deployment decision when changing auth or exposing browser clients.
- Affected: `API-009`, `AUTH-002`, `AUTH-003`, `ENV-003`, `SEC-006`, `FEAT-006`

### RISK-009 — Renewal proof migration and reported duplicate deductions are not live-verified

- Precision 2026-10-13: Exact matching is locally simulated; same-day prior-sale ambiguity and native service/provider/deployment gaps remain. Decimal precision above the unchanged proof-column capacity now holds rather than rounds. Broad ESLint is not globally clean. Sources: `docs/PROJECT_GUIDE.md`; `worker/tests/precise-renewal-journey.test.ts`; `UPD-20261013-010`.

- Selection incident 2026-10-13: User log for a v2 attempt shows Add succeeded and Sell returned `PACKAGE_QUOTE_CHANGED` before STB, OK or Pay. The exact rejected Sell HTML is absent, so the predicate responsible and real-provider compatibility of the compact parser remain NOT_VERIFIED. The historical attempt, account reservation, charges and deployed Worker versions were not altered or verified by this local repair. Source: user-supplied worker log in this task; `worker/src/http/renewal-purchase-guard.ts`; `UPD-20261013-009`.

- Migration incident 2026-10-13: Production deploy stopped at P3018/55P04, before a confirmed build/restart. Local ordered SQL repair does not establish the target database's failed-record/partial-DDL state or live service health; inspect both before recovery. Source: `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`; `UPD-20261013-008`.

- Version 2, 2026-10-13: New same-day report attribution has an approved temporal limit: Reports lacks an independent sale timestamp, so an identical earlier same-day invoice or a crash after the Pay-intent marker but before HTTP Pay can be mistaken for this attempt. Local tests do not establish provider response shape, disposable DB/Redis races or deployment parity. Do not deploy or claim incident resolution from this change alone. Source: `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`; `UPD-20261013-007`.

- Incident scope, 2026-10-12: Two supplied screenshots show wrong-package renewals; deployed causes remain unproven without server logs/artifacts. The cart parser now follows the inspected DOM; later Sell/STB/OK/Pay and real promo outcomes are still unobserved and may stop affected renewals. IRDETO retains the full serial pending actual format evidence; scheduled starts/credit extensions remain conservative holds. Source: `specs/036-audit-remediation/evidence/package-identity-repair.md`; `UPD-20261012-001`. Do not deploy or resolve balances from local simulation.

- State: UNKNOWN
- Sources: `specs/035-renewal-fulfillment-proof/quickstart.md#Amended-Core-Local-Verification-Record--2026-08-25`; `docs/PROJECT_GUIDE.md#Known-Gaps-And-Handoff-Notes`; `prisma/migrations/20260824090000_renewal_fulfillment_proof/migration.sql`; `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql`; `prisma/migrations/20260824180000_fulfillment_proof_composite_integrity/migration.sql`; `scripts/reconcile-renewal-fulfillment.ts`
- Severity: High for renewal completion, refunds, repeat Pay, and financial settlement.
- Issue status: Core reseller implementation and available local verification pass with explicit service-gated skips, but no feature migration is claimed deployed. The exact card `7517687161` query failed with PostgreSQL `ECONNREFUSED`, so the two operations, provider deductions, contracts/invoices, and refund state remain unverified. `REVIEW_ONLY` is the only accepted rollout mode.
- Required next evidence: disposable PostgreSQL migration/proof/refund/reservation races; disposable Redis lease/session races; production preflight for trim/case provider-login collisions; authorized sanitized Sold Report/active-contract same-Invoice correlation; explicit automation-exclusive account attestation; crash-durable idempotent completion side effects; production deployment confirmation; bounded incident dry-run; Worker/provider logs; and live refund evidence before any financial correction or `ENFORCE`.
- Prohibited inference: Do not infer one or two fulfilled packages from the two balance deductions and do not issue an automatic refund or provider Pay from this ledger/tool.
- Scope boundary: Mobile/store/application execution was explicitly excluded and not run; its files and compile presence do not reduce this risk or provide reseller renewal evidence.
- Affected: `DATA-010`, `FLOW-007`, `FEAT-010`, `FEAT-015`, `FEAT-020`, `OPS-007`, `TEST-008`, `IMPACT-008`

### RISK-010 — Unresolved code-audit findings and conditional release risks

- Extended quality 2026-09-08: Release holds: attributable installment/final-cart evidence, reviewed fresh DB baseline/upgrade drift repair, full lint/CI and actual production acceptance. Empty refund-directory provenance is resolved; it is not a missing migration to invent. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Remaining blockers: attributable installment/final-cart evidence, full lint/CI, migration provenance and actual production/load/cutover acceptance. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: Source-resolvable review gaps fixed locally; attributable installment receipts, final-cart consent evidence, initial/missing migration provenance, account opt-in, old quotes, mixed-worker cutover and live adapter remain explicit release gates. Source: `docs/deployment/audit-remediation-release.md`. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.


- State: VERIFIED
- Sources: `specs/036-audit-remediation/audit-register.md`; `src/lib/store-subscription-payment-claim.ts`; `worker/src/utils/error-handler.ts`; `worker/src/lib/fulfillment-finalization.ts`; `src/lib/auth-utils.ts`; `specs/036-audit-remediation/contracts/financial-lifecycle.md`
- Severity: High for financial closure, access invalidation, compatibility, and release readiness.
- Issue status: Fourteen active panel findings/follow-ups retain their acceptance gates; the six retired audit IDs are excluded, not resolved. Confirmed source mismatches are distinguished from unknown account/data/process/provider conditions. The prior review supplies code evidence, not live incident or runtime-test proof.
- Required next work: Finish T007 attributable installment observation from sanitized original HTTP fixtures; retain T008/T012 dependency gates. Current adapter holds paid/uncertain installments for review. Do not deploy this partial slice as a completed installment feature. All remaining panel tasks retain their acceptance gates; excluded consumers are not certified by a panel release.
- New local evidence: `OPS-009` supplies a preserved backup with known migration-history gaps; restore/count/permission checks do not close any financial finding or substitute for application/migration acceptance. Source: `docs/PROJECT_GUIDE.md#Local-Database-Snapshot`.
- Clone preparation: `OPS-010` applies the nine existing migrations and repairs three missing unique guards locally, exposing real history/schema drift without claiming production repair. Full application/constraint acceptance remains pending. Source: `specs/036-audit-remediation/evidence/local-database-preparation.md`.
- Synthetic rehearsal: `OPS-012` confirms empty 0_init prevents clean migration deploy. T040/T052 explicitly retain the baseline provisioning gap; schema-only bootstrap is bounded foundation evidence, not a release workaround approval.
- Connections: `FEAT-001`, `FEAT-002`, `FEAT-006`, `FEAT-011`, `FEAT-015`, `FEAT-017`, `FEAT-020`, `FEAT-021`, `WORK-005`, `IMPACT-009`

- Phase 3 evidence: 144 tests pass and components for AUD-002/AUD-003/AUD-007 are present, but missing provider observation prevents full closure. Source: `specs/036-audit-remediation/evidence/phase-3-verification.md`.
- Historical panel-only scope (2026-09-07): 46 active tasks / 10 accepted, 25 requirements and 14 audit items. Store and phone-app modifications are excluded; existing code, migrations and prior test results remain. T009 is historically completed outside current progress. Source: `specs/036-audit-remediation/evidence/panel-only-scope-amendment.md`; `UPD-20260907-011`.
- Phase 4 test evidence: T015 test authoring accepted after explicit user approval of synthetic Q04; Q02 4 pass / 6 fail, Q04 1 pass / 6 fail, zero skips. All failures are pre-fix evidence, not accepted runtime behavior. All 71 synthetic business tables were empty before/after. Source: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `UPD-20260907-013`.
- Phase 4: AUD-006/PRM-01–05 locally fixed/verified. Real beIN compatibility, mixed-version cutover, consent-less old snapshots, persistent hold-write recovery, full types/build and T007/T008/T012/release remain open. Resolve old preparation normally; never reset payment identity. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

## 21. Open Tasks

### WORK-008 — Administrative card archive/unlock delivery

- State: PARTIAL
- Sources: `docs/PROJECT_GUIDE.md#admin-card-release--delivery-register-2026-10-13`; `docs/deployment/audit-remediation-release.md#admin-card-release--2026-10-13`
- Status: Local implementation/verification complete within recorded limits; GitHub delivery authorized. User owns coordinated server deployment and each historical-card decision. Native service/concurrency/full migration-chain verification remains open, and no production card has been released here.
- Connections: `FEAT-015`, `TEST-001`, `OPS-002`, `RISK-001`, `DEC-011`

### WORK-001 — Web project memory ledger feature

- State: VERIFIED
- Sources: `specs/034-web-project-memory/spec.md`; `specs/034-web-project-memory/plan.md`; `specs/034-web-project-memory/tasks.md`
- Status: Complete on branch `034-web-project-memory`.
- Scope: `.agents/skills/web-project-memory`, personal installation, `PROJECT_MEMORY.md`, focused behavior tests, Spec Kit artifacts, `.gitignore`, and `docs/PROJECT_GUIDE.md`.
- Completion: T001-T018 are implemented and verified; the corrected source and personal packages are byte-equivalent and all feature checklists are complete.
- Runtime impact: NO_RUNTIME_IMPACT

### WORK-002 — Existing release follow-ups

- State: PLANNED
- Sources: `docs/PROJECT_GUIDE.md#Next-Tasks-And-Backlog`
- Status: Backlog.
- Scope: Authenticated multilingual/RTL password-reset and agent-drill-down browser smoke checks plus isolated PostgreSQL ownership/concurrency integration checks.
- Connections: `RISK-004`, `FEAT-002`, `FEAT-003`, `TEST-002`

### WORK-003 — Whole-project memory expansion

- State: VERIFIED
- Sources: `PROJECT_MEMORY.md`; `docs/PROJECT_GUIDE.md`; `src/app`; `src/lib`; `prisma`; `worker`; `tests`; `docs/current-project-prd.md`
- Status: Complete on 2026-08-23.
- Scope: Expanded the existing stable-ID ledger across page/component inventory, backend services, all API families, schema/enums/migrations, flows, auth/permissions, jobs/integrations, environment names, security, tests, operations, features, impact links, decisions, and verified risks.
- Completion boundary: No source implementation, schema, migration, dependency, secret, service, external system, or production state was changed or claimed verified.
- Runtime impact: NO_RUNTIME_IMPACT

### WORK-004 — Renewal fulfillment proof and duplicate-charge containment

- Current standalone accepted-plan delivery: `UPD-20261013-011` repairs unjustified pre-payment holds and their admin/maintenance visibility. No Spec Kit lifecycle or historical acceptance count changed. Source: `docs/PROJECT_GUIDE.md`.

- Recovery continuation 2026-10-13: The reported production migration attempt failed at 55P04. The ordered enum migration is locally tested; production history/schema inspection, native retry and consistent process restart remain open. Source: `specs/036-audit-remediation/audit-register.md#same-page-renewal-and-same-day-report-continuation--2026-10-13`; `UPD-20261013-008`.

- Version 2 continuation 2026-10-13: Locally implemented one-page promo/selection, daily report proof and persistent receipt. New migration and production cutover are NOT_VERIFIED; old v1 attempts keep their original policy. The evidence register lists each requirement and release gate. Source: `specs/036-audit-remediation/audit-register.md#same-page-renewal-and-same-day-report-continuation--2026-10-13`; `UPD-20261013-007`.

- Account lifecycle continuation: cooldown removal and terminal reservation fences/repair verified locally. Pending: read the supplied paid operations' proof and reservation chronology, confirm deployed versions, and exercise native PostgreSQL/Redis races before production acceptance. Source: `specs/036-audit-remediation/audit-register.md#account-availability-continuation--2026-10-13`; `UPD-20261013-006`.

- Dynamic promo continuation 2026-10-13: Local runtime change binds promo POST to the current provider form and rechecks card/STB before Add; exact package/cart/invoice guards remain, with no new Pay retry or automatic refund. The live Load/promo response and synchronized production Workers are open release checks. Source: `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`; `UPD-20261013-004`.

- Read-only review 2026-10-13: Full UI/API/Worker path and live Check/CISCO package/report pages are mapped in the linked evidence. The existing source stops rather than substitutes another package; exact live checkout and post-sale proof remain unverified. The supplied pre-repair logs explain the immediate loading error, not the older wrong-package incidents. Source: `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`; `UPD-20261013-003`.

- Local performance supplement 2026-10-12: Localization/configuration, representative journey, 200-user comparison, isolated fault assertions and cleanup are recorded. Twenty workers did not improve measured renewal throughput and failed burst admission targets; this candidate is not a production capacity fix. Native focused DB/Redis cases pass. Historical migration, native OS egress isolation, live provider and deployment acceptance remain open. Sources: `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `UPD-20261012-003`.

- Cooldown 2026-10-12: User-authorized local supplement is implemented with 14 focused cases, ten browser scenarios and current full-unit/type/schema checks. Existing review containment survives timer expiry. Remaining native DB/process/deployment checks are explicitly open, and no financial/provider execution occurred. Sources: `specs/036-audit-remediation/audit-register.md#supplemental-card-cooldown--2026-10-12`; `UPD-20261012-002`.

- Current continuation, 2026-10-12: User authorized implementation of the previously observed cart/report/promo plan, with local tests only and no subagents/provider transactions. The incompatible parsers are repaired; stale total without cart is rejected, quote/promo/card evidence survives to report correlation, and unknown next controls stop execution. Local delivery completed; later-stage and actual promo compatibility, service races, incident attribution and production artifacts remain pending. Source: `specs/036-audit-remediation/evidence/package-identity-repair.md`; `UPD-20261012-001`.

- State: PARTIAL
- Sources: `specs/035-renewal-fulfillment-proof/spec.md`; `specs/035-renewal-fulfillment-proof/tasks.md`; `worker/src/http/sold-packages-report.ts`; `worker/src/lib/fulfillment-baseline.ts`; `worker/src/lib/fulfillment-finalization.ts`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts`; `prisma/migrations/20260824090000_renewal_fulfillment_proof/migration.sql`; `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql`; `prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql`; `prisma/migrations/20260824180000_fulfillment_proof_composite_integrity/migration.sql`; `scripts/reconcile-renewal-fulfillment.ts`
- Status: Reseller-core local implementation and available verification complete on 2026-08-25; `REVIEW_ONLY`, production, disposable-service gates, and incident reconciliation remain pending.
- Scope: Sold Report baseline/diff plus same-Invoice active-contract proof, card/account reservations, fenced non-replayed provider mutation, exact latest-attempt completion, read-only verification recovery, safe refunds/review, localized panel states, and non-financial reconciliation. Mobile/store/application execution is excluded.
- Verification: `TEST-008`. Database/Redis/live/effects/deployment pending items are explicit in `RISK-009` and prevent a production-complete or `ENFORCE` claim.
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED

### WORK-005 — Track and implement audit remediation under Spec Kit 036

- Extended quality 2026-09-08: 45/57 tasks accepted locally; T067-T069 complete. 802 distinct unit and 221 distinct worker cases pass; four export browser scenarios and isolated builds/types pass. In-scope lint has zero errors; full lint retains seven excluded mobile/customer errors and 41 warnings. Fresh database baseline, provider evidence and release gates remain open. Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `UPD-20260908-003`. Earlier dated results are historical.

- Local backlog 2026-09-08: Approved local backlog completed through verified tasks without subagents; explicit quality, deferred evidence and release gates remain. Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `UPD-20260908-002`. Earlier dated results are historical.

- Review repair 2026-09-08: T059-T066 completed without subagents; T016/T017 reaccepted from current evidence. Next unresolved input is sanitized attributable installment/final-cart HTTP evidence; do not enable production based on local passes. Source: `specs/036-audit-remediation/evidence/review-repairs.md`; `UPD-20260908-001`.


- State: VERIFIED
- Sources: `specs/036-audit-remediation/tasks.md`; `specs/036-audit-remediation/README.md`; `specs/036-audit-remediation/quickstart.md`; `.specify/feature.json`; `AGENTS.md`
- Status: 45/57 tasks accepted locally; open IDs T007/T008, T037/T038, T051-T058. Source: `specs/036-audit-remediation/evidence/extended-quality-verification.md`.
- Scope: Reseller/admin panel, responsive web and required shared services/workers only. No store/Stripe/customer-worker enablement or phone-app implementation. Preserve existing guards and compatibility; no worker session pool.
- Later local exception: The maintainer requested database updates after supplying the backup; the specification/plan/task boundary now permits the isolated restore/clone/schema preparation in `OPS-009`/`OPS-010`. This supersedes only the original local DB/service/migration prohibition, not application tests/startup or acceptance. Source: `specs/036-audit-remediation/evidence/local-database-preparation.md`.
- Previous Phase 3 execution: User authorized Phase 3. Components implemented; 144 focused tests pass without skips, worker/focused web types pass and synthetic DB is empty. Next input: sanitized original installment receipt/rejection HTML; implement its attributable parser under T007 before closing dependencies. No provider/production action.
- Connections: `WORK-004`, `FEAT-021`, `RISK-010`, `DEC-007`, `IMPACT-009`
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED
- Historical panel-only scope (2026-09-07): 46 active tasks / 10 accepted, 25 requirements and 14 audit items. Store and phone-app modifications are excluded; existing code, migrations and prior test results remain. T009 is historically completed outside current progress. Source: `specs/036-audit-remediation/evidence/panel-only-scope-amendment.md`; `UPD-20260907-011`.

- Phase 4 test evidence: T015 test authoring accepted after explicit user approval of synthetic Q04; Q02 4 pass / 6 fail, Q04 1 pass / 6 fail, zero skips. All failures are pre-fix evidence, not accepted runtime behavior. All 71 synthetic business tables were empty before/after. Source: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `UPD-20260907-013`.
- Phase 4: Phase 4 T015-T017 complete, 10/46 accepted; synthetic API/worker/DB and six mocked browser groups verified with independent review. Later phases and T007/T008/T012 remain open. Saved locally, no commit/push/deploy. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

## 22. Change Ledger

### UPD-20261013-012 — Archive current blocking attempts and release a card by ADMIN decision

- Date: 2026-10-13
- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md#admin-card-release--delivery-register-2026-10-13`; `shared/operations/admin-card-release.ts`; `prisma/migrations/20261013190000_admin_card_release/migration.sql`; `src/components/admin/financial-review/CardReleaseDialog.tsx`; `tests/unit/admin-card-release.test.ts`; `tests/unit/admin-card-release-api.test.ts`; `worker/tests/admin-card-release-http.test.ts`; `tests/browser/panel-review-cases.cjs`
- Affected IDs: `FE-007`, `FE-008`, `BE-002`, `API-007`, `DATA-002`, `FLOW-001`, `JOB-003`, `JOB-005`, `SEC-005`, `OPS-002`, `FEAT-015`, `TEST-001`, `FRESH-001`
- Delta: Added current-scope preview, active-ADMIN decision, stable replay key, request drain, atomic archive/release, financial fences, cooldown waiver, neutral owner progress and localized archive/audit UI. New attempts remain normally guarded; no original financial result or open issue is rewritten.
- Evidence: 903 root passes, 490 Worker passes/five Redis skips, 92 mocked review-browser cases, actual Prisma/PGlite migration/archive/replay/rollback and actual Axios late-response interception; root/Worker types/builds pass. Changed-file lint has no errors; full lint retains unrelated errors. Native PostgreSQL/Redis contention, native complete historical migration chain, provider cancellation and production remain NOT_VERIFIED.
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED. No live provider/payment, production row edits or subagents. GitHub delivery is authorized; the user deploys and chooses each historical card decision.

### UPD-20261013-011 — Close proven pre-payment holds and expose remaining blockers

- Date: 2026-10-13
- State: VERIFIED
- Sources: `shared/operations/renewal-pre-payment.ts`; `shared/operations/renewal-hold.ts`; `src/lib/maintenance/renewal-hold-maintenance.ts`; `src/lib/operations/pre-mutation-renewal-finalization.ts`; `worker/src/lib/pre-mutation-renewal-finalization.ts`; `src/app/api/admin/financial-review`; `src/components/admin/financial-review/FinancialReviewClient.tsx`; `tests/unit/renewal-hold-persistence.test.ts`; `tests/unit/renewal-hold-safety.test.ts`; `worker/tests/renewal-hold-closure.test.ts`; `docs/PROJECT_GUIDE.md`
- Affected IDs: `FE-003`, `FE-007`, `BE-002`, `API-011`, `DATA-002`, `FLOW-007`, `JOB-005`, `SEC-002`, `TEST-008`, `FEAT-015`, `WORK-004`, `FRESH-001`
- Delta: Reproduced stale-issue blocking after safe failure, then integrated positive evidence, atomic local-issue/dispatch/reservation closure, terminal replay and audited admin repair. Bounded maintenance limits automatic unresolved-review closure to new policy-tagged v2 operations, defers active owners and preserves historical financial/cross-operation holds. Existing APIs/UI expose localized actionable blockers and cursor-search navigation.
- Evidence: Local root/Worker/browser/types/build and actual Prisma/PGlite SQL replay/rollback/cooldown checks; detailed counts and retained logs in `docs/PROJECT_GUIDE.md`. Scope-specific code review preserves final submission, original settlement, privacy and separate-operation boundaries. The PGlite bridge serializes one connection; native PostgreSQL/Redis contention, production evidence and real-provider behavior are NOT_VERIFIED.
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED. No provider request, live money, migration, historical financial decision or subagent. GitHub source delivery authorized; user owns deployment.

### UPD-20261013-010 — Read exact package cells and correlate report display variants

- Date: 2026-10-13
- State: PARTIAL
- Trigger: Maintainer approved precise same-row package/price extraction, preserved provider names, exact-decimal report correlation and a tested GitHub handoff without provider calls or subagents.
- Sources: `shared/operations/provider-price.ts`; `shared/operations/package-quote.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/report-package-identity.ts`; `worker/src/lib/same-day-report-fulfillment.ts`; `worker/tests/precise-package-report.test.ts`; `worker/tests/precise-renewal-journey.test.ts`; `docs/PROJECT_GUIDE.md`
- Delta: Map unique provider columns and retain exact price text/decimal through quote/session/selection; apply narrow Reports display equivalence and exact amount checks in search and transaction. Preserve all commercial terms, claims and flow guards; reuse the same completed invoice without re-claiming and reject unrepresentable proof amounts rather than rounding. Add bounded private-data-free diagnostics.
- Evidence: Three red regressions, four complete mocked journeys and current full unit/type/build/scoped-lint checks are documented in the guide. Full lint retains unchanged source/ignored-artifact debt. Native DB/Redis races, live provider compatibility and production cutover remain NOT_VERIFIED.
- Affected IDs: `API-011`, `DATA-002`, `FLOW-007`, `INT-001`, `TEST-008`, `FEAT-020`, `RISK-009`, `FRESH-001`
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED

### UPD-20261013-009 — Distinguish package selection preparation from final payment

- Date: 2026-10-13
- State: PARTIAL
- Trigger: Maintainer supplied a v2 Worker log stopping on `PACKAGE_QUOTE_CHANGED` at Sell and approved a pre-final selection repair. Add/Sell/STB are preparation; customer-approved OK/Pay is later.
- Sources: `worker/src/http-queue-processor.ts`; `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/lib/promo-quote.ts`; `worker/src/lib/pre-mutation-renewal-finalization.ts`; `shared/operations/consumer-progress.ts`; `src/app/dashboard/renew/page.tsx`; `worker/tests/renewal-package-identity.test.ts`; `worker/tests/pre-final-selection-closure.test.ts`; `tests/unit/operation-consumer-state-contract.test.ts`; `docs/PROJECT_GUIDE.md`
- Delta: Reserve the account before publishing a v2 quote; keep promo revision/page ownership and invalidate stale offers; accept compact later cart evidence without relaxing exact commercial identity. End verified no-debit Add/Sell/STB failures and prepared-confirmation cancellation without a financial hold or automatic replay; retain review for final mutation or sale evidence. Add translated customer feedback and a guarded historical admin capability.
- Evidence: Local synthetic parser and closure tests, full root/Worker unit suites, both TypeScript checks, schema sync, scoped lint and local web/Worker builds passed. Actual Sell HTML, native service races and production deployment remain NOT_VERIFIED; the historic operation was not changed.
- Affected IDs: `FE-007`, `API-011`, `FLOW-007`, `JOB-003`, `INT-001`, `TEST-008`, `FEAT-010`, `FEAT-020`, `RISK-009`, `FRESH-001`
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED

### UPD-20261013-008 — Recover enum-order failure in same-day report migration

- Date: 2026-10-13
- State: PARTIAL
- Trigger: User supplied production P3018/PostgreSQL 55P04 output from the first same-day report migration attempt.
- Sources: `prisma/migrations/20261013115959_same_day_report_enum_values/migration.sql`; `prisma/migrations/20261013120000_same_day_report_renewal/migration.sql`; `tests/unit/same-day-report-migration-sql.test.ts`; `scripts/check-same-day-report-migration-recovery.cjs`; `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`; `docs/deployment/audit-remediation-release.md`
- Delta: Preserve published migration bytes and commit its three new enum labels in an earlier separate migration so the original CHECK constraints can use them. Add a read-only history/schema preflight before resolving the failed production row.
- Evidence: Local PGlite red/green SQL and constraint test; production schema/history and native Prisma retry remain NOT_VERIFIED. No provider mutation or direct production database action by Codex.
- Affected IDs: `DATA-010`, `TEST-008`, `OPS-002`, `RISK-009`, `WORK-004`, `FRESH-001`
- Runtime impact: MIGRATION_ORDER_REPAIR_NOT_DEPLOYED

### UPD-20261013-007 — Versioned same-page renewal, daily report proof and receipt

- Date: 2026-10-13
- State: PARTIAL
- Trigger: Maintainer approved the v2 renewal plan and clarified that a Sell Packages reload loses card/type selection.
- Sources: `specs/036-audit-remediation/evidence/same-day-report-renewal-20261013.md`; `prisma/migrations/20261013120000_same_day_report_renewal/migration.sql`; `worker/src/http-queue-processor.ts`; `worker/src/lib/same-day-report-fulfillment.ts`; `src/lib/operations/receipt.ts`; `docs/PROJECT_GUIDE.md`
- Delta: New package attempts retain the same operation page across Workers and promo changes, stop on lost/mismatched state, correlate one exact Cairo-day provider invoice after mutation, complete/claim/release atomically, and expose a protected local receipt. Existing v1 operations and financial holds remain versioned. No real provider mutation or deployment.
- Evidence: Local unit/Worker/types/schema/lint/build checks and linked register; migration/concurrency and live-provider compatibility remain NOT_VERIFIED. A same-day prior identical sale remains a known attribution risk.
- Affected IDs: `API-011`, `DATA-002`, `DATA-010`, `FLOW-007`, `JOB-003`, `JOB-005`, `FEAT-010`, `FEAT-020`, `TEST-008`, `DEC-010`, `RISK-009`, `WORK-004`, `FRESH-001`
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED

### UPD-20261013-006 — Remove account cooldowns and repair ended account ownership

- Date: 2026-10-13
- State: PARTIAL
- Sources: `worker/src/pool`; `worker/src/lib/provider-account-reservation.ts`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/provider-reservation-maintenance.ts`; `src/lib/maintenance/operation-maintenance-runner.ts`; `src/lib/renewal-readiness.ts`; `src/app/api/admin/bein-accounts`; `tests/unit/provider-reservation-maintenance.test.ts`; `worker/tests/provider-reservation-lifecycle.test.ts`; `docs/PROJECT_GUIDE.md`; `specs/036-audit-remediation/audit-register.md`
- Affected IDs: `API-007`, `JOB-006`, `ENV-006`, `TEST-001`, `FEAT-014`, `IMPACT-005`, `RISK-001`, `WORK-004`, `FRESH-001`
- Delta: Honor explicit removal of provider-account cooldowns only; preserve card/rate/review guards. Fence terminal reservation reopening and release completed checks atomically. Repair eligible ended account holds with stored domain proof and generation checks, after Redis owners drain. Original account attribution, operation state, money and card deadlines remain intact.
- Impact: Local source/tests only; no migration, provider request, server mutation, push, deployment or subagent. Native service races and exact production paid-operation release eligibility remain unverified; existing UI lock/count ambiguity is documented.

### UPD-20261013-005 — Clarify complete native CISCO serial POST value

- Date: 2026-10-13
- State: VERIFIED
- Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/tests/smartcard-loading.test.ts`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`; `specs/036-audit-remediation/audit-register.md`; `docs/PROJECT_GUIDE.md`
- Affected IDs: `INT-001`, `RISK-001`, `FRESH-001`
- Delta: Correct the prior assistant's incomplete-card interpretation. Native and Worker Load POSTs carry the entire nine-digit CISCO provider field value, including the digit prefilled in the UI; the customer's ten-digit card remains separate. Withdraw the unnecessary approval request. Focused existing mapping/HTTP-client tests pass.
- Impact: NO_RUNTIME_IMPACT. Documentation only; no provider Load, package mutation, purchase, payment, deployment or subagent. Live promo and later checkout remain unverified.

### UPD-20261013-004 — Bind dynamic promo to the current quote and recheck receiver

- Date: 2026-10-13
- State: PARTIAL
- Sources: `src/app/api/operations/[id]/apply-promo/route.ts`; `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/package-cache.ts`; `tests/unit/promo-package-quote-contract.test.ts`; `worker/tests/renewal-package-identity.test.ts`; `worker/tests/promo-package-refresh.test.ts`; `specs/036-audit-remediation/evidence/dynamic-promo-renewal-20261013.md`; `specs/036-audit-remediation/audit-register.md`; `docs/PROJECT_GUIDE.md`
- Affected IDs: `FE-007`, `API-003`, `FLOW-007`, `INT-001`, `TEST-008`, `DEC-009`, `RISK-001`, `WORK-004`, `FRESH-001`
- Delta: Normalize variable coupon input, build its POST from the exact current provider form, reject stale/missing/conflicting controls, preserve unique full-offer/cart/report proof, clear/recheck the card's labelled STB before Add, and remove known direct identifier/page-snippet logs. Local unit suites, types and scoped lint pass.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Live promo/Check-after-Load and new-sale report behavior remain unverified because browser approval blocked Load; server Worker artifacts and historical incidents were not inspected. No live sale, payment, refund, database schema change or subagent.

### UPD-20261013-003 — Trace renewal against read-only live provider pages

- Date: 2026-10-13
- State: PARTIAL
- Sources: `src/app/dashboard/renew/page.tsx`; `src/app/api/operations/start-renewal/route.ts`; `src/app/api/operations/[id]/select-package/route.ts`; `src/app/api/operations/[id]/confirm-purchase/route.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/sold-packages-report.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/renewal-fulfillment-correlation.ts`; `specs/036-audit-remediation/evidence/renewal-readonly-flow-comparison-20261013.md`; `specs/036-audit-remediation/audit-register.md`; `docs/PROJECT_GUIDE.md`
- Affected IDs: `FE-007`, `FLOW-007`, `INT-001`, `TEST-008`, `FEAT-013`, `RISK-001`, `WORK-004`, `FRESH-001`
- Delta: Document the current card/quote/cart/confirmation/Reports path against authorized live Check, CISCO preparation and Dealer-scoped Sold Report observations. Distinguish the pre-repair loading failure from unproven wrong-package incidents; record conservative scheduled-start/outside-sale holds, STB provenance/logging risk and later-stage live gaps. Four focused suites pass 95 cases.
- Impact: NO_RUNTIME_IMPACT. Documentation only; no source behavior, schema, production state, provider sale/payment, refund or subagent action. Live panel HTTP adapter, IRDETO/promo/checkout and production Worker parity remain unverified.

### UPD-20261013-002 — Repair prefixed smartcard selection during package loading

- Date: 2026-10-13
- State: VERIFIED
- Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/index.ts`; `shared/operations/consumer-progress.ts`; `src/app/dashboard/renew/page.tsx`; `src/i18n/translations`; `worker/tests/smartcard-loading.test.ts`; `worker/tests/fixtures/renewal-observed.ts`; `worker/tests/provider-observed-identity.test.ts`; `tests/unit/operation-consumer-state-contract.test.ts`; `tests/browser/renewal-card-cooldown.cjs`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `specs/036-audit-remediation/audit-register.md`; `docs/PROJECT_GUIDE.md`
- Affected IDs: `FE-007`, `FLOW-007`, `INT-001`, `TEST-008`, `FRESH-001`
- Delta: Resolve the observed explicit smartcard label/value pair in loading and cart checks, reject ambiguous or changed forms, validate serial capacity, mirror native omission of disabled confirmation controls, localize the stable failure code and distinguish queue handling from business success. Save a sanitized HTTP field map and fixture. Preserve current serial conversions and financial/package proof authority.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Local regression/type/browser checks pass and live read-only CISCO preparation was inspected; live IRDETO input mapping, later checkout and deployed behavior remain unverified. The user clarified HTTP observation only, superseding the earlier interpretation of a purchase request. No subagents, package selection, cart, sale or payment.

### UPD-20261013-001 — Browse selected beIN account sales inside Reports

- Date: 2026-10-13
- State: VERIFIED
- Sources: `shared/reports`; `src/components/admin/report-center`; `src/hooks/useProviderReport.ts`; `src/app/api/admin/reports/bein-provider`; `src/app/api/admin/bein-accounts/route.ts`; `worker/src/lib/provider-report-reader.ts`; `worker/src/http/sold-packages-report.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http-queue-processor.ts`; `worker/src/index.ts`; `tests/unit/provider-report-api.test.ts`; `worker/tests/provider-report-browser.test.ts`; `tests/integration/provider-report-redis.test.ts`; `tests/browser/bein-provider-report.cjs`; `specs/036-audit-remediation/evidence/provider-report-browser-20261013.md`; `docs/PROJECT_GUIDE.md`; `docs/deployment/audit-remediation-release.md`; `docs/current-project-prd.md`
- Affected IDs: `FE-003`, `FE-008`, `BE-003`, `API-007`, `INT-001`, `JOB-007`, `JOB-008`, `SEC-003`, `TEST-001`, `TEST-003`, `OPS-002`, `FEAT-013`, `IMPACT-005`, `RISK-001`, `FRESH-001`
- Delta: Add exact-account ADMIN report UI/API/Worker read flow with date/All criteria, complete-scan guards, fenced Redis admission/results, localized paging/search and cancellation. Preserve account reservations, financial proof defaults and all earlier capacity/cooldown work. No schema or financial-state change.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Local tests/builds and semantic review are recorded separately; temporary resources are cleaned up. Live provider, mixed-version production rollout, complete CI and release acceptance remain unverified. No subagents, purchase, payment, subscription or live provider access.

### UPD-20261012-003 — Localize renewal and measure the prepared worker topology

- Date: 2026-10-12
- State: VERIFIED
- Sources: `src/app/dashboard/renew/page.tsx`; `src/components/renewal`; `src/i18n/translations`; `deployment/panel-workers.cjs`; `deployment/panel-workers.env.example`; `worker/src/lib/fulfillment-baseline.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/lib/session-keepalive.ts`; `tests/integration/renewal-baseline-capture-db.test.ts`; `scripts/audit-gate-manifest.cjs`; `tests/browser/renewal-card-cooldown.cjs`; `specs/036-audit-remediation/evidence/localization-capacity-20261012.md`; `docs/deployment/audit-remediation-release.md`
- Affected IDs: `APP-004`, `FE-007`, `FLOW-007`, `JOB-003`, `ENV-002`, `OPS-002`, `TEST-001`, `TEST-002`, `TEST-003`, `TEST-008`, `FEAT-001`, `FEAT-020`, `RISK-002`, `WORK-004`, `FRESH-001`
- Delta: Use selected-language renewal feedback and prepare 20 unique Workers at concurrency 4/pool 2 with five-minute drain. Real disposable-service smoke repaired an invalid baseline-column query and missing account binding in exported sessions. Existing financial, package, promo and cooldown authority stays unchanged. Temporary load tools/data remain outside the project.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Local comparison fails smooth-200-user capacity acceptance; fault cases confirm the exercised safety fences. Temporary services/ports/data/tools are removed and source checks pass. No real provider purchases, production access, deployment or subagents. Full native OS egress isolation, historical migration, PM2/Linux drain and production acceptance remain unverified; this entry verifies the saved change/outcomes, not those open scopes.

### UPD-20261012-002 — Pause card renewals for five minutes after each attempt

- Date: 2026-10-12
- State: PARTIAL
- Sources: `prisma/migrations/20261012120000_renewal_card_cooldown/migration.sql`; `prisma/schema.prisma`; `worker/prisma/schema.prisma`; `src/lib/operations/renewal-card-cooldown.ts`; `src/lib/operations/renewal-creation-guard.ts`; `src/app/api/operations/start-renewal/route.ts`; `src/hooks/useRenewalCardCooldown.ts`; `src/components/renewal/CardCooldownNotice.tsx`; `src/app/dashboard/renew/page.tsx`; `src/i18n/translations`; `tests/unit/renewal-card-cooldown.test.ts`; `tests/unit/renewal-card-cooldown-sql.test.ts`; `tests/browser/renewal-card-cooldown.cjs`; `specs/036-audit-remediation/audit-register.md`; `docs/PROJECT_GUIDE.md`; `docs/deployment/audit-remediation-release.md`
- Affected IDs: `FE-007`, `BE-002`, `API-011`, `DATA-002`, `DATA-009`, `FLOW-001`, `TEST-001`, `OPS-002`, `FEAT-001`, `IMPACT-001`, `DEC-008`, `RISK-001`, `WORK-004`, `FRESH-001`
- Delta: Immutable database deadline from first package-attempt end, shared card admission guard and localized countdown using the existing authenticated API. Denied requests/reloads/late proof cannot extend it. Review remains stronger than expiry; checks/signals/installments do not start the cooldown. No historical backfill.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Local verification: 843 root cases, 287 Worker passes/five Redis skips, ten isolated browser scenarios, both types/schema parity/scoped lint. SQL tested in PGlite only; native concurrent-worker/full-schema migration and production acceptance remain open. No business database, provider, funds, deployment or subagent actions. Root and Worker clients were generated locally.

### UPD-20261012-001 — Apply observed cart and Reports identity contracts

- Date: 2026-10-12
- State: PARTIAL
- Sources: `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http/sold-packages-report.ts`; `worker/src/lib/renewal-fulfillment-correlation.ts`; `worker/src/http-queue-processor.ts`; `worker/tests/fixtures/renewal-observed.ts`; `worker/tests/provider-observed-identity.test.ts`; `worker/tests/renewal-package-identity.test.ts`; `worker/tests/renewal-worker-evidence.test.ts`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `docs/deployment/audit-remediation-release.md`
- Affected IDs: `FLOW-007`, `INT-001`, `TEST-008`, `FEAT-020`, `RISK-009`, `WORK-004`, `FRESH-001`
- Delta: Replace synthetic cart assumptions and wrong report criteria; interpret only explicit rowspans; preserve full/provider serial, quote/revision/key and promo through payment evidence and new-invoice attribution. Require echoed STB and present next controls. Unchanged promo catalogues cannot certify acceptance. Compare report/contract dates and full commercial offer separately from same-invoice plain entitlement. Existing financial holds and no-replay behavior remain controlling.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Four representative red tests then green; current root 826 passes, Worker 287 passes/five Redis skips, final affected root 14 passes, types/emission/schema/lint checks pass. Unknown later-stage/promo layouts, real service races and server incident attribution keep release acceptance INCOMPLETE. Local mocks only; no provider traffic, business DB writes, balances/refunds, migrations, deployment or subagents. Fixture provenance distinguishes observed fragments from synthetic later stages.

### UPD-20261011-001 — Bind renewal selection to current provider purchase evidence

- Date: 2026-10-11
- State: PARTIAL
- Sources: `shared/operations/package-quote.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http/renewal-purchase-guard.ts`; `worker/src/http/types.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/promo-quote.ts`; `worker/src/lib/session-cache.ts`; `worker/src/lib/contract-verification.ts`; `worker/src/lib/renewal-fulfillment-correlation.ts`; `worker/tests/renewal-package-identity.test.ts`; `specs/036-audit-remediation/evidence/package-identity-repair.md`; `docs/deployment/audit-remediation-release.md`
- Affected IDs: `FLOW-007`, `INT-001`, `TEST-008`, `FEAT-020`, `RISK-009`, `WORK-004`, `FRESH-001`
- Delta: Preserve accepted currency/full package/offer/promo and original quote; reject unrelated package grids, stale controls and cart drift; bind prepared proof to session/card/state; consume before final mutation; retain fenced review and invoice/contract proof. Existing APIs, messages, database and financial settlement policy are reused.
- Live inspection supplement: Verified real Report controls (`DEALER_CONTEXT_MISSING` in a minimal local reproduction), package grid, temporary cart, empty-cart stale total and promo field names; removed the temporary item. The real cart structure fails the synthetic guard. Revised plan prioritizes accepted quote -> cart -> new Reports invoice/line, with Check supplementary only, and covers promo acceptance, serial mapping, grouped rows, term/event identity and dates. No purchase or new runtime code change occurred. Evidence: `specs/036-audit-remediation/evidence/package-identity-repair.md`, live provider section.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Synthetic negative/positive verification only; original provider markup, real service race gates and server incident correlation remain NOT_VERIFIED. No business database/balance writes, new endpoints, migrations or subagents. This update does not activate Spec Kit or grant release acceptance.

### UPD-20260908-003 — Extended local quality and connected repairs

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/extended-quality-verification.md`; `specs/036-audit-remediation/tasks.md`; `src/lib/manager-dashboard.ts`; `src/components/renewal/BeINExportTable.tsx`; `src/lib/maintenance/operation-maintenance-runner.ts`; `worker/src/http/HttpClientService.ts`; `ecosystem.config.js`
- Date: 2026-09-08
- Affected IDs: `FE-006`, `BE-001`, `API-008`, `DATA-005`, `DATA-008`, `JOB-003`, `JOB-005`, `INT-001`, `OPS-003`, `TEST-001`, `TEST-003`, `FEAT-012`, `FEAT-017`, `FEAT-018`, `FEAT-021`, `IMPACT-009`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Implemented T067-T069 and T051 quality corrections with red/green evidence; resolved the refund-directory provenance ambiguity without rewriting migration history. Current acceptance is 45/57; local verification and explicit release gaps are recorded above.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. No production/provider/PostgreSQL access, phone/store changes, dependency upgrades or subagents. Dedicated Redis was empty and stopped; serving .next untouched.

### UPD-20260908-002 — Complete verified local panel backlog without subagents

- State: VERIFIED
- Date: 2026-09-08
- Sources: `specs/036-audit-remediation/evidence/local-backlog-verification.md`; `specs/036-audit-remediation/tasks.md`; `specs/036-audit-remediation/contracts/local-backlog.md`; `docs/deployment/audit-remediation-release.md`; `prisma/migrations/20260908120000_dispatch_retry_schedule/migration.sql`; `deployment/panel-workers.cjs`
- Affected IDs: `FE-003`, `FE-007`, `BE-002`, `BE-006`, `API-003`, `API-006`, `API-007`, `API-011`, `AUTH-001`, `DATA-002`, `DATA-005`, `DATA-008`, `JOB-002`, `JOB-005`, `ENV-002`, `SEC-002`, `SEC-005`, `TEST-001`, `TEST-002`, `TEST-003`, `OPS-001`, `OPS-002`, `OPS-003`, `OPS-005`, `OPS-006`, `OPS-013`, `FEAT-010`, `FEAT-015`, `FEAT-017`, `FEAT-021`, `IMPACT-009`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Current auth and review capabilities, canonical legacy/pre-mutation closure, bounded attempt-CAS dispatch, durable completion effects, readiness, safe panel progress, shared topology and CI skip guard implemented and verified. 42/54 active tasks accepted; remaining evidence/quality/release gates retained.
- Verification: 790 unit/218 worker tests, 178 distinct synthetic integration cases, 22 mocked-browser groups; isolated web/worker compilation and types pass. Focused lint zero errors/four warnings, broader lint not accepted. 71 business tables empty; owned Redis stopped; schemas identical, historical SQL and excluded source preserved.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. No provider execution, production access, commit/push or subagents. Provider installment/final-cart evidence, migration provenance and full quality/operational release remain open.

### UPD-20260908-001 — Implement review repairs without subagents

- State: VERIFIED
- Date: 2026-09-08
- Sources: `specs/036-audit-remediation/evidence/review-repairs.md`; `specs/036-audit-remediation/contracts/review-repairs.md`; `specs/036-audit-remediation/tasks.md`; `docs/deployment/audit-remediation-release.md`; `.gitignore`
- Affected IDs: `FE-003`, `FE-007`, `BE-002`, `API-006`, `API-007`, `AUTH-001`, `JOB-002`, `JOB-003`, `JOB-006`, `TEST-001`, `TEST-002`, `TEST-003`, `OPS-013`, `FEAT-010`, `FEAT-015`, `FEAT-021`, `IMPACT-009`, `DEC-007`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Fenced parked-owner handoff, atomic zero-effect pre-sale quote closure, current operation identity, all-type dispatch recovery, unsupported admission rejection, request deadlines and required-note contract implemented. CI selection/type defects fixed. T059-T066 accepted; T016/T017 reaccepted; 18/54 active tasks.
- Verification: 149 focused +55 synthetic PostgreSQL +8 Redis tests, zero skips; ten mocked-browser groups, root/worker types and focused lint pass. Synthetic database returned to zero rows. No live provider/production action; schema/migration/store/phone source preserved.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED. Attributable installment observation, final-cart proof, migration provenance and operational/release gates remain open. Earlier dated counts/type gaps in this ledger are historical and superseded by this current repair evidence.

### UPD-20260907-002 — Complete Phase 1 source baseline and consumer inventory

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/baseline.md`; `specs/036-audit-remediation/evidence/baseline-sources.json`; `specs/036-audit-remediation/evidence/consumer-inventory.md`; `specs/036-audit-remediation/evidence/consumer-index.json`; `specs/036-audit-remediation/evidence/phase-1-verification.md`; `specs/036-audit-remediation/tasks.md`; `docs/PROJECT_GUIDE.md`
- Date: 2026-09-07
- Affected IDs: `FEAT-021`, `IMPACT-009`, `DEC-007`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Closed T001-T002 with a frozen 1,116-file hash baseline, complete operation guard/ownership matrix, queue/spend/effect/lock inventory and existing-task clarifications. Broad reference indexes are discovery only. All twenty audit items remain open; no runtime code drift was found since the reviewed snapshot.
- Evidence boundary: Q01 source and documentation checks only; no application tests/builds, database/Redis/provider calls, service changes or Git network/commit operations.
- Impact: NO_RUNTIME_IMPACT

### UPD-20260907-001 — Save the complete audit-remediation planning package

- State: VERIFIED
- Sources: `specs/036-audit-remediation`; `.specify/feature.json`; `AGENTS.md`; `docs/PROJECT_GUIDE.md`; `PROJECT_MEMORY.md`
- Date: 2026-09-07
- Affected IDs: `FEAT-021`, `IMPACT-009`, `DEC-007`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Created source-linked audit/register/specification/design/contracts/checklists/tasks and an Arabic tracker, pointed Spec Kit at feature 036, preserved current branch and existing runtime work, and separated document acceptance from unexecuted implementation/operational gates.
- Evidence boundary: Only documentation/metadata inspection and structural checks; no application tests/builds, database/provider calls, production mutation, or source edits.
- Impact: NO_RUNTIME_IMPACT

### UPD-20260823-001 — Initialize web project memory system

- State: VERIFIED
- Sources: `specs/034-web-project-memory/spec.md`; `specs/034-web-project-memory/plan.md`; `.agents/skills/web-project-memory/SKILL.md`; `.agents/skills/web-project-memory/references/project-memory-schema.md`; `.gitignore`; `PROJECT_MEMORY.md`
- Date: 2026-08-23
- Affected IDs: `SRC-001`–`SRC-010`, `APP-001`–`APP-006`, `FE-001`–`FE-004`, `API-001`–`API-004`, `DATA-001`–`DATA-005`, `AUTH-001`–`AUTH-005`, `JOB-001`–`JOB-005`, `INT-001`–`INT-002`, `ENV-001`–`ENV-004`, `OPS-001`–`OPS-004`, `FEAT-001`–`FEAT-007`, `TEST-001`–`TEST-004`, `DEC-001`–`DEC-003`, `RISK-001`–`RISK-004`, `WORK-001`–`WORK-002`
- Delta: Added one source-grounded durable ledger, stable cross-layer IDs, current topology, feature links, decisions, risks, active-work state, and narrow version-control exceptions for the shared workflow artifacts.
- Impact: NO_RUNTIME_IMPACT

### UPD-20260823-002 — Correct and install personal Web Project Memory

- State: VERIFIED
- Sources: `specs/034-web-project-memory/spec.md`; `specs/034-web-project-memory/tasks.md`; `.agents/skills/web-project-memory/SKILL.md`; `.agents/skills/web-project-memory/references/project-memory-schema.md`; `.agents/skills/web-project-memory/scripts/project_memory.py`; `.agents/skills/web-project-memory/agents/openai.yaml`; `tests/unit/web-project-memory.test.ts`; `PROJECT_MEMORY.md`
- Date: 2026-08-23
- Affected IDs: `ENV-004`, `TEST-004`, `DEC-001`, `WORK-001`, `FRESH-001`, `BE-001`–`BE-002`, `FLOW-001`–`FLOW-002`, `SEC-001`–`SEC-002`, `IMPACT-001`–`IMPACT-002`
- Delta: Replaced the narrow repository-only skill with the exact personal skill identity, twenty-three-section/eight-state schema, deterministic Git freshness and connected-impact routing, isolated multi-layer behavior tests, and a migrated project ledger while preserving existing stable IDs and source facts.
- Impact: NO_RUNTIME_IMPACT

### UPD-20260823-003 — Expand memory to whole-project system coverage

- State: VERIFIED
- Sources: `PROJECT_MEMORY.md`; `docs/PROJECT_GUIDE.md`; `src/app`; `src/components`; `src/lib`; `prisma/schema.prisma`; `prisma/migrations`; `worker/src`; `tests`; `ecosystem.config.js`; `worker/ecosystem.config.js`; `.env.example`; `worker/.env.example`; `docs/current-project-prd.md`
- Date: 2026-08-23
- Affected IDs: `SRC-011`, `FE-005`–`FE-008`, `BE-003`–`BE-006`, `API-005`–`API-010`, `DATA-006`–`DATA-009`, `FLOW-003`–`FLOW-006`, `AUTH-006`–`AUTH-009`, `JOB-006`–`JOB-008`, `INT-003`–`INT-005`, `ENV-005`–`ENV-006`, `SEC-003`–`SEC-006`, `TEST-005`–`TEST-007`, `OPS-003`, `OPS-005`–`OPS-006`, `FEAT-008`–`FEAT-019`, `IMPACT-003`–`IMPACT-007`, `DEC-004`–`DEC-006`, `RISK-002`, `RISK-005`–`RISK-008`, `WORK-003`, `FRESH-001`
- Delta: Added a bounded but repository-wide catalog of every material web/backend/data/Worker/integration/operations family, exact inventories and state catalogs, cross-layer impact links, full discovered configuration names, source/document conflicts, and security/deployment boundaries while preserving all prior stable records.
- Impact: NO_RUNTIME_IMPACT

### UPD-20260824-001 — Gate renewal completion on unique fulfillment proof

- State: VERIFIED
- Sources: `specs/035-renewal-fulfillment-proof`; `shared/operations/renewal-fulfillment.ts`; `worker/src/http-queue-processor.ts`; `worker/src/lib/fulfillment-proof.ts`; `src/lib/operations/recovery-proof.ts`; `src/lib/financial-review/manual-decisions.ts`; `src/app/api/operations/start-renewal/route.ts`; `prisma/schema.prisma#model-OperationFulfillmentProof`; `prisma/migrations/20260824090000_renewal_fulfillment_proof/migration.sql`; `scripts/reconcile-renewal-fulfillment.ts`; `specs/035-renewal-fulfillment-proof/quickstart.md#Local-Verification-Record--2026-08-24`
- Date: 2026-08-24
- Affected IDs: `API-011`, `DATA-002`, `DATA-005`–`DATA-010`, `FLOW-001`, `FLOW-003`, `FLOW-004`, `FLOW-007`, `TEST-001`–`TEST-003`, `TEST-006`–`TEST-008`, `OPS-002`, `OPS-006`–`OPS-007`, `FEAT-001`, `FEAT-004`, `FEAT-005`, `FEAT-010`, `FEAT-015`, `FEAT-017`, `FEAT-019`–`FEAT-020`, `IMPACT-001`, `IMPACT-003`, `IMPACT-005`, `IMPACT-006`, `IMPACT-008`, `RISK-001`, `RISK-009`, `WORK-004`
- Delta: A beIN debit is financial evidence only; unique non-blank contract invoice proof now gates automated completion, points, success notifications, recovery, and live admin verification. Unsafe charged/unknown/conflicting states review without automatic refund, final-Pay retries never resubmit, open safety issues block another renewal, and bounded reconciliation can only upsert idempotent issues.
- Evidence boundary: Local builds and non-database tests are verified. Production deployment, incident result, database concurrency/apply, browser smoke, and live provider/refund state remain unknown and are not claimed.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED

### UPD-20260824-002 — Add Sold Report correlation and fenced reseller-core finalization

- State: VERIFIED
- Sources: `specs/035-renewal-fulfillment-proof`; `worker/src/http/sold-packages-report.ts`; `worker/src/lib/fulfillment-baseline.ts`; `worker/src/lib/renewal-fulfillment-correlation.ts`; `worker/src/lib/fulfillment-finalization.ts`; `worker/src/lib/renewal-verification-retry.ts`; `worker/src/http/HttpClientService.ts`; `worker/src/http-queue-processor.ts`; `src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts`; `prisma/schema.prisma`; `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql`; `prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql`; `prisma/migrations/20260824180000_fulfillment_proof_composite_integrity/migration.sql`; `specs/035-renewal-fulfillment-proof/quickstart.md#Amended-Core-Local-Verification-Record--2026-08-25`
- Date: 2026-08-25
- Affected IDs: `API-011`, `DATA-005`–`DATA-010`, `FLOW-007`, `TEST-008`, `OPS-007`, `FEAT-020`, `IMPACT-008`, `RISK-009`, `WORK-004`, `FRESH-001`
- Delta: Replaced contract-only/blind verification with a complete pre/post Sold Report Invoice diff plus same-Invoice active contract; bound completion to the exact latest baseline/attempt/account/card/reservation/spend context; fenced provider/login/session mutations; and added deterministic read-only verification repair after queue and post-match crash windows.
- Evidence boundary: Core local tests/builds pass with explicit disposable PostgreSQL/Redis skips. Safe mode remains `REVIEW_ONLY`; authorized live Invoice equality, account exclusivity, crash-durable completion effects, incident state, deployment, and production data remain unknown. Mobile/store/application execution was excluded and not run.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED

### UPD-20260907-003 — Audit remediation Phase 2 source foundation

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/phase-2-verification.md`; `specs/036-audit-remediation/data-model.md`; `specs/036-audit-remediation/tasks.md`; `tests/helpers/audit-operation-fixtures.ts`; `shared/operations/audit-financial-context.ts`
- Date: 2026-09-07
- Affected IDs: `DATA-002`, `DATA-004`, `DATA-005`, `DATA-006`, `DATA-007`, `DATA-008`, `DATA-009`, `JOB-002`, `TEST-001`, `FEAT-021`, `IMPACT-009`, `DEC-007`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Authored T003-T005 foundation: six models, three new unapplied migrations, pure evidence seam, eleven synthetic fixture variants and unrun regression cases. Adapted existing shared/mobile dispatch lookups to revision zero and nullable report-owner DTOs. SQL cancellation and pure veto retain every reserved funding leg.
- Evidence boundary: Read-only source/syntax/document checks and independent review; Q02/Q04/Q06/Q09 NOT_RUN. No client generation, database/provider/service execution or deployment. Existing migration SQL preserved; one older directory lacks local SQL and awaits provenance review. Accepted progress remains 2/58; three authored tasks await acceptance.
- Impact: RUNTIME_CHANGE_NOT_DEPLOYED

### UPD-20260907-004 — Install local PostgreSQL

- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md`; `runtime:2026-09-07 local service and saved-credential verification`
- Date: 2026-09-07
- Affected IDs: `OPS-008`, `FRESH-001`
- Delta: Installed signed PostgreSQL 18.6/pgAdmin after explicit user authorization, restricted the new service to localhost and retained verified encrypted credentials outside the repository.
- Evidence boundary: Local installation/service/authentication checks only. No project database, app/provider/production execution or change to Phase 2 acceptance.
- Impact: LOCAL_ENVIRONMENT_CHANGE; documentation has NO_RUNTIME_IMPACT on the application.

### UPD-20260907-005 — Restore the backup and migrate a separate local work clone

- State: VERIFIED
- Sources: `docs/PROJECT_GUIDE.md#Local-Working-Database`; `specs/036-audit-remediation/evidence/local-database-preparation.md`; `external:D:/CodexPostgreSQL/restore-verification.json`; `external:D:/CodexPostgreSQL/reader-and-migration-verification.json`; `external:D:/CodexPostgreSQL/work-verification.json`
- Date: 2026-09-07
- Affected IDs: `DATA-005`, `OPS-008`, `OPS-009`, `OPS-010`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Restored and protected the backup on D:5433, verified counts/source hash/access/restart, then amended the explicit local scope and applied nine migrations to a separate work clone. Resolved empty-directory provenance, classified 14 checksum differences as line endings, and restored three missing canonical unique guards on the clone after zero-duplicate checks. Original dump, snapshot and source SQL remain preserved.
- Evidence boundary: Local restore, schema application and metadata/access/row-count checks only; no application tests/build/startup, client generation, seed, provider/production access or Spec Kit acceptance. Two intended NOT VALID constraints and wider schema drift remain open.
- Impact: LOCAL_DATABASE_RESTORE; NO_APPLICATION_RUNTIME_CHANGE.

### UPD-20260907-006 — Start an isolated local panel trial

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/local-database-preparation.md`; `docs/PROJECT_GUIDE.md`; `specs/036-audit-remediation/spec.md`; `specs/036-audit-remediation/plan.md`; `specs/036-audit-remediation/tasks.md`
- Date: 2026-09-07
- Affected IDs: `OPS-011`, `WORK-005`, `FRESH-001`
- Delta: Applied the user's local startup authorization through process-only local credentials, restricted work-clone access, isolated Redis and a Node socket egress guard; generated the root client and left the development login page open.
- Evidence boundary: Login browser rendering, unauthenticated HTTP 200 responses, Prisma read and Redis PING passed. No authenticated/financial acceptance, provider worker or production execution; accepted progress remains 2/58.
- Impact: LOCAL_RUNTIME_STARTUP; NO_PRODUCTION_CHANGE.

### UPD-20260907-007 — Repair the observed local renewal startup error

- State: VERIFIED
- Sources: `src/lib/operations/renewal-creation-guard.ts`; `src/lib/operations/card-lifecycle-reservation.ts`; `src/lib/renewal-payment-refund-finalization.ts`; `worker/src/lib/provider-account-reservation.ts`; `tests/integration/local-advisory-lock-compatibility.test.ts`; `specs/036-audit-remediation/evidence/local-database-preparation.md`
- Date: 2026-09-07
- Affected IDs: `OPS-011`, `WORK-005`, `FRESH-001`
- Delta: Cast four advisory-lock results to text after actual Prisma P2010 reproduction; retained lock identity/order/transaction lifetime. Corrected work-clone connection cap from 6 to 40 after observed P2037. Supplemental LOCAL-001 records scope, acceptance and convergence separately from the original 58 tasks.
- Evidence boundary: Real lock SQL regression fails before/passes after with contention/release verification; eight existing guard/refund unit cases pass. No business rows written by regression, no real renewal/provider execution, full suite or production action. Authenticated renewal retry remains for the user.
- Impact: RUNTIME_FIX_NOT_DEPLOYED; LOCAL_DATABASE_CONFIGURATION_CHANGE.

### UPD-20260907-008 — Complete Phase 2 Foundation acceptance

- State: VERIFIED
- Sources: `specs/036-audit-remediation/evidence/phase-2-runtime-verification.md`; `tests/helpers/audit-operation-fixtures.ts`; `tests/unit/audit-financial-context.test.ts`; `tests/integration/audit-financial-model-db.test.ts`; `specs/036-audit-remediation/tasks.md`
- Date: 2026-09-07
- Affected IDs: `DATA-005`, `TEST-001`, `OPS-012`, `FEAT-021`, `IMPACT-009`, `DEC-007`, `RISK-010`, `WORK-005`, `FRESH-001`
- Delta: Executed authorized Q02/focused Q04 on a separate synthetic database, recorded eight expected pre-foundation failures, corrected invalid fixture hashing/card length, strengthened model/cleanup/lock-contention tests, and accepted T003-T005. Empty 0_init clean-install failure is retained under T040/T052 without changing historical SQL.
- Evidence boundary: Twenty tests pass, no skips; focused types/lint pass; all 36 SQL hashes and schema parity preserved; zero business rows remain. Original plan progress is 5/58 plus supplemental LOCAL-001; no new provider/worker execution, combined build or deployment.
- Impact: TEST_FIX_AND_LOCAL_VERIFICATION; NO_PRODUCTION_RUNTIME_CHANGE.

### UPD-20260907-009 — Implement Phase 3 financial components; retain observation blocker

- Date: 2026-09-07
- State: VERIFIED
- Trigger: User requested Phase 3 / US1 correct financial settlement.
- Sources: `specs/036-audit-remediation/evidence/phase-3-verification.md`; `specs/036-audit-remediation/tasks.md`
- Changes: Durable installment claim/fenced POSTs, atomic installment finalizer, owner-safe provider ledger/report/recovery, expected latest-attempt settlement and focused regression coverage.
- Evidence: 144 passing tests, no skips; focused types/lint, unchanged SQL and zero synthetic residue.
- Affected IDs: `DATA-005`, `TEST-001`, `OPS-013`, `FEAT-021`, `IMPACT-009`, `DEC-007`, `RISK-010`, `WORK-005`, `FRESH-001`
- Unresolved: Attributable original installment receipt/rejection fixtures and parser (T007). Dependency check-offs stay open; 8/58 accepted, Phase 3 PARTIAL.
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED

## 23. Freshness and Conflicts


### WORK-006 — Panel UI repair checklist

- State: VERIFIED
- Sources: `docs/PANEL_UI_REPAIRS.md`; `tests/unit/panel-ui-repairs.test.ts`; `tests/integration/panel-login-redis.test.ts`; `tests/browser/panel-ui-repairs.cjs`; `user:approved checkpoint upload and panel implementation without subagents`
- Current state: Fourteen bounded repairs are locally complete and pushed as 4a2833e48a0ca033cbf0b9c6fc0faab080275da9 on origin/codex/panel-ui-repairs; earlier bd42692 remains on origin/034-web-project-memory. New completion work is tracked separately in WORK-007 and remains local. No deployment or provider/restored-data changes; 036 release gates remain separate.
- Connections: `FEAT-022`, `WORK-005`, `TEST-001`, `TEST-003`, `RISK-011`

### WORK-007 — Accepted twelve-task web completion continuation

- State: PARTIAL
- Sources: `docs/PANEL_UI_REPAIRS.md`; `docs/PROJECT_GUIDE.md`; `tests/browser/panel-ui-repairs.cjs`; `tests/browser/panel-auth-http.cjs`; `tests/helpers/panel-http-network-guard.cjs`; `user:implement accepted WEB-01..WEB-12 plan without subagents and excluding native app/store`
- Current state: 7/12 accepted, five tasks open for bounded implementation/acceptance described in the report. All 42 shared tables opt in; two provider exceptions, 15 modal migrations, current-request report/deleted-list handling and real cookie repair are implemented locally. No native/store/provider/business DB work. 036 remains 45/57; WEB results do not silently close its task IDs.
- Next: complete operation/permission action matrices, report positive-data/export parity, installment view-only states, remaining dialog forms and locale/race coverage; then refresh WEB-12 acceptance. T037/T038 and migration provenance remain separate old tasks; T007/T008 deferred and external gates require explicit access.
- Connections: `FEAT-023`, `WORK-005`, `WORK-006`, `TEST-001`, `TEST-003`, `AUTH-001`, `RISK-011`

### RISK-011 — Remaining panel table and integration coverage

- State: VERIFIED
- Sources: `docs/PANEL_UI_REPAIRS.md`; `src/components`; `src/app/dashboard`; `src/styles/tokens.css`
- Current state: Table source adoption is complete (42 shared panel instances plus two documented provider exceptions), but six WEB tasks still need per-page role/action/localization/export/state acceptance. Five actual synthetic auth HTTP cases do not prove live provider/settlement or production safety. T007/T008 remain deferred, T052 migration provenance unresolved, external/release gates open. Rate-limit memory fallback remains per process.
- Connections: `FE-002`, `FEAT-022`, `RISK-001`, `RISK-010`

### FRESH-001 — Local synchronization baseline

- Latest scoped delta: `UPD-20261013-012`, explicit audited administrative archive/unlock, stop/drain and preserved financial evidence. Local evidence and external limits are in `docs/PROJECT_GUIDE.md`; production card state remains unknown.

- Latest scoped delta: `UPD-20261013-011`, proven pre-payment hold closure/replay, policy-bound maintenance and actionable admin/owner diagnostics. Source/test evidence and native-service/production limitations are in `docs/PROJECT_GUIDE.md`. Synchronization metadata captures the settled pre-commit worktree; committing this ledger changes Git metadata without changing verified runtime sources.

- Latest scoped delta: `UPD-20261013-010`, precise package/price cells and narrow same-day Reports equivalence. Current local verification and its native-service/provider/lint limitations are recorded in `docs/PROJECT_GUIDE.md`; no historical acceptance or production state is changed.

- Latest scoped delta: `UPD-20261013-009`, v2 pre-final selection/account/promo/summary failure repair, locally simulated only. The earlier `UPD-20261013-008` enum migration recovery remains separate. Exact Sell HTML, production process parity, the historical operation, failed migration record/schema, native retry and release gates remain open. Historical UI/036 acceptance counters are unchanged.


- State: VERIFIED
- Sources: `PROJECT_MEMORY.md`; `.agents/skills/web-project-memory/scripts/project_memory.py`; `command:git status --porcelain=v1`; `command:git diff`
- Current state: Synchronization metadata in the header identifies the current source baseline; the ledger itself is excluded from its fingerprint. WORK-007 records partial web completion (7/12), WORK-006 retains the verified 14-repair GitHub checkpoint, and WORK-005 remains 45/57. Evidence and remaining acceptance are in `docs/PANEL_UI_REPAIRS.md`; `UPD-20260908-005`.
- Connections: `WORK-001`, `WORK-003`, `WORK-004`, `TEST-004`, `TEST-008`, `UPD-20260823-002`, `UPD-20260823-003`, `UPD-20260824-001`, `UPD-20260824-002`
- Phase 4 test evidence: T015 test authoring accepted after explicit user approval of synthetic Q04; Q02 4 pass / 6 fail, Q04 1 pass / 6 fail, zero skips. All failures are pre-fix evidence, not accepted runtime behavior. All 71 synthetic business tables were empty before/after. Source: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `UPD-20260907-013`.
- Phase 4: Latest synchronized delta UPD-20260907-015: Phase 4 implementation, verification and Spec Kit reconciliation; RUNTIME_CHANGE_NOT_DEPLOYED. Source: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `UPD-20260907-015`.

### UPD-20260907-010 — Narrow active remediation to web delivery

- Date: 2026-09-07
- State: VERIFIED
- Trigger: Maintainer requested removing phone-app work from tasks because the project work targets web.
- Sources: `specs/036-audit-remediation/evidence/web-only-scope-amendment.md`; `specs/036-audit-remediation/tasks.md`; `specs/036-audit-remediation/spec.md`; `specs/036-audit-remediation/plan.md`
- Changes: Retired T046/T047, FR-023 and AUD-015; narrowed mixed tasks and synchronized contracts, research, checklists, guide and current status. Stable remaining IDs and completed task states are preserved.
- Evidence: Static analysis confirms 56 tasks, 8 accepted, 30 covered requirements, 19 audit items, no missing/cyclic dependencies and no app-only active task obligations.
- Affected IDs: `FEAT-021`, `WORK-005`, `IMPACT-009`, `DEC-007`, `RISK-010`, `FRESH-001`
- Unresolved: Phase 3 remains PARTIAL with its existing T007 installment-observation blocker. No runtime acceptance added.
- Runtime impact: DOC_ONLY_NO_RUNTIME_CHANGE

### UPD-20260907-011 — Exclude store modifications from active delivery

- Date: 2026-09-07
- State: VERIFIED
- Trigger: Maintainer explicitly requested cancelling store modifications after excluding phone-app work.
- Sources: `specs/036-audit-remediation/evidence/panel-only-scope-amendment.md`; `specs/036-audit-remediation/spec.md`; `specs/036-audit-remediation/tasks.md`; `specs/036-audit-remediation/plan.md`
- Changes: Retired ten store-specific tasks (including historically accepted T009), five requirements and five audit items; narrowed mixed tasks, contracts, model/research planning, checklists, guide and release boundary to panel.
- Evidence: Static task/dependency/requirement audit and unchanged Phase 3 runtime source hashes; 46 active tasks / 7 accepted, 25 covered requirements, 14 audit items. No runtime checks executed.
- Affected IDs: `FEAT-021`, `WORK-005`, `IMPACT-009`, `DEC-007`, `RISK-010`, `FRESH-001`
- Unresolved: Phase 3 T007 observation and dependency gates remain open. Phase 4 T015-T017 requested but not implemented in this documentation turn. Existing store code/evidence preserved; excluded issues are not resolved.
- Runtime impact: NO_RUNTIME_IMPACT

### UPD-20260907-012 — Author Phase 4 regressions without bypassing financial dependencies

- Date: 2026-09-07
- State: VERIFIED
- Trigger: Maintainer requested Phase 4 / US2 panel package selection and offers.
- Sources: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `specs/036-audit-remediation/evidence/phase-4-unit-red.log`; `tests/helpers/promo-dispatch-harness.ts`; `tests/unit/promo-dispatch-revision.test.ts`; `tests/integration/promo-dispatch-revision-db.test.ts`
- Changes: Authored independent T015 tests and concretized revision contract; preserved T012/T007 gates for T016/T017. No runtime code or data model change.
- Evidence: 10 isolated unit cases, 4 pass / 6 expected pre-fix failures / 0 skips; focused types and lint pass. Independent review corrections applied. Seven DB cases authored but not executed.
- Affected IDs: `FEAT-021`, `WORK-005`, `IMPACT-009`, `DEC-007`, `RISK-010`, `TEST-001`, `FRESH-001`
- Unresolved: Automatic approval review denied reading the saved synthetic-test credential and running Q04 due to unclear database authorization. Do not bypass; await explicit approval. T007 attributable installment observations remain a separate T016/T017 dependency blocker.
- Runtime impact: NO_RUNTIME_IMPACT

### UPD-20260907-013 — Execute explicitly approved synthetic T015 database regressions

- Date: 2026-09-07
- State: VERIFIED
- Trigger: After the synthetic-data/isolation explanation, the maintainer explicitly approved running the test.
- Sources: `specs/036-audit-remediation/evidence/phase-4-verification.md`; `specs/036-audit-remediation/evidence/phase-4-db-red.log`; `specs/036-audit-remediation/evidence/phase-4-db-verification.json`; `specs/036-audit-remediation/tasks.md`
- Changes: Ran seven T015 integration cases against the dedicated local synthetic database, verified cleanup and accepted test authoring. Clarified the existing T016 replay requirement for semantic JSONB equality. No runtime/test/schema/migration code changed.
- Evidence: Q04 1 pass / 6 reproduced pre-fix failures / 0 skips; 71 business tables with zero rows before and after. Read-only JSONB probe confirms equal values but different key order/stringification, explaining real-DB identical replay rejection.
- Affected IDs: `FEAT-021`, `WORK-005`, `IMPACT-009`, `DEC-007`, `RISK-010`, `TEST-001`, `FRESH-001`
- Unresolved: T016/T017 behavior and T012/T007 dependencies remain open. Red tests are not a release pass. Previous credential-access refusal is superseded only for the now-authorized synthetic test.
- Runtime impact: NO_RUNTIME_IMPACT; synthetic verification rows cleaned, no production or interactive data change.

### UPD-20260907-014 — Review promo package-name drift and extend Phase 4 acceptance

- Date: 2026-09-07
- State: VERIFIED
- Trigger: Maintainer reports names changing after promo application and again later during renewal.
- Sources: `specs/036-audit-remediation/evidence/phase-4-promo-name-review.md`; `specs/036-audit-remediation/spec.md`; `specs/036-audit-remediation/plan.md`; `specs/036-audit-remediation/contracts/consumer-api.md`; `specs/036-audit-remediation/tasks.md`
- Changes: Traced panel/API/HTTP/worker/confirmation/proof paths; documented PRM-01–PRM-05, old-versus-dirty-work origin and conditional provider effects. Extended existing T016/T017 paths and test-first criteria with authoritative quote/draft-code separation, safe conflict handling and card-context preservation. Corrected the snapshot's stale 8/58 count to the already-established 8/46 scope.
- Evidence: Source inspection and independent read-only review; document consistency checks. No new application tests, database access, builds or provider operations.
- Affected IDs: `FEAT-021`, `WORK-005`, `IMPACT-009`, `DEC-007`, `RISK-010`, `TEST-001`, `FRESH-001`
- Unresolved: T016/T017 runtime work/new regressions, upstream T012/T007 and real provider naming compatibility remain open. T015's earlier evidence and acceptance are unchanged.
- Runtime impact: NO_RUNTIME_IMPACT; documentation and derived project memory only.

### UPD-20260907-015 — Complete panel Phase 4 quote and promo correctness

- Date: 2026-09-07
- State: VERIFIED
- Trigger: Maintainer explicitly requested completing Phase 4, including reviewed promo-name drift.
- Sources: `specs/036-audit-remediation/evidence/phase-4-implementation.md`; `specs/036-audit-remediation/tasks.md`; `shared/operations/package-quote.ts`; `worker/src/lib/promo-quote.ts`; `src/app/dashboard/renew/page.tsx`; `src/app/dashboard/operations/active/page.tsx`; `tests/integration/promo-dispatch-revision-db.test.ts`
- Changes: Revisioned promo dispatch/replay, safe provider context/rematch, authoritative quote consent, separate draft/applied code, explicit removal, bounded polling/retry, and both panel confirmation consumers. Preserved financial finalizers and stable payment identity. Accepted T016/T017 after independent review; total 10/46.
- Evidence: 76 focused unit/worker and 14 PostgreSQL cases pass with zero skips; six mocked-browser groups pass; worker/focused web types pass. All 71 synthetic business tables empty. Full web types retain four out-of-slice errors; no production build/provider request.
- Affected IDs: `FE-007`, `BE-002`, `API-006`, `API-011`, `DATA-002`, `FLOW-001`, `FLOW-007`, `JOB-002`, `JOB-003`, `TEST-001`, `TEST-002`, `TEST-003`, `FEAT-010`, `FEAT-021`, `IMPACT-009`, `DEC-007`, `RISK-010`, `WORK-005`, `FRESH-001`
- Unresolved: T007/T008/T012 and full release/provider verification; mixed-version cutover, consent-less legacy snapshots and operator recovery after persistent hold-write failure remain explicit.
- Runtime impact: RUNTIME_CHANGE_NOT_DEPLOYED; no schema/store/phone edits, restored/interactive DB mutation, provider workers, commit, push or deployment.

### UPD-20260908-004 — Panel login and responsive UI repairs

- Date: 2026-09-08
- State: VERIFIED
- Sources: `docs/PANEL_UI_REPAIRS.md`; `src/lib/auth/login-attempts.ts`; `src/app/login/page.tsx`; `src/hooks/usePanelRequest.ts`; `src/components/ui/PanelTableControls.tsx`; `tests/unit/panel-ui-repairs.test.ts`; `tests/integration/panel-login-redis.test.ts`; `tests/browser/panel-ui-repairs.cjs`
- Affected IDs: `FE-002`, `FE-003`, `FE-004`, `FE-007`, `FE-008`, `AUTH-001`, `AUTH-006`, `API-008`, `FEAT-008`, `FEAT-009`, `FEAT-016`, `FEAT-022`, `IMPACT-002`, `IMPACT-006`, `TEST-003`, `WORK-006`, `RISK-011`, `FRESH-001`
- Delta: Verified pre-change GitHub checkpoint; implemented current-session login/API handling, atomic failures, safe redirects, bounded latest-request list state, server sorting/counts, progress presentation, notification mutation handling, responsive modal/sidebar behavior and limited reusable table/token/localization repairs. Updated guide and delivery evidence.
- Impact: PANEL_RUNTIME_CHANGE_NOT_DEPLOYED. No subagents, native-app/store implementation, provider/production access, restored-data mutation, package/schema/migration changes. Thirty-three browser groups, actual isolated Redis concurrency and isolated Next build passed; detailed test counts and remaining boundaries are in the report.

### UPD-20260908-005 — Web completion, session verification and approved FIX batches

- Date: 2026-09-08
- State: VERIFIED
- Sources: `docs/PANEL_UI_REPAIRS.md`; `docs/PROJECT_GUIDE.md`; `src/components/ui`; `src/styles/tokens.css`; `src/hooks/usePanelRequest.ts`; `src/middleware.ts`; `src/components/providers/Providers.tsx`; `tests/browser/panel-ui-repairs.cjs`; `tests/browser/panel-auth-http.cjs`; `tests/helpers/panel-http-network-guard.cjs`
- Additional sources: `tests/browser/panel-operations-cases.cjs`; `tests/browser/panel-report-cases.cjs`; `tests/browser/panel-installment-cases.cjs`; `tests/browser/panel-dialog-cases.cjs`; `tests/browser/fixtures/panel-ui-entry.jsx`; `tests/browser/fixtures/panel-operations-data.js`; `src/components/admin/ActivityOverviewCards.tsx`; `src/components/admin/report-center`
- Affected IDs: `FE-002`, `FE-003`, `FE-004`, `FE-007`, `FE-008`, `AUTH-001`, `FEAT-008`, `FEAT-009`, `FEAT-023`, `IMPACT-002`, `IMPACT-006`, `TEST-001`, `TEST-003`, `WORK-006`, `WORK-007`, `RISK-011`, `FRESH-001`
- Delta: Pushed prior repairs as checkpoint 4a2833e; classified/migrated panel tables, preserved conditional PDF rendering, expanded existing modal/request composition and fixed real login cookie restoration. WEB-04 accepted after user/statistics matrix. Current completed browser cohort is 850 groups; subsequent proxy suite passes 81 and expanded installment suite passes 40, with overlap kept explicit. Active operations pass 30 groups; six forms pass 166; operational decision/escalation/handoff/payment dialogs pass 126; financial reports pass 84 and balance-export source-surface parity passes six. Installment polling/expiry now uses server-owned status and neutral follow-up, guards repeated commands and retains rejected confirmation. Financial-review repair passes 67 browser groups; Eid popup accessibility/admission/recovery passes 26 browser and 32 unit groups. WEB-07 is accepted with 40 installment groups and 15 actual provider PNG baseline comparisons. Blank balance-PDF raster was reproduced at checkpoint; clone-position fix is under raster acceptance (WEB-BUG-30). None establishes provider or settlement correctness.
- Impact: PANEL_RUNTIME_CHANGE_NOT_DEPLOYED. No subagents, native/store implementation, package/schema/migration/worker changes, provider traffic, business DB writes or production access. WEB completion is partial (7/12 accepted); 036 remains 45/57. Test/build evidence and its limits are in the report.

- Continuation sources for `UPD-20260908-005`: `tests/browser/panel-dialog-cases.cjs`; `tests/browser/panel-financial-cases.cjs`; `tests/browser/panel-balance-export.cjs`; `tests/browser/panel-active-cases.cjs`; `tests/browser/panel-operation-dialog-cases.cjs`; `tests/browser/panel-proxy-cases.cjs`; `tests/browser/panel-installment-cases.cjs`; `tests/browser/panel-review-cases.cjs`; `src/components/renewal/InstallmentPaymentFlow.tsx`; `src/components/admin/financial-review/FinancialReviewClient.tsx`. Latest complete unit gate passes 826/103 files with zero skips; subsequent Eid unit gate passes 32 (overlapping). Six actual corrected-reference PDF comparisons pass; 1170 combined browser cases, 51 layout cases, root types and the final isolated build pass. Repository-wide lint remains 7 errors/29 warnings in unchanged source; scoped 74-file lint passes. The report is the authority for saved commit and remaining acceptance. No 036 acceptance or release approval changed.

- FIX continuation for `UPD-20260908-005`: whole-plan approval supersedes repeated batch confirmation; no subagents. Sources: `src/hooks/usePanelRequest.ts`; `src/components/ui/PanelLoadError.tsx`; `src/app/dashboard/operations/active/page.tsx`; `tests/browser/panel-command-cases.cjs`; `tests/browser/panel-acceptance-cases.cjs`; `src/i18n/translations/ar.ts`; `src/i18n/translations/en.ts`; `src/i18n/translations/bn.ts`; `docs/PANEL_UI_REPAIRS.md`. Admin Eid settings/claims/transactions and installment settlement remain deferred. FIX evidence does not automatically close remaining WEB or 036 acceptance gates.

- Save evidence for `UPD-20260908-005`: source/test commit `e663e1427adb8d42f79f36886085f26350817194` pushed to `origin/codex/panel-ui-repairs`; remote hash equality and a clean source tree verified. The final follow-up changes only this ledger, `docs/PROJECT_GUIDE.md` and `docs/PANEL_UI_REPAIRS.md`. Synchronization metadata records the pre-commit source/index snapshot; committing this tracked ledger changes Git freshness metadata without changing tested runtime sources. No deployment; previous checkpoint `4a2833e` preserved.
