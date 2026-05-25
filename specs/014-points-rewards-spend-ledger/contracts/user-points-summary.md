# Contract: User Points Summary In User Lists

## Purpose

Expose point summaries beside balances in admin and manager user-management views.

## Admin Users API

Existing admin users listing responses must include a `points` summary for each user row.

### Response Shape Addition

```json
{
  "id": "user_1",
  "username": "customer1",
  "balance": 25,
  "points": {
    "available": 40,
    "lifetimeEarned": 75,
    "converted": 20,
    "reversed": 15,
    "legacy": 0
  }
}
```

## Manager Users API

Existing manager users listing responses must include the same `points` summary for managed users only.

## Authorization

- Admin endpoint: exact admin role or existing admin authorization rule.
- Manager endpoint: manager role and existing manager-user ownership filtering.
- No endpoint may expose point summaries for users outside the current viewer's scope.

## Aggregation Rules

- Summaries must be based on point ledger entries grouped by owner.
- Use a batched query for all listed users to avoid per-row point aggregation.
- Legacy entries must be shown only in the `legacy` field if retained for audit, not mixed into spend-earned available totals unless explicitly classified as convertible.

## UI States

- Loading: table may show current skeleton/loading state.
- Empty: zero users remains empty list; no point-specific error.
- No point activity: show zero point values.
- Aggregation failure: show the page-level error pattern already used by the relevant users page.
