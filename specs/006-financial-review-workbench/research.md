# Research: Financial Review Workbench

## Decision: Separate review actions from Integrity Reports

**Rationale**: Integrity Reports is analytics-heavy and currently mixes scan controls, financial totals, issue types, and dense rows. A decision workflow needs a narrow page focused on "what needs a decision now?".

**Alternatives considered**:

- Add another section to Integrity Reports: rejected because the user already finds the page confusing.
- Replace Integrity Reports entirely: rejected because scans and analytics are still useful.

## Decision: Use financially impacted `REVIEW_REQUIRED` operations as the primary queue

**Rationale**: The worker and cron safety paths already move uncertain financial outcomes to `REVIEW_REQUIRED`, but the admin review page must not become an all-operations log. A case belongs in the queue only when the outcome is suspicious/incomplete and there is user/customer money deducted, held, refund-blocked, or final provider payment uncertainty after deduction.

**Alternatives considered**:

- Use `OperationIntegrityIssue` rows as the queue: rejected because they describe mismatch analytics and may not map cleanly to refund decisions.
- Use transactions only: rejected because missing beIN evidence and response messages live on operations.
- Include every operation: rejected because normal operations belong in history/reports, not the financial review workbench.

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

## Decision: Add card verification as a separate evidence step

**Rationale**: A balance delta or log message may still leave the admin unsure whether the customer's card was actually renewed. A safe card check gives the admin current beIN-visible evidence without submitting another renewal or touching money.

**Alternatives considered**:

- Rely only on worker logs: rejected because logs explain process steps, not the customer's current card state.
- Rely only on beIN balance delta: rejected because balance can move for other operations and may not prove the target card changed.
- Auto-run card checks for every review item: rejected because beIN checks can be slow, proxy-dependent, and should be intentional.

## Decision: Primary UI text must be plain language

**Rationale**: The current report table exposes internal issue codes and dense financial columns. The admin needs simple business labels first: "money taken from user", "beIN appears charged", "card check did not confirm renewal", "refund already done", and "needs follow-up".

**Alternatives considered**:

- Keep technical codes and add tooltips: rejected because the main problem is operational confusion.
- Remove technical codes entirely: rejected because developers may still need advanced details during support.

## Decision: Verification informs decisions but does not decide automatically

**Rationale**: A card check can fail, return stale data, or be hard to compare with the selected package. The system should recommend the next action, but refund/no-refund must remain an explicit admin action with a note.

**Alternatives considered**:

- Auto-refund after a failed card check: rejected because the failure could be a proxy or beIN availability issue.
- Auto-close after a matching card check: rejected because customer evidence may still conflict and admin should record the reason.
