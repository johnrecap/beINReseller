# Implementation Plan: Points Settings Save And Manager-Owned User Points

**Branch**: `029-points-manager-user-rewards` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/029-points-manager-user-rewards/spec.md`

## Summary

Fix the Points Settings save path so the values visible on the admin screen are the values that persist and reload. Add a dedicated manager-owned user points option so users linked under managers can earn their own points at an admin-defined points-per-1000-USD rate, while preserving existing manager point awards. Apply the same rule in the web app and worker point-award paths, keep historical ledger rows unchanged, and verify with focused tests.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js runtime, React 19.2

**Primary Dependencies**: Next.js 16.1, Prisma 7.2, PostgreSQL, zod, existing point settings and operation award services

**Storage**: PostgreSQL through Prisma schema and migrations

**Testing**: `npx tsx --test` focused unit/integration tests, `node scripts/check-prisma-schema-sync.js`, `npx prisma validate`, `npx prisma generate`, `npm run build`, `npm --prefix worker run build`

**Target Platform**: Existing Desh Panel web app, API routes, and background worker

**Project Type**: Full-stack Next.js application with Prisma-backed APIs and a TypeScript worker

**Performance Goals**: Admin settings save remains one bounded transaction. Operation point award remains one operation lookup plus bounded rate lookups. No broad ledger scan runs during normal user operations.

**Constraints**: Do not alter historical ledger rows automatically. Keep app and worker Prisma schemas synchronized. Use production migrations, not schema push. Preserve zero-rate semantics. Avoid exposing secrets or runtime credentials.

**Scale/Scope**: One admin settings page, one admin points settings API, shared points settings/rate helpers, web operation award logic, worker operation award logic, Prisma migration, and focused tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. New awards use existing operation, ownership, settings, and point ledger evidence. Historical rows are not deleted or rewritten.
- **Traceable Planning**: PASS. Tasks map stories to files, tests, expected outcomes, risks, mitigations, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. Points can become balance, so save precedence and award routing tests must be written before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted edits and avoids full-file rewrites.
- **Security And Privacy Boundaries**: PASS. No beIN credentials, sessions, provider tokens, or runtime secrets are exposed.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/029-points-manager-user-rewards/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- api-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
prisma/
|-- schema.prisma
`-- migrations/

worker/
|-- prisma/schema.prisma
`-- src/lib/points.ts

src/
|-- app/api/admin/points/settings/route.ts
|-- components/admin/points/AdminPointsSettingsClient.tsx
`-- lib/points/
    |-- admin-settings-normalization.ts
    |-- calculation.ts
    |-- operation-awards.ts
    `-- settings.ts

tests/
|-- unit/
|   |-- points-admin-settings-normalization.test.ts
|   |-- points-operation-awards.test.ts
|   `-- worker-points-awards.test.ts
`-- integration/
    `-- admin-points-settings-save.test.ts
```

**Structure Decision**: Keep admin save normalization in a small testable helper, then use it from the existing admin points settings route. Keep operation recipient logic in the existing points award modules. Mirror schema and award behavior into the worker path so operation completion stays consistent.

## Phase 0 Research

See [research.md](./research.md). Decisions:

- Current setting field names are canonical; legacy aliases are fallback only.
- Admin success appears only after saved values are read back or returned.
- Manager-owned user points use a dedicated rate bucket, not the normal user-global rate.
- The new manager-owned user behavior is off by default to preserve current routing.
- Web and worker point-award paths must be updated together.

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/api-contract.md](./contracts/api-contract.md), and [quickstart.md](./quickstart.md).

## Source Of Truth And Data Rules

- **Admin settings source**: `PointProgramSettings` and active `PointRule` rows.
- **Visible point settings source**: current fields returned by `GET /api/admin/points/settings`.
- **Legacy field handling**: old aliases may be accepted in save requests for compatibility, but current field names win.
- **Manager-owned user setting source**: `PointProgramSettings.managerOwnedUserPointsEnabled`.
- **Manager-owned user rate source**: active `PointRule` row with the manager-owned user default owner type and no owner user id.
- **Award source**: qualifying completed renewal operations, current ownership relations, active point settings, and active rate rules.
- **Point balance source**: `PointLedgerEntry` remains immutable evidence.

## Security Boundaries

- Admin points settings GET/PUT require exact admin authorization.
- Public/user endpoints must not expose the full admin settings payload.
- Logs and API responses must not include beIN passwords, sessions, provider tokens, cookies, storage state, ViewState, or raw runtime credentials.
- Point settings can expose usernames/display labels to admins only for override management.

## Database And Migration Impact

Planned Prisma changes:

- Add `managerOwnedUserPointsEnabled Boolean @default(false)` to `PointProgramSettings`.
- Add a new point rule owner type for the manager-owned user default rate.
- Keep `PointRule.ownerUserId` null for the manager-owned user default rate.
- Mirror schema changes into `worker/prisma/schema.prisma`.

Required indexes/constraints:

- Existing `point_rules(owner_type, owner_user_id, is_active)` index covers the new owner type.
- No new ledger index is required because no historical backfill runs in this feature.

Migration safety:

- Existing settings rows default the new switch to disabled.
- Existing active point rules remain active.
- No existing ledger rows are updated, deleted, or backfilled.
- Production deploy must use `npx prisma migrate deploy`.

## Legacy And Backfill Behavior

- Old request aliases remain accepted as compatibility fallback.
- The admin page stops sending old aliases after this change.
- Existing manager-owned user operations are not recalculated.
- Historical point corrections remain a separate reviewed workflow and are not part of this feature.

## API Authorization Rules

- `GET /api/admin/points/settings`: exact `ADMIN`; returns safe point settings and override lists.
- `PUT /api/admin/points/settings`: exact `ADMIN`; validates, normalizes, saves settings and rules atomically; returns the saved snapshot or enough data for the page to reload safely.
- Operation point award logic remains internal and is not directly callable by users.

## UI States

- Loading: existing loading state remains while settings are fetched.
- Empty overrides: no agents/managers displays an empty state.
- Invalid save: show the server validation error and keep the draft values on screen.
- Successful save: show success only after the displayed values match the persisted values.
- Manager-owned user option disabled: keep the rate visible but clearly disabled or inactive in behavior.

## Verification Strategy

- Unit tests for point settings normalization and save precedence.
- Integration test for admin settings save/readback.
- Unit tests for manager-owned user operation recipients when disabled and enabled.
- Worker parity test or focused worker-side unit coverage for the same manager-owned user cases.
- Prisma schema validation and schema-sync check.
- Web and worker production builds.
- Mojibake and whitespace diff checks.

## Verification Limitations

- Existing production data cannot prove historical intended ownership without business review; no automatic historical correction is planned.
- Browser-level UI verification may require a running dev server and admin session.
- Worker parity can be validated through focused logic tests and build, but a full production queue replay is out of scope for this plan.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. The ledger remains immutable and new entries record rate snapshots.
- **Traceable Planning**: PASS. Task list includes file-level work, tests, and verification.
- **Test-First For Risky Behavior**: PASS. Tests are explicitly first in the task order.
- **Minimal, Encoding-Safe Edits**: PASS. All edits are scoped to point settings, points award logic, schemas, tests, and docs.
- **Security And Privacy Boundaries**: PASS. No sensitive runtime data is exposed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
