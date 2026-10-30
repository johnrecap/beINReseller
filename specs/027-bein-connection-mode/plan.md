# Implementation Plan: beIN Connection Mode

**Branch**: `027-bein-connection-mode` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-bein-connection-mode/spec.md`

## Summary

**2026-10-30 amendment takes precedence for deferred reads and login recovery.** Accepted scope and AC01–AC10 are in `spec.md`. Preserve the existing purchase-path implementation and Spec 036 financial guards.

Add an admin-controlled beIN connection mode that lets new beIN worker actions use either saved account proxies or the server IP emergency route. The implementation must preserve saved proxy assignments, keep each operation on the route it started with, separate sessions by route, and avoid any increase in retries, worker concurrency, keepalive cadence, or automatic fallback behavior.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9 for the Next.js app; TypeScript 5.7 for the worker package

**Primary Dependencies**: Next.js 16.1 app router, React 19, Prisma 7.2, Redis/ioredis, BullMQ, axios, axios-cookiejar-support, http-cookie-agent, https-proxy-agent, socks-proxy-agent

**Storage**: Existing `settings` table for `bein_connection_mode`; existing `operations.responseData` for non-secret route snapshots; Redis for shared and operation-scoped beIN sessions

**Testing**: `node:test` with `tsx` for root tests and worker tests, existing `npm run build`, existing `cd worker && npm run build`

**Target Platform**: Production Next.js admin panel and Node.js PM2 worker/keepalive processes

**Project Type**: Full-stack web dashboard plus background worker service

**Performance Goals**: No added retries, no added worker count, no added keepalive frequency, no route-based account lock expansion, no automatic 502 failover

**Constraints**: Live production database; avoid schema migration by using the existing settings table. Do not expose proxy passwords, beIN passwords, TOTP secrets, cookies, ViewState, or session snapshots in UI/logs/operation route metadata. Do not mutate saved account proxy assignments when emergency mode is active.

**Scale/Scope**: Admin settings UI/API, worker route resolution, renewal/confirmation/promo/signal/installment continuation route stability, Redis session keying, keepalive client keying, focused tests, deployment notes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. This feature touches beIN account assignment routes and operation continuation. The plan documents route snapshots as evidence and requires legacy behavior for old operations.
- **Traceable Planning**: PASS. Tasks map user stories to exact files, tests, and verification detail blocks.
- **Test-First For Risky Behavior**: PASS. Route selection, session key separation, and operation continuation behavior require tests before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are targeted to settings, worker route/session boundaries, keepalive, and tests. Manual edits use `apply_patch`.
- **Security And Privacy Boundaries**: PASS. Route snapshots store only non-secret route metadata. Logs must redact secrets and never include cookies/sessions/ViewState.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/027-bein-connection-mode/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- admin-setting.md
|   |-- worker-route-resolution.md
|   |-- session-route-safety.md
|   `-- operation-continuation.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/settings/route.ts
|-- components/admin/SettingsForm.tsx
|-- i18n/translations/ar.ts
|-- i18n/translations/en.ts
`-- lib/bein-connection-mode.ts

worker/
`-- src/
    |-- http-queue-processor.ts
    |-- lib/bein-connection-mode.ts
    |-- lib/session-cache.ts
    `-- lib/session-keepalive.ts

tests/
`-- unit/
    `-- bein-connection-mode-settings.test.ts

worker/
`-- tests/
    |-- bein-connection-route.test.ts
    |-- session-cache-route-keys.test.ts
    `-- operation-route-snapshot.test.ts
```

**Structure Decision**: Keep the user-facing setting in the existing admin settings route/form. Keep worker route logic inside `worker/src/lib` so worker code does not depend on app-only imports. Add small pure helpers to create test seams before touching renewal and keepalive flows.

## Source Of Truth And Legacy Behavior

- Saved per-account proxy assignments remain `bein_accounts.proxy_id` and `proxy` relation.
- Global runtime mode source of truth is `settings.key = 'bein_connection_mode'`.
- Valid setting values are `assigned_proxy` and `server_ip`; missing/invalid values default to `assigned_proxy`.
- Operation route snapshot source of truth is non-secret metadata stored in `operations.responseData`.
- Shared sessions move from account-only Redis keys to account-and-route keys. Old account-only Redis session keys are legacy and must not be imported by the new route-aware paths.
- Legacy mutating continuations without route snapshot continue under assigned-proxy behavior even if the admin toggled server-IP emergency mode after the operation started. Dedicated deferred verification reads use FR-021's current-route exception.

## API Authorization Rules

- `/api/settings` remains admin-only for reading and writing this setting.
- No customer-visible API can change the beIN connection mode.
- Logs and operation response data may expose route mode, route key, proxy id, and proxy label to admins/maintainers, but never proxy passwords or beIN/session secrets.

## Required Indexes And Migration Impact

- No Prisma schema migration is required.
- No new database index is required.
- The settings key is upserted through the existing settings API and can be seeded later if desired.
- Redis keys change for sessions; old keys expire naturally and do not need a destructive cleanup.

## Verification Limitations

- Local tests can prove route selection and session separation, but cannot prove beIN accepts the server IP.
- Emergency mode depends on the upstream beIN portal allowing the server IP.
- Production toggling should be done after active operations drain when possible. If not possible, the route snapshot guard protects existing purchases and old mutating continuations without snapshots use legacy assigned-proxy behavior; deferred reads follow FR-021.
- Browser/UI verification proves the admin setting is saved, not that all workers have immediately reloaded it unless logs or worker tests confirm setting reload behavior.

## Phase 0 Research Decisions

See [research.md](./research.md).

## Phase 1 Design Artifacts

- [data-model.md](./data-model.md)
- [quickstart.md](./quickstart.md)
- [contracts/admin-setting.md](./contracts/admin-setting.md)
- [contracts/worker-route-resolution.md](./contracts/worker-route-resolution.md)
- [contracts/session-route-safety.md](./contracts/session-route-safety.md)
- [contracts/operation-continuation.md](./contracts/operation-continuation.md)

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Route snapshots are planned as operation evidence, and old-operation fallback is documented.
- **Traceable Planning**: PASS. `tasks.md` includes file paths, reasons, expected results, possible bugs, mitigations, and verification.
- **Test-First For Risky Behavior**: PASS. Foundation tasks require route/session/snapshot tests before worker behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. No broad refactor, no schema migration, no full-file rewrites.
- **Security And Privacy Boundaries**: PASS. Contracts explicitly forbid credentials, cookies, sessions, ViewState, TOTP secrets, and tokens in route metadata/logs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No constitution violation is needed | No simpler alternative was rejected |

## Incident implementation sequence

1. T032–T034: restore official CLI, inspect integration without force, amend this feature and its contracts, requirements checklist and analyze. Keep the missing historical 036 contract explicitly open. No source edits before the scoped gate passes.
2. T035–T036: actual HTTP-boundary and queue/recovery regression tests; retain expected red assertions before implementation.
3. T037–T038: shared typed classifier in `shared/bein/`, compatible `worker/src/http/types.ts`, HTTP guards/positive evidence in `HttpClientService.ts`; update queue, KeepAlive and report consumers. One SQL statement increments and disables genuine failures; existing account execution ownership must fence state writes and manual recovery.
4. T039–T040: deferred v1/v2 read routes ignore purchase snapshots only at their dedicated entry points; use account/route shared session with no purchase ViewState, preserve proof correlation and read lease/duplicate guards. All mutating call sites remain pinned.
5. T041–T042: shared ADMIN recovery service for both existing endpoints; acquire existing account lease, reject reservations/busy, transactional counter reset and session invalidation. Compare-owner release only; no account lock/rate budget deletion. API additive review classification and catalog-driven ar/en/bn labels in `LoginMonitorPanel.tsx`.
6. T043–T045: complete connected suites, isolated PG/Redis ownership races, UI states/mobile RTL, typechecks/builds, current evidence and scoped contract checker, guide/memory/runbook. Run analyze/converge and append tasks for discovered necessary gaps rather than silently omitting them.

### Connected impact and invariants

Tracking uses the existing account updatedAt as a compare-and-set revision captured before login HTTP. Counter/success writes condition on that revision and advance it monotonically; recovery advances the same revision. This fences stale HTTP responses even after lease expiry without schema changes. Ownership still guards provider/cache work; revision checking is not a substitute for locks.

KeepAlive clients are cycle-local and restore only the current account/route Redis entry, so recovery cannot be undone by an old in-memory session. Shared-cache publication compares the captured legacy owner or execution lease atomically. Legacy callers without a captured matching guard keep their session local. Fenced cache APIs receive seconds converted from the existing configuration's minutes. Every boolean re-login consumer stops before replaying its action when login returns false. Display report login uses the same revision-fenced credential tracking while its returned rows remain non-financial.

`HttpClientService.login/submitLogin` → queue initial login/re-login/balance/actions, `session-keepalive`, `provider-report-reader` → shared login tracking → `bein_accounts` → ADMIN failure list, counter reset, reset-and-activate, monitor catalog. Session cache + account execution lease + operation reservations connect every writer. Audit all `login`, `submitLogin`, `recordLoginFailure` and reset call sites. No new schema/index/backfill is expected; SQL must use actual mapped column names. Redis cleanup is account-specific and must not include operation cache, request counters or execution/reservation keys. Historical error strings remain unchanged until explicit recovery.

### Verification and rollout boundaries

Mock HTTP first, then dedicated isolated PostgreSQL/Redis fixtures, then root/worker tests, type checks and builds. Inspect the first red→green case before applying the pattern to all consumers. Use existing harnesses, no live `.env` credentials. Negative tests cover every AC row. Keep HTTP acceptance, race proof, UI inspection and production evidence separate; missing checks stay NOT_VERIFIED. See `quickstart.md` for safe release. Existing role count was 10 in user logs, not a new recommended count. No publication or live purchase is part of local implementation.
