# Implementation Plan: Admin Permission Controls

**Branch**: `017-admin-permission-controls` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-admin-permission-controls/spec.md`

## Summary

Add a dynamic permission layer above the current static roles. The first deliverable is a global "panel user creation freeze" that blocks new user creation for all admins and managers. The full feature adds role-level and account-level permission controls, server-side enforcement for sensitive mutations, UI gating, and audit logs. Existing behavior remains unchanged until a permission setting, override, or global block is configured.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js runtime used by Next.js and `tsx`

**Primary Dependencies**: Next.js 16.1, React 19.2, Prisma 7.2, PostgreSQL, zod, next-auth beta, lucide-react

**Storage**: PostgreSQL through Prisma schema and migrations

**Testing**: `node:test` through `npx tsx --test`, `npx tsc --noEmit`, schema sync script, focused API/service tests

**Target Platform**: Existing BeIN reseller panel web app and API

**Project Type**: Full-stack Next.js application with Prisma-backed APIs and admin client views

**Performance Goals**: Permission checks must not create N+1 database reads on list pages. Mutating APIs should evaluate permissions in one small shared helper call before writes.

**Constraints**: Use encoding-safe edits only; no full-file rewrites; preserve production behavior until configured; protect live database; no secrets exposed in audit logs.

**Scale/Scope**: Admin permission management page, shared permission service, Prisma migration, protected API routes, admin/manager UI gating, focused tests, and deployment notes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Balance add/withdraw and credit approval permissions affect money paths, so the plan requires server-side checks and audit events.
- **Traceable Planning**: PASS. Tasks must map permissions to files, tests, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. Permission enforcement can block money and user creation, so tests must precede implementation.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are shared-service based and targeted to existing routes.
- **Security And Privacy Boundaries**: PASS. Audit logs must avoid secrets and stack traces.

No constitution violations are required.

## Project Structure

### Documentation

```text
specs/017-admin-permission-controls/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- admin-permission-settings.md
|   |-- admin-permission-evaluation.md
|   `-- admin-user-creation-freeze.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code

```text
src/
|-- app/api/admin/permissions/
|-- app/api/admin/users/
|-- app/api/manager/users/
|-- components/admin/permissions/
|-- components/admin/users/
|-- components/manager/
|-- lib/permissions/
|-- lib/auth-utils.ts
`-- lib/permissions.ts

tests/
|-- unit/
`-- integration/

prisma/
|-- schema.prisma
`-- migrations/
```

**Structure Decision**: Keep current role constants, but introduce `src/lib/permissions/evaluator.ts` and `src/lib/permissions/catalog.ts` as the shared runtime source. Existing routes call the evaluator before protected writes. UI components consume an admin-visible effective-permission state but never rely on UI-only checks for security.

## Source Of Truth And Permission Rules

- **Static defaults**: Existing `src/lib/permissions.ts` remains fallback behavior.
- **Dynamic role settings**: New role permission rows override static defaults for a role.
- **User overrides**: New account-specific rows override role settings.
- **Global blocks**: Global hard blocks, especially panel user creation freeze, override both role settings and user allows.
- **Account status**: Inactive or deleted users are blocked before permission evaluation.
- **Protected admin rule**: At least one protected active admin must keep permission-management access.

## Permission Evaluation Order

1. Reject if account is missing, inactive, deleted, or session is invalid.
2. Reject if a matching global hard block is enabled.
3. Apply user-specific override if present.
4. Apply role-level setting if present.
5. Fall back to current static role permissions.

## API Authorization Rules

- Permission settings APIs require permission-management access.
- Admin user creation requires `users.create` and must also pass global creation freeze.
- Manager user creation requires `manager.users.create` or `users.create.managed` and must also pass global creation freeze.
- Manager balance deposit requires `balance.add`.
- Manager balance withdrawal requires `balance.withdraw`.
- Password reset requires `users.reset_password`.
- User delete/deactivate requires separate delete/deactivate permissions.
- Existing admin-only high-risk routes keep admin role checks plus a permission check where mutation occurs.

## Migration Impact

Required migration adds structured permission tables or equivalent:

- `role_permission_settings`
- `user_permission_overrides`
- `global_permission_settings`
- `protected_admins`
- `permission_audit_events`

Recommended indexes:

- Unique `(role, permission_key)` on role settings.
- Unique `(user_id, permission_key)` on user overrides.
- Unique `(key)` on global settings.
- Index `(actor_user_id, created_at)` on audit events.
- Index `(target_type, target_id, created_at)` on audit events.

No destructive migration is allowed. Existing users, transactions, operations, and roles are not rewritten.

## UI States

- Admin permissions page: loading, empty defaults, save success, validation error, unsafe lockout rejection, audit-log loading.
- Role permissions table: category filter, permission search, default/allow/deny status.
- User overrides: account search, current effective permissions, add override, remove override.
- Global controls: panel user creation freeze toggle with required confirmation and optional reason.
- Admin and manager create-user buttons: hidden/disabled when blocked, with clear message.

## Verification Limitations

- Existing full lint can be noisy; use focused ESLint plus TypeScript and targeted tests.
- Browser verification needs an authenticated admin and manager account.
- Production deploy must run Prisma migration deploy before build.

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design And Contracts

See [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), and [contracts/](./contracts/).

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Money-related actions require permission checks and audit logs.
- **Traceable Planning**: PASS. Tasks identify exact route/component/service targets.
- **Test-First For Risky Behavior**: PASS. Tests are required before enforcement changes.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses shared helper and targeted route additions.
- **Security And Privacy Boundaries**: PASS. Permission API must not expose secrets or stack traces.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
