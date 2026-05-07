# Reseller Panel Hardening Task Checklist

Use this checklist to track execution. It mirrors the implementation plan but is shorter for day-to-day progress tracking.

## Execution Log

- [x] Phase 1 committed: `12e5c2b fix(auth): harden session authorization claims`.
- [x] Phase 2 committed: `fix(operations): keep bein sessions server-side`.

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

- [ ] Fix atomic debit in `src/app/api/operations/create/route.ts`.
- [ ] Fix atomic debit in `src/app/api/operations/bulk/route.ts`.
- [ ] Fix admin balance withdrawal/deposit guards.
- [ ] Fix manager transfer guards.
- [ ] Add DB non-negative balance constraint or migration plan.
- [ ] Test concurrent deductions.

## Active Card Guard

- [ ] Add DB-backed guard for one active operation per card.
- [ ] Apply guard to single create flow.
- [ ] Apply guard to bulk flow.
- [ ] Convert guard conflict to clean API error.
- [ ] Test concurrent same-card requests.

## Queue Durability

- [ ] Add durable operation dispatch outbox or equivalent.
- [ ] Write outbox row in same transaction as operation/debit.
- [ ] Add dispatcher or retry path.
- [ ] Do not silently swallow queue failure after debit.
- [ ] Test Redis down scenario.

## Worker Account Locking

- [ ] Acquire Redis lock before returning selected beIN account.
- [ ] Skip locked accounts.
- [ ] Renew lock during long operations.
- [ ] Release lock in success paths.
- [ ] Release lock in failure paths.
- [ ] Release lock in cancel/timeout paths.
- [ ] Test two workers cannot use same account.

## Worker Logs and TLS

- [ ] Remove cookie/session logging.
- [ ] Remove TOTP logging.
- [ ] Remove CAPTCHA answer/API key logging.
- [ ] Add `worker/logs/*.log` to `.gitignore`.
- [ ] Remove tracked worker log files from git index.
- [ ] Remove global `NODE_TLS_REJECT_UNAUTHORIZED = '0'`.
- [ ] Test worker HTTPS flow in staging.

## Credential Encryption

- [ ] Encrypt beIN TOTP secrets.
- [ ] Encrypt proxy passwords.
- [ ] Backfill existing plaintext values.
- [ ] Add encrypted marker/version.
- [ ] Remove silent plaintext fallback after backfill.

## Refund Idempotency

- [ ] Add unique refund guard.
- [ ] Update `src/lib/refund.ts` to rely on DB idempotency.
- [ ] Treat duplicate refund conflict as already refunded.
- [ ] Test cancel and timeout refund race.

## Cancellation Race

- [ ] Add guarded worker status update helper.
- [ ] Replace unguarded active-state writes.
- [ ] Stop worker if operation is terminal.
- [ ] Test cancel while worker is mid-flow.

## Verification

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [x] Run `cmd /c npm --prefix worker run build`.
- [ ] Search for sensitive log patterns.
- [x] Search touched files for mojibake patterns.
- [x] Review sensitive-file diffs manually.
- [ ] Prepare release notes and rollback notes.
