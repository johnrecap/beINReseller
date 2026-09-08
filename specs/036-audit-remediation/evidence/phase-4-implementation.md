# Phase 4 implementation — 2026-09-07

Scope: panel web T016/T017; synthetic local checks only. No provider requests,
worker daemon, restored/interactive database, migration or production action.

## T016 checkpoint

Accepted after independent source re-review and worker TypeScript noEmit pass.
Promo job/outbox identity uses action revision; payment identity remains zero.
JSONB object key order and omitted/explicit zero replay are normalized without
ignoring business values. Promo reload retains card/type context; unverified
fallback packages cannot certify an applied code. Fresh rematching requires a
unique exact price and normalized display name; drift becomes a fenced hold.

Focused evidence: worker promo suite 9 pass, PostgreSQL dispatch/publish/hold
suite 6 pass, zero skips. The hold test rejects stale revision/snapshot/state and
lost lease, and preserves newer evidence. Actual orchestrator reservation failure
test proves no financial closure calls. Legacy zero replay test reproduced a
payload conflict before the fix, then passed. Earlier connected worker proof
suite run: 53 pass. T017 selection failures remain until its implementation.

Independent reviewer identified and root fixed generic promo financial catch and
stale hold write. Hold writes retry at most three times under the same lease;
persistent current-owner write failure produces an unrecoverable failed job,
never another cart attempt or financial closure. If the database remains
unwritable, operation may remain COMPLETING and needs operator recovery.

## T017 test-first checkpoint

Actual packages GET lacks pending revision; actual final-confirm accepts stale
consent far enough to attempt a write. Both regressions reproduced before fixes.
These regressions now pass. T016/T017 are accepted after final independent review.
T012/T007/T008 remain open; Phase 4 acceptance is not production readiness.

## Final verification and connected impact

- Q02/Q03: **76 pass, 0 fail, 0 skip** across promo dispatch/quote, actual HTTP
  fallback/orchestrator, worker correlation and renewal orchestration suites.
  The existing orchestration suite includes source-contract checks; it is not a
  substitute for the actual adapter/API behavioral cases or live provider proof.
- Q04: **14 pass, 0 fail, 0 skip** in `tests/integration/promo-dispatch-revision-db.test.ts`.
  Includes locked current/stale/pending selection, edited/cleared draft rejection,
  stale/repriced final confirmation, concurrent confirmation with exactly one
  deduction/dispatch, and applied-code REMOVE admission → worker publication.
  All 71 synthetic business tables empty afterwards: `phase-4-db-cleanup.json`.
  An initial new selection test failed on the fixture's insufficient balance;
  corrected the synthetic starting balance to 500, then reran all 14. That was
  test setup, not a production defect. REMOVE separately reproduced false/true
  matching failure before its explicit-null fix.
- Q07: **six scenario groups pass** using the actual React page/components with
  isolated hooks and every network request fulfilled/aborted in the browser.
  No local application API/database/provider request was sent. 360px Arabic RTL,
  768px and 1280px cover keyboard package selection, 202 with old list, rename/reset,
  draft edits, explicit removal, accepted select/final payload, failed offer and
  identical transport retry. A resumed pending operation rejects a stale reply,
  reaches the 45-second polling bound and resumes explicitly (browser clock).
  Active Operations sends quote revision for renewal and preserves installment's
  separate endpoint/body. No unexpected console/page errors or horizontal overflow;
  intentionally aborted/injected network resource errors are excluded. Local harness
  and screenshots: `output/playwright/phase4-ui-smoke.cjs`, `phase4-ui-results.json`,
  `phase4-360-ar.png`, `phase4-768-en.png`, `phase4-1280-en.png`.
- Narrow design polish: package cards are keyboard buttons with aria-pressed,
  status uses aria-live, current code is distinct from draft, and confirmation
  wraps long names/buttons on narrow RTL screens. Changed quote flow score **8/10**;
  pre-existing English copy elsewhere in the wizard is outside this slice.
- Worker and focused web TypeScript noEmit pass. Focused ESLint: zero errors, three existing
  exhaustive-deps warnings in Active Operations. Full web TypeScript reports four
  out-of-slice errors: generated `.next/dev/types/app/api/operations/route.ts:52`
  RouteContext, and `tests/unit/audit-financial-context.test.ts:112,116,119`
  NODE_ENV typing. No full production build was run against the serving `.next`.
- Phase 3 hash comparison: **13/15 unchanged**, only the two intended HTTP adapter/
  processor files differ. Canonical locks, installment/no-charge/fulfillment
  finalizers, spend ledger, recovery and financial error handler are unchanged.
- Independent reviewer accepted T016, then found explicit REMOVE null fallback;
  fixed and regression-tested before final T017 acceptance. Root owns integration.

## Delivery and remaining limits

Changes are saved locally, not deployed. No schema or migration was added in this
slice, and no store/phone source was edited. Existing local beIN isolation and
stopped provider workers remain. Real beIN names/HTML/session behavior and account
readiness still need separately authorized provider/release evidence.

Deploy web and provider consumers together after existing preparation flows are
resolved/drained normally. Do not mix an old worker that ignores actionRevision
with new promo admission. Revision-zero financial job IDs remain stable; old
selected snapshots without quote consent fail closed and require refresh or
existing review/closure, not fabricated consent or repeated payment. Expired
selection windows still follow existing recovery and are not extended here.

Provider name/price drift never substitutes another package. A review hold retains
reservations/evidence; fresh restart requires canonical closure. Persistent DB
failure during hold publication is an unrecoverable failed job for operator
recovery, not automatic financial closure. T007/T008/T012 and combined release
verification remain open. Full TypeScript/build readiness is not claimed.
