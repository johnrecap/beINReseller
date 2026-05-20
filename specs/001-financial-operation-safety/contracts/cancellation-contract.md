# Contract: Cancellation Safety

## Purpose

Define when cancellation can refund automatically and when it must become manual review.

## Inputs

- Operation id
- Current operation status
- Whether final Pay has started
- Whether beIN outcome is known
- Whether customer was deducted
- Whether a refund already exists
- Whether operation is terminal

## Cancellation Decisions

### Safe Cancellation

Allowed when:
- Operation is before final Pay.
- Operation is not terminal.
- No external beIN charge is possible for the current stage.

Result:
- Cancel operation.
- Refund once if customer was deducted.

### Review Cancellation

Required when:
- Operation is in final confirmation or completing payment, or
- final Pay may have been submitted, or
- beIN outcome is unknown.

Result:
- Move to review.
- Do not refund automatically.

### Rejected Cancellation

Required when:
- Operation is already completed, failed, expired, review-required, or cancelled.

Result:
- Do not overwrite status.
- Do not refund unless a separate safe refund path has already approved it.

## Non-Negotiable Rule

Cancellation must not overwrite a completed operation.
