# Implementation Plan: beIN Connection Mode

**Branch**: `027-bein-connection-mode` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-bein-connection-mode/spec.md`

## Summary

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
- Legacy operations without route snapshot continue under assigned-proxy behavior even if the admin toggled server-IP emergency mode after the operation started.

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
- Production toggling should be done after active operations drain when possible. If not possible, the route snapshot guard protects existing operations but old operations without snapshots use legacy assigned-proxy behavior.
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
