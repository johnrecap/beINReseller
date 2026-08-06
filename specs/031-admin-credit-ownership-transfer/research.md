# Research: Admin Credit Requests And Unified Ownership Transfer

## Decision: Split Delivery Into Two Safe Increments

**Decision**: Implement admin-owned credit request support first, then unified ownership transfer.

**Rationale**: Admin-owned credit requests are a narrow change with existing nullable agent fields. Unified transfer touches all current ownership paths and can expose dirty production data. Splitting lets the first fix ship without waiting for the larger ownership workflow.

**Alternatives considered**:

- Ship both at once: rejected because a transfer bug can affect user visibility and ownership across the app.
- Only implement transfer first: rejected because it does not unblock admin-owned credit requests immediately.

## Decision: Classify Current Owner Before Decisions

**Decision**: Create one shared current-owner classifier used by credit requests, admin users, and transfers.

**Rationale**: Current code has separate concepts: `ManagerUser`, `AgentAssignment`, and historical `createdById`. A shared classifier prevents one screen from treating a user as admin-owned while another treats the same user as agent-owned.

**Alternatives considered**:

- Patch each route separately: rejected because it repeats the same ownership edge cases.
- Treat no active agent as admin-owned: rejected because unowned or manager-owned users could be allowed by mistake.

## Decision: Admin-Owned Means Manager/Admin Link To An Admin

**Decision**: A user is admin-owned when the current manager/admin ownership link points to an active admin. A user is manager-owned when that link points to an active manager/distributor.

**Rationale**: Admin and manager ownership are stored through the same relationship shape, so the linked owner's role is the only safe way to distinguish them.

**Alternatives considered**:

- Block all `ManagerUser` links: rejected because it is the current reason admin-owned users cannot request credit.
- Allow all `ManagerUser` links: rejected because manager-owned users would be opened without approval.

## Decision: Legacy Admin Fallback Is Allowed But Marked

**Decision**: If a user has no current manager/admin link and no active agent assignment, but `createdById` points to an active admin, classify as legacy admin-owned with a legacy marker.

**Rationale**: Existing production users may have been created before the current ownership rows were consistent. Blocking all of them can break valid admin-owned users.

**Alternatives considered**:

- Ignore `createdById` entirely: rejected for first release because it may strand legitimate legacy admin-owned users.
- Treat `createdById` as primary ownership: rejected because it is historical and can remain after transfer.

## Decision: Store Owner Type Evidence On New Credit Requests

**Decision**: Add owner type evidence for new credit requests so admin-owned, agent-owned, legacy-admin, and unowned/null cases are distinguishable later.

**Rationale**: Current nullable agent fields alone cannot explain whether a null agent is intentional admin ownership, legacy fallback, or a broken request. Review screens and handoff decisions need this evidence.

**Alternatives considered**:

- Reuse `agentIdSnapshot = null` only: rejected because it cannot support clear audit or safe handoff.
- Backfill old requests: rejected because historical intent is not always provable.

## Decision: Null-Agent WhatsApp Handoff Must Not Query Current Assignments

**Decision**: If the credit request snapshot has no agent and is admin-owned or legacy-admin-owned, handoff uses only the global/default WhatsApp destination.

**Rationale**: A user can be transferred after the credit request is created. Looking up the current active assignment during approval can send the admin to the wrong WhatsApp group.

**Alternatives considered**:

- Continue looking up by current user id: rejected because it can route old admin-owned requests to a later agent.
- Require every admin-owned request to select a group manually: deferred; default WhatsApp destination is already configured.

## Decision: Transfer Is One Transaction With Full Current-Owner Cleanup

**Decision**: The transfer service closes all old active agent assignments and removes all old manager/admin links before creating the selected new current owner.

**Rationale**: The reported bug is a user still appearing under the old owner after transfer. Cleanup in one transaction makes the final state reliable.

**Alternatives considered**:

- Extend the current agent-only transfer path only: rejected because it does not support admin/manager targets and can preserve old links.
- Add separate endpoints for every direction: rejected because it multiplies inconsistent rules.

## Decision: Source Group Is Optional Assignment Metadata

**Decision**: Store `AgentAssignment.sourceGroup` as nullable metadata. Omitted, explicitly cleared, and explicitly supplied values have distinct semantics; WhatsApp URL is resolved independently.

**Rationale**: Source Group is only a label used by UI, filters, reports, and Telegram. It is not an ownership group and must not block transfer, balance visibility, credit handoff, or notification delivery.

**Alternatives considered**:

- Keep a required fake value such as `main-group`: rejected because it creates misleading data and hides truly ungrouped assignments.
- Inherit the old agent's metadata when switching agents: rejected because it can expose a private group or route handoff to the wrong owner.

## Decision: Lock Then Revalidate An Ownership Token

**Decision**: Public ownership mutations require a versioned token over current ownership evidence. The canonical transaction locks the subject and relevant owners, re-reads state, and rejects a stale token with `409` without retry.

**Rationale**: Application-level validation before a transaction cannot prevent two admins, legacy endpoints, or completion-time point capture from racing. A shared user lock serializes cross-table ownership evidence that no single index can cover.

**Alternatives considered**:

- Last write wins: rejected because it can silently overwrite another admin's decision.
- Automatic retry with refreshed ownership: rejected because it would confirm a materially different state without the admin seeing it.
- Rely only on unique indexes: rejected because manager and agent ownership live in different tables.

## Decision: Exact Match Is A No-Op And Same-Agent Metadata Updates In Place

**Decision**: Do not close/recreate an assignment when owner and metadata already match; update the existing row for a same-agent metadata change.

**Rationale**: Recreating rows creates audit noise, changes assignment identity/timestamps, and makes concurrent retries harder to reason about.

**Alternatives considered**:

- Always recreate: rejected because it treats idempotent retry as ownership churn.
- Mutate history for different-agent transfers: rejected because old inactive rows and request snapshots are historical evidence.

## Decision: Historical Null Source Group Remains Null

**Decision**: A credit request with `sourceGroupSnapshot = null` never falls back to a later assignment Source Group. Destination URL fallback remains independent and may use current assignment, agent, then global settings.

**Rationale**: Request snapshots describe the request at creation. Inferring a later group changes historical reporting and may mislabel notifications, while destination fallback is an explicit operational routing rule.

## Decision: Strict Ownership Indexes Are Deferred Until Data Audit

**Decision**: Keep the existing active-agent uniqueness protection. Add unique `ManagerUser.userId` only after an audit checks/repairs production data; retain transaction locking permanently.

**Rationale**: Existing data may already contain duplicate manager links or duplicate active agent assignments. Adding constraints without cleanup can fail deploy.

**Alternatives considered**:

- Add unique constraints immediately: rejected because of production migration risk.
- Never add constraints: rejected as a long-term stance; constraints should be considered after audit and cleanup.
