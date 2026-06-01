# Research: Operation Lock Timeouts

## Decision 1: Keep deduction at final confirmation, add package-selection balance gate

**Decision**: Package selection checks reseller balance and blocks low-balance users, but does not deduct money. Final confirmation repeats the balance check and performs the only deduction.

**Rationale**: Package selection can be abandoned or timed out. Charging there creates unnecessary refund paths. A non-deducting balance gate gives fast feedback without changing financial ownership.

**Alternatives considered**:
- Deduct at package selection: rejected because abandoned operations would need refunds.
- Only check at final confirmation: rejected because users with low balance would hold a beIN account through unnecessary confirmation steps.

## Decision 2: Use one beIN account lock for the active operation

**Decision**: A beIN account assigned to a renewal stays unavailable to other operations until the active operation completes, cancels/fails before Pay, or enters manual review after evidence is saved.

**Rationale**: This isolates provider balance changes so a beIN dealer balance decrease can be attributed to one operation.

**Alternatives considered**:
- Lock only during Pay: rejected because package loading and confirmation can still leave stale balance assumptions.
- Never release until admin review closes: rejected by user clarification; review should use saved evidence and release the account.

## Decision 3: Use 30/10/10 second decision windows

**Decision**: Package selection gets 30 seconds. The package-details confirmation gets 10 seconds. Final payment confirmation gets 10 seconds.

**Rationale**: Short windows reduce account lock hold time and match the user's operational preference for fast decisions.

**Alternatives considered**:
- Keep current longer timeouts: rejected because they hold beIN accounts too long.
- Use a single 10 second timeout for all steps: rejected because package comparison needs slightly more time.

## Decision 4: Heartbeat every 2 seconds, cancel after 5 seconds missing before Pay

**Decision**: The preferred heartbeat design sends lightweight presence every 2 seconds and treats 5 seconds without heartbeat as customer exit before Pay.

**Rationale**: It detects exits quickly without writing heavy data every second. One second heartbeat remains acceptable only if implemented as a lightweight signal.

**Alternatives considered**:
- Current 15 second window: rejected because it leaves beIN accounts locked too long after exit.
- One second heartbeat with database writes: rejected because many active customers could create unnecessary load.

## Decision 5: Immediate leave signal is best effort only

**Decision**: The browser attempts immediate cancellation when the user leaves before Pay, but server-side heartbeat cleanup remains the reliable fallback.

**Rationale**: Browsers do not guarantee that a final network request will complete during tab close or navigation.

**Alternatives considered**:
- Rely only on browser leave event: rejected because it is not reliable.
- Rely only on heartbeat timeout: rejected because an immediate signal can release locks faster when it works.

## Decision 6: After Pay starts, exit cannot cancel

**Decision**: Once Pay has started or may have reached beIN, customer exit and missed heartbeat must not cancel or auto-refund. The operation must complete through provider verification or move to manual review.

**Rationale**: The worst financial failure is beIN charging while the panel cancels/refunds.

**Alternatives considered**:
- Cancel on exit even after Pay: rejected because it can create debt.
- Keep the account locked through review: rejected per user clarification; saved evidence must drive review, not the lock.

## Decision 7: Admin force unlock is operational only

**Decision**: Admin force unlock releases a stuck account lock and records an audit trail. It does not change operation status, refund money, or mark provider charge.

**Rationale**: Unlocking fixes capacity. It must not be a hidden financial decision.

**Alternatives considered**:
- Combine force unlock with review closure: rejected because it mixes operational recovery with money decisions.
- No admin unlock: rejected because stuck locks can stop production operations.
