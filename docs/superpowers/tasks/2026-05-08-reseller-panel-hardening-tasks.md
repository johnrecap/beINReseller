# Reseller Panel Hardening Task Checklist

Use this checklist to track execution. It mirrors the implementation plan but is shorter for day-to-day progress tracking.

## Execution Log

- [x] Phase 1 committed: `12e5c2b fix(auth): harden session authorization claims`.
- [x] Phase 2 committed: `fix(operations): keep bein sessions server-side`.
- [x] Balance Safety committed: `fix(finance): guard balance mutations`.
- [x] Active Card Guard committed: `fix(operations): enforce active card guard`.
- [x] Queue Durability and Worker Account Locking committed: `fix(operations): add durable dispatch and account locks`.

## Exclusions

- [x] Confirm Mobile app routes are excluded.
- [x] Confirm Store app routes are excluded.
- [x] Confirm current scope is reseller panel, beIN worker, reseller balance, reseller operations, admin/manager APIs.

## High-Sensitivity Files

- [x] Treat `worker/src/http-queue-processor.ts` as high-risk.
- [x] Treat `worker/src/http/HttpClientService.ts` as high-risk.
- [x] Review diffs for touched sensitive files manually before every commit.
- [x] Do not reformat either file.
- [x] Do not move large blocks in either file.

## Auth

- [x] Remove unsafe JWT session merge in `src/lib/auth.config.ts`.
- [x] Make API role authorization use current DB role.
- [x] Reject disabled users.
- [x] Reject stale tokens after password/security-state change.
- [ ] Test USER cannot access admin route.
- [ ] Test demoted manager loses manager access.

## beIN Session Exposure

- [x] Redact session fields from `src/app/api/operations/[id]/route.ts`.
- [x] Stop writing beIN session snapshots into `Operation.responseData`.
- [x] Move session snapshots to Redis/server-only storage.
- [x] Add script or migration to purge existing session snapshots.
- [x] Verify operation API response redaction path removes cookies/session/ViewState.
- [ ] Manually test a live operation API response with real operation data.

## Balance Safety

- [x] Fix atomic debit in `src/app/api/operations/create/route.ts`.
- [x] Fix atomic debit in `src/app/api/operations/bulk/route.ts`.
- [x] Fix admin balance withdrawal/deposit guards.
- [x] Fix manager transfer guards.
- [x] Fix manager create-user initial balance debit guard.
- [x] Add DB non-negative balance constraint or migration plan.
- [ ] Test concurrent deductions.

## Active Card Guard

- [x] Add DB-backed guard for one active operation per card.
- [x] Apply guard to single create flow.
- [x] Apply guard to bulk flow.
- [x] Convert guard conflict to clean API error.
- [ ] Test concurrent same-card requests.

## Queue Durability

- [x] Add durable operation dispatch outbox or equivalent.
- [x] Write outbox row in same transaction as operation/debit.
- [x] Add dispatcher or retry path.
- [x] Do not silently swallow queue failure after debit.
- [ ] Test Redis down scenario.

## Worker Account Locking

- [x] Acquire Redis lock before returning selected beIN account.
- [x] Skip locked accounts.
- [ ] Renew lock during long operations.
- [x] Release lock in success paths.
- [x] Release lock in failure paths.
- [x] Release lock in cancel/timeout paths.
- [ ] Test two workers cannot use same account.

## Worker Logs and TLS

- [x] Remove cookie/session logging.
- [x] Remove TOTP logging.
- [x] Remove CAPTCHA answer/API key logging.
- [x] Add `worker/logs/*.log` to `.gitignore`.
- [x] Remove tracked worker log files from git index.
- [x] Remove global `NODE_TLS_REJECT_UNAUTHORIZED = '0'` from reseller worker and keepalive paths.
- [ ] Test worker HTTPS flow in staging.

## Credential Encryption

- [x] Encrypt beIN TOTP secrets.
- [x] Encrypt proxy passwords.
- [x] Backfill existing plaintext values.
- [x] Add encrypted marker/version.
- [x] Remove silent plaintext fallback after backfill.
- [ ] Run `npx tsx scripts/backfill-credential-encryption.ts --dry-run`.
- [ ] Run `npx tsx scripts/backfill-credential-encryption.ts` after backup.

## Refund Idempotency

- [x] Add unique refund guard.
- [x] Update `src/lib/refund.ts` to rely on DB idempotency.
- [x] Treat duplicate refund conflict as already refunded.
- [ ] Test cancel and timeout refund race.

## Cancellation Race

- [x] Add guarded worker status update helper.
- [x] Replace unguarded active-state writes.
- [x] Stop worker if operation is terminal.
- [ ] Test cancel while worker is mid-flow.

## Verification

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [x] Run `cmd /c npm --prefix worker run build`.
- [x] Search for sensitive log patterns.
- [x] Search touched files for mojibake patterns.
- [x] Review sensitive-file diffs manually.
- [ ] Prepare release notes and rollback notes.
