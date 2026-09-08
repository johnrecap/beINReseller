# Jobs, readiness, and release contract

**Status — 2026-09-08:** Local dispatch/effect/readiness/topology implementation is verified; live adapter, migration provenance, live topology and cutover are still open. Operational steps below remain unexecuted. The concrete reviewed sequence is in `docs/deployment/audit-remediation-release.md`.

Both PM2 profiles now derive their panel workers from `deployment/panel-workers.cjs` and require `PANEL_WORKER_COUNT` (1..32). `bein-maintenance` in the root profile owns periodic panel recovery. `operations` is consumed by the regular HTTP workers, including direct read-only VERIFY_REVIEW_CARD/CHECK_ACCOUNT_BALANCE and scheduled VERIFY_RENEWAL_FULFILLMENT. Unsupported card-level CHECK_BALANCE remains rejected before financial writes; it is not an account-balance alias. Existing excluded queue/process definitions remain unchanged.

## Dispatch and completion effects

- Inventory every panel OperationJobData type and producer, including START_RENEWAL, APPLY_PROMO, COMPLETE_PURCHASE, CANCEL_CONFIRM, CONFIRM_INSTALLMENT, CONFIRM_PURCHASE, and supported signal/bulk paths.
- The existing maintenance runner owns generic pending dispatch recovery. Keep the CONFIRM_PURCHASE watchdog's financial safety checks, then extend other types using type-aware recovery/exhaustion.
- Preparation identity is operation/type/revision; final provider mutation identity remains immutable.
- Recover stale DISPATCHING claims using the same job identity, distinguish known terminal state, and never enqueue financial work for an unsafe reviewed/terminal operation.
- Defaults: batch 50, cap 200, five total delivery/effect attempts (initial plus four retries at 5s/30s/2m/10m); do not apply those retries to provider Pay.
- Indexed due-time scanning, leases, safe reason codes, oldest-pending age, counts, and exhaustion reporting are required.
- Completion transaction creates durable effect rows. Atomic effect application prevents duplicate notification/counter changes. Existing points repair retains captured historical recipients/rates.

## Account and attestation readiness

- Report eligible account count by required consumer scope; automation exclusivity requires real operator confirmation.
- Missing eligible accounts blocks admission before deduction or provider mutation.
- An already-owned valid causal reservation counts as available for that operation; do not reject it merely because the unreserved pool is empty. Recheck actual account eligibility/reservation at every financial admission boundary.
- Implement the authenticated read-only session adapter behind the existing live-smoke command. Fixture mode is not a substitute for live proof.
- A privileged writer stores sanitized pass evidence with release fingerprint, verifiedAt, and exact configured correlation coverage. Preserve 24-hour expiry unless a separately reviewed requirement changes it.
- Surface requested/effective mode and expiry in admin config. Expired/missing evidence blocks new automatic admission; explicit supported REVIEW_ONLY policy remains visible and cannot be called automatic success.
- Never persist passwords, cookies, TOTP, ViewState, raw HTML, or payment details in attestation or logs.

## Deployment topology and scheduler manifest

Reconcile `ecosystem.config.js` and `worker/ecosystem.config.js` with a declared profile. Each enabled panel queue has exactly the intended consumer(s). Existing customer/store process definitions are preserved; enabling or modifying them is excluded. Record maintenance cadence and any external cron dependency; avoid relying on undocumented server jobs. Do not assume the live count is either 8 or 10 without later evidence.

## Future release sequence

1. Obtain authorized read-only evidence of deployed commit, migration history, account eligibility, required processes/queues, and in-flight work.
2. Assemble a committed release manifest including all intended new source files/migrations; preserve unrelated work. Check schema/version compatibility.
3. Rehearse migration, crash/replay, legacy compatibility, and rollback limits on disposable resources; never point test helpers at production.
4. In an authorized maintenance window, stop new financial admission and drain/fence existing work. Never replay an uncertain provider mutation to empty a queue.
5. Use `prisma migrate deploy` for reviewed migrations and generate both compatible clients. No normal-production db push.
6. Protect Next artifacts: never build into the same .next while bein-web serves it. Use the repository's stop-web/build/start sequence in a controlled window, or a separately validated release-directory switch. Keep the previous runnable artifact until rollback is safe.
7. Build/deploy matching worker version and restart the declared processes only. Resume admission after readiness checks.
8. Observe safe logs, dispatch age, review/refund backlog, point-effect backlog, and queue consumers. Hold admission on financial conflicts.

Rollback is not blind down-migration or restoring balances from stale backups. After new financial records/external actions, prefer forward repair and compatible old readers; preserve all durable evidence. Exact executable production commands require the actual approved topology and later authorization.

**Panel release boundary:** Acceptance covers this active panel scope only. Existing shared migrations and excluded consumer compatibility still constrain a safe combined deployment; retain their guards and report conflicts without adding store/app modifications or claiming those consumers verified.
