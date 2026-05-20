# Research: Financial Review Workbench

## Decision: Separate review actions from Integrity Reports

**Rationale**: Integrity Reports is analytics-heavy and currently mixes scan controls, financial totals, issue types, and dense rows. A decision workflow needs a narrow page focused on "what needs a decision now?".

**Alternatives considered**:

- Add another section to Integrity Reports: rejected because the user already finds the page confusing.
- Replace Integrity Reports entirely: rejected because scans and analytics are still useful.

## Decision: Use `REVIEW_REQUIRED` operations as the primary queue

**Rationale**: The worker and cron safety paths already move uncertain financial outcomes to `REVIEW_REQUIRED`. The summary API already extracts these operations and their audit evidence.

**Alternatives considered**:

- Use `OperationIntegrityIssue` rows as the queue: rejected because they describe mismatch analytics and may not map cleanly to refund decisions.
- Use transactions only: rejected because missing beIN evidence and response messages live on operations.

## Decision: Create operation-linked review decisions

**Rationale**: Admin financial decisions need an audit trail: who decided, when, action, note, and refund transaction if any.

**Alternatives considered**:

- Store decisions only in `operation.responseData`: lower migration risk, but weaker reporting and harder duplicate prevention.
- Use generic activity logs only: useful as secondary audit, but too generic for idempotent refund decisions.

## Decision: Refunds must be idempotent and operation-linked

**Rationale**: A review refund must never create duplicate money. Existing transactions already have `operationId` and type `REFUND`, so decision logic can check and block duplicates.

**Alternatives considered**:

- Use admin balance adjustment endpoint: rejected because it is not review-specific and can break traceability.
- Let admin manually add balance: rejected for the same audit and duplicate-risk reasons.

## Decision: Evidence should produce a recommendation, not an automatic action

**Rationale**: beIN outcomes can be uncertain, and the business risk of refunding after a real beIN payment is high. The UI should suggest "likely executed", "refund appears safe", or "needs follow-up", but the admin makes the final decision.

**Alternatives considered**:

- Auto-refund when beIN delta is missing: rejected because telemetry may be missing while beIN actually charged.
- Auto-close when beIN delta matches amount: rejected because admin still needs human confirmation for financial disputes.
