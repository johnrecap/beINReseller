# Planned Data and State Model

Implementation NOT_STARTED. No Prisma schema change, new database index or historical backfill is planned.

## Panel command

- Identity: actorId + action + resource key + attemptId. A sorted set of conflict resource keys is claimed atomically to avoid transfer/bulk deadlocks.
- States: IDLE → PENDING → SUCCEEDED | FAILED | UNCERTAIN. A loaded PENDING tombstone becomes UNCERTAIN; it never auto-dispatches. Only authoritative reconciliation can resolve uncertain non-idempotent work. Reads have independent latest-generation cancellation.
- Memory holds immutable submitted payload and draft separately; payloads and sensitive drafts are removed on completion/logout. Internal route changes retain live command ownership.
- sessionStorage stores only version, actorId, action/resource keys, attemptId, state and timestamp, optionally the server requestId. No financial body, credentials or raw error. Terminal known commands remove tombstones. Uncertain non-idempotent records do not silently expire; they need supported reconciliation. Logout clears memory and hides prior-actor tombstones; retain tombstones partitioned until the same actor returns/reconciles, preventing logout/login from becoming an automatic retry shortcut.
- This is same-tab UI protection; server authorization, locks and existing idempotency remain authoritative across tabs/devices. No new universal financial execution ledger is claimed.

## Balance refresh request (Redis, planned)

- Separate `bein:balance-refresh` namespace; requestId, accountId, createdAt, queueDeadline, executionDeadline, state, runToken, safe errorCode and terminal balance/updatedAt.
- State: QUEUED → RUNNING → COMPLETED | FAILED. Unknown/missing retention is a read outcome, not a fabricated stored failure. Deadline projection is FAILED with BALANCE_TIMEOUT; late workers cannot overwrite terminal state.
- Account-scoped active pointer deduplicates admissions. Request/run token and existing account execution ownership fence claims, writes and release. Records live up to 660 seconds from admission; terminal retention is 300 seconds from completion/failure. Active pointer lives through its deadline; expiry never bypasses the underlying execution lease.
- PostgreSQL dealerBalance/balanceUpdatedAt is the latest display observation. The request result records the specific observation made by its worker; it does not infer ownership from the DB timestamp or prove financial fulfillment.

## Existing beIN account health (PostgreSQL)

- Reuse isActive, consecutiveLoginFailures, lastLoginAttemptAt, lastLoginFailureAt, lastLoginFailureReason, lastSuccessfulLoginAt and updatedAt. Preserve credential-only counter meaning.
- Persist safe versioned reason codes defined in the health contract; decode historical credential strings and unrecognized text safely. Do not persist raw provider messages.
- All outcomes compare the revision captured before HTTP. A failed CAS is stale, not a new failure and not grounds to retry the write against the new revision. Missing revision stops authentication work and emits a system warning.
- Terminal authentication disables immediately. Transport/system warnings preserve isActive and credential count. Current-revision success clears current failure and counter only while already active; disabled accounts are never automatically reactivated.
- Existing account reservations/leases govern in-flight work. Disablement prevents new admission; no purchase resubmission, automatic refund or reassignment of uncertain work follows.

## Recovery and compatibility

ADMIN reset-and-activate clears selected account shared sessions/health using current owned recovery and advances updatedAt. Counter-only reset preserves activity. Toggle-to-active, low-balance reactivation and edit-to-active delegate to the same recovery; combined field changes/attestation audit commit atomically under ownership. Toggle-to-inactive preserves existing behavior. Busy/conflicting owner returns 409 without partial edits. Historical settings/reasons are retained, not rewritten in bulk. No migration command is required by 037.
