# Contract: Financial Review Workbench

## GET `/api/admin/financial-review`

Returns review operations for the admin workbench.

### Query Parameters

- `state`: `needs_decision`, `follow_up`, `refunded`, `bein_executed`, or `all`.
- `days`: positive integer date window, default 30.
- `q`: search operation id, card number, username, or beIN account.
- `operationType`: optional operation type.
- `evidence`: `complete`, `incomplete`, `bein_delta`, `no_bein_delta`, or `all`.
- `refund`: `available`, `already_refunded`, `blocked`, or `all`.
- `beinAccountId`: optional beIN account id.

### Response Shape

```json
{
  "success": true,
  "summary": {
    "needsDecision": 3,
    "followUp": 1,
    "refunded": 2,
    "beinExecuted": 4,
    "refundBlocked": 1
  },
  "operations": [
    {
      "operationId": "cmpeg5zj400046thy3ars9kod",
      "type": "RENEW",
      "state": "needs_decision",
      "cardNumber": "947242535456241",
      "amount": 92,
      "selectedPackageName": "Add Summer Offer 2",
      "user": { "id": "user_id", "username": "customer" },
      "beinAccount": { "id": "bein_id", "label": "bot 16", "username": "Ajsd-08-1233" },
      "evidence": {
        "userDeductTotal": 92,
        "beinBalanceBefore": 13613,
        "beinBalanceAfter": 13521,
        "beinDelta": 92,
        "refundExists": false,
        "refundBlocked": false,
        "responseMessage": "Contract Created Successfully",
        "reviewReason": "Uncertain provider response",
        "recommendation": "LIKELY_BEIN_EXECUTED"
      },
      "latestDecision": null,
      "updatedAt": "2026-05-20T19:21:36.000Z"
    }
  ]
}
```

### Error Responses

- `401`: user not authenticated.
- `403`: user is not admin.
- `500`: server error.

## POST `/api/admin/financial-review/[operationId]/resolve`

Applies a review decision.

### Request Body

```json
{
  "action": "REFUND_CUSTOMER",
  "decisionNote": "Confirmed beIN did not charge after checking dealer account.",
  "acknowledgeFinancialRisk": true
}
```

Allowed actions:

- `BEIN_EXECUTED_NO_REFUND`
- `REFUND_CUSTOMER`
- `KEEP_UNDER_REVIEW`

### Response Shape

```json
{
  "success": true,
  "operationId": "cmpeg5zj400046thy3ars9kod",
  "state": "refunded",
  "decision": {
    "id": "decision_id",
    "action": "REFUND_CUSTOMER",
    "decisionNote": "Confirmed beIN did not charge after checking dealer account.",
    "refundTransactionId": "transaction_id",
    "createdAt": "2026-05-20T20:00:00.000Z"
  }
}
```

### Required Server Rules

- Admin role required.
- Operation must exist.
- Operation must be in a reviewable state.
- `decisionNote` must be non-empty.
- `REFUND_CUSTOMER` must be blocked if a refund already exists for the operation.
- `REFUND_CUSTOMER` must run in a database transaction with balance update and refund transaction creation.
- Repeated submit must not create duplicate refund transactions.
- `BEIN_EXECUTED_NO_REFUND` must not mutate user balance.
- `KEEP_UNDER_REVIEW` must not remove the item from the pending/follow-up queue.
