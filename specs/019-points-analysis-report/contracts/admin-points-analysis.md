# Contract: Admin Points Analysis

## GET `/api/admin/reports/points-analysis`

Admin-only endpoint returning summary totals and paginated ledger rows.

### Query Parameters

- `page`: integer, optional, default `1`
- `limit`: integer, optional, default `25`, max `100`
- `from`: string, optional, Egypt-local date/time or ISO
- `to`: string, optional, Egypt-local date/time or ISO
- `role`: `ADMIN | MANAGER | AGENT | USER`, optional
- `ownerSearch`: string, optional
- `sourceType`: existing point ledger source type, optional
- `status`: existing point ledger status, optional
- `conversionState`: `available | converted | reversed | pending | cancelled | legacy`, optional

### Response 200

```json
{
  "summary": {
    "earnedPoints": 14,
    "availablePoints": 3,
    "convertedPoints": 10,
    "convertedBalanceAmount": 5,
    "reversedPoints": 1,
    "pendingPoints": 0,
    "cancelledPoints": 0,
    "legacyPoints": 0,
    "ownersCount": 2,
    "ledgerEntriesCount": 4
  },
  "filters": {
    "page": 1,
    "limit": 25
  },
  "rows": [
    {
      "ledgerEntryId": "ledger_1",
      "createdAt": "2026-05-27T09:30:00.000Z",
      "createdAtDisplay": "2026/05/27 12:30 PM",
      "owner": {
        "id": "user_1",
        "username": "Noman329",
        "email": "Noman329@example.com",
        "role": "USER",
        "isActive": true,
        "deleted": false
      },
      "sourceType": "EID_REWARD",
      "sourceLabel": "Eid reward",
      "status": "AVAILABLE",
      "points": 3,
      "direction": "earn",
      "amountUsdSnapshot": null,
      "ratePerThousandSnapshot": null,
      "moneyValue": null,
      "operationRef": null,
      "redemptionRef": null,
      "transactionRef": null,
      "notes": "Eid reward claim"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 4,
    "totalPages": 1
  },
  "settings": {
    "pointsEnabled": true,
    "conversionEnabled": true,
    "conversionPoints": 10,
    "conversionAmount": 5,
    "currencyLabel": "USD"
  }
}
```

### Errors

- `401`: unauthenticated
- `403`: non-admin
- `400`: invalid filters
- `500`: generic report error without stack trace

## GET `/api/admin/reports/points-analysis/owners/{id}`

Admin-only endpoint returning one owner's point summary and timeline.

### Query Parameters

- `page`: integer, optional, default `1`
- `limit`: integer, optional, default `25`, max `100`
- `from`: string, optional
- `to`: string, optional

### Response 200

```json
{
  "owner": {
    "id": "user_1",
    "username": "Noman329",
    "email": "Noman329@example.com",
    "role": "USER",
    "isActive": true,
    "deleted": false,
    "balance": 0
  },
  "summary": {
    "earnedPoints": 4,
    "availablePoints": 1,
    "convertedPoints": 3,
    "convertedBalanceAmount": 1.5,
    "reversedPoints": 0,
    "pendingPoints": 0,
    "cancelledPoints": 0,
    "legacyPoints": 0,
    "ledgerEntriesCount": 2
  },
  "rows": [],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 2,
    "totalPages": 1
  }
}
```

### Errors

- `401`: unauthenticated
- `403`: non-admin
- `404`: owner not found
- `400`: invalid filters
- `500`: generic report error without stack trace
