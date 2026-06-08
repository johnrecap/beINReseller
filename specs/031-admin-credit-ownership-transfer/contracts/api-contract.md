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
- `sourceGroup`: required for agent targets only.
- `whatsappGroupUrl`: optional for agent targets only.
- `reason`: optional admin note.

Response:

- `userId`.
- `newOwner`.
- `closedAgentAssignmentIds`.
- `removedManagerUserIds`.
- `auditLogId`.

Rules:

- The transaction closes/removes old current ownership before creating the new owner.
- The target owner must be active, not deleted, and have the expected role.
- Balances, operations, point ledger entries, historical transactions, and historical credit request decisions are unchanged.

## Existing Compatibility

Existing agent assignment endpoints may remain for older UI paths, but new admin users transfer UI should use the unified ownership endpoint. Compatibility endpoints should delegate to the same transfer service when practical.
