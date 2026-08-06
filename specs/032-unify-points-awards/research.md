# Research: Unified Operation Spend Points

## Decision: Use one shared pure award policy

**Rationale**: Current web and worker code have separate recipient-routing logic. That is the root cause of inconsistent admin-owned behavior. A pure shared policy gives both sides the same eligibility and recipient decisions while keeping database access local to each runtime.

**Alternatives considered**:

- Keep duplicated web and worker logic and update both. Rejected because future changes can drift again.
- Move all awarding into a web API called by worker. Rejected because it couples worker reliability to a live web request and adds operational failure modes.
- Put shared code under the worker and import it from web. Rejected because the web app currently excludes worker code.

## Decision: Admin-owned direct users receive normal user points

**Rationale**: User decision is explicit: the user under admin receives points, not the admin. The normal-user rate is the clearest existing rate bucket for that behavior.

**Alternatives considered**:

- Admin receives manager-rate points for direct users. Rejected by user decision.
- Create a new admin-owned-user rate bucket. Rejected for first release because the user asked to fix the logic, not introduce another rate field.

## Decision: Unowned users receive no points

**Rationale**: Awarding unowned users is risky because it can hide dirty ownership data. A legacy admin-created fallback is allowed only when there is no current owner evidence and the creator is an active admin.

**Alternatives considered**:

- Award every active normal user even with no owner. Rejected because it can grant points to records with broken ownership.
- Block legacy admin-created users. Rejected because existing production data may still represent admin ownership by creator only.

## Decision: Manager ownership keeps precedence over agent assignment

**Rationale**: Existing web and worker code already prioritize manager ownership when present. Keeping this precedence avoids changing manager-owned behavior while transfer cleanup work handles dirty ownership separately.

**Alternatives considered**:

- Agent assignment wins over manager ownership. Rejected because it would change current manager-owned behavior and could surprise admins.
- Award all detected owners in dirty data. Rejected because it can double-award.

## Decision: Manual charged financial review should award points

**Rationale**: If admin confirms that a completed operation was charged and should be closed as completed, it should not be excluded from operation-spend points. The same idempotent award process prevents duplicates.

**Alternatives considered**:

- Keep manual financial-review closure excluded. Rejected because it creates a completed-operation path with missing points.
- Require manual points adjustment by admin. Rejected because it is error-prone and not consistent with automatic completion paths.

## Decision: Capture The Entire Award Decision At Operation Completion

**Decision**: In the same transaction that changes an operation to `COMPLETED`, lock the subject user and persist one immutable operation-spend run containing ownership, settings, rates, recipients, points, and skipped evidence.

**Rationale**: Current wrappers read live state after completion. A crash, delayed retry, transfer, or settings change can therefore redirect recipients or change the amount of points for a historical operation.

**Alternatives considered**:

- Capture owner id only: rejected because later rate/toggle changes still change the outcome.
- Resolve everything at final award time: rejected because that is the observed race and contradicts completion-time ownership.
- Award inside every completion writer with duplicated code: rejected because it repeats policy and makes multi-recipient atomicity inconsistent.

## Decision: Separate Atomic Capture From Atomic Finalization

**Decision**: Completion commits one `CAPTURED` or `SKIPPED` run. A common finalizer locks the run, inserts the full positive recipient set, and marks it `AWARDED` in one transaction.

**Rationale**: Keeping capture in the business completion transaction freezes evidence without making external/retry scheduling part of that transaction. Run-level finalization prevents partial multi-recipient awards and serializes web/Worker retries.

**Alternatives considered**:

- `createMany(skipDuplicates)` without a run: rejected because uniqueness is per owner, so a transferred owner can receive an extra row and requested rows may be reported as awarded even when skipped.
- One transaction spanning provider work and award: rejected because it would hold database locks across slow/external work.

## Decision: Persist Skipped Outcomes

**Decision**: Disabled, pre-start, non-renewal, non-positive, invalid/unowned, and all-zero decisions are stored as `SKIPPED` runs with a stable reason. If at least one recipient remains positive, the run is `CAPTURED` and zero-rate recipients remain in its snapshot with their zero reasons.

**Rationale**: Without durable skip evidence, a later program/rate change can turn a previously ineligible completed operation into an award on retry.

## Decision: Customer-Only Operations Skip Without Panel Ownership

**Decision**: If an operation has `customerId` but no panel `userId`, capture a durable `SKIPPED` run with `CUSTOMER_OPERATION_NOT_ELIGIBLE`, null ownership/program/rate/recipient evidence, and the exact completion identity.

**Rationale**: Customer/mobile operations share completion writers with reseller operations but do not have a panel owner. Treating absent `userId` as an invariant error can roll back a successful provider operation or wallet change.

## Decision: Persist Bounded Finalization Backoff

**Decision**: Store only a bounded attempt count, attempt/next-attempt timestamps, and an allowlisted safe error code. At the attempt limit, transition the run to `LEGACY_REVIEW_REQUIRED` with `FINALIZATION_RETRIES_EXHAUSTED`.

**Rationale**: Ordering every retry by the original capture time lets a small set of permanent failures occupy every maintenance batch and starve newer valid runs.

## Decision: Missing Historical Snapshots Require Review

**Decision**: Existing pre-cutover records are untouched. After cutover, a completed operation without a run—or one with pre-existing unlinked operation-spend rows—atomically creates/reads one minimal unique `LEGACY_REVIEW_REQUIRED` sentinel with safe operation identity and null ownership/rate/recipient evidence, then receives no automatic award.

**Rationale**: Current ownership cannot prove historical ownership. Automatic inference would grant rewards without auditable completion-time evidence.

## Decision: Signal Check Owns The Reused Signal Operation Decision

**Decision**: The existing signal-check step is the one canonical completion for its operation id. Signal activation may temporarily reopen that same operation for provider work, but it preserves the original completion timestamp and only re-observes/finalizes the existing skipped run.

**Rationale**: The schema deliberately allows one immutable run per operation. Capturing both signal check and later activation with different timestamps/sources would either overwrite historical evidence or produce an unavoidable identity conflict. Signal operations are non-spend, so preserving the first skipped decision is both safe and behaviorally compatible.

**Alternatives considered**:

- Create a second run for the same operation: rejected because it breaks the one-run invariant and complicates ledger idempotency.
- Replace the signal-check run during activation: rejected because immutable completion evidence must never be rewritten.
- Create a distinct activation operation: deferred because it is a larger product/API migration outside this ownership-and-points change.

## Decision: Activate Cutover Only After Mixed-Version Risk Ends

**Decision**: Add a nullable cutover timestamp and set it only after additive migration, compatible web, and every Worker process are deployed.

**Rationale**: During rolling deployment, old processes can complete operations without runs. Keeping cutover inactive avoids classifying those mixed-version completions as post-cutover invariant violations before all writers are compatible.

The activation command must call the same count-complete read-only preflight as the audit and refuse unresolved invariants; a release-id string is attestation, not evidence by itself.

## Decision: Serialize Financial-Review Decisions

**Decision**: Lock and re-read the operation inside the decision transaction, validate it is still `REVIEW_REQUIRED`, then apply one guarded charged/refund/follow-up transition.

**Rationale**: Two administrators can otherwise act on the same stale read, allowing a refund and a completed/awarded result to overwrite one another.

## Decision: No historical automatic rewrite

**Rationale**: Historical point entries are financial-adjacent records. Rewriting them without a separate audit would be risky.

**Alternatives considered**:

- Automatically backfill old completed operations. Rejected because it can create unexpected balance-equivalent rewards.
- Delete old wrong admin entries. Rejected because historical corrections need a separate reviewed plan.
