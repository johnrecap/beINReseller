# Contract: Operation History Card Search

## GET `/api/operations`

Returns paginated operations for the authenticated panel user. Existing type, status, and date filters remain supported. This contract adds card-number search while preserving ownership boundaries.

### Query Parameters

| Name | Required | Description |
|------|----------|-------------|
| `page` | no | Page number, default 1. |
| `limit` | no | Page size, default 10. |
| `type` | no | Operation type. |
| `status` | no | Operation status or `active`. |
| `from` | no | Created-at lower bound. |
| `to` | no | Created-at upper bound. |
| `cardNumber` | no | Smart card digits. Input is normalized to digits before filtering. |

### Response Shape

```json
{
  "operations": [
    {
      "id": "operation-id",
      "type": "RENEW",
      "cardNumber": "7518695237",
      "amount": 145,
      "status": "COMPLETED",
      "responseMessage": "Renewal successful",
      "createdAt": "2026-05-25T15:33:58.000Z",
      "updatedAt": "2026-05-25T15:35:10.000Z",
      "selectedPackage": null,
      "stbNumber": "receiver-id",
      "finalConfirmExpiry": null,
      "heartbeatExpiry": null
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### Authorization Rules

- The endpoint remains scoped to `session.user.id`.
- Searching by card number must not return other users' operations.
- Admin-wide investigation by card number belongs to admin reporting endpoints.

### Error Behavior

- Invalid optional filters should not expose server internals.
- Empty card input should behave like no card filter.
- A normalized card query with no matches returns an empty list with `total: 0`.
