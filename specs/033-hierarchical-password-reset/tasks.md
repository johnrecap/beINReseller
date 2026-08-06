# Tasks: Hierarchical Password Reset

**Input**: Design documents from specs/033-hierarchical-password-reset/

**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/api-contract.md

**Tests**: Focused tests are required because this feature changes credential authorization and session revocation. The website and production database must not be started or used.

## Phase 1: Setup And Failing Security Contracts

- [x] T001 [P] Add hierarchical authorization policy tests in tests/unit/hierarchical-password-reset.test.ts
  - **Reason**: Every actor/target/ownership combination must be fixed before the credential mutation exists.
  - **Expected**: Tests cover admin, manager, agent, user, self/admin targets, inactive/deleted accounts, ownership conflicts, transfers, and audit secrecy.
  - **Possible bugs**: Tests can encode permissive manager-first ownership behavior.
  - **Fix/Mitigation**: Assert mixed or duplicate ownership fails closed with OWNERSHIP_CONFLICT.
  - **Verification**: Run only tests/unit/hierarchical-password-reset.test.ts.

- [x] T002 [P] Replace closed-route expectations with secure route/session contracts in tests/unit/panel-password-self-service.test.ts
  - **Reason**: The existing test deliberately requires admin/manager reset routes to stay closed.
  - **Expected**: Tests require shared-service delegation for admin/manager/agent, no direct route mutation, database-backed self-change auth, stable codes, and no returned password.
  - **Possible bugs**: Source assertions may pass while runtime ownership logic is wrong.
  - **Fix/Mitigation**: Keep authorization behavior in T001 and use T002 only for wiring/privacy regressions.
  - **Verification**: Run only tests/unit/panel-password-self-service.test.ts.

## Phase 2: Foundational Security Service

- [x] T003 Implement pure reset authorization decisions and transactional service in src/lib/users/password-reset.ts
  - **Reason**: One source of truth must own target locking, relationship revalidation, hashing, session timestamp, and audit.
  - **Expected**: Service returns stable success/error codes, accepts only ADMIN/MANAGER/AGENT actors, fails closed on dirty ownership, and commits update plus secret-free audit atomically.
  - **Possible bugs**: Ownership can change between precheck and update; password/hash may enter audit details.
  - **Fix/Mitigation**: Lock target first, re-read all evidence inside the transaction, allowlist audit fields, and use central bcrypt rounds.
  - **Verification**: T001 passes and changed source contains no password/hash response or audit field.

- [x] T004 Enable users.reset_password defaults and reusable permission evaluation in src/lib/permissions/catalog.ts and src/lib/permissions/guards.ts
  - **Reason**: Server and UI must honor the same configurable permission decision.
  - **Expected**: ADMIN, MANAGER, and AGENT are default-allowed while explicit role/user denial still wins; list endpoints can expose one request-level capability.
  - **Possible bugs**: A default can bypass user overrides or enable USER.
  - **Fix/Mitigation**: Reuse evaluatePermission precedence and assert USER remains denied.
  - **Verification**: Permission assertions in T001/T002 pass.

## Phase 3: User Story 1 - Direct Owner Restores Access (Priority: P1)

**Goal**: Authorized direct supervisors can reset eligible accounts without race or secret exposure.

**Independent Test**: Exercise policy fixtures for each allowed and denied ownership shape and inspect all three adapters.

- [x] T005 [US1] Implement shared request handling in src/lib/users/password-reset-route.ts and thin role adapters in src/app/api/admin/users/[id]/reset-password/route.ts, src/app/api/manager/users/[id]/reset-password/route.ts, and src/app/api/agent/users/[id]/reset-password/route.ts
  - **Reason**: Each role needs its existing URL surface while sensitive logic remains centralized.
  - **Expected**: Adapters authenticate exact role, require effective permission, rate-limit actor-target pairs, validate newPassword, delegate once, and map stable codes/statuses.
  - **Possible bugs**: Hierarchical role guard could let admin enter manager adapter or rate limiting could be global per actor.
  - **Fix/Mitigation**: Use exact-role checks and include both actor and target IDs in the existing password-change limiter key.
  - **Verification**: T002 passes and routes contain no prisma password update or direct hash call.

- [x] T006 [US1] Add AGENT reset audit labels and filters in src/lib/activityLogHelpers.ts
  - **Reason**: Agent-initiated resets need the same operational visibility as admin and manager resets.
  - **Expected**: AGENT_RESET_PASSWORD maps to a safe human-readable password-reset entry and existing filters include it.
  - **Possible bugs**: Audit UI may omit the new action or expose raw JSON.
  - **Fix/Mitigation**: Add only the action mapping/filter value; service details remain allowlisted.
  - **Verification**: Focused source assertion in T002 passes.

## Phase 4: User Story 2 - Safe Self-Service And Session Revocation (Priority: P1)

**Goal**: Existing self-change remains available while all old panel sessions are rejected.

**Independent Test**: Source and auth-unit assertions prove self-change uses the database-backed dual guard and updates only the current actor.

- [x] T007 [US2] Harden self-change authentication and shared password settings in src/app/api/user/change-password/route.ts
  - **Reason**: Reading web/mobile tokens directly can bypass passwordChangedAt after another reset.
  - **Expected**: Self-change uses requireAuthAPI, central bcrypt rounds, current-password comparison, and updates only the authenticated account.
  - **Possible bugs**: Mobile requests can stop authenticating or an old token can remain accepted.
  - **Fix/Mitigation**: Use the existing dual guard already supporting both web sessions and mobile bearer tokens.
  - **Verification**: T002 passes; no local raw auth/mobile token helper remains in this route.

- [x] T008 [US2] Audit panel credential-sensitive routes for database-backed session checks in src/app/api/user and src/app/api/mobile/profile/password
  - **Reason**: Session revocation is ineffective if a password-related panel route trusts JWT contents without the current user row.
  - **Expected**: Relevant panel password routes consistently reject credentials issued before passwordChangedAt.
  - **Possible bugs**: Store/customer password flows could be changed accidentally.
  - **Fix/Mitigation**: Limit edits to panel user/profile password surfaces; do not touch store auth.
  - **Verification**: T002 session guard inventory passes.

## Phase 5: User Story 3 - Shared Localized Reset Controls (Priority: P2)

**Goal**: Authorized supervisors see one consistent reset dialog in all relevant user lists.

**Independent Test**: Static UI/localization assertions cover action visibility, dialog states, AR/EN/BN parity, and forgot-password guidance.

- [x] T009 [P] [US3] Add semantic password-reset messages in src/i18n/translations/ar.ts, src/i18n/translations/en.ts, and src/i18n/translations/bn.ts
  - **Reason**: New fields, warnings, success, and error states must not be hardcoded.
  - **Expected**: All three catalogs contain equivalent passwordReset keys including reset action, fields, mismatch/length, session warning, loading, success, stable error codes, and contact-supervisor guidance.
  - **Possible bugs**: Missing key parity can render undefined or English fallback in Arabic/Bengali.
  - **Fix/Mitigation**: Mirror the same semantic key shape and run locale source assertions.
  - **Verification**: T002 localization assertions pass.

- [x] T010 [US3] Create shared dialog in src/components/users/ResetPasswordDialog.tsx
  - **Reason**: Three duplicated sensitive dialogs would drift in validation and privacy behavior.
  - **Expected**: Dialog provides new/confirm fields, show/hide, PasswordStrengthMeter, local validation, loading, warning, success/error mapping, and clears password state on close/success.
  - **Possible bugs**: Password can remain in component state after close or duplicate submissions can occur.
  - **Fix/Mitigation**: Reset state on lifecycle changes and disable controls while submitting.
  - **Verification**: T002 UI source assertions pass.

- [x] T011 [US3] Expose permission capability in src/app/api/admin/users/route.ts, src/app/api/manager/users/route.ts, and src/app/api/agent/dashboard/route.ts, then wire the shared action in src/components/admin/users/UsersTable.tsx, src/components/manager/users/ManagerUsersTable.tsx, and src/components/agent/AgentDashboardClient.tsx
  - **Reason**: The action must be visible only when the actor has effective permission and only beside eligible current targets.
  - **Expected**: src/components/admin/users/UsersTable.tsx, src/components/manager/users/ManagerUsersTable.tsx, and src/components/agent/AgentDashboardClient.tsx use the shared dialog; their existing data responses expose one canResetPasswords capability.
  - **Possible bugs**: Per-row permission calls can cause lag; agent lists can include inactive/deleted/non-user targets.
  - **Fix/Mitigation**: Evaluate capability once per response and keep server reset authorization authoritative.
  - **Verification**: T002 passes and list queries remain bounded.

- [x] T012 [US3] Replace placeholder forgot-password link with localized supervisor guidance in src/components/auth/LoginForm.tsx
  - **Reason**: A dead link is confusing, while a public username reset would be unsafe.
  - **Expected**: Login shows accessible contact-supervisor guidance without a reset form or username lookup.
  - **Possible bugs**: Guidance can look clickable without an action or remain hardcoded.
  - **Fix/Mitigation**: Use localized informational text with appropriate semantics.
  - **Verification**: T002 forgot-password assertion passes.

## Final Phase: Documentation And Safe Verification

- [x] T013 Update password recovery documentation in docs/current-project-prd.md
  - **Reason**: Current documentation says admin/manager reset works even though routes are closed and has no agent rule.
  - **Expected**: Docs match exact hierarchy, session revocation, permission, rate limit, and no-public-reset behavior.
  - **Possible bugs**: Documentation may imply admin can reset another admin.
  - **Fix/Mitigation**: Copy the authorization matrix from the approved API contract.
  - **Verification**: Manual cross-check against contracts/api-contract.md.

- [x] T014 Run focused verification and convergence without starting the site
  - **Reason**: Combined API, auth, UI, locale, and docs changes must be reconciled before handoff.
  - **Expected**: Focused tests, safe type/build validation, git diff --check, secret scan, and changed-file mojibake scan pass; tasks and specs match implementation.
  - **Possible bugs**: A broad command can start services or touch production.
  - **Fix/Mitigation**: Use only local non-server commands and never load production environment/database.
  - **Verification**: Commands listed in quickstart.md complete with no website, Worker, or production access.

## Dependencies And Execution Order

- T001 and T002 precede all behavior changes.
- T003 and T004 block the role adapters and capability wiring.
- T005-T008 complete the P1 security behavior.
- T009 may proceed independently before T010-T012; T010 blocks component wiring in T011.
- T013 and T014 run after all code and UI tasks.

## Parallel Opportunities

- T001 and T002 target separate test concerns.
- T009 targets locale catalogs while backend service work proceeds.
- Admin, manager, and agent component patches are independent after the shared dialog contract is stable, but are integrated in one task to keep ownership clear.

## Implementation Strategy

1. Lock authorization, privacy, session, and route expectations in focused tests.
2. Implement the central transaction and permission decision.
3. Reopen three thin role routes and harden self-change/session checks.
4. Add one localized dialog and connect it to existing list surfaces.
5. Update docs, run only safe focused checks, and reconcile all accepted task IDs.
