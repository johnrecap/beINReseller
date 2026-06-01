# Contract: Recovery And Manual Review

## Recovery Classification

**Inputs**:

- Operation status.
- Operation amount.
- Whether reseller deduction exists.
- Whether refund already exists.
- Final payment phase evidence.
- Provider outcome evidence.
- Dispatch status and attempt count.
- Heartbeat and final confirmation deadlines.

**Required decisions**:

- Before final Pay: retry dispatch, expire, fail, or refund when safe.
- After final Pay may have started: review unless confirmed no-charge evidence exists.
- Confirmed provider charge: complete or keep completed.
- Confirmed provider no-charge: allow exactly one reseller refund if money was deducted.
- Legacy ambiguous `COMPLETING`: choose review when money was deducted and evidence is incomplete.

## Cleanup And Timeout Runners

**Required behavior**:

- Must not expire/refund after final confirmation if final payment dispatch or final-payment-started evidence exists.
- Must retry pending dispatch before deciding failure.
- Must not release account locks in a way that lets a second provider payment start for the same operation.
- Must be idempotent when multiple runners inspect the same operation.

## Manual Review Decision

**Actor**: Admin only.

**Required behavior**:

1. Admin can mark provider charged.
2. Admin can mark provider not charged and apply the correct refund once.
3. Admin can keep review open with a reason if evidence is insufficient.
4. Closed review leaves the unresolved review list.
5. Decision evidence remains visible for audit.

**Forbidden behavior**:

- Non-admins cannot close financial review.
- Review closure cannot duplicate reseller refunds or beIN spend ledger rows.
- Review closure cannot erase prior final payment evidence.
