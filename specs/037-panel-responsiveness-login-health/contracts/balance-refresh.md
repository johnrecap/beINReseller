# Planned Dealer Balance Refresh Contract

FR-008–FR-012. NOT_IMPLEMENTED. This is a provider display read, never a customer balance adjustment or payment proof.

## HTTP interface

Keep `POST /api/admin/bein-accounts/[id]/check-balance`. A JSON body `{ "mode": "async" }` opts in; absent/empty body is legacy mode. Reject other modes with 400/VALIDATION_ERROR before admission. Preserve existing `requireRoleAPIWithMobile(..., 'ADMIN')` authorization, including its supported ADMIN client types, on POST and GET; do not widen it.

Async acceptance: HTTP 202 `{ "success": true, "data": { "requestId": "opaque-id", "accountId": "account-id", "state": "QUEUED", "pollAfterMs": 2000 } }`. Duplicate admission returns the same active request identity/state. Current account eligibility is checked before new admission and again by the worker. A prior authorized request may still be inspected when the account later becomes disabled.

Add GET on the same path: `?requestId=<id>` returns HTTP 200 `{ "success": true, "data": { "requestId", "accountId", "state", "createdAt", "deadline", "balance", "updatedAt", "errorCode" } }`; the quoted field names describe the planned object, not runnable JSON. Epoch-millisecond numeric times; balance/updatedAt appear only for COMPLETED, with updatedAt as ISO string and the existing numeric USD display representation. errorCode appears only for FAILED. Omit runToken and all provider details. A mismatched/missing/expired request returns 404/REQUEST_NOT_FOUND without leaking another account. Disabled/deleted ADMIN access is denied before data reads.

GET `?active=1` returns the active request projection or `{ "success": true, "data": null }` and never enqueues. Use it after a lost POST reply or same-tab refresh. It does not claim that a previously completed request never ran. Redis failure is 503/STATUS_UNAVAILABLE, not an empty result. Poll every two seconds with one poll in flight and a 15-second HTTP/body deadline. Pause when hidden/offline and resume on return; stop on terminal outcome, logout or expired/missing status. Client request timeout does not cancel the job.

Known request FAILED is an HTTP 200 status result with a safe errorCode. Admission/auth failures use existing error/error-code envelopes. Codes: ACCOUNT_UNAVAILABLE, ACCOUNT_BUSY, LOGIN_FAILED, CAPTCHA_REQUIRED, CONNECTION_FAILED, PROVIDER_RATE_LIMITED, BALANCE_NOT_FOUND, BALANCE_TIMEOUT, BALANCE_FAILED, QUEUE_UNAVAILABLE, STATUS_UNAVAILABLE and REQUEST_NOT_FOUND. Client copy maps codes through the locale catalog; no raw worker exceptions.

Legacy POST uses the same request/store, waits at most 60 seconds, and retains top-level success/balance/updatedAt/message on 200 and success:false/error on failure/timeout. Add requestId/code for follow-up without breaking old fields. Return 504/BALANCE_TIMEOUT if still pending, without canceling or duplicating it; terminal worker failure returns a safe 500. Never poll DB timestamps as proof of completion.

## Admission, execution and retention

Planned shared modules: `shared/bein/balance-refresh.ts` (types/constants), `shared/bein/balance-refresh-store.ts` (Redis atomic admission/claim/finish), reused by web and Worker. Use the existing operationsQueue singleton; add optional balanceRequestId to CHECK_ACCOUNT_BALANCE payload, preserving old payloads. Use requestId-derived BullMQ jobId, attempts:1 and existing queue priority. No higher global concurrency/rate limit.

Admission atomically creates one account-active request. Enqueue failure records a safe terminal failure and releases only that pointer. Unknown enqueue delivery must retain the identity so reconciliation cannot create duplicate work. Duplicate BullMQ delivery can claim a request only once. Queue timeout is five minutes from acceptance; execution deadline is sixty seconds from claim, capped at six minutes from acceptance. Enforce deadlines in worker admission and completion, not only UI projection.

Request TTL is 660 seconds from acceptance; terminal write resets result TTL to 300 seconds. Active pointer expires at its bounded maximum deadline; any subsequent admission still must acquire the existing account execution lease. An expired record never authorizes overlapping provider work. The worker fails busy rather than bypassing reservation/execution ownership. Existing HTTP/body deadlines must fit the execution bound; release owned locks only after registered HTTP work has drained.

On success: confirm request/run ownership and current account eligibility, read finite nonnegative balance, persist its observed balance/timestamp using existing guarded account behavior, and finish the request with that observation. Preserve an account revision change owned by the same successful login; distinguish it from external ADMIN edits using the current ownership mechanism. Missing/invalid balance is BALANCE_NOT_FOUND, not zero/success. If the DB write succeeds but result persistence fails, status remains unavailable/uncertain; do not infer success or trigger money reconciliation from it.

On failure: store a safe FAILED result before propagating the failure to BullMQ; if Redis persistence also fails, log only the safe request ID/code and let bounded deadline/unavailable handling control follow-up. Do not swallow CHECK_ACCOUNT_BALANCE errors. Legacy jobs without requestId use the existing balance handler and now correctly reject failures, without inventing a request record. No changes to customer CHECK_BALANCE business semantics.

Timeout/failure/missing result can permit an explicit later read-only refresh after active-request reconciliation and account-lease eligibility; it must never resubmit a financial operation. Late results cannot replace terminal state, a newer request result or an ADMIN-recovered account state.
