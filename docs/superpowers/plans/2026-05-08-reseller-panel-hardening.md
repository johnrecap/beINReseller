# Reseller Panel Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the active reseller panel against privilege escalation, beIN session leakage, balance races, queue loss, worker account collisions, sensitive logging, weak TLS, duplicate refunds, and cancellation races.

**Architecture:** Fix the highest-risk trust boundaries first: auth claims, user-visible operation data, financial transactions, and worker account leases. Treat `worker/src/http-queue-processor.ts` and `worker/src/http/HttpClientService.ts` as sensitive files that require tiny diffs and explicit verification.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, BullMQ, Redis, NextAuth, worker TypeScript process.

---

## Preflight Rules

- Do not touch Mobile or Store routes unless a task explicitly says a shared helper must remain compatible.
- Do not rewrite large files.
- Do not run PowerShell `Set-Content`, `Out-File`, or `[System.IO.File]::WriteAllText`.
- Use `apply_patch` or normal editor edits that preserve encoding.
- After every code edit, scan for mojibake patterns introduced by the edit.
- Run `npm run lint` after logical chunks.
- Run `npm run build` before final handoff.
- For worker changes, also run `cmd /c npm --prefix worker run build`.

## Sensitive File Protocol

For `worker/src/http-queue-processor.ts` and `worker/src/http/HttpClientService.ts`:

- Change one behavior per commit.
- Keep each patch under roughly 80 changed lines if possible.
- Do not auto-format the file.
- Do not rename unrelated variables.
- Do not change beIN selectors or parsing while fixing locks/logging unless required.
- Before commit, inspect the exact diff for these files with `git diff -- worker/src/http-queue-processor.ts worker/src/http/HttpClientService.ts`.

## Files Map

- `src/lib/auth.config.ts`: remove unsafe JWT update merge.
- `src/lib/auth-utils.ts`: DB-backed API auth for current user state.
- `src/lib/mobile-auth.ts`: keep token parsing only; do not authorize from token role alone.
- `src/app/api/operations/[id]/route.ts`: strip beIN session material from responses.
- `worker/src/http-queue-processor.ts`: stop storing session snapshots in operation response, add guarded status updates, add account lease usage.
- `worker/src/http/HttpClientService.ts`: remove sensitive logging only.
- `worker/src/pool/account-pool-manager.ts`: acquire Redis lock when selecting account.
- `worker/src/pool/account-locking.ts`: owner-token lock helpers.
- `worker/src/pool/account-queue-manager.ts`: return locked accounts only.
- `src/app/api/operations/create/route.ts`: atomic balance and active-card guard.
- `src/app/api/operations/bulk/route.ts`: atomic bulk balance and active-card guard.
- `src/app/api/admin/users/[id]/balance/route.ts`: guarded admin balance mutation.
- `src/app/api/manager/users/[id]/balance/route.ts`: guarded manager transfer.
- `src/lib/queue.ts`: introduce durable dispatch/outbox or clear compensation strategy.
- `src/lib/refund.ts`: idempotent refund behavior.
- `prisma/schema.prisma`: constraints/indexes for non-negative balances, active card guard, refund idempotency, encrypted secret columns if needed.
- `.gitignore`: ignore worker logs.

## Chunk 1: Auth Claim Hardening

### Task 1.1: Remove client-controlled JWT updates

**Files:**
- Modify: `src/lib/auth.config.ts`

- [ ] Inspect current JWT callback behavior.
- [ ] Remove `return { ...token, ...session }`.
- [ ] If session update is still needed, whitelist harmless UI-only fields only.
- [ ] Ensure role, id, balance, and passwordChangedAt are never accepted from client session update payloads.
- [ ] Run `npm run lint`.
- [ ] Manually test: login as USER, try admin API, expect 403.
- [ ] Commit: `fix(auth): prevent client session claim overwrite`

### Task 1.2: Make API authorization DB-backed

**Files:**
- Modify: `src/lib/auth-utils.ts`
- Modify: `src/lib/mobile-auth.ts` only if helper shape needs adjustment.

- [ ] Add a helper that loads the current `User` by token/session id.
- [ ] Verify `isActive === true`.
- [ ] Verify current DB role is used for authorization.
- [ ] Verify token/session is invalid if `passwordChangedAt` is newer than token issue time.
- [ ] Update `requireRoleAPIWithMobile` and permission helpers to use the DB-backed user.
- [ ] Run `npm run lint`.
- [ ] Manually test disabled user token, demoted manager token, and normal admin session.
- [ ] Commit: `fix(auth): authorize api requests from current user state`

## Chunk 2: beIN Session Exposure Removal

### Task 2.1: Strip session material from operation API responses

**Files:**
- Modify: `src/app/api/operations/[id]/route.ts`

- [ ] Identify every field returned to operation owners.
- [ ] Add a sanitizer for `responseData`.
- [ ] Remove keys such as `sessionData`, `cookies`, `storageState`, `viewState`, `__VIEWSTATE`, and similar nested session fields.
- [ ] Keep safe user-facing fields such as package data, status messages, and audit summaries.
- [ ] Run `npm run lint`.
- [ ] Manually call the operation API for an operation with responseData and confirm no session material appears.
- [ ] Commit: `fix(operations): redact bein session data from responses`

### Task 2.2: Stop storing beIN session snapshots in operation responseData

**Files:**
- Modify: `worker/src/http-queue-processor.ts`

- [ ] Locate writes that place `sessionData` into `operation.responseData`.
- [ ] Replace storage with server-only Redis keys keyed by operation id.
- [ ] Keep only non-sensitive metadata in `responseData`.
- [ ] Ensure confirm/promo flows read the server-only session key instead of user-visible operation data.
- [ ] Run `cmd /c npm --prefix worker run build`.
- [ ] Inspect diff carefully for the sensitive file.
- [ ] Commit: `fix(worker): keep bein session snapshots server-side`

### Task 2.3: Purge existing stored session snapshots

**Files:**
- Create migration or one-off script under `scripts/`.

- [ ] Write a script that scans operation `responseData`.
- [ ] Remove only known session keys.
- [ ] Do not rewrite unrelated operation metadata.
- [ ] Run against staging database first.
- [ ] Back up production before running.
- [ ] Commit: `chore(operations): add session data purge script`

## Chunk 3: Financial Atomicity

### Task 3.1: Fix single operation balance deduction

**Files:**
- Modify: `src/app/api/operations/create/route.ts`
- Modify: `prisma/schema.prisma` if adding constraints/indexes.

- [ ] Move balance sufficiency check inside the transaction.
- [ ] Use a guarded update that only succeeds when `balance >= price`.
- [ ] Use committed updated balance for `Transaction.balanceAfter`.
- [ ] Do not create operation if debit fails.
- [ ] Add or plan DB non-negative balance constraint.
- [ ] Run `npm run lint`.
- [ ] Test two parallel create requests against one low-balance user.
- [ ] Commit: `fix(finance): make operation debit atomic`

### Task 3.2: Fix bulk operation balance deduction

**Files:**
- Modify: `src/app/api/operations/bulk/route.ts`

- [ ] Move total price calculation validation before transaction.
- [ ] Inside transaction, debit with `balance >= total`.
- [ ] Create all operation and transaction rows only after debit succeeds.
- [ ] Use committed final balance for ledger.
- [ ] Handle partial duplicate-card rejection before debit or with all-or-nothing behavior.
- [ ] Run `npm run lint`.
- [ ] Test concurrent bulk requests.
- [ ] Commit: `fix(finance): make bulk operation debit atomic`

### Task 3.3: Fix admin and manager balance updates

**Files:**
- Modify: `src/app/api/admin/users/[id]/balance/route.ts`
- Modify: `src/app/api/manager/users/[id]/balance/route.ts`

- [ ] For withdrawals, update only when target balance is sufficient.
- [ ] For manager deposits, debit manager only when manager balance is sufficient.
- [ ] Credit/debit target user only after guarded manager debit succeeds.
- [ ] Use committed balances for both transaction rows.
- [ ] Run `npm run lint`.
- [ ] Test two parallel manager deposits that together exceed manager balance.
- [ ] Commit: `fix(finance): guard admin and manager balance mutations`

## Chunk 4: Active Card and Refund Idempotency

### Task 4.1: Add active-card guard

**Files:**
- Modify: `prisma/schema.prisma`
- Add migration under `prisma/migrations/`.
- Modify: `src/app/api/operations/create/route.ts`
- Modify: `src/app/api/operations/bulk/route.ts`

- [ ] Decide between partial unique index or dedicated active-card lock table.
- [ ] Add DB-backed guard for active statuses.
- [ ] Convert duplicate-card conflicts into a clean API error.
- [ ] Run Prisma generate/build flow.
- [ ] Test concurrent same-card requests.
- [ ] Commit: `fix(operations): enforce one active operation per card`

### Task 4.2: Add refund idempotency

**Files:**
- Modify: `prisma/schema.prisma`
- Add migration under `prisma/migrations/`.
- Modify: `src/lib/refund.ts`

- [ ] Add unique protection for one refund per operation per refund type.
- [ ] Move duplicate handling to database constraint handling.
- [ ] Treat unique conflict as already refunded.
- [ ] Run `npm run lint`.
- [ ] Test cancel and timeout refund attempts for same operation.
- [ ] Commit: `fix(refunds): enforce refund idempotency`

## Chunk 5: Durable Worker Dispatch

### Task 5.1: Design and add outbox table

**Files:**
- Modify: `prisma/schema.prisma`
- Add migration under `prisma/migrations/`.
- Modify: `src/lib/queue.ts`

- [ ] Add an `OperationDispatchOutbox` model with operation id, job type, payload, status, attempts, and last error.
- [ ] In money-mutating routes, write outbox row in the same DB transaction.
- [ ] Make Redis enqueue idempotent from outbox rows.
- [ ] Do not mark dispatch complete until Redis job exists.
- [ ] Commit: `feat(queue): add durable operation dispatch outbox`

### Task 5.2: Add outbox dispatcher

**Files:**
- Create: `src/app/api/cron/dispatch-operation-outbox/route.ts` or a worker-side dispatcher.
- Modify: `src/lib/queue.ts`

- [ ] Require `CRON_SECRET` if implemented as API cron.
- [ ] Fetch pending outbox rows.
- [ ] Enqueue BullMQ jobs with deterministic job ids.
- [ ] Mark rows dispatched or record retry error.
- [ ] Test Redis unavailable and then restored.
- [ ] Commit: `feat(queue): dispatch pending operation jobs reliably`

## Chunk 6: Worker Account Lease Safety

### Task 6.1: Acquire lock during account selection

**Files:**
- Modify: `worker/src/pool/account-locking.ts`
- Modify: `worker/src/pool/account-pool-manager.ts`
- Modify: `worker/src/pool/account-queue-manager.ts`

- [ ] Add owner token support if missing.
- [ ] When selecting an account, atomically acquire the lock before returning it.
- [ ] If lock acquisition fails, continue to next account.
- [ ] Return account plus lease metadata, or store lease owner consistently.
- [ ] Run `cmd /c npm --prefix worker run build`.
- [ ] Commit: `fix(worker): acquire account lease before use`

### Task 6.2: Renew and release locks in operation flows

**Files:**
- Modify: `worker/src/http-queue-processor.ts`

- [ ] Add small helper for operation-scoped lock renewal/release.
- [ ] Use it in renewal, confirm, cancel, signal, balance check, and installment paths.
- [ ] Ensure terminal paths release locks.
- [ ] Ensure errors release locks in `finally`.
- [ ] Inspect sensitive-file diff line by line.
- [ ] Run `cmd /c npm --prefix worker run build`.
- [ ] Commit: `fix(worker): release account leases on terminal paths`

## Chunk 7: Worker Secret Logging and TLS

### Task 7.1: Remove sensitive logs

**Files:**
- Modify: `worker/src/http/HttpClientService.ts`
- Modify: `worker/src/utils/totp-generator.ts`
- Modify: `worker/src/utils/captcha-solver.ts`
- Modify: `.gitignore`

- [ ] Remove logs that print cookies or raw headers.
- [ ] Remove logs that print TOTP codes.
- [ ] Remove logs that print CAPTCHA answers or API keys.
- [ ] Add `worker/logs/*.log` to `.gitignore`.
- [ ] Remove tracked log files from git index without deleting local runtime logs if needed.
- [ ] Run `cmd /c npm --prefix worker run build`.
- [ ] Commit: `fix(worker): redact sensitive runtime logs`

### Task 7.2: Re-enable HTTPS verification

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `worker/src/keepalive.ts`
- Modify: `worker/src/customer-index.ts` if still used by shared worker startup.

- [ ] Remove process-wide `NODE_TLS_REJECT_UNAUTHORIZED = '0'`.
- [ ] If proxy CA is required, document required environment setup.
- [ ] Run worker build.
- [ ] Test beIN login in staging.
- [ ] Commit: `fix(worker): keep tls verification enabled`

## Chunk 8: Credential Encryption

### Task 8.1: Encrypt TOTP and proxy passwords

**Files:**
- Modify: `src/lib/crypto.ts`
- Modify: `worker/src/lib/crypto.ts`
- Modify: `src/app/api/admin/bein-accounts/route.ts`
- Modify: `src/app/api/admin/bein-accounts/[id]/route.ts`
- Modify: `src/app/api/admin/proxies/route.ts`
- Modify: `src/app/api/admin/proxies/[id]/route.ts`
- Create migration/backfill script.

- [ ] Encrypt TOTP secret on create and update.
- [ ] Encrypt proxy password on create and update.
- [ ] Decrypt only inside server/worker code that needs the secret.
- [ ] Backfill existing plaintext rows.
- [ ] Add an explicit encrypted value marker or version.
- [ ] Commit: `fix(secrets): encrypt totp and proxy credentials`

### Task 8.2: Remove plaintext fallback after backfill

**Files:**
- Modify: `src/lib/crypto.ts`
- Modify: `worker/src/lib/crypto.ts`

- [ ] After backfill is verified, make decrypt fail closed for unmarked plaintext.
- [ ] Keep a documented emergency migration-only path if needed.
- [ ] Run app and worker builds.
- [ ] Commit: `fix(secrets): fail closed on plaintext credentials`

## Chunk 9: Cancellation Race Safety

### Task 9.1: Guard worker status transitions

**Files:**
- Modify: `worker/src/http-queue-processor.ts`

- [ ] Add helper: update operation only if current status is expected and not terminal.
- [ ] Replace unguarded writes to `AWAITING_PACKAGE`, `AWAITING_FINAL_CONFIRM`, `COMPLETING`, `COMPLETED`, and `FAILED`.
- [ ] If update count is zero, stop the flow as cancelled/expired/raced.
- [ ] Do not broadly refactor the worker.
- [ ] Run worker build.
- [ ] Commit: `fix(worker): prevent cancelled operation resurrection`

## Chunk 10: Final Verification

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `cmd /c npm --prefix worker run build`.
- [ ] Search for sensitive logging:
  - `rg -n "cookie|cookies|TOTP|captcha.*solution|NODE_TLS_REJECT_UNAUTHORIZED|sessionData" src worker -g "!worker/logs/**"`
- [ ] Search for mojibake introduced in touched files:
  - Run the repository mojibake scan from `AGENTS.md` against touched files.
- [ ] Manually test:
  - normal login
  - admin route as USER denied
  - create operation
  - duplicate same-card operation denied
  - insufficient balance denied
  - cancel during active operation does not resurrect
  - worker can complete a staging operation
- [ ] Final review:
  - `git diff --stat`
  - `git diff -- worker/src/http-queue-processor.ts worker/src/http/HttpClientService.ts`
- [ ] Commit final verification adjustments if needed.

## Execution Notes

- Use this order exactly unless a task is blocked.
- If a task fails more than twice, stop and investigate root cause before applying another fix.
- Do not bundle unrelated chunks in one commit.
- Mobile and Store routes are excluded; do not spend time repairing them unless shared code changes break current reseller panel behavior.
