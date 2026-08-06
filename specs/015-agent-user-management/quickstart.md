# Quickstart: Agent User Management

## Preconditions

- Admin account can log in.
- At least one `AGENT` account exists.
- At least one manager-owned user exists.
- At least one admin-created user exists.
- At least one agent-owned user exists for reassignment testing.

## Automated Verification

Run from repository root:

```bash
node scripts/check-prisma-schema-sync.js
npx tsc --noEmit
npx tsx --test tests/unit/agent-assignment-transfer.test.ts
npx tsx --test tests/unit/points-operation-awards.test.ts
npx tsx --test tests/integration/admin-agent-assignments.test.ts
```

For the required nullable Source Group migration and schema sync:

```bash
npx prisma validate
node scripts/check-prisma-schema-sync.js
```

## Manual UI Verification

1. Start the app.
2. Log in as admin.
3. Open the admin users page.
4. Confirm tabs show distributors, `مندوبين`, and users.
5. Open `مندوبين`.
6. Search for an agent and confirm rows show balance, points, active status, assigned count, created date, and actions.
7. Use the add-user-under-agent flow.
8. Confirm the new user appears in the agent dashboard and not in manager users list.
9. Transfer a manager-owned user to an agent.
10. Confirm the user disappears from the manager users list and appears in the target agent dashboard.
11. Transfer an agent-owned user to a different agent.
12. Confirm the old agent no longer sees the user and the new agent does.
13. Confirm the old agent still sees only credit requests captured with its own agent snapshot, while the new agent does not inherit those historical requests.

## Data Checks

After a transfer:

```sql
SELECT *
FROM manager_users
WHERE user_id = '<user_id>';
```

Expected: zero rows.

```sql
SELECT id, agent_id, is_active, ended_at
FROM agent_assignments
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;
```

Expected: exactly one row with `is_active=true`; old rows are inactive with `ended_at`.

## Points Behavior Smoke Check

After transferring a user to an agent, complete a new subscription spend operation for that user after points are enabled. The completion-time snapshot recipients are:

- User receives user-rate points.
- Target agent receives agent-rate points.
- Previous manager/admin owner receives no new points.

Do not expect historical operations or historical points to change, including when finalization happens after the transfer.
