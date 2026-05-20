# Data Model: Renewal Confirmation Session Safety

## Operation Response Data

Existing JSON evidence attached to an operation.

Fields used by this feature:

- `operationPhase`: Current safety phase.
- `jobType`: Worker job that wrote the evidence.
- `finalPaySubmitted`: Boolean evidence that final beIN Pay started.
- `finalPaySubmittedAt`: Timestamp for final Pay evidence.
- `smartcardType`: Card type selected during package loading.
- `dealerBalance`: Balance captured during package loading.
- `dealerBalanceBefore`: beIN balance before final Pay.
- `dealerBalanceAfter`: beIN balance after final Pay.
- `outcomeCategory`: Final payment outcome classification.

Validation rules:

- Missing data is allowed and treated as unknown.
- String and object shapes must both be accepted.
- Malformed string data must not crash the worker.
- `finalPaySubmitted` must only be trusted when it is the boolean `true`.

## Operation-Scoped Session

Redis data keyed by operation id and used for final confirmation.

Fields:

- `cookies`: Authenticated beIN cookies.
- `viewState`: Operation-specific hidden fields, optionally compressed.
- `accountId`: beIN account used to prepare the package.
- `expiresAt`: Session expiration timestamp.
- `loginTimestamp`: Login timestamp.
- `lastLoginTime`: Human-readable last login time.

Validation rules:

- The session must include usable ViewState for final confirmation.
- Missing session before final Pay is a pre-final-payment failure unless other final Pay evidence exists.

## Final Pay Evidence

Evidence that beIN final Pay may have charged the owner account.

Fields:

- `finalPaySubmitted`: Must be true only after final Pay submission starts.
- `finalPaySubmittedAt`: Timestamp written at the same time.
- `operationPhase`: `FINAL_PAY_SUBMITTED` or `POST_FINAL_PAY_REVIEW`.

State transitions:

```text
PACKAGE_PREPARATION
  -> FINAL_CONFIRMATION
  -> FINAL_PAY_SUBMITTED
  -> COMPLETED or REVIEW_REQUIRED or FAILED-with-safe-refund
```

Important rule: `COMPLETING` status alone is not enough to prove final Pay started when phase evidence says pre-final-payment.
