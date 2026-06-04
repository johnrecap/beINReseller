# Implementation Plan: Login Attempt Guidance

**Branch**: `031-login-attempt-guidance` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-login-attempt-guidance/spec.md`

## Summary

Replace confusing panel login failures with clear guidance: show remaining attempts after the first and second failed attempts, evaluate the third attempt normally, then start a two-minute cooldown only after the third failed result. Preserve exact case-sensitive account identity: `Mobarak2030` and `mobarak2030` remain different accounts.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript on Next.js 16 / React 19 / Node.js runtime

**Primary Dependencies**: NextAuth v5 credentials provider, Prisma 7, bcryptjs, ioredis, existing translation files

**Storage**: Existing PostgreSQL `users` table remains source of truth for account identity; Redis stores short-lived login attempt windows

**Testing**: Node test runner with `tsx` import for unit tests; `npm run build` for production build validation

**Target Platform**: Web panel login in the production Next.js app

**Project Type**: Web application with server-side authentication and client login form

**Performance Goals**: Login attempt checks should add no user-noticeable delay and use short-lived Redis state only

**Constraints**:
- Do not normalize username casing.
- Do not fuzzy-match punctuation, missing hyphens, symbols, or changed digits.
- Do not log passwords, password hashes, cookies, tokens, sessions, or beIN secrets.
- Do not make production database cleanup part of this feature.
- Do not use `npx prisma db push` for production deployment.

**Scale/Scope**: Panel web login only. Mobile login is documented as out of current implementation scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: Pass. This feature does not touch customer balance, beIN dealer balance, refunds, operations, or account assignment.
- **Traceable Planning**: Pass. `tasks.md` includes file paths, reason, expected result, possible bugs, mitigation, and verification for every task.
- **Test-First For Risky Behavior**: Pass. Authentication behavior and security messaging are risky; tasks require tests before behavior changes.
- **Minimal, Encoding-Safe Edits**: Pass. Plan uses focused new helper files and small edits to auth and login form; no full-file rewrites.
- **Security And Privacy Boundaries**: Pass. Plan forbids logging passwords/hashes/tokens and keeps public messages generic.

## Project Structure

### Documentation (this feature)

```text
specs/031-login-attempt-guidance/
- spec.md
- plan.md
- research.md
- data-model.md
- quickstart.md
- contracts/
  - login-attempt-response.md
- checklists/
  - requirements.md
- tasks.md
```

### Source Code (repository root)

```text
src/
- lib/
  - auth.ts
  - auth/
    - login-attempts.ts
    - login-diagnostics.ts
  - rate-limiter.ts
- components/
  - auth/
    - LoginForm.tsx
- i18n/
  - translations/
    - ar.ts
    - en.ts
    - bn.ts

tests/
- unit/
  - login-attempt-guidance.test.ts
  - login-diagnostics-redaction.test.ts
  - login-form-feedback.test.ts
```

**Structure Decision**: Keep authentication-specific attempt tracking in `src/lib/auth/` so `src/lib/auth.ts` remains focused on NextAuth integration. Keep visible countdown behavior in `LoginForm.tsx`. Keep translation changes in existing locale files.

## Phase 0: Research Decisions

See [research.md](./research.md).

Key outcomes:
- Usernames and emails remain exact case-sensitive account identifiers.
- Wrong-case login names must not match the saved account.
- Normal mistakes use a short two-minute cooldown after three failed results.
- Broader abuse protection remains separate from normal mistake guidance.
- Passwords are never changed, trimmed, or logged by this feature.

## Phase 1: Design

### Data Model

See [data-model.md](./data-model.md).

No database migration is required. Redis holds short-lived login attempt windows. The existing `users` table remains source of truth.

### Contract

See [contracts/login-attempt-response.md](./contracts/login-attempt-response.md).

The UI must be able to show:
- invalid-login message with remaining attempts
- active cooldown message with countdown
- generic fallback for unexpected failures

### Quickstart

See [quickstart.md](./quickstart.md).

## Source Of Truth

- Exact saved `users.username` and `users.email` values are the only account identity source of truth.
- Case is meaningful and must be preserved.
- Redis attempt windows are temporary guidance state only; they must never become account lock state.

## Legacy And Backfill Behavior

- No automatic cleanup of existing account names.
- Existing accounts with uppercase letters remain valid only when users type the exact saved case.
- Existing accounts with hyphens or symbols remain exact-match only.
- Existing `ratelimit:panel-login:*` keys may expire naturally; implementation should move normal mistake tracking to new keys so old long-window keys stop controlling web login guidance.

## Security Boundaries

- Public messages do not reveal whether the account exists, is disabled, or whether only the password was wrong.
- Private diagnostics use categories and safe context only.
- No password, password hash, cookie, token, session, beIN credential, or provider secret may be logged or returned.
- Repeated clicks during cooldown must not extend the wait.
- A third attempt with correct credentials must succeed.

## Verification Limitations

- Local unit tests can verify attempt-window behavior and redaction.
- Full production parity depends on Redis and request address/header behavior in the deployment environment.
- Browser countdown accuracy should be manually checked after implementation because it depends on client timers and server cooldown values.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: Pass; no financial state touched.
- **Traceable Planning**: Pass; tasks map to user stories and files.
- **Test-First For Risky Behavior**: Pass; tests are first-class tasks.
- **Minimal, Encoding-Safe Edits**: Pass; small targeted files and mojibake check required.
- **Security And Privacy Boundaries**: Pass; diagnostics contract forbids secrets.
