# Data Model: Hierarchical Password Reset

No database schema change is required.

## Existing User

Relevant fields:

- id: target and actor identity
- role: ADMIN, MANAGER, AGENT, or USER
- isActive and deletedAt: actor/target eligibility
- passwordHash: replaced only after authorization succeeds
- passwordChangedAt: set to the reset time to revoke older sessions

Validation:

- Actor must be active and not deleted.
- Target must be active and not deleted.
- Manager/agent targets must have role USER.
- Admin targets may have role MANAGER, AGENT, or USER but never ADMIN.

## Existing ManagerUser

Relevant fields:

- managerId: direct manager owner
- userId: target normal user

Validation:

- Manager reset requires exactly one current link for the target and it must point to the actor.
- Any active agent assignment at the same time makes ownership conflicting.

## Existing AgentAssignment

Relevant fields:

- agentId: direct agent owner
- userId: target normal user
- isActive: current assignment indicator

Validation:

- Agent reset requires exactly one active assignment for the target and it must point to the actor.
- Any manager link at the same time makes ownership conflicting.

## Existing ActivityLog

Relevant fields:

- userId: actor
- action: ADMIN_RESET_PASSWORD, MANAGER_RESET_PASSWORD, or AGENT_RESET_PASSWORD
- targetId and targetType: reset target
- details: actorRole, targetRole, ownershipKind only
- ipAddress and userAgent: request context

Privacy rule:

- details must not include password, passwordHash, authorization token, cookie, or full request body.

## State Transition

AUTHORIZED ACTIVE TARGET
-> lock target and current ownership
-> revalidate actor, target, role, and direct relationship
-> update passwordHash and passwordChangedAt
-> create audit record
-> commit

Any failure before commit leaves both password and audit unchanged.
