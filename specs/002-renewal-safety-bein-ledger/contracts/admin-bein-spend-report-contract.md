# Contract: Admin beIN Spend Reports

## Endpoint: Summary Report

`GET /api/admin/reports/bein-spend`

### Query Parameters

- `from`: ISO date/time, required
- `to`: ISO date/time, required
- `groupBy`: `day`, `week`, `month`, or `none`, optional default `none`
- `beinAccountId`: optional
- `userId`: optional panel user filter
- `operationType`: optional
- `includeUnconfirmed`: optional boolean, default `true`

### Response

```json
{
  "range": {
    "from": "2026-05-01T00:00:00.000Z",
    "to": "2026-05-31T23:59:59.999Z",
    "groupBy": "month"
  },
  "totals": {
    "confirmedSpend": 1250,
    "confirmedOperationCount": 12,
    "unconfirmedReviewCount": 2,
    "currency": "USD"
  },
  "accounts": [
    {
      "beinAccountId": "bein_123",
      "beinUsernameSnapshot": "dealer@example.com",
      "beinLabelSnapshot": "Main account",
      "confirmedSpend": 850,
      "confirmedOperationCount": 8,
      "unconfirmedReviewCount": 1,
      "lastChargedAt": "2026-05-14T10:00:00.000Z"
    }
  ],
  "buckets": [
    {
      "bucketStart": "2026-05-01T00:00:00.000Z",
      "bucketEnd": "2026-05-31T23:59:59.999Z",
      "confirmedSpend": 1250,
      "confirmedOperationCount": 12
    }
  ]
}
```

## Endpoint: Detail Rows

`GET /api/admin/reports/bein-spend/operations`

### Query Parameters

- `from`: ISO date/time, required
- `to`: ISO date/time, required
- `beinAccountId`: optional
- `userId`: optional
- `operationType`: optional
- `page`: optional default `1`
- `pageSize`: optional default `50`, max `200`

### Response

```json
{
  "items": [
    {
      "ledgerId": "ledger_123",
      "operationId": "op_123",
      "chargedAt": "2026-05-14T10:00:00.000Z",
      "panelUserId": "user_123",
      "panelUsername": "panel-user",
      "beinAccountId": "bein_123",
      "beinUsernameSnapshot": "dealer@example.com",
      "operationType": "RENEW",
      "cardNumber": "1234567890",
      "selectedPackageName": "Package Name",
      "dealerBalanceBefore": 500,
      "dealerBalanceAfter": 400,
      "spendAmount": 100,
      "evidenceSource": "BALANCE_DELTA",
      "operationStatusAtRecord": "COMPLETED"
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```

## Endpoint: Operation Detail Addition

Existing operation detail responses should add a safe, nullable section:

```json
{
  "chargedBeinAccount": {
    "ledgerId": "ledger_123",
    "beinAccountId": "bein_123",
    "beinUsernameSnapshot": "dealer@example.com",
    "beinLabelSnapshot": "Main account",
    "proxyLabelSnapshot": "proxy-safe-label",
    "chargedAt": "2026-05-14T10:00:00.000Z",
    "spendAmount": 100,
    "dealerBalanceBefore": 500,
    "dealerBalanceAfter": 400,
    "evidenceSource": "BALANCE_DELTA"
  }
}
```

## Security Rules

- Admin-only.
- Do not return beIN password, cookies, TOTP secret, proxy password, or session data.
- Validate date range; reject very large ranges or require pagination for detail rows.
