# Contract: Payment Outcome Classification

## Purpose

Define the decision rules after final beIN Pay so automation does not refund the customer when beIN may have charged the dealer account.

## Inputs

- Operation id
- Customer/user id
- Internal deducted amount
- beIN account id
- Selected package
- Final Pay response text
- beIN balance before Pay, when available
- beIN balance after Pay, when available
- Error category, if the request failed
- Whether final Pay was submitted

## Output Categories

### CONFIRMED_SUCCESS

Use when:
- beIN success text is found, or
- beIN dealer balance decreased by an amount compatible with the selected package.

Required result:
- Complete operation.
- Do not refund.
- Store evidence.

### CONFIRMED_NOT_CHARGED

Use only when:
- final Pay was not submitted, or
- final Pay returned a clear pre-charge validation failure, and
- beIN balance is confirmed unchanged when balance evidence is needed.

Required result:
- Fail or cancel operation.
- Refund is allowed if customer was deducted.
- Store evidence.

### UNCERTAIN_REVIEW_REQUIRED

Use when:
- final Pay was submitted and result is busy, timeout, no confirmation, login redirect, unreadable, connection failed, or balance cannot be verified.

Required result:
- Move operation to review.
- Do not refund automatically.
- Store evidence and reason.

## Non-Negotiable Rule

After final Pay has been submitted, unknown outcome means review, not refund.
