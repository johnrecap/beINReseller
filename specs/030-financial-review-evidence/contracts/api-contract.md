# API Contract: Financial Review Evidence Provenance

## GET /api/admin/financial-review

Returns review items with explicit evidence provenance.

### Response Additions

```json
{
  "items": [
    {
      "id": "operation-id",
      "amount": 82.5,
      "evidence": {
        "userDeductTotal": 82.5,
        "beinDebitAmount": null,
        "beinDebitConfirmed": false,
        "beinDebitSource": "incomplete-evidence",
        "providerEvidenceState": "incomplete-evidence",
        "providerEvidenceLabel": "لا توجد أدلة كافية لتأكيد خصم beIN",
        "legacyStoredBeinDebitAmount": 96.99,
        "differenceAmount": null,
        "manualVerification": null
      }
    }
  ]
}
```

### Contract Rules

- `beinDebitAmount` is populated only for confirmed final-payment evidence or manual verification with an amount.
- `legacyStoredBeinDebitAmount` may be populated for old untrusted values but does not imply confirmed provider charge.
- `differenceAmount` is populated only when both customer deduction and confirmed/manual beIN amount are known.

## POST /api/admin/financial-review/{operationId}/decision

Records an admin decision and applies refund/no-refund outcome when allowed.

### Request

```json
{
  "action": "BEIN_EXECUTED_NO_REFUND",
  "note": "optional admin note",
  "manualVerification": {
    "cardRenewed": true,
    "actualBeinDebitAmount": 82.5,
    "source": "admin_manual_review"
  }
}
```

### Button Defaults

- `BEIN_EXECUTED_NO_REFUND` adds payment status `تم تأكيد الدفع`.
- `REFUND_CUSTOMER` adds payment status `لم يتم تأكيد الدفع`.
- `KEEP_UNDER_REVIEW` does not force payment status.

### Decision Guards

- No-refund is allowed only when trusted evidence or manual verification confirms the customer received renewal/service.
- Refund is allowed only when no trusted provider charge exists and manual/live verification confirms no renewal/payment.
- Incomplete, legacy, fallback, or conflicting evidence stays under review unless manual verification is supplied.
- Provider charge confirmed but no renewal is returned as conflict and does not auto-close.

## POST /api/admin/financial-review/{operationId}/verify-card

Current v1 behavior reviews stored evidence only unless a real live provider check is implemented.

### Response

```json
{
  "success": true,
  "check": {
    "outcome": "STORED_EVIDENCE_ONLY",
    "summary": "فحص الأدلة المسجلة فقط. هذا ليس فحصا مباشرا من beIN.",
    "checkedAt": "2026-06-04T00:00:00.000Z"
  }
}
```

### Contract Rules

- The action label must not imply live provider verification while the endpoint remains heuristic/stored-evidence-only.
- Stored-evidence checks cannot alone unlock unsafe refund/no-refund decisions.
