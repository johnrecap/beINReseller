# Contract: Manual Review Evidence

## Purpose

Define the minimum information an admin needs when automation stops to avoid owner loss.

## Required Review Data

- Operation id
- Customer/user id
- Card number, masked if shown outside admin context
- Operation type
- Selected package name and price
- Internal deducted amount
- Refund status
- beIN account label/username snapshot
- beIN balance before final Pay
- beIN balance after final Pay
- Outcome category
- Reason automation stopped
- Worker timestamp
- Last visible beIN message, if safe to store

## Admin Actions

- Mark operation completed
- Refund customer
- Keep pending review
- Add correction transaction
- Add admin note

## Safety Rules

- Admin action must create an audit trail.
- Refund action must still respect duplicate-refund guard.
- Completing an operation must not create a refund.
- Correction transactions must explain why the correction was made.
