# Connected consumer inventory — T002

**Current reconciliation — 2026-09-08:** The inventory below is the historical discovery snapshot. Current panel guard behavior is in [auth-matrix.md](auth-matrix.md); dispatch/effects in [recovery-bounds.md](recovery-bounds.md); connected coverage in [regression-matrix.md](regression-matrix.md). All 19 operation routes / 21 handlers use current panel identity. CHECK_BALANCE card admission is now rejected before debit; VERIFY_REVIEW_CARD, VERIFY_RENEWAL_FULFILLMENT and CHECK_ACCOUNT_BALANCE keep their supported regular HTTP worker handlers and are not final-Pay aliases. Both PM2 profiles derive panel workers from mandatory PANEL_WORKER_COUNT; root maintenance is the periodic owner. Old 8-vs10, single-type watchdog and planned customer-attribution statements below are historical, not current scope or runtime claims. No excluded consumer was modified.

**Baseline:** [T001](baseline.md), commit `7457b7028811759736faa799a8b06b43691b1218` plus the frozen local tree.
**Date:** 2026-09-07. **Evidence level:** source reading and reference enumeration only; Q02–Q12 NOT_RUN.
**Owner:** current Codex task; this document assigns later acceptance owners without authorizing their execution.

[consumer-index.json](consumer-index.json) holds all discovered paths, source anchors and owner task IDs. A path can belong to several groups. The 208 shared-auth importers and 64 existing regression candidates are expansion indexes, not 208 reviewed endpoint implementations or 64 passed tests. This inventory fully enumerates the 19 operation route files / 21 exported HTTP handlers and reads their guard and ownership boundaries. It also traces the named financial, queue and lock paths below. It is not a new whole-repository security verdict.

## Source of the renewal data

beIN is the execution system. The panel supplies identity, permissions, local accounting, workflow state and a UI. `worker/src/http/HttpClientService.ts` performs authenticated HTTP/WebForms steps, reads returned page data and extracts provider results. `worker/src/http-queue-processor.ts` carries the selected card/package/offer through preparation, confirmation and verification. `availablePackages` and operation results are persisted snapshots; polling a panel API need not make a fresh provider request. A local debit or successful HTTP response alone is not fulfillment proof.

Reuse this chain in later tasks. Never replace provider package availability or the provider result with invented local success. Transport failure after submission remains an evidence question; it does not authorize another Pay.

## 1. Every operation route

All paths in the first column are relative to `/api/operations`. Follow-up routes currently rely on ownership/state where the table does not name a separate permission. That is current behavior, not an endorsement or a new permission policy.

| Route | Methods | Current identity gate | Current permission / ownership | Connected effect | Source anchor |
| --- | --- | --- | --- | --- | --- |
| `/` | GET | withAuth → getAuthSession | No action permission; list scoped by session.user.id | Recovery may run while listing active operations | `src/app/api/operations/route.ts:8` |
| `/bulk` | POST | Local web/panel-mobile helper | SUBSCRIPTION_BULK; new operations belong to authenticated user | RENEW rejected; CHECK_BALANCE / SIGNAL_REFRESH still admitted | `src/app/api/operations/bulk/route.ts:44` |
| `/create` | POST | Local web/panel-mobile helper | SUBSCRIPTION_RENEW; new operation belongs to authenticated user | RENEW rejected; CHECK_BALANCE / SIGNAL_REFRESH still admitted | `src/app/api/operations/create/route.ts:42` |
| `/signal-activate` | POST | Local web/panel-mobile helper | SIGNAL_ACTIVATE; owner only | Existing operation -> SIGNAL_ACTIVATE | `src/app/api/operations/signal-activate/route.ts:39` |
| `/signal-check` | POST | Local web/panel-mobile helper | SIGNAL_ACTIVATE; creates own operation | SIGNAL_CHECK | `src/app/api/operations/signal-check/route.ts:39` |
| `/signal-refresh` | POST | Local web/panel-mobile helper | SIGNAL_ACTIVATE; creates own operation | SIGNAL_REFRESH | `src/app/api/operations/signal-refresh/route.ts:39` |
| `/start-installment` | POST | Local web/panel-mobile helper | SUBSCRIPTION_RENEW; creates own operation | Guarded creation -> START_INSTALLMENT | `src/app/api/operations/start-installment/route.ts:40` |
| `/start-renewal` | POST | Local web/panel-mobile helper | SUBSCRIPTION_RENEW; own operation; non-admin maintenance check | Guarded creation -> START_RENEWAL | `src/app/api/operations/start-renewal/route.ts:66` |
| `/[id]` | GET | Local web/panel-mobile helper | Owner or ADMIN; admin-only provider audit projection | Read operation; hide internal relations | `src/app/api/operations/[id]/route.ts:19` |
| `/[id]/apply-promo` | POST | Local web/panel-mobile helper | Owner only; no separate permission check | AWAITING_PACKAGE -> APPLY_PROMO | `src/app/api/operations/[id]/apply-promo/route.ts:37` |
| `/[id]/cancel` | POST | Web, then panel-mobile, then customer token | Match userId OR customerId; no ADMIN override | Safe termination/refund; reseller queue cleanup only | `src/app/api/operations/[id]/cancel/route.ts:48` |
| `/[id]/cancel-confirm` | POST | Local web/panel-mobile helper | Owner only; no separate permission check | CANCEL_CONFIRM | `src/app/api/operations/[id]/cancel-confirm/route.ts:31` |
| `/[id]/captcha` | GET, POST | Local web/panel-mobile helper | Owner only for both methods | Read / submit CAPTCHA while awaiting | `src/app/api/operations/[id]/captcha/route.ts:19` |
| `/[id]/confirm-installment` | POST | Local web/panel-mobile helper | Owner or ADMIN; charge operation owner | Canonical deduction -> CONFIRM_INSTALLMENT | `src/app/api/operations/[id]/confirm-installment/route.ts:39` |
| `/[id]/confirm-purchase` | POST | Local web/panel-mobile helper | Owner only; no separate permission check | Canonical deduction -> CONFIRM_PURCHASE | `src/app/api/operations/[id]/confirm-purchase/route.ts:37` |
| `/[id]/heartbeat` | GET, POST | Local web/panel-mobile helper | Query includes userId in both methods | Refresh heartbeat / unload / recovery | `src/app/api/operations/[id]/heartbeat/route.ts:46` |
| `/[id]/installment` | GET | Local web/panel-mobile helper | Owner or ADMIN | Read installment progress | `src/app/api/operations/[id]/installment/route.ts:28` |
| `/[id]/packages` | GET | Local web/panel-mobile helper | Owner or ADMIN | Read saved beIN package/result projection; expiry recovery | `src/app/api/operations/[id]/packages/route.ts:24` |
| `/[id]/select-package` | POST | Local web/panel-mobile helper | Owner checked inside transaction | Select saved provider package -> COMPLETE_PURCHASE | `src/app/api/operations/[id]/select-package/route.ts:47` |

**Owning tasks for every row:** T027 negative cases, T028 guard integration, T029 role/ownership acceptance. T049 protects unchanged shared consumers. No route is closed as fixed by this inventory.

- `src/lib/auth-utils.ts:35` / `getDbAuthenticatedUser` reloads current user, checks `isActive` and password-change timing, and returns current role. `getAuthenticatedUser` supplies the web/panel-mobile entry point. Reuse it.
- `src/lib/mobile-auth.ts:72` verifies the panel JWT and returns claims plus issuance time; that alone is not current-user lookup.
- `src/lib/api-middleware.ts:35` / `getAuthSession`, used by `withAuth` and `withPermission`, returns session/mobile claims. The operations collection route therefore belongs to AUD-005 too. Changing only local `getAuthUser` helpers would leave it behind.
- `src/lib/operation-list-filters.ts:10` retains list ownership. `ADMIN` exceptions are exactly the four detail/packages/installment/confirm-installment rows above; do not introduce a blanket override.
- Cancellation's mixed credential branch must preserve identity kind. Customer IDs must never be reinterpreted as panel-user IDs. T027/T029 require both token-family negatives and current-role revocation cases.
- If a later fix changes shared middleware itself, expand review using all `authShared` entries. Migrating the operation caller to the existing central guard can avoid unrelated middleware churn.

## 2. Store, customer-mobile and admin boundaries

| Surface | Current gate / ownership and connection | Acceptance owner |
| --- | --- | --- |
| `src/app/api/store/subscriptions/start/route.ts:30` | Store token via `getStoreCustomerFromRequest`; creates customer-owned operation/subscription and guarded card reservation | T013, T014, T036 |
| Store `[id]/select-package`, `confirm-payment`, `confirm`, `cancel`, `heartbeat`, `captcha`, `[id]/route.ts` | Store identity and subscription.customerId; persisted Operation and StoreSubscription have distinct state; selection checks owner again in transaction | T014, T019, T022, T044 |
| Store public catalogue / authenticated history | `src/app/api/store/subscriptions/route.ts:15` exposes active local SubscriptionPackage catalogue without auth; `history/route.ts` separately reads customer-owned subscriptions | T044, T049 |
| `src/app/api/mobile/subscriptions/check/route.ts`, `renew/route.ts`, `create-payment-intent/route.ts` | Customer auth; legacy renewal entry points return transition conflict before the former execution path | T046, T047, T054 |
| Mobile active/history/status/signal | `withCustomerAuth`; status restricts operation.customerId; signal debits customer wallet and submits customer queue job | T046, T047, T049 |
| `src/app/api/admin/financial-review/route.ts`, decision and verify-card | Central `requireRoleAPIWithMobile(..., 'ADMIN')`; evidence-derived actions and server decision notes; verify-card queues a read-only provider check | T024, T025, T026, T029 |
| `src/app/api/store/webhooks/stripe/route.ts` | Signature-checked provider event, then exact stored payment/operation/subscription identity; payment finalizers feed durable dispatch/refund observation | T021, T022, T023 |
| `src/lib/customer-auth.ts`, `src/lib/store-auth.ts` | Separate token families; preserve their own guards and ownership contracts | T027, T029, T046 |

There is no checked external mobile UI/source in this repository slice. T054 must establish the real consumer later. Do not equate the panel-mobile JWT with the customer-mobile JWT.

## 3. Queue producer / consumer graph

### Actual queue routing

- `src/lib/queue.ts:29`: `operations`, job name `process-operation`, stable `type--operationId` identity.
- `src/lib/queue.ts:46`: `customer-operations`, job name `process-customer-operation`, stable `customer--type--operationId` identity.
- `src/lib/operation-dispatch.ts:54`: outbox uniqueness is operationId/jobType. Parsing defaults queueTarget to RESELLER; CUSTOMER is selected only with explicit queueTarget and customerId.
- Store start/select/confirm/payment-finalization currently omit queueTarget and therefore use `operations` even with a customerId. Do not silently move them when standardizing topology.
- `src/lib/mobile-renewal-payment-finalization.ts:125` and `:372` explicitly target CUSTOMER. Mobile signal directly uses `addCustomerOperationJob`; this direct producer must be included in outage and consumer coverage.
- `worker/src/index.ts:62` consumes operations with the regular pool. `worker/src/customer-index.ts:69` consumes customer-operations, initializes `customerOnly: true`, and calls the same HTTP processor.
- Provider fulfillment retry scheduling at `worker/src/http-queue-processor.ts:4061` and web repair at `src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts:98` currently submit to operations. T030/T041 must explicitly cover the intended account/pool routing before changes.

### Admitted job types and handlers

| Job type | Producer(s) | HTTP consumer | Owner |
| --- | --- | --- | --- |
| START_RENEWAL | Panel start-renewal; store start | handleStartRenewalHttp | T030, T031, T036 |
| COMPLETE_PURCHASE | Panel select-package; store credit-only selection / payment finalizer | handleCompletePurchaseHttp | T014, T016, T030, T031 |
| APPLY_PROMO | Panel apply-promo | handleApplyPromoHttp | T015, T016, T017 |
| CONFIRM_PURCHASE | Panel confirm; store confirm; customer mobile payment finalizer | handleConfirmPurchaseHttp | T020, T021, T030, T031 |
| CANCEL_CONFIRM | Panel cancel-confirm | handleCancelConfirmHttp | T030, T031, T049 |
| SIGNAL_REFRESH | Dedicated panel route; legacy create/bulk; mobile signal | handleSignalRefreshHttp | T030, T031, T049 |
| SIGNAL_CHECK | Panel signal-check | handleSignalCheckHttp | T030, T031, T049 |
| SIGNAL_ACTIVATE | Panel signal-activate | handleSignalActivateHttp | T030, T031, T049 |
| START_INSTALLMENT | Panel start-installment | handleStartInstallmentHttp | T006, T008, T030 |
| CONFIRM_INSTALLMENT | Panel confirm-installment | handleConfirmInstallmentHttp | T006, T007, T008 |
| VERIFY_RENEWAL_FULFILLMENT | Worker retry scheduler; maintenance repair | handleVerifyRenewalFulfillmentHttp | T011, T012, T030, T041 |
| VERIFY_REVIEW_CARD | Admin verify-card direct queue producer | handleVerifyReviewCardHttp | T025, T030, T041 |
| CHECK_ACCOUNT_BALANCE | Admin account check-balance direct queue producer | handleCheckAccountBalance; returns without an operation refund path | T030, T041, T049 |
| CHECK_BALANCE | Legacy create/bulk still accept and debit this type | No corresponding switch case at processor dispatch; distinguish from account-level CHECK_ACCOUNT_BALANCE | T030, T031, T049 |
| RENEW / REFRESH_SIGNAL aliases | Present in worker job type union; RENEW explicitly blocked in legacy create/bulk | No corresponding switch cases; REFRESH_SIGNAL must not be confused with SIGNAL_REFRESH | T030, T031, T049 |

The last two rows are concrete producer/type-union coverage gaps recorded under the existing AUD-014 / connected-regression scope. They are not fixed here. T030 must expose unsupported admission before any generic retry changes; T031 must resolve admission/handler compatibility within its accepted scope rather than retry an unsupported financial job. If changing commercial behavior is required, clarify that specific decision before implementation.

### Exhaustive discovered queue source references

The table covers the 32 non-test source files using queue/outbox symbols or constructing a Queue/Worker. The machine index also retains the three matching test files.

| Source | Owning follow-up tasks |
| --- | --- |
| `src/app/api/admin/bein-accounts/[id]/check-balance/route.ts:22` | T030, T031, T041, T049 |
| `src/app/api/admin/financial-review/[operationId]/verify-card/route.ts:44` | T030, T031, T041, T049 |
| `src/app/api/cron/dispatch-operation-jobs/route.ts:2` | T030, T031, T041, T049 |
| `src/app/api/cron/timeout-operations/route.ts:4` | T030, T031, T041, T049 |
| `src/app/api/mobile/subscriptions/signal/route.ts:11` | T030, T031, T041, T049 |
| `src/app/api/operations/bulk/route.ts:6` | T030, T031, T041, T049 |
| `src/app/api/operations/create/route.ts:7` | T030, T031, T041, T049 |
| `src/app/api/operations/signal-activate/route.ts:5` | T030, T031, T041, T049 |
| `src/app/api/operations/signal-check/route.ts:5` | T030, T031, T041, T049 |
| `src/app/api/operations/signal-refresh/route.ts:5` | T030, T031, T041, T049 |
| `src/app/api/operations/start-installment/route.ts:5` | T030, T031, T041, T049 |
| `src/app/api/operations/start-renewal/route.ts:5` | T030, T031, T041, T049 |
| `src/app/api/operations/[id]/apply-promo/route.ts:5` | T016, T030, T031 |
| `src/app/api/operations/[id]/cancel/route.ts:4` | T030, T031, T041, T049 |
| `src/app/api/operations/[id]/cancel-confirm/route.ts:7` | T030, T031, T041, T049 |
| `src/app/api/operations/[id]/confirm-installment/route.ts:9` | T030, T031, T041, T049 |
| `src/app/api/operations/[id]/confirm-purchase/route.ts:5` | T030, T031, T041, T049 |
| `src/app/api/operations/[id]/select-package/route.ts:10` | T030, T031, T041, T049 |
| `src/app/api/store/subscriptions/start/route.ts:15` | T014, T022, T030, T031, T041 |
| `src/app/api/store/subscriptions/[id]/confirm/route.ts:12` | T014, T022, T030, T031, T041 |
| `src/app/api/store/subscriptions/[id]/confirm-payment/route.ts:16` | T014, T022, T030, T031, T041 |
| `src/app/api/store/subscriptions/[id]/select-package/route.ts:16` | T014, T022, T030, T031, T041 |
| `src/app/api/store/webhooks/stripe/route.ts:19` | T014, T022, T030, T031, T041 |
| `src/lib/mobile-renewal-payment-finalization.ts:2` | T014, T022, T030, T031, T041 |
| `src/lib/operation-dispatch.ts:3` | T030, T031, T041, T049 |
| `src/lib/queue.ts:29` | T041, T049 |
| `src/lib/store-subscription-payment-finalization.ts:2` | T014, T022, T030, T031, T041 |
| `src/lib/maintenance/operation-maintenance-runner.ts:5` | T030, T031, T041, T049 |
| `src/lib/maintenance/renewal-fulfillment-verification-maintenance.ts:98` | T030, T031, T041, T049 |
| `worker/src/customer-index.ts:69` | T041, T049 |
| `worker/src/http-queue-processor.ts:4070` | T030, T031, T041, T049 |
| `worker/src/index.ts:62` | T041, T049 |

### Schedulers and process definitions

- `src/lib/maintenance/operation-maintenance-runner.ts:155` calls runDispatchWatchdog; it then recovers stale operations, repairs captured points runs and due fulfillment verification jobs. `src/scripts/operation-maintenance.ts` starts the runner.
- `src/app/api/cron/dispatch-operation-jobs/route.ts` can call generic pending dispatch plus watchdog; `timeout-operations` and cleanup routes provide additional recovery entry points. Actual cron configuration is UNKNOWN.
- runDispatchWatchdog's admitted retry/exhaustion scan currently selects CONFIRM_PURCHASE; reclaiming stale DISPATCHING records does not itself prove every other type gets redelivered.
- Root `ecosystem.config.js` declares web, keepalive, maintenance and eight regular workers; it has no customer worker. `worker/ecosystem.config.js` declares ten regular workers, keepalive and customer, but no web/maintenance.
- Customer entry reads CUSTOMER_WORKER_CONCURRENCY (default 2); its PM2 block sets WORKER_CONCURRENCY to 4 instead. Record as T041 configuration-contract work, not a claim about running concurrency.
- A worker's presence in a file is not evidence it runs. T041 owns declared topology; T055 owns separately authorized live verification; no process was started here.

## 4. Spend writers, reports and financial effects

### Provider-spend source of truth

The current model is `BeinAccountSpendLedger`, with unique operation identity and required panel user attribution. The schema and all listed readers/writers must move together when T004/T010 add customer attribution. Retail price, customer wallet debit and beIN dealer spend are distinct amounts.

- Worker `recordConfirmedBeinSpend` is called in final renewal payment and installment outcomes (`worker/src/http-queue-processor.ts:2934,5782,5948`). The current userId condition is the AUD-003 integration gap.
- Web recovery `src/lib/operations/recovery.ts:254` can create/update provider-spend evidence in its transaction; it is a second writer, not just a reader.
- Automated fulfillment requires matching spend/evidence, so schema support alone cannot complete customer operations.
- Admin summary/detail reports, financial-review projections, card search and operation audit-detail redaction depend on this ledger. Preserve user/customer privacy and avoid awarding reseller points to a synthetic user.

| Complete discovered spend source set | Follow-up tasks |
| --- | --- |
| `src/app/api/admin/financial-review/route.ts:50` | T010, T049 |
| `src/app/api/admin/financial-review/[operationId]/decision/route.ts:224` | T010, T049 |
| `src/app/api/admin/reports/bein-spend/route.ts:3` | T010, T049 |
| `src/app/api/admin/reports/bein-spend/operations/route.ts:7` | T010, T049 |
| `src/app/api/operations/[id]/route.ts:50` | T010, T049 |
| `src/lib/bein-spend-ledger.ts:133` | T010, T049 |
| `src/lib/operation-detail-audit.ts:54` | T010, T049 |
| `src/lib/operation-safety.ts:76` | T010, T049 |
| `src/lib/renewal-payment-refund-finalization.ts:475` | T010, T021, T049 |
| `src/lib/financial-review/evidence.ts:27` | T010, T049 |
| `src/lib/operations/financial-review-refund-finalization.ts:74` | T010, T021, T049 |
| `src/lib/operations/pre-mutation-renewal-finalization.ts:130` | T010, T021, T049 |
| `src/lib/operations/recovery-proof.ts:87` | T010, T049 |
| `src/lib/operations/recovery.ts:96` | T010, T049 |
| `worker/src/http-queue-processor.ts:32` | T010, T049 |
| `worker/src/lib/bein-spend-ledger.ts:96` | T010, T049 |
| `worker/src/lib/renewal-no-charge-finalization.ts:82` | T010, T049 |
| `scripts/bein-spend-ledger-simulations.ts:6` | T010, T049 |
| `scripts/reconcile-renewal-fulfillment.ts:24` | T010, T049 |
| `scripts/refund-safe-review-not-charged.ts:70` | T010, T021, T049 |

The machine index includes test references separately. Scripts listed above are source consumers only; none was run.

### Financial effect writers and funding boundaries

| Family | Existing writers / callers | Existing truth / risk boundary | Owner |
| --- | --- | --- | --- |
| Panel deductions | create, bulk, confirm-purchase, confirm-installment routes | User balance and OPERATION_DEDUCT transaction; selected server amount and owner; later refund uses canonical deduction | T008, T017, T049 |
| Panel refunds | `src/lib/refund.ts`, web pre-mutation/recovery/strict-review finalizers; `worker/src/utils/error-handler.ts`, worker pre-mutation/no-charge finalizers | REFUND entry plus balance/points/status; caller must honor blocked result | T008, T012, T021, T025 |
| Customer wallet | Mobile signal, wallet webhook, admin customer balance, mobile store orders; refundCustomer | WalletTransaction reference and customer balance; separate from StoreCreditLedgerEntry | T021, T046, T049 |
| Store credit | store select-package writes DEBIT; `src/lib/store-subscription.ts:256` and renewal-payment-refund finalizer write REFUND | StoreCreditLedgerEntry with subscription/customer/currency/amountMinor identity; original funding split | T019, T021, T022, T023 |
| External payment | Store selection/confirm-payment/Stripe webhook; mobile-renewal-payment-finalization; renewal-payment-refund-finalization | Exact Payment/provider identity and verified observations; no local success assumption | T021, T022, T023, T047 |
| Captured points | Shared operation-spend-award-runs via web/worker adapters; automated/manual/recovery completion and signal/installment completion paths | Immutable ownership/rate snapshot captured with completion, then idempotent finalize; existing stale-run repair stays authoritative | T032, T033, T049 |
| Legacy point award entry | `src/lib/points/operation-awards.ts` exports processCompletedOperationPoints[InTransaction] | Uses current operation/user policy; distinguish from captured-run pipeline; do not add a new caller to bypass snapshots | T049 |
| Point reversals | `src/lib/points/reversals.ts`, refund/recovery/pre-mutation/strict-review and admin correct-balance callers | Reversal origin and transaction boundary preserved; admin correction is an unchanged connected writer | T021, T049 |
| Completion counters / notices | Worker finalizeRenewalSideEffects, installment/signal paths, activity-tracker and notification helper; web recovery notification is inside refund transaction | Worker counter/notice calls after completion can be lost on crash; ordinary analytics counts from rows are distinct from User.totalOperations | T032, T033, T034, T049 |
| Credit/commission/debt/transfers/rewards | Existing credit-request decisions/debt, ownership transfer, balance changes, points cash-redemption, Eid rewards and reports | Connected-regression scope; preserve commercial policy and original historical ownership; not an instruction to rewrite these writers | T049 |

Every discovered direct monetary writer, award/reversal caller and store-credit/refund reference has file/line/task ownership in the machine index. Broad financial writers outside renewal are acceptance dependencies under T049, not new remediation claims.

## 5. Locks and transaction intersection map

Source-level order is recorded here; no database concurrency experiment was run. Explicit SQL locks, advisory locks, Redis locks and the implicit row locks taken by writes are different mechanisms.

| Existing path | Observed order / protected state | Owner |
| --- | --- | --- |
| renewal-creation-guard + card-lifecycle-reservation | renewal-card-lifecycle advisory -> card-reservation operation key -> card key -> reservation read/write | T003, T021 |
| renewal-payment-refund-finalization:438 | renewal-card advisory -> acquire card reservation -> operation row -> payment row -> optional subscription row -> customer row; later provider reservation locks | T003, T021, T022 |
| store-subscription-payment-finalization:41 | ensure guarded renewal reservation -> subscription FOR UPDATE -> payment/subscription/operation writes -> outbox | T003, T014, T021, T022 |
| mobile-renewal-payment-finalization:168 / :415 | acquire reservation unless terminal/replay -> operation row -> payment row (existing payment finalizer); operation update/dispatch | T003, T021, T047 |
| worker fulfillment-baseline:182 | operation row -> card reservation row -> provider reservation row -> verification row; final mutation claim also has joined FOR UPDATE across causal records | T003, T012, T021 |
| worker fulfillment-finalization:599 | operation -> verification/latest attempt -> card reservation -> provider reservation -> active baseline; spend/proof checks, completion/effect capture and reservation writes | T003, T010, T021, T033 |
| worker fulfillment-proof:454 | operation row -> unique proof claim; composite matching remains mandatory | T003, T021 |
| Manual/strict-review/pre-mutation/no-charge finalizers | operation row first -> evidence/financial updates -> card/provider reservation writes; both web and worker versions are in the index | T003, T008, T012, T021, T025 |
| Generic web/worker refund helpers | operation FOR UPDATE -> canonical funding read -> balance and ledger/reversal writes | T003, T008, T021 |
| Web recovery | Redis recovery ownership -> transaction reads -> CAS/status/evidence/financial writes -> reservations; no initial SQL operation FOR UPDATE in this path | T003, T010, T021, T031 |
| Provider causal reservation helper | advisory operation key -> sorted account keys -> causal reservation write; generation/ownership fence; distinct from Redis account lease | T003, T021, T041 |
| Shared ownership-evidence-lock / point award runs | operation row -> subject user -> ordered owner rows through existing helpers; preserve captured ownership and avoid reverse acquisition | T003, T033, T049 |
| Stripe non-renewal refund branch | payment FOR UPDATE -> payment/order writes; renewal-linked branch routes to renewal refund finalizer | T003, T021, T022 |

**Required before T021 enables new refund authorization:** normalize all intersecting writers to the common order in [data-model.md](../data-model.md), not only the new coordinator. Preserve the canonical card advisory fence, distinguish it from reservation-row acquisition, and move existing early reservation-row claims to the agreed position in every participating writer. Do not mix old and new ordering in one release. Joined SQL locks and implicit update locks need explicit concurrent regression; their textual order alone is not a deadlock proof.

The existing contract's proposed order is future design. This table documents the current differences and the T003 concurrent Stripe/new-settlement regression. T021 owns adaptations; T033 must preserve that order while adding effects. No missing lock is invented as already present.

## 6. UI and test expansion

| Known in-repository consumer | Owner |
| --- | --- |
| `src/app/dashboard/operations/active/page.tsx:360` | T017, T044, T045, T047 |
| `src/app/dashboard/renew/page.tsx:262` | T017, T044, T045, T047 |
| `src/components/admin/financial-review/FinancialReviewClient.tsx:141` | T026, T045 |
| `src/components/admin/reports/BeinSpendReportClient.tsx:154` | T010, T049 |
| `src/components/history/HistoryPageClient.tsx:47` | T017, T044, T045, T047 |
| `src/components/history/OperationsTable.tsx:119` | T017, T044, T045, T047 |
| `src/components/operations/BulkRenewForm.tsx:45` | T017, T044, T045, T047 |
| `src/components/renewal/InstallmentPaymentFlow.tsx:258` | T017, T044, T045, T047 |
| `src/components/renewal/SignalRefreshFlow.tsx:64` | T017, T044, T045, T047 |
| `src/hooks/useOperationHeartbeat.ts:69` | T017, T044, T045, T047 |
| `src/lib/operations/client-timeout.ts:9` | T017, T044, T045, T047 |

- Renewal UI and installment/signal components consume provider-derived snapshots and panel state. API errors/labels remain the existing ar/en/bn catalog scope for later UI tasks; no user-facing application text was changed now.
- The public store catalogue is local SubscriptionPackage data. Distinguish it from per-card availablePackages extracted from beIN and from authenticated subscription history. API routes alone do not establish the external storefront/mobile UI.
- Existing regression candidates (64 named files) are in the index. T049 selects meaningful cases and real services; filenames or source assertions do not count as behavioral coverage.
- Initial anchors include operation-spend-completion-writers, operation-points-completion-parity, admin-financial-review-decisions, operation-dispatch-watchdog, operation-timeout-recovery, provider/card reservation DB tests, hierarchical-password-reset, permission-evaluator, ownership-transfer-concurrency and the three payment/refund DB suites called out by AUD-019.
- Root/worker package scripts and CI selection remain T048/T050/T051 evidence; no suite was executed in this phase.

## 7. Handoff and limitations

T002 is complete when route-file/method counts match source, every machine-index path and task ID resolves, the described queue/financial/lock anchors still match T001 hashes, and Q01 scope verification passes. Completing T001/T002 does not resolve AUD-005/014/016/020; it supplies their implementation inventory.

The inventory sharpens existing tasks: T028 includes the collection wrapper caller; T030/T031 include unsupported legacy job admission and direct queue producers; T041 includes actual queueTarget and CUSTOMER_WORKER_CONCURRENCY; T021 includes all current card/payment/refund lock intersections. Future changes must reopen affected callers and update this inventory; no additional implementation task is executed here.

Production revision, actual schedules/process counts, historical data, active sessions and current beIN response shape remain UNKNOWN. Full feature completion/convergence and release remain T058 and earlier release-gate tasks, outside this slice.
