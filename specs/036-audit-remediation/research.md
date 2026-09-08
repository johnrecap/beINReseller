# Research and decisions

## D19 — Resume local backlog without repeating accepted repairs

The approved local sequence reuses T059-T066 and narrows each original task to its remaining acceptance. Remove only scheduling dependencies unsupported by runtime contracts: auth versus review UI, local preflight versus provider attestation, UI versus deployment runbook. Keep test-before-change and sequential shared-file integration. Preserve final release dependencies and evidence holds. New review capabilities reuse existing strict finalizers and existing adjudication/effect tables; no alternate money ledger or replacement queue.

**Review repairs — 2026-09-08:** T059-T066 complete; T016/T017 reaccepted after fixing the reopened handoff, pre-sale closure and network-deadline gaps. **18/54 active tasks accepted.** 149 focused tests, 55 synthetic PostgreSQL tests, 8 Redis tests and 10 mocked-browser scenario groups pass; root/worker types pass. Phase 3/provider/migration/build/release gates remain open. [Current evidence](evidence/review-repairs.md). Earlier dated counts/results below are historical.

## D18 — Review repair decisions (2026-09-08)

Reuse the legacy owner key with an explicit parked marker and atomic compare-and-set, then transition through the existing execution lease. Use current operation/account/revision locks to close only positively observed pre-cart, zero-financial-effect quote conflicts; retain all unknown-state vetoes. Reuse current identity validation and existing maintenance scheduling. Network timeout is an ambiguous outcome, so retry identity stays fixed. No schema or migration changes are needed for these repairs. See [contract](contracts/review-repairs.md) and [runtime evidence](evidence/review-repairs.md).

**Historical research date**: 2026-09-07. **Evidence at planning**: local source and prior read-only audit; no runtime checks at that stage.
**Scope**: decisions for feature 036, not a claim that fixes exist.

## D01 — A separate remediation feature

- Decision: use 036 with one audit register and task graph, retaining 034/035 history and the current dirty branch.
- Rationale: The current scope covers panel financial, offer, authentication and worker defects. Store and phone-app delivery are excluded.
- Alternatives: amend 035 (obscures prior scope/evidence); rewrite architecture (unnecessary blast radius).
- Sources: `specs/035-renewal-fulfillment-proof/plan.md`; `specs/034-web-project-memory/tasks.md`.

## D02 — Installments need explicit evidence semantics

- Decision: add an operation purpose and installment mutation/evidence family; derive no-charge eligibility from authoritative installment response context, not renewal report absence or caller flags.
- Rationale: installments currently have type RENEW but do not produce FINAL_OK renewal proof fields. A blanket guard exemption would reintroduce unsafe refunds.
- Alternatives: relax all RENEW refunds (rejected); synthesize sold-report proof (rejected).
- Sources: `worker/src/http-queue-processor.ts:5711`; `worker/src/utils/error-handler.ts:97`; `src/lib/operations/renewal-creation-guard.ts:171`.
- Contract: installment no-charge settlement must atomically lock operation and deduction, validate the exact last mutation/evidence, return canonical money once, close status, and release only safe claims.

## D03 - Retired from active panel delivery

This store-specific decision is excluded by the [panel-only scope amendment](evidence/panel-only-scope-amendment.md). Prior schema, code and verification remain historical evidence; no additional implementation is required here.

## D04 - Retired from active panel delivery

This store-specific decision is excluded by the [panel-only scope amendment](evidence/panel-only-scope-amendment.md). Prior schema, code and verification remain historical evidence; no additional implementation is required here.

## D05 — Latest evidence and legacy reviews are separate concerns

- Decision: finalizers validate the latest locked attempt and update derived operation fields within their transaction. Add explicit modern/pre-mutation/installment/legacy/conflict review classification.
- Rationale: stale CHECK_FAILED fields can currently veto a newer valid negative attempt; old null fields cannot meet modern proof requirements.
- Alternatives: overwrite old evidence globally (destroys history); allow all admin confirmations (weakens proof); leave every legacy case permanently unresolvable (operational dead end).
- Sources: `worker/src/http-queue-processor.ts:3231`; `worker/src/lib/renewal-no-charge-finalization.ts:105`; `src/lib/operations/manual-fulfillment-finalization.ts:200`.
- Legacy repair imports verifiable original facts only. Separate adjudication records may authorize an explicitly classified legacy/manual outcome; they never claim automated composite proof.

## D06 — Reuse central auth, retain separate trust domains

- Decision: replace route-local panel credential helpers with getAuthenticatedUser, preserving route permissions and ownership.
- Rationale: central DB/current-user checks already exist. Customer/store guards remain separate.
- Alternatives: middleware-only fix (API bypass); duplicate per-route session validation (drift).
- Sources: `src/lib/auth-utils.ts:38`; `src/lib/auth-utils.ts:343`; `src/app/api/operations/start-renewal/route.ts:21`.

## D07 — Revision-aware preparation, stable irreversible identity

- Decision: add actionRevision for APPLY_PROMO/preparation; revision zero is the immutable final payment key. Authoritative selected quote freezes package and price before debit.
- Rationale: unique operation/job currently rejects a new promo payload or reuses a completed dispatch.
- Alternatives: delete the old dispatch (loses evidence); random job ID for final payment (duplicate risk).
- Sources: `src/lib/operation-dispatch.ts:54`; `src/app/api/operations/[id]/apply-promo/route.ts:89`.
- Promo-name review: choose a quote snapshot/revision plus explicit renewed consent over matching provider rows by index/checkbox or similar text. The source does not establish a permanent product ID. Separate the draft code from the applied snapshot, preserve card type during fallback, and require evidence that the offer is applied. Keep immutable COMPLETE_PURCHASE identity and proof guards; a safe restart cannot bypass canonical closure. See [source findings, alternatives and test matrix](evidence/phase-4-promo-name-review.md).

## D08 — Recovery must have a declared owner

- Decision: extend the existing maintenance runner with generic bounded dispatch and durable completion-effect draining; preserve captured points repair.
- Rationale: the current watchdog retries only CONFIRM_PURCHASE, and completion side effects can be lost after status commit.
- Alternatives: rely on an undocumented external cron (unverifiable); add a second competing uncoordinated daemon (duplicate work).
- Sources: `src/lib/operation-dispatch.ts:271`; `src/lib/maintenance/operation-maintenance-runner.ts:155`; `worker/src/lib/fulfillment-finalization.ts:693`.
- Default retry budget: five total attempts (initial plus four retries at 5s/30s/2m/10m), 50 rows/cycle, hard batch cap 200; indexes on state/nextAttemptAt; terminal exhaustion with reason. Existing provider Pay remains single-attempt.

## D09 — Account eligibility and real verification are admission gates

- Decision: explicit account readiness, completed live read-only adapter, sanitized attestation writer, and stale-evidence handling. No account mass opt-in or fabricated attestation.
- Rationale: automationExclusive defaults false; ENFORCE needs a current attestation; the present live command always reports the session adapter unavailable.
- Sources: `prisma/migrations/20260824130000_sold_report_fulfillment_correlation/migration.sql:37`; `shared/operations/renewal-fulfillment-config.ts:7`; `scripts/verify-sold-report-contract-correlation.ts:249`.
- New automatic admission fails before deduction/mutation when readiness is unavailable. An explicitly selected REVIEW_ONLY policy may admit review-backed work with operator-visible limits. In-flight work never repeats Pay because attestation expires; evidence collection may continue and completion follows current proof authority.

## D10 — Additive migration and staged validation

- Decision: new migrations only, compatibility classification before strict cutover, isolated rehearsal and separately authorized live release evidence.
- Rationale: applied migration set and production rows are unknown. Panel legacy deductions and evidence need classification before cutover.
- Alternatives: edit applied SQL, db push, global history rewrite, or blind rollback after new money records (all rejected).
- Sources: `prisma/migrations/20260824150000_canonical_bein_account_identity/migration.sql`; `ecosystem.config.js`.
- Spec Kit bootstrap: modified shared scripts/templates inspected; keep customization. No forced upgrade, branch fetch, or optional auto-commit.

## D11 - Retired by web-only scope amendment

Phone-app replacement delivery is excluded. Existing code/history remain intact; no app availability gate applies to web release. See evidence/web-only-scope-amendment.md.

## Uncertainty disposition

Phase 4 implementation evidence is in `evidence/phase-4-implementation.md`.
Source dependency review separated T016 quote preparation from T012 post-payment
installment/no-charge acceptance; T012 remains a T050 release dependency. Quote
drift uses an existing review hold, never speculative refund/restart. JSONB
canonical equality preserves values and array order; only zero omission is
normalized. Explicit REMOVE must distinguish null from absence. Synthetic and
mocked browser checks prove these paths locally, not real provider compatibility.

No product question blocks document completion. Actual migration history, account exclusivity, provider invoice compatibility, live process inventory, and data anomalies remain UNKNOWN and are mapped to T052-T055. Their absence blocks relevant release gates, not honest completion of planning.
