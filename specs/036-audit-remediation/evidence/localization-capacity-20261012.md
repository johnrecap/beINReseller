# Renewal localization and local capacity comparison

Scope: the user authorized this implementation and temporary local test, without Spec Kit activation, subagents, production access, real provider purchases or deployment. Source changes preserve existing quote/cart/invoice guards, cooldown and financial review policy.

## Saved changes

- Renewal headings, steps, validation, confirmation, expiration, cancellation, terminal feedback, signal and installment components use the selected en/ar/bn catalog. English is the initial document language. Switching and persisted reload update the language/direction; provider package names remain unchanged. Provider document exports retain their original representation.
- The shared PM2 factory supplies concurrency 4, PostgreSQL pool 2 and a 300,000 ms drain window per panel Worker. The versioned environment example selects 20 unique Workers explicitly. Queue and provider rate limits are unchanged. Connection/memory budgeting and coordinated process replacement are documented in `docs/deployment/audit-remediation-release.md`.
- The real PostgreSQL smoke exposed an invalid query of the nonexistent `operations.fulfillment_proof_kind` column. Baseline capture now uses the actual proof/claim/manual-evidence relations under the existing operation/reservation locks; it does not add a fictitious column or bypass proof validation. A native database regression is included in the existing database gate manifest.
- The real cross-job renewal also exposed missing provider-account identity in exported HTTP sessions. Operation and keepalive clients now bind their provider account, export that identity and reject an explicitly mismatched imported account before importing cookies. Existing fenced cache writes remain strict.
- A pre-existing reservation race test attempted to create two active operations on one card, which the separate active-card index already forbids. Its fixture now uses two review rows so the assertion actually reaches and tests the reservation uniqueness constraint; production constraints were not weakened.

## Verification recorded before load

- Root unit gate: 844 cases / 105 files, zero failures or skips. Worker tests: 293 cases, zero failures or skips, including the Redis lease/session tests on a separate local Redis database.
- Native PostgreSQL: 14 distinct focused cases pass after correcting the reservation fixture, covering baseline capture/reuse, card/account reservation races, canonical account uniqueness, invoice claims, composite proof constraints and safe pre-mutation finalization. These are targeted checks, not the complete database gate or a production migration rehearsal.
- Mocked browser: 29 renewal scenarios including ar/en/bn, 360/1280 widths, persistent locale switching, cooldown continuity, localized confirmation/success/failure/review/pending settlement and live language switching on the terminal screen, zero external requests and page errors. Pending review/settlement uses a distinct amber heading rather than falsely declaring failure. The installment suite passes 40 scenarios. The provider export suite passes its 15 comparisons.
- Root and Worker TypeScript, schema parity, focused lint, isolated Next production build and Worker compilation pass. Current mobile screenshots were visually inspected: translated content and RTL/LTR fit; package names are preserved and separated from their labels. Mechanical assertions and this visual judgment are separate evidence.

## Test method and limits

An owned temporary directory outside the repository contains an independent source copy, native PostgreSQL, standalone Memurai, real Next/AuthJS API, BullMQ, actual compiled Workers and the actual maintenance runner. All test service listeners bind loopback. Node sockets are restricted to the four local test ports; provider egress is blocked. The HTTP provider fixture uses synthetic WebForms package/cart/Reports/contract pages and a synthetic ledger, including reordered package rows and promotional prices. No source secrets, business records or real credentials are copied.

The socket restriction is a preload in every test Node process, not a machine-wide firewall. The native database/Redis processes are configured as local standalone servers; an OS-level outbound-blocking rule for those native executables was not enforced (the session has no Administrator token). No firewall policy or automatic service was installed. This limits any claim of complete operating-system network isolation; actual provider-call code ran only behind the Node guard. Keepalive/customer/store services were not part of the measured stack.

The fixture contains 200 distinct users and 40 synthetic provider accounts, of which ten are eligible. Login sessions are prepared under the existing login limit before the measurement. The test-only fulfillment setting uses synthetic attestation-shaped data to exercise the gated completion path; it is explicitly **not** a live provider attestation and is never copied into the project or production.

The empty database is bootstrapped from the current Prisma model plus required migration indexes, checks, functions and triggers. The historical empty initial migration remains unresolved. A known obsolete foreign-key replacement was supplied against the current schema. This setup and the focused native tests do not establish that the production migration history can provision or upgrade correctly.

Both mixed runs retain pool 2, the global 50-jobs/minute queue limiter and account limits (default five uses per 300 seconds). Baseline is 10 × 8 job slots; target is 20 × 4. Users ramp across two minutes and remain active for ten further minutes. A deterministic action cycle allocates 40% renewals, 25% card checks, 15% history/status, 10% signals and 10% installments; half of renewals use a promo. Each visitor waits for its flow then thinks for three seconds. Status polls follow the page's 0.5/1/2-second progression and awaiting states send heartbeats. Each flow is censored after four minutes or at the measurement boundary; censored operations must be reported separately, never as completed. The burst starts 200 distinct renewal flows together.

The representative renewal traversed selected quote, promo, cart, final confirmation and synthetic payment to a matching Reports/contract invoice and `COMPLETED`. Check and signal flows also completed. The representative installment made one synthetic payment and remained `REVIEW_REQUIRED` under the existing deferred-settlement policy; this is not counted as completed.

Sampling records API latency/outcomes, prioritized and ordinary BullMQ queues, job start/finish times, account acquisition, PostgreSQL connections and owned process CPU/memory. Account wait reported from worker logs is rounded to seconds and is distinct from API admission-to-reservation delay. Processes run directly with the compared configuration; PM2 restart automation and Linux signal/drain behavior are not exercised by the Windows benchmark.

## Results and cleanup

### Mixed workload (two-minute ramp + ten-minute hold)

Measured on local Windows with 16 logical processors and approximately 16 GiB physical RAM, versus the user's production screenshot of six cores and approximately 12 GB RAM. One run per configuration; timing differences are observations, not statistical significance or a production guarantee. CPU below is expressed in equivalents of one fully used logical core. Working-set sums may double-count shared pages and include the local load generator/database/provider as well as application processes.

| Measurement | 10 Workers × 8 | 20 Workers × 4 |
| --- | ---: | ---: |
| API requests | 72,476 | 72,897 |
| Successful read p95 / p99 | 93.7 / 178.7 ms | 75.7 / 145.4 ms |
| Accepted start p95 / p99 | 215.4 / 409.4 ms | 127.7 / 203.2 ms |
| Accepted operation starts | 679 | 681 |
| Expected readiness HTTP 503 responses, including continuation commands | 312 | 210 |
| Unexpected HTTP/network errors | 0 | 0 |
| Started-job queue wait p95 / p99 | 257.5 / 266.2 s | 257.7 / 266.4 s |
| Account wait p95, rounded log samples | 126 s | 126 s |
| Completed operation duration p95 / p99 | 384.7 / 384.7 s | 384.8 / 384.8 s |
| Maximum queued jobs, excluding active | 227 | 232 |
| Queued / active jobs at final queue sample | 194 / 80 | 195 / 80 |
| Peak PostgreSQL connections, including test sampler | 32 | 52 |
| Peak Worker working-set sum | 1,352 MiB | 2,707 MiB |
| Peak whole-test working-set sum | 3,239 MiB | 4,842 MiB |
| Whole-test CPU p95 / peak, logical-core equivalents | 0.86 / 1.04 | 0.86 / 0.98 |
| Worker CPU p95 / peak, logical-core equivalents | 0.11 / 0.66 | 0.22 / 0.50 |
| Verified renewal invoices / simulated renewal payments | 5 / 5 | 5 / 5 |
| Simulated installment payments under sustained load | 0 | 0 |
| Wrong renewal package / duplicate debit / duplicate Pay / overlapping requests on one provider account | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

Final database operation states (all operation types):

| State | 10 × 8 | 20 × 4 |
| --- | ---: | ---: |
| COMPLETED | 19 | 17 |
| FAILED | 320 | 322 |
| EXPIRED | 13 | 20 |
| REVIEW_REQUIRED | 53 | 48 |
| PENDING | 194 | 194 |
| PROCESSING | 80 | 80 |

These snapshots are sampled sequentially, so a queue count and a database count can differ by one as work progresses. The client observed 547 / 548 flows still unresolved when its four-minute observation limit or the run boundary was reached. Those are censored observations, not server failures or successes. Database completions include late outcomes after an individual client stopped following. Expected rejections and histories are also excluded from operation completions. Closed-loop runs generate different action counts because rejected/finished users begin their next action sooner: baseline 464 renewals, 290 checks, 174 history reads, 115 signals, 114 installments; target 416, 260, 156, 104, 102 respectively. Promo renewals were exactly half (232 / 208).

Interpretation: both mixed runs meet the API response targets, but neither provides smooth execution for this 200-user workload. Twenty Workers did not increase the five verified renewal completions or reduce queue wait; it increased memory and connections. The shared 50-jobs/minute limiter serves starts, promos and continuation/confirmation jobs, while ten accounts retain rate/ownership restrictions and a roughly two-minute acquisition wait. Continuations can wait beyond the existing selection/confirmation deadlines. Most failure messages were account-wait timeout; further cases expired or entered review. The readiness gate rejected starts/commands when no eligible account was available. No limits or safety gates were bypassed to make the result look better.

The correctness result applies to the payments actually exercised; zero installment payments during the sustained runs does not prove concurrent installment settlement correctness. The separate representative installment remained in the existing review path after one simulated payment.

### Simultaneous renewal burst

All 200 starts were issued within 37–39 ms, followed for four minutes with status polls/heartbeats and one selection/confirmation per flow. Each configuration was repeated once after a 15-second Worker startup wait to distinguish initial startup from the admission bottleneck. No further tuning or load reruns were used to change the verdict.

| Measurement | 10 × 8 initial | 20 × 4 initial | 10 × 8 warm repeat | 20 × 4 warm repeat |
| --- | ---: | ---: | ---: | ---: |
| Accepted starts / 200 | 200 | 191 | 200 | 191 |
| Accepted start p95 / p99 | 3,097 / 3,121 ms | 6,376 / 6,549 ms | 5,280 / 5,370 ms | 6,065 / 6,345 ms |
| Successful read p95 / p99 | 285 / 371 ms | 362 / 860 ms | 268 / 703 ms | 370 / 796 ms |
| Unexpected HTTP 500 on start | 0 | 9 | 0 | 9 |
| Completed renewals / simulated payments | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Client observed FAILED / EXPIRED / still unresolved | 56 / 55 / 89 | 56 / 55 / 80 | 59 / 54 / 87 | 55 / 54 / 82 |
| Expected readiness HTTP 503 on continuation | 27 | 32 | 29 | 31 |

The target's nine failures recur after startup: Prisma `P2028`, unable to start a transaction within the allotted time, in renewal admission. This is 4.5% of attempted starts; its approximately 0.05% share of all requests is diluted by polling and must not conceal the admission failure. Both profiles fail the two-second p95 start target. No burst reaches provider Pay, so its zero duplicate/wrong-package count is not evidence of payment throughput. Warm queue-wait p95 remains about 195–196 seconds. No automatic process restart was observed during the performance runs; the separately injected Worker interruption is recorded below.

### Fault observations

The twenty-worker fault sequence uses the same real local services and keeps all safety limits. Assertions against the saved event snapshots and synthetic ledger verify:

- Reordering package rows **and changing their checkbox control IDs** across reloads still completes the selected six-month promotional package at USD 86.40, with one matching invoice/proof.
- Twenty concurrent users starting the same card yield one accepted operation and nineteen HTTP 409 responses. The admitted uncontinued selection later expires; no provider Pay is sent for it.
- Selecting USD 86.40 while the returned cart contains the USD 216 package stops before Pay and enters `REVIEW_REQUIRED` with `PACKAGE_QUOTE_CHANGED`; the synthetic provider ledger has no payment for that card. This safe review is not counted as completed or automatically refunded.
- A 60-second Reports delay sends one Pay, initially holds `REVIEW_REQUIRED`, exhausts the bounded read-only verification schedule and remains for manual review after the invoice becomes visible. No second Pay is made. Late evidence after exhaustion does not itself schedule an unlimited retry or authorize a refund.
- Repeating that held card returns HTTP 409 twice. Both countdown snapshots retain exactly the same deadline; remaining seconds decrease from 284 to 281. Review remains an independent block after the five minutes.
- The combined sequence records zero package mismatches, duplicate Pay, duplicate customer debits or overlapping provider requests on one account. Its only HTTP 503 is an expected readiness rejection during the expired-session case, not an unexpected server error.

The initial session-expiry case ends `EXPIRED` without Pay. Disabling two accounts after the earlier cases leaves seven completed checks and five account-wait failures out of twelve, partly because earlier review reservations remain held. Fresh-database isolated repetitions are recorded separately below so this shared-state sequence is not mistaken for an independent account-outage measurement.

The fresh-database session-expiry repetition injects two login-page responses. Preparation loses the required STB evidence and safely ends `REVIEW_REQUIRED` with `STB number not available`, zero Pay requests and zero provider sales. It does not silently choose another package or infer successful renewal.

The interrupted-worker case runs separately with one worker so the executing process is unambiguous. The provider delays its Pay response for five seconds; after observing receipt of Pay, the test hard-stops that worker and manually starts its replacement. The synthetic provider completes the one payment while the original client is gone. BullMQ recovery reaches `REVIEW_REQUIRED` with `Provider mutation already started; only fulfillment verification is allowed.` The final snapshot after another 35 seconds still requires review. Assertions verify one Pay request, one correct USD 86.40 promo invoice, zero repeated debit, zero second Pay and zero account-request overlap. Automatic post-crash completion was not achieved or claimed. This tests the durable submission fence and manual process replacement, not PM2 autorestart or graceful Linux shutdown.

In the fresh account-outage repetition, two of the ten eligible accounts are disabled and twelve card checks start together with twenty workers. Eight complete (duration p95 2.58 seconds); four fail with account-wait timeout after 127.18–127.46 seconds. Assertions confirm the disabled accounts are never used, no account requests overlap and no provider payment occurs. There are no unexpected HTTP/network errors in the isolated fault repetitions.

### Acceptance and final checks

- VERIFIED within exercised cases: exact selected promo package, no observed duplicate debit/Pay, exclusive account/card execution, fixed cooldown, delayed-report review and post-interruption non-replay. The limited number of actual simulated payments is shown explicitly above; this is not a universal production guarantee.
- VERIFIED: selected-language UI, explicit twenty-worker configuration and connection/drain budget. Root unit 844/105 files, Worker 293, focused native DB 14, renewal browser 29, installment browser 40 and export comparisons 15 pass. Root/Worker types, schema parity, final focused lint, isolated production web build and Worker compilation pass. The final copied runtime manifest matches 690 repository files and excludes environment files. Build success and configuration assertions do not prove PM2/Linux shutdown behavior.
- NOT MET: smooth 200-user execution, p95 burst admission within two seconds and fewer than 1% unexpected failures among burst starts for twenty workers. Both profiles accumulate operations; twenty workers provide no measured renewal-throughput gain and consume more memory/connections.
- NOT_VERIFIED: complete OS-level outbound blocking for native executables, full production migration history/upgrade rehearsal, whole-project CI, live provider layouts/attestation, actual server process versions/capacity, PM2 automatic restart and Linux graceful drain. These scopes remain incomplete. No deployment or live acceptance follows from the local measurements.

Next capacity work should measure bounded admission/backpressure, continuation scheduling and the interaction between account reservation/rate windows and operation deadlines. Increasing provider/queue limits or database transaction timeouts without that work would not resolve the demonstrated queue starvation safely. These follow-up changes were not made in this request.

### Cleanup receipt

After presenting the aggregate findings, all owned test Node processes were stopped, the exact temporary PostgreSQL cluster was shut down with `pg_ctl`, and the temporary Memurai executable was stopped. All four test listeners were verified absent (54368, 6398, 31268, 31269), and no owned Node/PostgreSQL/Memurai process remained. No Memurai/PostgreSQL automatic service had been installed.

The two dependency junctions were inventoried against their exact repository targets and detached before recursive deletion; both repository dependency directories remain present. The owned temporary root, including runtime copy, downloaded/extracted binaries, synthetic database, queue, users, cookies, harness and raw logs, was removed. The secondary attempted sandbox temporary directory is also absent. Cleanup returned `temporaryRootsAbsent=true`, `ownedProcesses=0`, `testListeners=0`, `dependencyTargetsPreserved=true`.

Only this sanitized result summary, release/ledger updates and reusable source regression tests remain in the project. Raw load data and the transient load generator were deliberately not retained or committed, as requested. Local implementation/measurement/cleanup is delivered with the acceptance failures and unverified scopes above; no production capacity approval is made.
