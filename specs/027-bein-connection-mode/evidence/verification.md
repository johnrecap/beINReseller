# 027 incident implementation evidence — 2026-10-30

Scope: user-authorized local implementation of T032–T045; direct execution, no subagents. Branch `codex/027-login-recovery`, base `a3bc54d6ed9f2cc46a047c7894005db2f0528de9`. No commit, push, deployment, live provider request, payment or production data change. Technical verification does not grant deployment or author acceptance.

## Reproduction and implementation

The original HTTP-boundary tests failed on GET/POST/tunnel transport classification and false login success. The actual v1/v2 queue-handler fixture observed assigned proxy instead of current direct mode. The real reset endpoints returned success on a foreign lock. These red assertions preceded their implementation; fixture import/selector setup failures were distinguished from behavior failures. A later consumer review added a red display-report credential tracking test, then verified the shared tracking integration.

The fix follows the current route once per deferred read on the original account. Purchase continuation restore and all final Pay/evidence matching remain unchanged. Shared-cookie import strips purchase ViewState/selection/prepared state. HTTP status checks precede HTML and credential submission, positive authenticated controls are required, and generic responses remain unknown. Typed 402/407/429 failures stop immediate login loops. Boolean re-login consumers now stop before repeating their action on false.

Credential tracking captures Prisma's account revision before HTTP. Conditional SQL increments and disables in one statement, advances UTC timestamp precision monotonically, and rejects stale responses after recovery. Counter-only recovery leaves isActive unchanged; reset-and-activate clears counters and enables one account. Both ADMIN endpoints acquire the existing account guard, reject causal reservations/execution leases, invalidate only that account's reusable sessions, and release by exact owner. They preserve rate keys, operation snapshots, reservations and monetary rows. Conservative revision checking can discard a response if another account update advances updatedAt; it never reactivates an account automatically.

KeepAlive creates a cycle-local client from current Redis state. A cache removed by recovery cannot be resurrected from an old client. Redis Lua cache writes compare the captured owner/lease. Existing session timeout minutes are converted to seconds for fenced writes; worker count, concurrency, cadence and retry budgets are unchanged.

## Current verification

Machine-readable commands, results and source hashes are retained in `verification-results.json`. Full transient logs remain in ignored `tmp/`; the compact retained receipt is the durable summary.

| Check | Result | What it establishes |
| --- | --- | --- |
| Root unit gate, 123 files | 922 passed, zero failures/skips | ADMIN contracts, recovery/financial regressions, catalogs and memory-helper checks |
| Worker suite with Redis enabled | 543 passed, zero failures/skips | Actual HTTP fixtures, both read-route branches, report/KeepAlive consumers, cache/lease/duplicate/financial safeguards |
| Dedicated native recovery fixture | 1 compound scenario passed, zero skips | Two stale workers, five reset races, true-rejection threshold, counter-only action, foreign-owner/reservation conflict, exact cache cleanup, wrong-account rejection |
| Report browser harness | 102 passed, no page errors | Five existing report surfaces, ar/en/bn, 360/390/768/1280/1440 widths, 401/403/500, loading/review/busy/pending/empty states |
| Root and worker TypeScript/build | Passed | Current production compilation; no schema change |
| Focused source ESLint | Passed; stale Browserslist database warning | Changed web/shared source consistency; not a whole-repository lint claim |
| Spec Kit integration | CLI 1.2.5; zero missing managed files | Existing six customizations preserved; missing converge skill bootstrapped from official CLI |

The unit gate initially needed the existing Python executable and permission to create its disposable Git fixture. Sandboxed Turbopack initially failed to connect to its CSS child process; the same production build passed outside that sandbox with synthetic loopback configuration. Those environment failures are retained as context, not reported as code defects or silently counted as passing checks.

Native services: PostgreSQL 17.11 and officially downloaded, validly signed Memurai-for-Redis 8.2.0, reporting Redis API 8.2.10. They ran as temporary loopback processes, without Windows service installation, PATH/firewall changes or persistent cache data. Test Node sockets were restricted to the two owned ports. This is real SQL/Redis-API concurrency evidence on Windows, not a Linux Redis/PM2 deployment rehearsal. The fixture uses Prisma Date decoding, matching the actual login revision reader; raw pg's local timestamp parser is not used as its revision source.

Sources: [PostgreSQL Windows binary distribution](https://www.postgresql.org/download/windows/), [Memurai developer download](https://www.memurai.com/get-memurai). Cleanup verified: no test schemas, Redis database size zero, both processes/listeners stopped, and the validated temporary native-runtime directory removed. The separate ignored Spec Kit CLI runtime remains available for this project.

## Semantic acceptance review

| Requirement / acceptance | Evidence and countercheck | State |
| --- | --- | --- |
| FR-021; AC01/05 | Both actual deferred queue branches select direct while stored proxy snapshot stays byte-equivalent; existing operation-route/precise-renewal regressions preserve purchase route and proof | VERIFIED locally |
| FR-022/023; AC02–04 | GET/POST/tunnel/CAPTCHA-image402,407,429,5xx,DNS,timeout; explicit rejection vs generic redirect/form/cached title; no credential POST on rejected GET | VERIFIED locally |
| FR-024; AC01/03/07 | Shared tracking call-site inventory; KeepAlive three-account fixture; report reader; native stale revision and threshold tests; no automatic activation | VERIFIED locally |
| FR-025; AC07/08 | Both real ADMIN routes, owner/reservation conflicts, native transaction/Lua checks; counter-only leaves disabled state | VERIFIED locally |
| FR-026; AC04/08 | Additive review fields, unchanged historical reasons, three-language tokens and real component browser states | VERIFIED locally |
| FR-027; AC06/09 | Shared cache strips purchase state; native other-account/budget/operation-key and balance preservation; complete financial regression suites; safe error allowlist | VERIFIED locally |
| FR-028; AC10 | Current builds, native local checks, documented parity/drain/manual restore/two-cycle/rollback procedure | VERIFIED local preparation; production NOT_VERIFIED |

No test sent a real Pay or provider purchase. Financial regression assertions are synthetic; they do not reconcile historical production purchases or invoices. No new migration or historical error backfill was made.

## UI review (separate judgment)

`LoginMonitorPanel` and the existing account reset action reuse Button/Card/Badge/Table and foreground/muted/border tokens; no new component library or layout system. Unknown reasons say login review, while reset-counter copy explicitly says it does not enable the account. Busy conflicts retain the row and expose a translated explanation; repeated clicks remain one pending request. Existing ADMIN gate and localized accessible button names remain.

Mobile Arabic at 360px was visually inspected using `output/panel-ui/login-review-ar-360.png`; horizontal scrolling remains inside the existing table rather than the page. This wide operational table requires horizontal movement to reach actions. Scoped visual score: 8/10 for clear hierarchy, readable RTL copy and preserved interaction states; wide-table discoverability remains an existing limitation, not a redesign claim. Desktop/tablet and other languages have mechanical overflow/state coverage. No whole-product accessibility certification or native mobile-app claim.

## Open external and historical gates

- NOT_VERIFIED: production source/artifact parity, actual worker inventory/count, drain, release/rollback execution, fresh beIN direct authentication and two complete KeepAlive cycles after one manual activation.
- NOT_VERIFIED: Linux Redis/server-version acceptance; Windows Memurai evidence is identified above without equating it to production.
- NOT_VERIFIED: historical 036 `evidence/plan-guard.json`, complete migration provenance and prior audit/release obligations. This local 027 contract does not replace that missing historical file.
- No guarantee of zero errors or successful provider access; use the reviewed runbook and retain unknown financial outcomes.
