# Implementation Plan: Agent User Management

**Branch**: `codex/015-agent-user-management` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-agent-user-management/spec.md`

## Summary

Add agents as a first-class tab in the admin users page and make agent ownership management safe. The existing `AgentAssignment` model is reused, but assignment creation becomes a transfer operation that can move users away from manager/admin ownership or another agent in one transaction. New users can be created directly under an agent without creating a legacy manager/admin owner link, and future point earning follows the new active agent assignment only.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy ownership behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js runtime used by Next.js and `tsx`

**Primary Dependencies**: Next.js 16.1, React 19.2, Prisma 7.2, PostgreSQL, zod, next-auth beta, lucide-react

**Storage**: PostgreSQL through Prisma schema and migrations

**Testing**: `node:test` through `npx tsx --test`, `npx tsc --noEmit`, schema sync script, focused API/service tests

**Target Platform**: Web application and API running in the existing BeIN reseller panel deployment

**Project Type**: Full-stack Next.js application with Prisma-backed APIs and admin client views

**Performance Goals**: Admin users list queries must remain paginated and avoid per-row point or assignment count N+1 queries. Transfer operations must complete in one database transaction.

**Constraints**: Use encoding-safe edits only; no full-file rewrites; preserve live production database safety; no historical spend or points recalculation; no beIN runtime secrets exposed.

**Scale/Scope**: One admin management feature across users API, agent assignment API, users page UI, existing agents page UI, a small ownership transfer service, focused tests, and optional schema/index hardening.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Ownership transfer affects future point/accounting behavior and must log previous ownership, new assignment, admin actor, and source group.
- **Traceable Planning**: PASS. Tasks include reason, expected result, possible bugs, mitigation, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. This touches ownership that controls points and credit requests, so service tests and integration tests must be written before behavior changes where seams exist.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted edits and `apply_patch`; avoid risky PowerShell writers.
- **Security And Privacy Boundaries**: PASS. Contracts expose admin-owned account metadata only to admins and no beIN secrets.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/015-agent-user-management/
|-- plan.md
|-- spec.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- admin-users-agents-tab.md
|   |-- admin-agent-user-transfer.md
|   `-- admin-create-user-under-agent.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/admin/users/
|-- app/api/admin/users/counts/
|-- app/api/admin/agent-assignments/
|-- components/admin/users/
|-- components/admin/agents/
|-- lib/agents/
`-- lib/points/

tests/
|-- unit/
`-- integration/

prisma/
|-- schema.prisma
`-- migrations/
```

**Structure Decision**: Keep UI changes in the existing admin user and admin agent components. Add a focused `src/lib/agents/assignment-transfer.ts` service so both `/api/admin/agent-assignments` and `/api/admin/users` can share the same ownership logic without duplicating transaction rules.

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design And Contracts

See [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), and [contracts/](./contracts/).

## Source Of Truth And Ownership Rules

- **Agent ownership source**: Active `AgentAssignment` rows where `isActive=true`.
- **Manager/admin ownership source**: Existing `ManagerUser` rows linking a `USER` to a manager/admin account.
- **Transfer to agent**:
  - Validate target user is a non-deleted `USER`.
  - Validate target agent is a non-deleted active `AGENT`.
  - Resolve nullable Source Group using Spec 031 presence semantics: same-agent preserve, new-agent default/null, explicit clear, or explicit value.
  - End all active agent assignments for the user.
  - Remove all manager/admin ownership rows for the user.
  - Create the new active agent assignment for a different owner, update same-agent metadata in place, or return a no-op for an exact match.
  - Create an activity log with previous and new ownership evidence.
- **Historical data**: Operations, points, credit requests, balance transactions, inactive assignments, and old activity logs are not rewritten.
- **Points behavior**: Future completed spend must see the current active agent assignment and should no longer see a manager/admin ownership row after transfer.

## API Authorization Rules

- Agents tab list and counts require admin role.
- Create user under agent requires admin role.
- Transfer user to agent requires exact admin role.
- End assignment remains admin-only.
- Agent dashboard remains scoped to the authenticated agent and only shows active assignments for that agent.
- Manager users page must no longer show a user after that user is transferred out of manager ownership.

## Required Indexes And Migration Impact

- Existing indexes on `AgentAssignment(agentId, isActive)` and `AgentAssignment(userId, isActive)` support current list and transfer lookups.
- 2026-08-06 amendment: an additive migration drops `NOT NULL` from `AgentAssignment.sourceGroup` in both app and Worker schemas without rewriting existing rows.
- Existing hardening migration may add/retain a partial unique index on active agent assignment per user:
  - `CREATE UNIQUE INDEX ... ON agent_assignments(user_id) WHERE is_active = true`
  - Only add this after a preflight query confirms production has no duplicate active assignments.
- No destructive migration is allowed for existing historical assignments.

## UI States

- Agents tab: loading skeleton, empty state, search pagination, refresh spinner, and API error alert.
- Add-under-agent dialog: prefilled agent, optional Source Group default, duplicate username/email error, invalid agent error.
- Transfer dialog: target user, current owner summary/token, target agent, optional Source Group preserve/default/clear states, success state, stale-state error, and no partial local state update on failure.
- Existing agents page: no more manager-owned rejection; show transfer success and refresh assignments.

## Verification Limitations

- Existing full lint can be blocked by unrelated repository warnings; this feature must still run TypeScript, schema sync, focused unit tests, integration tests, and UI smoke checks.
- Browser verification requires a local dev server and authenticated admin session; if not available, document manual verification steps from quickstart.
- Production deployment MUST run `npx prisma migrate deploy` for the required nullable Source Group migration. The separate manager-ownership uniqueness migration remains audit-gated and is deployed only after accepted cleanup evidence.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Contracts and data model require transfer logs and previous ownership evidence.
- **Traceable Planning**: PASS. `tasks.md` maps user stories to exact files and verification.
- **Test-First For Risky Behavior**: PASS. Unit and integration tests precede service and route changes.
- **Minimal, Encoding-Safe Edits**: PASS. Edits are scoped and include mojibake scan.
- **Security And Privacy Boundaries**: PASS. Admin-only APIs do not expose sensitive runtime data.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
