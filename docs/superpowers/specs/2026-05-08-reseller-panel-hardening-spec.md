# Reseller Panel Hardening Spec

**Date:** 2026-05-08
**Scope:** Current reseller panel only.
**Excluded:** Mobile app and Store app flows are intentionally excluded because they are no longer active.

## Goal

Fix the remaining high-risk issues in the current reseller panel without changing retired Mobile or Store functionality.

The main outcomes are:

- Users cannot forge admin or manager permissions.
- beIN dealer session data is never exposed to users.
- User balance cannot be overdrawn or deducted twice under concurrent requests.
- The same beIN card cannot have multiple active operations at the same time.
- A balance deduction cannot be committed without a durable worker dispatch path.
- beIN accounts are protected from concurrent worker use.
- Worker logs do not contain cookies, TOTP, CAPTCHA, or session material.
- HTTPS verification is not disabled process-wide.
- Refunds are idempotent.
- Cancellation cannot be overwritten by an active worker.

## Explicit Non-Goals

- Do not repair Mobile app routes in this work.
- Do not repair Store app routes in this work.
- Do not redesign the UI.
- Do not refactor large worker files broadly.
- Do not migrate all money fields from `Float` in the first pass unless earlier safety fixes are complete.

## Sensitive Files

The following files are high-risk and must be handled with extra care:

- `worker/src/http-queue-processor.ts`
- `worker/src/http/HttpClientService.ts`

Rules for those files:

1. Make small, isolated changes only.
2. Do not reformat the file.
3. Do not move large blocks.
4. Do not rename unrelated functions.
5. Add tests or manual verification for every touched flow.
6. Review diffs line by line before committing.
7. Never log cookies, TOTP codes, CAPTCHA answers, passwords, or raw session state.
8. Avoid changing beIN request parsing unless the task explicitly requires it.

## Risks Found

### R1: Client-controlled session update can forge roles

`src/lib/auth.config.ts` merges client-provided session data into the JWT on update.

Impact:

- A normal authenticated user may be able to become admin by changing JWT/session claims.

Required behavior:

- JWT role and identity claims must come from trusted server-side data only.
- API authorization must verify current user state from the database for privileged routes.

### R2: beIN session material is exposed through operation data

Worker session snapshots are stored in `Operation.responseData`, and operation APIs can return that field to the operation owner.

Impact:

- A reseller user may retrieve beIN cookies/ViewState/session material.

Required behavior:

- beIN session data must be stored only in server-only storage.
- User-facing operation responses must strip session fields.
- Existing stored snapshots must be removed or ignored.

### R3: Balance mutations are race-prone

Several reseller balance flows check balance before the committed mutation.

Impact:

- Concurrent requests can overdraw a user or manager balance.
- Ledger `balanceAfter` can become inaccurate.

Required behavior:

- Balance checks and balance mutations must be atomic.
- Database constraints should prevent negative balances.

### R4: Active operation checks are race-prone

Active card checks are read-before-create checks without a durable uniqueness guard.

Impact:

- Two concurrent requests can create two active operations for the same card.

Required behavior:

- There must be one global active-operation guard per `cardNumber`.

### R5: Money is committed before queue dispatch is durable

Some routes deduct balance and create operations before successfully creating a worker job.

Impact:

- A user may be charged while the worker never receives the operation.

Required behavior:

- Operation dispatch must be durable.
- If Redis queueing fails, the system must retry from a durable record or compensate safely.

### R6: beIN account selection does not acquire a lock

The worker checks whether accounts are locked, but account selection returns without acquiring a lease.

Impact:

- Multiple workers can use the same beIN account/session concurrently.

Required behavior:

- Account selection must atomically acquire a Redis lease.
- Long operations must renew the lease.
- Terminal paths must release the lease safely.

### R7: Worker disables TLS verification globally

Worker processes set `NODE_TLS_REJECT_UNAUTHORIZED = '0'`.

Impact:

- HTTPS traffic can be intercepted.

Required behavior:

- Remove global TLS verification disablement.
- If a proxy certificate is needed, configure a trusted CA explicitly.

### R8: Logs and tracked log files contain sensitive material

Worker code logs sensitive material, and `worker/logs/*.log` files are tracked.

Impact:

- Repo or log access can expose active sessions or credentials.

Required behavior:

- Remove sensitive logs.
- Ignore worker logs.
- Purge tracked logs from the working tree.
- Rotate exposed sessions/secrets if the repo was shared.

### R9: Some credentials are not encrypted

beIN passwords are encrypted, but TOTP secrets and proxy passwords are not consistently encrypted.

Impact:

- Database exposure reveals credentials or 2FA seeds.

Required behavior:

- Encrypt TOTP secrets and proxy passwords.
- Backfill existing rows.
- Remove plaintext fallback after migration.

### R10: Refund idempotency relies on read-before-create

Refund code checks for existing refunds before creating a refund row, but the schema does not fully enforce uniqueness.

Impact:

- Concurrent cancel/timeout/failure paths can double-refund.

Required behavior:

- Add a durable idempotency guard for refunds.

### R11: Worker can overwrite cancellation

The worker checks cancellation near the start of some flows, then later performs unguarded status updates.

Impact:

- A cancelled operation can become active again.

Required behavior:

- Every worker status transition must guard against terminal statuses.

## Success Criteria

- A non-admin cannot access admin routes by updating session data.
- Operation API responses contain no beIN session material.
- Concurrent create/bulk requests cannot create negative balances.
- Concurrent requests for the same card produce at most one active operation.
- Queue outage does not leave a deducted operation with no retry path.
- Two workers cannot use the same beIN account lease simultaneously.
- Worker logs contain no sensitive values.
- TLS verification remains enabled.
- Duplicate refund attempts are harmless.
- Worker status updates do not resurrect cancelled operations.

