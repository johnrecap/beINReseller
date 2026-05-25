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

**Decision**: Add a small service in `src/lib/agents/assignment-transfer.ts` and call it from both `/api/admin/agent-assignments` and admin user creation/transfer endpoints.

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

## Decision 5: Optional Unique Index Is Hardening, Not MVP Requirement

**Decision**: Do not require a migration for MVP. Consider a partial unique index for active assignment per user after checking production data.

**Rationale**: The service can end old active assignments transactionally. Adding a partial unique index on production requires a duplicate-data preflight and could block deployment if old bad data exists.

**Alternatives considered**:

- Add partial unique index immediately: useful, but risky without preflight on the live database.
- Skip all hardening permanently: rejected because an optional follow-up hardening task is valuable after data health is known.

## Existing Behavior To Change

- `src/app/api/admin/users/route.ts` currently supports `roleFilter=distributors|users` only.
- `src/app/api/admin/users/counts/route.ts` currently returns only `distributors` and `users`.
- `src/components/admin/users/UsersTable.tsx` defines `TabType = 'distributors' | 'users'` and has no agents tab.
- `src/app/api/admin/agent-assignments/route.ts` rejects manager-owned users with reason `MANAGER_OWNED`.
- `src/app/api/admin/users/route.ts` creates a `ManagerUser` link for every admin-created `USER`, which is wrong when creating directly under an agent.
- `src/lib/points/operation-awards.ts` resolves manager ownership before agent assignment. Transfer must remove manager/admin links so future points route to agent ownership.

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
