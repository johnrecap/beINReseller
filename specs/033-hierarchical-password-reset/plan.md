# Implementation Plan: Hierarchical Password Reset

**Branch**: 033-hierarchical-password-reset | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

## Summary

Add one transactional supervisor-reset service behind role-specific admin, manager, and agent endpoints. The service locks the target, rechecks direct ownership, updates the existing password hash and password-change timestamp, and writes a secret-free audit record atomically. Keep self-change, invalidate old web/mobile sessions through the existing database-backed authentication guard, enable the existing reset permission for the three supervisor roles, and reuse one localized dialog across all user tables.

## Planning Quality Standard

Every implementation task includes Reason, Expected, Possible bugs, Fix/Mitigation, and Verification. No implementation starts until the requirement checklist is complete and analysis has no unresolved critical, high, or medium issue.

## Technical Context

**Language/Version**: TypeScript 5.9, Next.js 16.1, Node.js runtime
**Primary Dependencies**: Existing Next.js route handlers, Prisma 7.2 transactions, PostgreSQL row locks, bcryptjs, Zod, existing permission evaluator and rate limiter
**Storage**: Existing User, ManagerUser, AgentAssignment, and ActivityLog records; no schema or migration change
**Testing**: Focused Node/tsx unit tests, TypeScript/build checks where safe, diff and encoding checks; no site startup and no production database access
**Target Platform**: Existing panel web application and mobile bearer-token consumers of panel routes
**Project Type**: Full-stack Next.js panel
**Performance Goals**: One bounded target/ownership lookup and one password update transaction per accepted reset; no list-page per-row permission query
**Constraints**: Never log or return the new password/hash. Do not change Worker code, financial data, ownership data, or production state. Preserve AR/EN/BN and RTL.
**Scale/Scope**: Three role adapters, one service, existing permission catalog/evaluator, three existing user-list surfaces, login guidance, audit display mapping, focused tests and docs

## Constitution Check

- **Evidence-Driven Security**: PASS. Authorization uses authenticated actor, effective permission, locked target, and current direct ownership.
- **Traceable Planning**: PASS. Requirements, contracts, and tasks use stable IDs and exact file paths.
- **Test-First For Risky Behavior**: PASS REQUIRED. Pure policy and route-contract tests precede service and adapters.
- **Minimal, Encoding-Safe Edits**: PASS. One shared service/dialog and narrow route/table changes avoid duplicated behavior.
- **Security And Privacy Boundaries**: PASS. Passwords and hashes are excluded from responses, logs, audit details, and UI persistence.

No constitution exception is required.

## Project Structure

### Documentation

specs/033-hierarchical-password-reset/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/api-contract.md
|-- checklists/requirements.md
|-- tasks.md

### Source Code

src/
|-- app/api/admin/users/[id]/reset-password/route.ts
|-- app/api/manager/users/[id]/reset-password/route.ts
|-- app/api/agent/users/[id]/reset-password/route.ts
|-- app/api/user/change-password/route.ts
|-- components/users/ResetPasswordDialog.tsx
|-- components/admin/users/UsersTable.tsx
|-- components/manager/users/ManagerUsersTable.tsx
|-- components/agent/AgentDashboardClient.tsx
|-- components/auth/LoginForm.tsx
|-- i18n/translations/{ar,en,bn}.ts
|-- lib/users/password-reset.ts
|-- lib/users/password-reset-route.ts
|-- lib/permissions/catalog.ts
|-- lib/activityLogHelpers.ts
|-- lib/auth-utils.ts

tests/unit/
|-- panel-password-self-service.test.ts
|-- hierarchical-password-reset.test.ts

## Source Of Truth And Data Rules

- Authenticated actor: database-backed web/mobile authentication guard.
- Permission: existing users.reset_password catalog key evaluated with default role, configured role setting, user override, and any applicable global block.
- Target account: locked current User row.
- Manager ownership: all current ManagerUser links for the target; exactly one link must point to the actor and there must be no active agent assignment.
- Agent ownership: all active AgentAssignment rows for the target; exactly one assignment must point to the actor and there must be no manager link.
- Session revocation: existing passwordChangedAt timestamp compared with session/token issue time.
- Audit: one ActivityLog row committed in the same transaction as the password update.

## Authorization And Concurrency Rules

1. Authenticate through the database-backed dual web/mobile guard.
2. Require exact actor role for each adapter and effective users.reset_password permission.
3. Apply three-attempts-per-hour rate limit keyed by actor and target.
4. Parse newPassword with a minimum of six characters.
5. Start a transaction and lock the target User row.
6. Re-read actor, target, all manager links, and all active agent assignments.
7. Reject inactive/deleted actors and targets, invalid target roles, indirect ownership, conflicts, and transferred ownership.
8. Hash with the central bcrypt-round configuration.
9. Update passwordHash and passwordChangedAt and create the audit row atomically.
10. Return only a stable success code.

## UI And Localization Rules

- One shared dialog accepts role adapter URL, target identity, and localized copy.
- Dialog includes new password, confirmation, show/hide, existing strength meter, mismatch/length validation, loading state, session-closure warning, and success/error handling.
- Admin, manager, and agent tables render the action only when the list response reports effective reset permission.
- All user-facing copy is provided in Arabic, English, and Bengali through semantic passwordReset keys.
- Forgot-password guidance is informational only and creates no public reset request surface.

## Failure Contract

- INVALID_PASSWORD: malformed or too-short new password, HTTP 400.
- PERMISSION_DENIED: authentication role or effective permission rejected, HTTP 403.
- PASSWORD_RESET_NOT_ALLOWED: valid actor cannot reset this target class or itself, HTTP 403.
- TARGET_USER_NOT_FOUND: target does not exist, is deleted, or is inactive, HTTP 404.
- OWNERSHIP_CONFLICT: ownership is missing, conflicting, or changed, HTTP 409.
- RATE_LIMITED: actor-target limit exceeded, HTTP 429.
- Unexpected failures return a generic server code and never include raw exception or credential data.

## Verification Strategy

- Pure authorization-policy tests for every role/target/ownership/status combination.
- Static route-contract tests proving role adapters delegate to the shared service and never mutate passwords directly.
- Session tests proving self-change uses the database-backed dual guard.
- UI source tests for the shared dialog, permission-based action visibility, translations, and no public username reset.
- Focused TypeScript/tests and diff/encoding scans only; do not start the site or connect to production.

## Phase 0 Research

See [research.md](./research.md). All material decisions were resolved from the existing system and the approved user plan; no clarification marker remains.

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/api-contract.md](./contracts/api-contract.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- Ownership and account state are revalidated inside the locked transaction: PASS.
- Secret-free response and audit contracts are explicit: PASS.
- Existing schema is reused without unsafe migration: PASS.
- UI, API, session, permission, audit, docs, and tests are covered: PASS.
- Production and Worker exclusions are explicit: PASS.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| None | No constitution violation is needed | Existing permission, ownership, session, and audit systems support the feature |
