# Implementation Plan: Eid Reward Audience And Copy

**Branch**: `028-eid-reward-audience-copy` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-eid-reward-audience-copy/spec.md`

## Summary

Expand the existing Eid Rewards feature so admins can control the audience and edit every visible popup/card text from the same admin page. The implementation keeps current default visibility for all existing roles, adds per-user allow/deny exceptions, enforces the same rule in status and claim, and normalizes popup text through one settings-owned text bundle with backward-compatible defaults.

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

**Primary Dependencies**: Next.js 16.1, Prisma 7.2, PostgreSQL, NextAuth, zod, lucide-react, existing Eid Rewards services/components

**Storage**: PostgreSQL through Prisma schema and migrations

**Testing**: `npx tsx --test` focused unit/integration tests, `node scripts/check-prisma-schema-sync.js`, `npx prisma generate`, `npm run build`, `npm --prefix worker run build`

**Target Platform**: Existing Desh Panel web app and API deployment

**Project Type**: Full-stack Next.js application with Prisma-backed APIs and admin/client dashboard views

**Performance Goals**: Status and claim audience checks add at most one indexed lookup for a single user override. Admin settings save remains a single transaction.

**Constraints**: Preserve existing reward behavior for default settings, do not reset claim history, do not expose audience rules to public APIs, use production migrations only, keep app and worker Prisma schemas synchronized, avoid mobile app scope.

**Scale/Scope**: One feature spanning Prisma migration, Eid settings validation, admin settings API/UI, public status/claim services, popup text usage, and focused tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Claim behavior remains ledger-backed; audience checks happen before claim creation and do not alter historical claim or ledger rows.
- **Traceable Planning**: PASS. Tasks map each story to files, tests, expected outcomes, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. This controls who can receive points that can become balance, so audience and claim rejection tests must be written before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted edits and avoids full-file rewrites.
- **Security And Privacy Boundaries**: PASS. Public APIs do not expose complete audience rules, overrides, sessions, passwords, provider tokens, or runtime secrets.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/028-eid-reward-audience-copy/
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

worker/prisma/
`-- schema.prisma

src/
|-- app/api/eid-rewards/
|   |-- status/route.ts
|   `-- claim/route.ts
|-- app/api/admin/eid-rewards/
|   `-- settings/route.ts
|-- components/eid-rewards/
|   `-- EidRewardPopup.tsx
|-- components/admin/eid-rewards/
|   `-- AdminEidRewardsClient.tsx
`-- lib/eid-rewards/
    |-- audience.ts
    |-- claim.ts
    `-- settings.ts

tests/
|-- unit/
`-- integration/
```

**Structure Decision**: Keep the feature inside the existing Eid Rewards module. Add one small audience helper so status and claim share the same decision. Extend the existing admin settings page instead of creating a new admin area.

## Phase 0 Research

See [research.md](./research.md). Decisions:

- Use role-level audience plus per-user allow/deny overrides.
- Keep default audience as all current roles.
- Enforce audience in both status and claim.
- Store copy in a structured popup text bundle with safe defaults.
- Keep existing before/after text fields compatible.

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/api-contract.md](./contracts/api-contract.md), and [quickstart.md](./quickstart.md).

## Source Of Truth And Data Rules

- **Audience source**: `EidRewardSettings.audienceRoles` plus `EidRewardAudienceOverride`.
- **Audience decision**: inactive/deleted user is always denied; deny override wins; allow override wins over role exclusion; otherwise role list decides.
- **Popup text source**: normalized Eid popup text bundle from settings. If missing, defaults are derived from existing constants and `beforeText`/`afterText`.
- **Claim source**: existing `EidRewardClaim` remains the immutable record. No claim row may be created before the audience check passes.
- **Point source**: existing `PointLedgerEntry` remains the point balance source of truth.

## Security Boundaries

- Public status can return whether the current user is eligible, but not the full role audience or exception list.
- Public claim returns a generic not-eligible error for audience failures and creates no records.
- Admin settings GET/PUT require exact admin authorization.
- Admin user search/override payload must select safe user fields only.
- Logs must not include passwords, sessions, provider tokens, or sensitive runtime data.

## Database And Migration Impact

Planned Prisma changes:

- Add enum `EidRewardAudienceOverrideEffect`: `ALLOW`, `DENY`.
- Add `audienceRoles Role[]` to `EidRewardSettings`, defaulting to all current roles.
- Add `popupTexts Json?` to `EidRewardSettings` for the complete text bundle.
- Add `EidRewardAudienceOverride` with `settingsId`, `userId`, `effect`, and timestamps.
- Add relations from settings and user to audience overrides.
- Mirror schema changes into `worker/prisma/schema.prisma`.

Required indexes/constraints:

- `eid_reward_audience_overrides`: unique `[settingsId, userId]`.
- `eid_reward_audience_overrides`: index `[settingsId, effect]`.
- `eid_reward_audience_overrides`: index `[userId]`.
- Existing `eid_reward_claims` uniqueness remains unchanged.

Migration safety:

- Existing settings row receives default audience roles for all current roles.
- Existing `beforeText` and `afterText` remain intact.
- `popupTexts` may be null for old rows; the app must normalize defaults at read time.
- Production deploy must use `npx prisma migrate deploy`, not `db push`.

## Legacy And Backfill Behavior

- No existing claims or point ledger rows are changed.
- Existing users retain reward visibility unless an admin changes the audience.
- Existing settings with only `beforeText` and `afterText` continue to work.
- Admin save writes the new popup text bundle and keeps `beforeText`/`afterText` aligned for compatibility.

## API Authorization Rules

- `GET /api/eid-rewards/status`: authenticated user, returns safe current-user status only.
- `POST /api/eid-rewards/claim`: authenticated user, audience-checked before claim creation.
- `GET /api/admin/eid-rewards/settings`: exact `ADMIN`, returns full audience and text settings.
- `PUT /api/admin/eid-rewards/settings`: exact `ADMIN`, validates and saves settings/audience/text atomically.

## Verification Strategy

- Unit tests for audience decision precedence and inactive/deleted user denial.
- Unit tests for popup text normalization, placeholder validation, and legacy defaults.
- Integration tests for status hiding and claim rejection when outside audience.
- Integration tests for admin settings validation and atomic save.
- Manual admin page test for roles, exceptions, and all editable text.
- `node scripts/check-prisma-schema-sync.js`.
- `npx prisma generate`.
- `npm run build`.
- `npm --prefix worker run build`.
- Mojibake scan on changed text files.

## Complexity Tracking

No constitution violations are expected.
