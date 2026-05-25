# Contract: Point Cash Redemption

## Purpose

Allow authenticated users, agents, and managers to convert available points into their own account balance immediately.

## Authorization

- Any authenticated active `USER`, `AGENT`, or `MANAGER`.
- The request can only convert the caller's own points into the caller's own balance.
- Admins may view audit records through admin reporting, but this endpoint is self-service.

## GET `/api/points/wallet`

Returns the current point wallet and conversion settings available to the caller.

### Response 200

```json
{
  "points": {
    "available": 250,
    "lifetimeEarned": 400,
    "converted": 100,
    "reversed": 50,
    "legacy": 0
  },
  "conversion": {
    "enabled": true,
    "points": 100,
    "amountUsd": 10
  },
  "recentConversions": [
    {
      "id": "conversion_1",
      "pointsConverted": 100,
      "balanceAmountUsd": 10,
      "requestedAt": "2026-05-25T11:00:00.000Z",
      "transactionId": "transaction_1"
    }
  ]
}
```

## POST `/api/points/cash-redemptions`

Converts points into balance.

### Request

```json
{
  "points": 100
}
```

### Response 201

```json
{
  "success": true,
  "redemption": {
    "id": "conversion_1",
    "pointsConverted": 100,
    "balanceAmountUsd": 10,
    "availablePointsAfter": 150,
    "balanceAfter": 42.5,
    "transactionId": "transaction_1"
  }
}
```

## Validation

- `points` must be positive and no greater than available convertible points.
- Conversion settings must be enabled and valid.
- Credited balance is calculated from the configured ratio at request time.
- The conversion must create both the negative point ledger entry and the balance transaction atomically.

## Error Responses

- 400: invalid point amount or invalid conversion settings.
- 401: unauthenticated.
- 403: inactive account or unsupported role.
- 409: insufficient points or concurrent conversion conflict.
- 500: server error.
