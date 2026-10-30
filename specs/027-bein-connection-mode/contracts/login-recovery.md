# Contract: Login classification and manual recovery

2026-10-30 amendment. ADMIN-only existing routes; no automatic reactivation.

## Login result
Keep success, requiresCaptcha, captchaImage and error compatible. Add optional failureCategory (transport, rate_limit, captcha, credentials, unknown), failureCode, httpStatus and retryable. Codes/messages are allowlisted, independent of raw provider HTML. HTTP failures precede HTML parsing and credentials submission. A rejected GET blocks POST; 402/407/429 stop the current login loop. Safe HTTP retries remain at existing bounds; non-idempotent POSTs are never automatically replayed. Unknown redirects, login forms and title-only pages are failures without a credential assertion. Only explicit invalid-username/password evidence counts.

## Tracking
All consumers use the shared classification. Login results carry optional typed metadata; the existing tracking interface accepts only the canonical explicit credential-rejection string. Legacy string callers must fail conservatively: explicit known credential rejection only. A single SQL statement increments and disables at the configured threshold; threshold remains 1..20/default 3. Existing account ownership guards cover state writes, recovery, and cache saves; stale owners cannot write after recovery. Transport failures do not change isActive or credential counter.

## POST /api/admin/bein-accounts/{id}/reset
ADMIN only. Acquire account ownership, reject active reservations/work with 409 and stable localized error; clear login/general failure status and enable this one account. DB counter/reason/session invalidation is transactional. Invalidate only reusable account sessions, then release only the owned lease. Failure cannot be reported as success. Do not reset request budgets, delete foreign locks, touch operation snapshots/reservations/invoices/balances, or bulk-enable accounts.

## POST /api/admin/bein-accounts/{id}/login-failures/reset
Same ownership/authorization/invalidations, but isActive is unchanged. Reset counter and reason only. Busy returns 409.

## GET /api/admin/bein-accounts/login-failures
Preserve existing fields. Add review classification as needed. needsPasswordUpdate is true only for explicit known credential rejection at threshold, not generic historical errors. Unknown errors require login review, with no historical DB backfill. ar/en/bn labels distinguish actions; preserve loading/empty/error/pending states and mobile RTL.

## Acceptance
AC02–04/07–09 in spec.md; tests at actual HTTP, tracking, lease and route-handler boundaries. Logs and API errors never include raw passwords, cookies, TOTP, HTML or ViewState.
