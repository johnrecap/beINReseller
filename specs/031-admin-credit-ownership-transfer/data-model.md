# Data Model: Admin Credit Requests And Unified Ownership Transfer

## CurrentOwnerClassification

Represents the resolved current owner for one normal user.

Fields:

- `userId`: normal user being classified.
- `ownerType`: `ADMIN`, `MANAGER`, `AGENT`, `LEGACY_ADMIN`, or `UNOWNED`.
- `ownerId`: current owner user id when there is one.
- `ownerLabel`: display-safe owner name for admin UI and notifications.
- `agentAssignmentId`: active agent assignment id when `ownerType` is `AGENT`.
- `managerUserIds`: current manager/admin ownership link ids used in classification.
- `isLegacyFallback`: true only when `createdById` was used because no current owner rows exist.
- `conflicts`: detected duplicate or cross-owner evidence, used for audit and transfer cleanup.

Validation rules:

- Deleted or inactive owners do not count as valid current owners.
- Deleted or inactive normal users cannot be transferred as active users.
- `LEGACY_ADMIN` can only be returned when no valid manager/admin link and no active agent assignment exist.

## CreditRequest Owner Evidence

Extends new credit request rows with owner evidence captured at request creation.

Fields:

- `ownerTypeSnapshot`: owner type captured at creation.
- `ownerIdSnapshot`: owner id captured at creation when applicable.
- `ownerLabelSnapshot`: display-safe owner label captured at creation.
- Existing `agentIdSnapshot`: remains populated only for agent-owned requests.
- Existing `agentNameSnapshot`: remains populated only for agent-owned requests.
- Existing `sourceGroupSnapshot`: remains populated only for agent-owned requests.
- Existing `whatsappGroupUrlSnapshot`: remains populated only when an agent-owned request has an agent group URL.

Validation rules:

- Agent-owned requests must keep the existing agent snapshots.
- Admin-owned and legacy-admin requests must not invent fake agent snapshots.
- Historical requests with null owner evidence are treated as legacy display cases, not rewritten.

## OwnershipTransferRequest

Represents an admin request to move a user to a new owner.

Fields:

- `userId`: normal user to transfer.
- `targetOwnerType`: `ADMIN`, `MANAGER`, or `AGENT`.
- `targetOwnerId`: selected owner id.
- `expectedOwnershipToken`: required optimistic precondition for public mutations.
- `sourceGroup`: agent-only `string | null | undefined`; omitted, explicitly cleared, and explicitly set are distinct.
- `whatsappGroupUrl`: independent agent-only `string | null | undefined` with the same presence semantics.
- `reason`: optional admin note for audit.

Validation rules:

- Actor must be admin.
- Target owner must be active, not deleted, and have the expected role.
- User must be active, not deleted, and have role exactly `USER`.
- Agent-only fields are ignored or rejected for admin/manager targets.
- `sourceGroup` is trimmed, limited to 120 characters, and may resolve to `null`.
- Missing public precondition returns `428`; a stale precondition after locking returns `409` without mutation.

Resolution rules for agent targets:

- Omitted Source Group: preserve for the same agent; for a different/new agent use the target agent default or `null`.
- `null`, blank, or whitespace Source Group: store `null`.
- Non-empty Source Group: store the trimmed value.
- Omitted WhatsApp URL: preserve for the same agent; for a different/new agent store `null`.
- `null`, blank, or whitespace WhatsApp URL: store `null`; non-empty URL sets the validated value.

## OwnershipTransferResult

Represents the final transfer outcome returned to the admin UI.

Fields:

- `userId`: transferred user.
- `previousOwners`: owner classification and duplicate evidence before cleanup.
- `closedAgentAssignmentIds`: active agent assignments closed by transfer.
- `removedManagerUserIds`: manager/admin ownership links removed by transfer.
- `newOwner`: owner type, id, and label after transfer.
- `auditLogId`: audit evidence id or `null` for `NO_OP`.
- `ownershipToken`: token for the committed state.
- `mode`: `CREATED`, `REPLACED`, `UPDATED`, or `NO_OP`.
- `sourceGroupResolution`: `EXPLICIT`, `CLEARED`, `PRESERVED`, `AGENT_DEFAULT`, or `NONE` for agent outcomes.

Validation rules:

- Exactly one current owner should be visible after a mutating transfer; compatibility deletion may intentionally leave the user unowned/legacy.
- An exact desired-state request is a no-op and creates no audit entry.
- A same-agent metadata mutation updates the existing active assignment in place.
- The result must not include sensitive credentials or provider runtime data.

## AuditEntry

Records ownership transfer evidence.

Fields:

- `actorAdminId`: admin who performed the transfer.
- `targetUserId`: user moved.
- `previousOwnerEvidence`: safe serialized previous classification and cleanup ids.
- `newOwnerEvidence`: safe serialized new owner type/id/label.
- `reason`: optional admin note.
- `sourceGroupResolution`: safe resolution mode without requiring the raw value.
- `whatsappUrlState`: configured/cleared/unchanged plus optional non-reversible digest; never the full invite URL.
- `createdAt`: timestamp.

Validation rules:

- Audit data must be safe for admin review.
- Audit data must not include Telegram tokens, beIN passwords, cookies, TOTP secrets, sessions, storage state, ViewState, or provider tokens.

## NotificationDestination

Represents the destination used for a credit request notification or handoff.

Fields:

- `telegramTargetId`: configured Telegram chat id.
- `telegramTargetLabel`: safe display label.
- `whatsappMode`: `AGENT_GROUP`, `DEFAULT_GROUP`, `DEFAULT_PHONE`, or `MISSING`.
- `whatsappDestination`: URL or phone-derived URL where safe.

Validation rules:

- Admin-owned and legacy-admin requests can only use default WhatsApp destinations.
- Agent-owned requests can use the captured agent group URL first, then safe fallback behavior already supported by the app.

## AgentAssignment Source Group

Fields:

- `sourceGroup`: nullable display/reporting classification.
- `whatsappGroupUrl`: nullable destination override, independent from Source Group.

Validation rules:

- Null Source Group does not affect ownership, balance, debt, limits, operations, transactions, points, or WhatsApp destination fallback.
- Historical `CreditRequest.sourceGroupSnapshot` remains authoritative even when null and must not inherit later assignment metadata.
- Tables render a localized no-group label; report APIs expose a dedicated null filter rather than overloading a real string value.

## Ownership Concurrency And Locks

- The ownership token is a versioned digest over a canonical sorted representation of current manager/admin links and active assignment identity/agent/update metadata.
- `shared/db/ownership-evidence-lock.ts` provides the generic transaction helper shared with Spec 032. Transfer locks the subject `users` row first, re-reads relation evidence, then locks current/target owner user ids in lexical order with `SELECT ... FOR UPDATE` before token validation/mutation.
- Ownership transfer and operation-completion point snapshotting use the same subject-user lock to serialize ownership evidence at completion.
- Database uniqueness remains defense in depth; it does not replace the cross-table lock.
