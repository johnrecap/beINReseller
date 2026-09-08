# Review repair contract — 2026-09-08

This supplements financial-lifecycle, consumer-api and jobs-and-release; money/proof constraints are unchanged.

- Account handoff is an exact-owner Redis CAS after the last preparation HTTP/session action. Only explicitly parked same-operation locks may move across worker IDs. Active foreign/same-operation owners and existing leases remain exclusive. A lost CAS blocks publication.
- A quote conflict before Add/Sell can atomically close with zero refund only while the current execution fence, operation revision/snapshot, panel ownership, zero amount/deductions, NOT_SUBMITTED provider state, no mutation/spend/proof and no final-payment dispatch all agree. Persist a safe reason, cancel pending preparation work and release both reservations under canonical locks. Otherwise retain review. A delayed worker result cannot resurrect a closed operation. Existing historical holds are not inferred safe from absent fields.
- Panel auth uses current identity/role/isActive/passwordChangedAt before reads or writes; preserve endpoint-specific ownership and shared non-panel boundaries. CHECK_BALANCE is a rejected legacy card input, not an alias for account CHECK_ACCOUNT_BALANCE.
- Maintenance polls bounded all-type outbox work; stable job identity handles uncertain queue acknowledgement. Exhausted promo delivery affects only the matching pending quote revision and produces FAILED quote state; unrelated/newer/terminal states remain unchanged. Final financial dispatch keeps its existing safe recovery path.
- The promo UI has a real elapsed deadline covering response body parsing as well as fetch. Timeout aborts work locally and preserves uncertain POST identity; it never assumes the server cancelled an admitted request. Review closure note is trimmed 1..2000 characters with catalog-backed feedback.
- No new migration is planned. Provider settlement receipts/cart-total HTML, old in-flight quotes, explicit account opt-in, migration provenance, live attestation and production topology require actual source or separately authorized evidence. Lack of evidence cannot be converted to success.

Verification: test-first actual modules plus focused Q02/Q03, synthetic Q04 and isolated Q05 where available, noEmit/lint and deterministic browser checks. Reconcile original task acceptance only when its full criteria have evidence.
