# Contract: Admin beIN Spend Report

## GET `/api/admin/reports/bein-spend`

Returns summary totals, grouped account rows, and time buckets for confirmed beIN spend.

### Query Parameters

| Name | Required | Description |
|------|----------|-------------|
| `from` | yes | ISO date-time lower bound. |
| `to` | yes | ISO date-time upper bound. |
| `groupBy` | no | `none`, `day`, `week`, or `month`. |
| `beinAccountId` | no | Filter by beIN account id. |
| `userId` | no | Filter by panel user id. |
| `operationType` | no | Filter by operation type. |
| `cardNumber` | no | Smart card digits. Input is normalized to digits before filtering. |
| `includeUnconfirmed` | no | Defaults to true. Includes review counts when true. |

### Response Shape

```json
{
  "range": {
    "from": "2026-05-01T00:00:00.000Z",
    "to": "2026-05-25T23:59:59.999Z",
    "groupBy": "month"
  },
  "totals": {
    "confirmedSpend": 52882.3,
    "confirmedOperationCount": 486,
    "unconfirmedReviewCount": 23,
    "currency": "USD"
  },
  "accounts": [
    {
      "beinAccountId": "account-id",
      "beinUsernameSnapshot": "account@example.com",
      "beinLabelSnapshot": "Account 21",
      "confirmedSpend": 2875.3,
      "confirmedOperationCount": 23,
      "unconfirmedReviewCount": 0,
      "lastChargedAt": "2026-05-25T15:33:58.000Z"
    }
  ],
  "buckets": []
}
```

### Error Behavior

- `400` for missing or invalid date ranges.
- `400` for date ranges exceeding the existing maximum.
- `401/403` for unauthorized users.
- `500` for unexpected server errors.

## GET `/api/admin/reports/bein-spend/operations`

Returns paginated confirmed spend detail rows.

### Query Parameters

Same as summary endpoint, plus:

| Name | Required | Description |
|------|----------|-------------|
| `page` | no | Page number, default 1. |
| `pageSize` | no | Page size, default existing behavior, maximum 200. |

### Response Shape

```json
{
  "items": [
    {
      "ledgerId": "ledger-id",
      "operationId": "operation-id",
      "chargedAt": "2026-05-25T15:33:58.000Z",
      "panelUserId": "user-id",
      "panelUsername": "admin2020",
      "beinAccountId": "account-id",
      "beinUsernameSnapshot": "account@example.com",
      "beinLabelSnapshot": "Account 21",
      "operationType": "RENEW",
      "cardNumber": "7518695237",
      "selectedPackageName": "FIFA World Cup 2026",
      "dealerBalanceBefore": 4800,
      "dealerBalanceAfter": 4655,
      "spendAmount": 145,
      "evidenceSource": "BALANCE_DELTA",
      "operationStatusAtRecord": "COMPLETED"
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 486
}
```

### Security Notes

- Only admin role can call these endpoints.
- Account username and label are audit-safe. Secrets and session data are never included.
