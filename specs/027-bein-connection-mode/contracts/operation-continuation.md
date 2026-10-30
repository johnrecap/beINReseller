# Contract: Operation Continuation Route Stability

## Operation Start

When a beIN operation starts and selects an account, store an operation route snapshot in `responseData.beinRoute`.

Snapshot fields:
- `mode`
- `routeKey`
- `accountId`
- optional `proxyId`
- optional `proxyLabel`
- `createdAt`

## Continuation Steps

Continuation steps include renewal completion, promo apply, final confirmation, cancellation confirmation, signal flows, and installment continuations when they restore or reuse a beIN session.

Rules:
- If `responseData.beinRoute.accountId` matches the current beIN account, use that route.
- If the step intentionally switches to a different beIN account, compute and store a new route snapshot for the new account.
- If no route snapshot exists, use legacy assigned-proxy behavior.
- Never override a valid purchase/confirmation/payment route snapshot. Exception: deferred fulfillment verification reads (v1 and v2) resolve current mode once on the original account. They never overwrite the purchase snapshot, replay Pay, or promote display-only reports to financial proof.

## Failure Behavior

If a stored route cannot be used because the account/proxy record is missing:
- Do not silently switch to another route.
- Fail safely or recompute only when the flow intentionally switches to a new account.
- Keep error messages operationally clear and avoid exposing secrets.
