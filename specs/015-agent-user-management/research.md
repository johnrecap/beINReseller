# Research: Agent User Management

## Decision 1: Reuse `AgentAssignment` As The Agent Ownership Source

**Decision**: Keep `AgentAssignment` as the source of truth for agent-owned users.

**Rationale**: The project already uses `AgentAssignment` for the agent dashboard, credit request eligibility, WhatsApp handoff routing, and point recipient routing. Reusing it avoids a second ownership model.

**Alternatives considered**:

- Add `agentId` directly to `User`: rejected because it would duplicate assignment history and conflict with existing agent dashboard queries.
- Store ownership in `ManagerUser` for agents too: rejected because the current point and credit request code already expects agents through `AgentAssignment`.

## Decision 2: Transfer To Agent Ends Previous Manager/Admin Ownership

**Decision**: A successful transfer to agent removes all `ManagerUser` rows for the target user and ends all active agent assignments before creating the target assignment.

**Rationale**: The points feature currently gives manager ownership precedence when a valid manager owns the user. Keeping manager/admin links during transfer can make future point routing ambiguous and can leave a user visible in the wrong management page.

**Alternatives considered**:

- Keep manager ownership and add agent assignment: rejected because it can preserve manager precedence and defeats the user's requirement to move users from a manager/admin to an agent.
- Add an `ownerType` flag: rejected for MVP because existing source tables already provide ownership state and a new flag would need migrations and backfill.

## Decision 3: Use One Transfer Service Shared By Both Admin Entry Points

**Decision**: Historical baseline used `src/lib/agents/assignment-transfer.ts`; the 2026-08-06 amendment makes `src/lib/users/ownership-transfer.ts` the canonical locked/token-aware service, with the agent helper and legacy routes acting only as compatibility adapters.

**Rationale**: The existing agents page currently rejects manager-owned users. A shared service avoids fixing the users page while leaving the agents page broken.

**Alternatives considered**:

- Patch only `/api/admin/agent-assignments`: rejected because user creation under an agent still needs a transaction that avoids the current admin manager link.
- Duplicate logic in each route: rejected because ownership transfer is high-risk and must be consistent.

## Decision 4: Agent Tab Uses Existing Admin Users API Pattern

**Decision**: Extend `/api/admin/users` with `roleFilter=agents` and extend `/api/admin/users/counts` with an `agents` count.

**Rationale**: The current admin users page already switches tabs by passing `roleFilter=distributors|users`. Adding `agents` keeps the UI and pagination model consistent.

**Alternatives considered**:

- Use `/api/admin/agent-assignments` to render agents tab: rejected because that endpoint returns full assignment management data, not paginated admin user rows with point summaries.
- Create a new `/api/admin/agents` listing endpoint: rejected for MVP because it overlaps with existing admin users patterns and would require extra UI plumbing.

## Decision 5: Nullable Source Group Migration Is Required; Ownership Constraint Is Audit-Gated

**Decision**: Apply the required additive migration that makes `AgentAssignment.sourceGroup` nullable without rewriting existing rows. Retain the active-assignment uniqueness index; add one-manager-link-per-user uniqueness only after production audit/cleanup acceptance.

**Rationale**: Optional Source Group cannot work while the database column is `NOT NULL`. Cross-table locking remains the primary concurrency guard, while manager-link uniqueness is safe only after duplicate-data preflight.

**Alternatives considered**:

- Skip the nullable migration: rejected because valid no-group assignments would still fail at persistence.
- Add manager-link uniqueness immediately: rejected because it is risky without preflight on the live database.
- Skip all hardening permanently: rejected because an optional follow-up hardening task is valuable after data health is known.

## Existing Behavior To Change

- `src/app/api/admin/users/route.ts` currently supports `roleFilter=distributors|users` only.
- `src/app/api/admin/users/counts/route.ts` currently returns only `distributors` and `users`.
- `src/components/admin/users/UsersTable.tsx` defines `TabType = 'distributors' | 'users'` and has no agents tab.
- `src/app/api/admin/agent-assignments/route.ts` rejects manager-owned users with reason `MANAGER_OWNED`.
- `src/app/api/admin/users/route.ts` creates a `ManagerUser` link for every admin-created `USER`, which is wrong when creating directly under an agent.
- Completion-time point snapshotting resolves manager ownership before agent assignment. Transfer must remove manager/admin links so operations completed after transfer capture agent ownership; already completed operations retain their prior snapshot.

## Verification Queries

Use these queries manually on staging/production before optional hardening:

```sql
SELECT user_id, count(*)
FROM agent_assignments
WHERE is_active = true
GROUP BY user_id
HAVING count(*) > 1;
```

```sql
SELECT mu.user_id, count(*)
FROM manager_users mu
GROUP BY mu.user_id
HAVING count(*) > 1;
```

No production repair query should be run without a fresh backup and reviewed output.
