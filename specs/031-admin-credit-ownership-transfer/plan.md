# Implementation Plan: Admin Credit Requests And Unified Ownership Transfer

**Branch**: `codex/031-admin-credit-ownership-transfer` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-admin-credit-ownership-transfer/spec.md`

## Summary

Allow users owned directly by admin to submit credit requests without an agent assignment, while keeping manager-owned and unowned users blocked. Fix Telegram and WhatsApp handoff so historical request snapshots remain truthful. Extend the unified admin ownership flow so any active non-deleted `USER` can move safely to admin, manager/distributor, or agent ownership; make Source Group nullable classification metadata; preserve all financial/history data; and add row locking, an optimistic ownership token, no-op/same-agent behavior, safe audit evidence, and compatibility adapters for every assignment mutation path.

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

**Primary Dependencies**: Next.js 16.1, Prisma 7.2, PostgreSQL row locks and additive migrations, zod, existing credit request services, existing agent assignment transfer helper, existing Telegram and WhatsApp handoff helpers

**Storage**: PostgreSQL through Prisma schema and migrations

**Testing**: `npx tsx --test` focused unit/integration tests, PostgreSQL migration/concurrency tests, `npx prisma validate`, app/Worker schema-sync and builds, Playwright ownership-flow checks, and targeted lint checks

**Target Platform**: Existing Desh Panel web app and API routes

**Project Type**: Full-stack Next.js application with Prisma-backed APIs

**Performance Goals**: Credit request eligibility remains a bounded lookup. Ownership transfer locks and updates one subject plus relevant owners in one bounded transaction. Admin users listing remains paginated, returns ownership tokens without N+1 scans, and no-group reporting stays bounded.

**Constraints**: Do not change balances, operation records, point ledger entries, historical credit request decisions, or sensitive runtime credential handling. Do not use `npx prisma db push` for production. Keep edits minimal and encoding-safe.

**Scale/Scope**: Credit request eligibility and creation; snapshot-safe notification/handoff; admin/agent user tables and no-group filters; unified ownership transfer, legacy adapter, same-agent edit and delete service/API/dialog; nullable Source Group migration in app and Worker schemas; optimistic concurrency and row locking; production ownership audit/constraint gate; focused unit, PostgreSQL integration, UI/Playwright, build, and deployment verification.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Credit requests and transfers are financially adjacent and must preserve owner snapshots and audit entries. The plan records source-of-truth and legacy behavior before implementation.
- **Traceable Planning**: PASS. Tasks map user stories to files, tests, expected outcomes, risks, mitigations, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. Credit request eligibility, handoff routing, and ownership transfer tests must be created before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted helpers and existing routes/components instead of broad rewrites.
- **Security And Privacy Boundaries**: PASS. Telegram tokens, beIN credentials, cookies, sessions, TOTP secrets, and provider data remain redacted.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/031-admin-credit-ownership-transfer/
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
`-- prisma/schema.prisma

src/
|-- app/api/credit-requests/route.ts
|-- app/api/admin/credit-requests/[id]/decision/route.ts
|-- app/api/admin/credit-requests/[id]/notification-retry/route.ts
|-- app/api/admin/users/route.ts
|-- app/api/admin/user-ownership/route.ts
|-- app/api/admin/user-ownership/targets/route.ts
|-- components/admin/credit-requests/AdminCreditRequestsClient.tsx
|-- components/admin/users/UsersTable.tsx
|-- components/admin/users/TransferOwnershipDialog.tsx
|-- lib/admin/users-ownership-filter.ts
|-- lib/agents/assignment-transfer.ts
|-- lib/credit-requests/notifications.ts
|-- lib/credit-requests/permissions.ts
|-- lib/credit-requests/telegram.ts
|-- lib/credit-requests/types.ts
|-- lib/credit-requests/whatsapp-handoff.ts
`-- lib/users/ownership.ts

tests/
|-- unit/
|   |-- credit-request-ownership.test.ts
|   |-- credit-request-telegram.test.ts
|   |-- credit-request-whatsapp-handoff.test.ts
|   |-- user-ownership-classification.test.ts
|   `-- user-ownership-transfer.test.ts
`-- integration/
    |-- admin-user-ownership-transfer.test.ts
    `-- credit-request-admin-owned.test.ts
```

**Structure Decision**: Add a small shared ownership classification helper and reuse it from credit requests, admin users, and transfer logic. Keep the existing agent assignment transfer behavior compatible, but route new admin UI transfer actions through a unified ownership transfer service.

## Phase 0 Research

See [research.md](./research.md). Decisions:

- Admin-owned credit eligibility must be based on current owner classification, not simply the absence of an agent.
- Admin/manager ownership links are classified by the linked owner role.
- Legacy admin-created users with no current owner may be treated as legacy admin-owned only when no active manager/admin link or active agent assignment exists.
- New credit requests should store owner type evidence.
- Admin-owned WhatsApp handoff must skip agent assignment lookup entirely.
- Unified transfers close old conflicting current owner links before creating the new owner; exact matches are no-ops and same-agent metadata changes update in place.
- Public mutations require an ownership token and lock/revalidate the subject plus relevant owners in one transaction.
- Source Group is nullable classification metadata. Its absence has no financial, ownership, points, transaction, notification-destination, or handoff effect.
- Strict `ManagerUser.userId` uniqueness is gated by the production audit; cross-table locking remains mandatory after the constraint.

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/api-contract.md](./contracts/api-contract.md), and [quickstart.md](./quickstart.md).

## Source Of Truth And Data Rules

- **Current owner source**: active `AgentAssignment` rows and `ManagerUser` rows whose owner user is active and not deleted.
- **Admin-owned source**: `ManagerUser` whose owner role is `ADMIN`.
- **Manager-owned source**: `ManagerUser` whose owner role is `MANAGER`.
- **Agent-owned source**: active `AgentAssignment` whose agent is active and not deleted.
- **Legacy admin fallback**: `createdById` points to an active admin and no current owner rows exist.
- **Transfer source**: the unified transfer transaction result, not client-side assumptions.
- **Concurrency source**: a versioned digest of sorted current manager/admin links and active assignment identity/metadata, revalidated after row locks.
- **Source Group source**: explicit request value, explicit clear, same-agent preserved value, target-agent default, or `null`, with the resolution mode recorded.
- **Credit request source**: request row plus owner snapshot captured at creation time.
- **WhatsApp handoff source**: agent-owned request snapshots may resolve request URL snapshot, current assignment URL, agent configuration, then global configuration. Admin-owned and legacy-admin-owned snapshots use global configuration only and never query a later assignment. A null Source Group never blocks the destination, and a historical null group never inherits a later group label.
- **Audit source**: transfer audit entry records actor, safe previous/current owner evidence, cleanup details, target owner, Source Group resolution mode, and timestamp; full WhatsApp invite URLs are excluded.

## Security Boundaries

- Only admin can transfer ownership across admin, manager/distributor, and agent ownership.
- Normal users can only submit their own credit requests.
- Manager-owned and unowned users remain blocked from credit requests in this version.
- Transfer targets must be active, not deleted, and have the expected role.
- Transfer subjects must be active, not deleted, and have role exactly `USER`; all public mutation routes require exact `ADMIN` authorization and an ownership precondition.
- API responses and logs must not expose Telegram tokens, beIN passwords, TOTP secrets, cookies, session data, storage state, ViewState, or raw provider tokens.
- Audit and operational logs must not contain full WhatsApp invitation URLs; they may record configured/cleared state and a non-reversible digest when correlation is necessary.
- Admin UI may show owner names, usernames, and labels needed for audit; it must not show sensitive credentials.

## Database And Migration Impact

Planned Prisma changes:

- Add nullable owner evidence to `CreditRequest`, such as `ownerTypeSnapshot` and optional owner label/id fields if current nullable agent fields are not enough for audit clarity.
- Change `AgentAssignment.sourceGroup` from `String` to `String?` in both Prisma schemas.
- Add an additive migration that drops only the `NOT NULL` requirement on `agent_assignments.source_group`; do not backfill, delete, or rewrite historical values.
- Mirror schema changes into `worker/prisma/schema.prisma` if repository schema sync requires it.

Required indexes/constraints:

- Keep the existing partial unique active-agent-assignment index and verify it on upgraded PostgreSQL data.
- Add a unique `ManagerUser.userId` constraint only after the production audit confirms/repairs conflicting current links.
- No database constraint spans `ManagerUser` and `AgentAssignment`; retain the subject-user lock to serialize those cross-table ownership changes.

Migration safety:

- New credit request owner evidence fields are nullable for historical rows.
- Historical credit requests are not rewritten.
- Existing Source Group values and request snapshots are preserved; new null assignment values are permitted without a backfill.
- Reversal from nullable to required is unsafe after null rows exist; rollback is a forward-fix or a separately reviewed validation/backfill before `SET NOT NULL`.
- Production deploy must use `npx prisma migrate deploy`.

## Legacy And Backfill Behavior

- Existing credit requests keep their historical agent/null snapshots.
- Existing user ownership data is not bulk rewritten in this feature.
- Legacy admin-owned classification is allowed only as a fallback when no current owner exists and `createdById` points to an active admin.
- Ownership transfer cleanup can repair a single user's dirty current owner rows at the time that user is transferred.
- A separate data cleanup/backfill migration can be planned later after audit output is reviewed.
- Public missing/stale ownership preconditions return `428`/`409`; duplicate/no-op retries do not write new assignments or audit records.

## API Authorization Rules

- `GET /api/credit-requests`: authenticated normal user only; returns eligibility and recent requests for that user.
- `POST /api/credit-requests`: authenticated normal user only; accepts requests for agent-owned and admin-owned users.
- `GET /api/admin/users`: admin only; returns current owner classification for each listed user.
- `GET /api/admin/user-ownership/targets`: admin only; returns valid active target owners grouped by admin, manager/distributor, and agent.
- `POST /api/admin/user-ownership`: admin only; transfers one user to the selected owner type and records audit evidence.
- Existing `/api/admin/agent-assignments` compatibility can remain, but new unified UI should call the new ownership endpoint.

## UI States

- Credit request form:
  - Eligible admin-owned user: form is enabled and owner label says admin/direct.
  - Eligible agent-owned user: existing agent/group label remains.
  - Manager-owned or unowned user: form shows a clear blocked reason.
  - Submit success: request appears in recent requests with correct owner/notification state.
- Admin users page:
  - Owner column shows admin/direct, manager/distributor, agent, legacy admin, or unowned.
  - Transfer dialog shows target type selector and only relevant fields, marks Source Group optional, and distinguishes omitted from explicitly cleared.
  - Transfer loading state disables submit.
  - Transfer validation error preserves selected input.
  - Transfer success refreshes the row and removes stale old owner display.
- Assignment and credit request tables show localized no-group wording and expose an explicit no-group filter.
- Source Group filter states:
  - Loading keeps the current table stable and disables duplicate filter submissions.
  - Valid no-group filter with zero rows shows a localized empty result, not a hidden/error row.
  - Invalid `sourceGroupMode` returns a stable validation code and the UI preserves the last valid filter with a localized error/recovery action.
  - API/network failure shows a retry state without silently broadening the ownership scope.
- Admin credit review:
  - Admin-owned request cards show admin/direct owner wording.
  - Missing default WhatsApp destination shows a warning, not a wrong link.

## Verification Strategy

- Unit tests for owner classification.
- Unit and integration tests for admin-owned credit request eligibility and creation.
- Unit tests for Telegram message formatting with admin-owned and agent-owned requests.
- Unit tests for WhatsApp handoff proving null-agent/admin-owned requests skip assignment lookup.
- Unit and integration tests for transfer directions and dirty-data cleanup.
- Unit and PostgreSQL integration tests for all Source Group/WhatsApp tri-state modes, row locks, stale tokens, no-op/same-agent updates, concurrent transfers, rollback, and non-zero financial invariants.
- Contract and UI tests for nullable Source Group, explicit no-group filtering, historical snapshot behavior, and AR/EN/BN labels.
- API authorization tests for transfer endpoints.
- App/Worker Prisma schema sync, migration tests, builds, targeted lint, and Playwright ownership-flow verification.
- Data audit query before production deploy.
- Mojibake and whitespace diff checks on changed files.

## Verification Limitations

- Existing production ownership data may be dirty; strict uniqueness constraints are deferred until audit results are reviewed.
- Telegram delivery cannot be fully proven in unit tests; tests can prove payload construction and notification decision, while production test confirms external delivery.
- Browser-level UI verification requires a dev server and admin session.
- The plan does not recalculate old credit requests or balances.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. New credit requests store owner evidence, transfer actions write audit entries, and historical records are preserved.
- **Traceable Planning**: PASS. `tasks.md` identifies exact files, tests, risks, mitigations, and verification.
- **Test-First For Risky Behavior**: PASS. Tests are ordered before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are scoped to owner classification, credit request paths, transfer paths, UI, and tests.
- **Security And Privacy Boundaries**: PASS. Sensitive runtime data remains redacted.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
