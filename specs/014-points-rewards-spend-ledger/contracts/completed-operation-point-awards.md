# Contract: Completed Operation Point Awards

## Purpose

Define the internal accounting contract for creating point ledger entries when a subscription operation becomes `COMPLETED`.

## Trigger

The award processor is invoked whenever an operation reaches `COMPLETED`, including retry/recovery paths that may re-observe a completed operation.

## Input

```json
{
  "operationId": "operation_1",
  "status": "COMPLETED",
  "userId": "user_1",
  "amount": 100,
  "completedAt": "2026-05-25T10:30:00.000Z"
}
```

## Processing Rules

1. Ignore non-completed operations.
2. Ignore operations with `amount <= 0`.
3. Ignore operations completed before `pointsStartAt`.
4. Ignore operations when `pointsEnabled=false`.
5. Resolve ownership:
   - manager link exists: manager only,
   - else active agent assignment exists: user and agent,
   - else direct user: user only.
6. Calculate each recipient's points from `operation.amount` and the applicable rate snapshot.
7. Create one `OPERATION_SPEND` ledger entry per recipient if calculated points are positive.
8. Treat zero calculated points as a no-op, not an error.
9. Reprocessing the same operation must not create duplicate entries.

## Output

```json
{
  "operationId": "operation_1",
  "awarded": [
    {
      "ownerUserId": "manager_1",
      "ownerRole": "MANAGER",
      "points": 0.3,
      "ratePerThousandSnapshot": 3,
      "amountUsdSnapshot": 100
    }
  ],
  "skippedReason": null
}
```

## Reversal Contract

When a completed operation with awarded points is refunded or corrected after completion:

1. Find all positive `OPERATION_SPEND` entries for the operation.
2. Create matching negative `POINT_REVERSAL` entries for each owner.
3. Store the original operation id and original ledger entry id in source metadata or a stable source id.
4. Do not delete original earn entries.

## Failure Handling

- If owner resolution fails because the recipient is deleted or inactive, do not assign points to a fallback owner.
- Log the skipped award with enough operation and ownership context for admin review.
- Retrying must be safe.
