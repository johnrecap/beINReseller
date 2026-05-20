# Research: Financial Operation Safety

## Decision 1: Uncertain beIN payment outcomes must not auto-refund

**Decision**: Any unclear result after final Pay becomes manual review unless there is proof that beIN did not charge.

**Rationale**: The owner loses money if beIN charges the dealer account and the panel refunds the customer. Manual review is safer than automatic refund when the external result is uncertain.

**Alternatives considered**:
- Auto-refund on timeout: rejected because network failure after Pay does not prove beIN did not charge.
- Auto-complete on any balance read: rejected because balance can be stale or unrelated if not compared properly.
- Fail operation without refund: safer for owner but unfair to customers when non-charge is clear.

## Decision 2: Dealer balance delta is primary evidence after final Pay

**Decision**: Capture beIN dealer balance before and after final Pay when available. A decrease is evidence that beIN charged.

**Rationale**: Success text can be missing or localized. Balance movement is stronger evidence for financial outcome.

**Alternatives considered**:
- Success text only: rejected because beIN can return unclear pages.
- Customer balance only: rejected because customer balance is internal and cannot prove beIN charge.

## Decision 3: Late cancellation must become review-only

**Decision**: Cancellation is normal before final Pay and review-only during/after final Pay.

**Rationale**: Late cancellation can race with the worker and create a completed-on-beIN/refunded-in-panel mismatch.

**Alternatives considered**:
- Always allow cancellation: rejected due owner-loss race.
- Never allow cancellation: rejected because cancellation before Pay is safe and expected.

## Decision 4: Rollout must not rewrite live balances

**Decision**: Do not bulk-correct existing balances as part of this plan. Use reports and manual review for uncertain existing operations.

**Rationale**: The site is live. Bulk balance changes without a reconciliation pass can create new financial errors.

**Alternatives considered**:
- Automatic backfill/correction: rejected because it needs separate audit data and approval.

## Decision 5: Speed improvements are limited to pre-payment steps

**Decision**: Keep session and STB/package caching before final Pay, but never use stale cache to decide post-payment refund.

**Rationale**: Pre-payment speed is reversible. Post-payment safety is financial.

**Alternatives considered**:
- Cache final Pay decisions: rejected because prices, sessions, and beIN results can change.
