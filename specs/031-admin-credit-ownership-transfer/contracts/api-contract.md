# API Contract: Admin Credit Requests And Unified Ownership Transfer

## GET /api/credit-requests

Purpose: Return the signed-in user's credit request eligibility and recent requests.

Authorization: Signed-in normal user.

Response owner fields:

- `eligibility.allowed`: boolean.
- `eligibility.reason`: `AGENT_OWNED`, `ADMIN_OWNED`, `LEGACY_ADMIN_OWNED`, `MANAGER_OWNED`, `UNOWNED`, `INACTIVE`, or validation error reason.
- `eligibility.ownerLabel`: safe label for user display.
- Recent requests include owner label and notification state, but no secret tokens.

Rules:

- Admin-owned and agent-owned users can be eligible.
- Manager-owned and unowned users are not eligible in this release.

## POST /api/credit-requests

Purpose: Create a new credit request for the signed-in user.

Authorization: Signed-in normal user.

Request body:

- `amountUsd`: positive amount.
- `paymentMethod`: optional payment method text.
- `notes`: optional notes.

Response:

- Created request id.
- Status.
- Owner snapshot label/type.
- Notification state.

Rules:

- Agent-owned requests include agent snapshots.
- Admin-owned requests include admin owner evidence and no fake agent fields.
- Manager-owned and unowned users return a clear blocked response.

## GET /api/admin/users

Purpose: Return admin-visible users with current ownership display.

Authorization: Admin only.

Response additions:

- `currentOwner.type`: `ADMIN`, `MANAGER`, `AGENT`, `LEGACY_ADMIN`, or `UNOWNED`.
- `currentOwner.label`: safe owner label.
- `currentOwner.conflictCount`: count of duplicate/cross-owner evidence when detected.
- `currentOwner.ownershipToken`: versioned optimistic concurrency token.
- Agent ownership includes active assignment id, nullable Source Group, and safe WhatsApp configured state needed for intentional preserve/clear behavior.

Rules:

- Display must reflect current owner after transfer, not historical creator only.

## GET /api/admin/user-ownership/targets

Purpose: Return valid transfer targets grouped by owner type.

Authorization: Admin only.

Response:

- `admins`: active admins.
- `managers`: active managers/distributors.
- `agents`: active agents with display labels and default group metadata where available.

Rules:

- Deleted or inactive users are omitted.
- No sensitive runtime credentials are returned.

## POST /api/admin/user-ownership

Purpose: Transfer one normal user to a selected current owner.

Authorization: Admin only.

Request body:

- `userId`: required.
- `targetOwnerType`: `ADMIN`, `MANAGER`, or `AGENT`.
- `targetOwnerId`: required.
- `expectedOwnershipToken`: required for public transfer requests.
- `sourceGroup`: optional/nullable for agent targets; property presence is significant.
- `whatsappGroupUrl`: optional/nullable for agent targets; property presence is significant and independent from Source Group.
- `reason`: optional admin note.

Response:

- `userId`.
- `newOwner`.
- `closedAgentAssignmentIds`.
- `removedManagerUserIds`.
- `auditLogId`: `string | null`; null only for `NO_OP`.
- `ownershipToken` for the committed state.
- `mode`: `CREATED`, `REPLACED`, `UPDATED`, or `NO_OP`.
- Nullable agent assignment metadata and Source Group resolution mode when target is agent.

Rules:

- Missing `expectedOwnershipToken` returns HTTP `428` with `OWNERSHIP_PRECONDITION_REQUIRED`.
- After row locking, an exact desired durable state returns `NO_OP` (and `auditLogId: null`) even if the supplied token became stale because an identical request committed first. Otherwise a stale token returns HTTP `409` with `OWNERSHIP_CHANGED`, the safe current ownership summary/token, and no partial mutation.
- The transaction locks the subject and relevant owners, re-reads state, then closes/removes only conflicting current ownership before creating the new owner.
- Exact desired state is a no-op; same-agent metadata edits update the active row in place.
- The target owner must be active, not deleted, and have the expected role.
- The subject must be active, not deleted, and have role exactly `USER`.
- Source Group resolution: omitted preserves for same agent or uses new-agent default/null; `null`/blank clears; non-empty sets trimmed text up to 120 characters.
- WhatsApp URL follows the same presence rules independently; a different-agent transfer never inherits old assignment metadata.
- Balances, operations, point ledger entries, historical transactions, and historical credit request decisions are unchanged.

Error codes:

- `OWNERSHIP_PRECONDITION_REQUIRED` (`428`)
- `OWNERSHIP_CHANGED` (`409`)
- `INVALID_SUBJECT_USER`, `INVALID_TARGET_OWNER`, or target-role-specific validation (`400`/`404`)
- `OWNERSHIP_CONFLICT` (`409`) for residual database uniqueness races

## GET /api/admin/credit-requests Source Group Filter

- Real values continue to use `sourceGroup=<value>`.
- `sourceGroupMode=NONE` selects `sourceGroupSnapshot IS NULL` and does not collide with a real group name.
- Filter metadata returns real non-null Source Groups separately and a `hasNoSourceGroup` flag/count.
- Rows with null snapshots render the localized no-group label; the API does not manufacture a string snapshot.

## Existing Compatibility

Existing agent assignment endpoints remain for older UI paths but MUST delegate POST and DELETE to the same canonical ownership service. The adapter preserves legacy response/error names and `replaceExisting=false` behavior; DELETE preserves its documented unowned/legacy outcome while gaining locks, token validation, idempotency, and safe audit. Creating a new user under an agent uses an internal trusted unowned-user path and does not weaken the public token requirement.

Legacy `GET /api/admin/agent-assignments` MUST return the current `ownershipToken` for every assignable user/assignment row so its POST and DELETE UI can supply the required precondition without a second ownership source.
