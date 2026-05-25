# API Contract: Eid Rewards

All user-facing APIs require authentication. Admin APIs require exact admin role.

## GET `/api/eid-rewards/status`

Returns current user eligibility and safe display data.

### Response 200

```json
{
  "enabled": true,
  "active": true,
  "eligible": true,
  "alreadyClaimed": false,
  "claimPolicy": "ONCE_PER_EVENT",
  "pointsBalance": 120,
  "canRedeem": true,
  "minRedeemPoints": 50,
  "conversion": {
    "enabled": true,
    "points": 100,
    "amount": 10,
    "previewAmount": 12,
    "currencyLabel": "USD"
  },
  "popup": {
    "show": true,
    "allowLaterDismiss": true,
    "closeDelaySeconds": 0,
    "beforeText": "عيديتك جاهزة! افتح الظرف واحصل على نقاط عشوائية تقدر تحولها لرصيد داخل حسابك.",
    "afterText": "يمكنك تحويل نقاطك إلى رصيد داخل الموقع."
  },
  "message": null
}
```

### Public Response Rules

- Must not include tier weights.
- Must not include raw validation internals.
- Must not trust browser timezone.

## POST `/api/eid-rewards/claim`

Claims Eid reward for the authenticated user.

### Request Body

```json
{}
```

The body must not accept `points`, `tierId`, `moneyValue`, or `balance`.

### Response 201

```json
{
  "success": true,
  "claim": {
    "id": "claim-id",
    "points": 250,
    "moneyValue": 25,
    "claimDate": "2026-05-26",
    "eventKey": "eid-2026"
  },
  "pointsBalance": 250,
  "conversion": {
    "enabled": true,
    "points": 100,
    "amount": 10,
    "previewAmount": 25,
    "currencyLabel": "USD"
  },
  "message": "مبروك! حصلت على 250 نقطة"
}
```

### Error Responses

- `401`: unauthenticated
- `403`: inactive/deleted user
- `409`: already claimed
- `429`: rate limited
- `400`: invalid event settings
- `500`: server error without stack trace

## POST `/api/eid-rewards/redeem`

Converts available points to existing site balance using existing point conversion settings.

### Request Body

```json
{
  "points": 250
}
```

### Response 201

```json
{
  "success": true,
  "redemption": {
    "id": "redemption-id",
    "pointsConverted": 250,
    "balanceAmount": 25,
    "availablePointsAfter": 0,
    "balanceAfter": 125,
    "transactionId": "transaction-id"
  },
  "message": "تم تحويل النقاط إلى رصيد بنجاح."
}
```

### Error Responses

- `401`: unauthenticated
- `400`: invalid points or invalid conversion settings
- `403`: inactive/deleted user
- `409`: insufficient points
- `429`: rate limited

## GET `/api/admin/eid-rewards/settings`

Returns full admin settings, including tiers and weights.

### Response 200

```json
{
  "settings": {
    "enabled": false,
    "eventKey": "eid-2026",
    "startsAt": null,
    "endsAt": null,
    "claimPolicy": "ONCE_PER_EVENT",
    "minPoints": 50,
    "maxPoints": 500,
    "minRedeemPoints": 1,
    "showPopupAfterLogin": true,
    "allowLaterDismiss": true,
    "closeDelaySeconds": 0,
    "beforeText": "...",
    "afterText": "..."
  },
  "conversion": {
    "points": 100,
    "amount": 10,
    "enabled": true
  },
  "tiers": [
    {
      "id": "tier-id",
      "points": 100,
      "probabilityWeight": 30,
      "label": "متوسط",
      "isActive": true
    }
  ]
}
```

## PUT `/api/admin/eid-rewards/settings`

Updates singleton settings and replaces/upserts tier list in one transaction.

### Request Body

```json
{
  "enabled": true,
  "eventKey": "eid-2026",
  "startsAt": "2026-06-16T00:00:00.000Z",
  "endsAt": "2026-06-20T23:59:59.000Z",
  "claimPolicy": "ONCE_PER_DAY",
  "minPoints": 50,
  "maxPoints": 500,
  "minRedeemPoints": 50,
  "showPopupAfterLogin": true,
  "allowLaterDismiss": true,
  "closeDelaySeconds": 2,
  "beforeText": "عيديتك جاهزة! افتح الظرف واحصل على نقاط عشوائية تقدر تحولها لرصيد داخل حسابك.",
  "afterText": "يمكنك تحويل نقاطك إلى رصيد داخل الموقع.",
  "tiers": [
    { "points": 50, "probabilityWeight": 40, "label": "صغيرة", "isActive": true },
    { "points": 100, "probabilityWeight": 30, "label": "متوسطة", "isActive": true }
  ]
}
```

## GET `/api/admin/eid-rewards/claims`

Query params:

- `page`
- `limit`
- `eventKey`
- `search`
- `dateFrom`
- `dateTo`

Returns paginated claim audit rows.

## GET `/api/admin/eid-rewards/transactions`

Query params:

- `page`
- `limit`
- `search`
- `dateFrom`
- `dateTo`

Returns point ledger and balance conversion audit data related to Eid reward points.
