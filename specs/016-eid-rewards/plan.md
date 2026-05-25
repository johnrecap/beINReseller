# Implementation Plan: Eid Rewards

**Branch**: `codex/016-eid-rewards` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-eid-rewards/spec.md`

## Summary

Build Eid Rewards inside the existing Next.js/Prisma panel. The feature reuses current authentication, `users.balance`, `transactions`, `point_ledger_entries`, `point_cash_redemptions`, and `point_program_settings`. New database state is limited to Eid event settings, weighted tiers, and immutable claim audit rows. The main dashboard shows an Arabic RTL animated popup for eligible users. Admins configure the event from a standalone page.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by:

- **Reason**
- **Expected**
- **Possible bugs**
- **Fix/Mitigation**
- **Verification**

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js runtime, React 19.2

**Primary Dependencies**: Next.js 16.1, Prisma 7.2, PostgreSQL, NextAuth, zod, framer-motion, sonner, lucide-react, planned `lottie-react`

**Storage**: PostgreSQL through Prisma schema and migrations

**Testing**: `node:test` via `npx tsx --test`, focused service/API tests, schema sync, `npm run build`, `npm --prefix worker run build`

**Target Platform**: Existing Desh Panel web app and API deployment

**Project Type**: Full-stack Next.js application with Prisma-backed APIs and admin/client dashboard views

**Performance Goals**: Claim and redeem endpoints complete in one DB transaction. Admin claim lists remain paginated and indexed by event/date/user.

**Constraints**: No new project; no duplicate point wallet; no frontend-selected points; no sensitive data exposure; production uses migrations only; preserve worker/app Prisma schema sync; do not mutate old historical point/balance records.

**Scale/Scope**: One feature spanning Prisma models/migration, public authenticated APIs, admin APIs/page, dashboard popup, tests, and deployment docs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Claims and conversions affect points and balance; plan uses `EidRewardClaim`, `PointLedgerEntry`, `PointCashRedemption`, and `Transaction` audit rows.
- **Traceable Planning**: PASS. Tasks map stories to exact files, tests, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. Claim uniqueness, weighted random, and balance conversion require service tests before endpoint implementation.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted edits and avoids rewriting unrelated points/rewards behavior.
- **Security And Privacy Boundaries**: PASS. Public APIs do not expose weights or internal rules; admin APIs require admin auth; no secrets are introduced.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/016-eid-rewards/
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
|   |-- claim/route.ts
|   `-- redeem/route.ts
|-- app/api/admin/eid-rewards/
|   |-- settings/route.ts
|   |-- claims/route.ts
|   `-- transactions/route.ts
|-- app/dashboard/admin/eid-rewards/page.tsx
|-- components/eid-rewards/
|-- components/admin/eid-rewards/
|-- components/dashboard/DashboardContent.tsx
|-- components/layout/Sidebar.tsx
`-- lib/eid-rewards/

public/assets/eid-rewards/
|-- animation1.json
|-- animation2.json
`-- animation3.json

tests/
|-- unit/
`-- integration/
```

**Structure Decision**: Use a focused `src/lib/eid-rewards/` service layer so status, claim, redeem, and admin routes share one source of truth. Keep UI in existing dashboard/admin component patterns. Add tracked Lottie assets under `public/assets/eid-rewards/`.

## Source Of Truth And Data Rules

- **Eligibility source**: `EidRewardSettings` + current authenticated user + existing claims for the computed claim scope.
- **Claim uniqueness source**: `eid_reward_claims` unique `(user_id, claim_scope_key)`.
- **Claim points source**: `point_ledger_entries` with `sourceType='EID_REWARD'`, `status='AVAILABLE'`, and `sourceId=claim.id`.
- **Point balance source**: existing point summary over `point_ledger_entries`; must include `EID_REWARD` as available earned points.
- **Conversion settings source**: existing singleton `point_program_settings`.
- **Balance source**: existing `users.balance`.
- **Balance ledger source**: existing `transactions`.
- **Conversion audit source**: existing `point_cash_redemptions` plus negative `POINT_CASH_REDEMPTION` point ledger.
- **Event key**: settings-owned stable string, e.g. `eid-2026`, required for once-per-event behavior and future Eid seasons.

## Security Boundaries

- Public status returns only user-safe state and copy.
- Public claim never accepts `points`, `moneyValue`, tier id, or probability data.
- Admin settings can write tiers and dates; all values must be validated server-side.
- Claim and redeem endpoints require auth and rate limiting.
- Admin APIs require exact admin role.
- IP and user agent are stored for claims.
- No `localStorage` is a source of truth. `sessionStorage` may only hide "لاحقا" temporarily.

## Database And Migration Impact

Planned Prisma changes:

- Add enum value `EID_REWARD` to `PointLedgerSourceType`.
- Add enum `EidRewardClaimPolicy`: `ONCE_PER_EVENT`, `ONCE_PER_DAY`.
- Add `EidRewardSettings`.
- Add `EidRewardTier`.
- Add `EidRewardClaim`.
- Add relation from `User` to `EidRewardClaim`.

Required indexes/constraints:

- `eid_reward_claims`: `@@unique([userId, claimScopeKey])`.
- `eid_reward_claims`: indexes on `[eventKey, claimDate]` and `[userId, createdAt]`.
- `eid_reward_tiers`: index on `[settingsId, isActive]`.
- Existing `point_ledger_entries` unique `[ownerUserId, sourceType, sourceId]` prevents duplicate claim ledger credits if `sourceId=claim.id`.

Migration safety:

- Migration only adds new tables and one enum value; it must not rewrite existing point or balance rows.
- Production deploy must use `npx prisma migrate deploy`, not `db push`.

## Legacy And Backfill Behavior

- No historical claims exist before feature launch.
- No old point entries are backfilled.
- Existing point summaries must be updated to include `EID_REWARD` going forward.
- Existing point redemption behavior may need a safe extension so all Eid-eligible roles can redeem from the Eid flow.
- Existing Lottie files are untracked locally; implementation must add them to Git.

## API Authorization Rules

- `GET /api/eid-rewards/status`: authenticated user.
- `POST /api/eid-rewards/claim`: authenticated user, rate-limited.
- `POST /api/eid-rewards/redeem`: authenticated user, rate-limited.
- `GET/PUT /api/admin/eid-rewards/settings`: exact `ADMIN`.
- `GET /api/admin/eid-rewards/claims`: exact `ADMIN`.
- `GET /api/admin/eid-rewards/transactions`: exact `ADMIN`.

## Verification Strategy

- Unit tests for weighted random boundary behavior, settings validation, claim scope generation, and point summary inclusion.
- Integration tests for claim uniqueness, disabled/inactive events, daily/event policy, and redeem-to-balance ledger.
- Focused lint on changed files.
- `node scripts/check-prisma-schema-sync.js`.
- `npx prisma generate`.
- `npm run build`.
- `npm --prefix worker run build`.
- Manual dashboard/admin smoke test.

## Complexity Tracking

No constitution violations are expected.
