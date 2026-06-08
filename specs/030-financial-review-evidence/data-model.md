# Data Model: Financial Review Evidence Provenance

## ProviderEvidenceState

Represents the trust level of provider/beIN evidence for a review item.

Fields:

- `state`: one of `confirmed-final-pay`, `incomplete-evidence`, `legacy-unverified`, `manual-verified-paid`, `manual-verified-not-paid`, `conflict`.
- `reason`: reader-facing reason for the state.
- `source`: exact evidence source such as final payment flow, package-load diagnostic, legacy row, or manual admin verification.
- `capturedAt`: timestamp when evidence or classification was captured.

Validation:

- Confirmed final-pay requires final before-balance and final after-balance from the final payment flow.
- Legacy-unverified preserves old stored values but blocks use as trusted provider spend.
- Conflict is required when provider charge and service outcome disagree.

## ProviderBalanceEvidence

Represents provider balance readings used for diagnostics or confirmed spend.

Fields:

- `operationId`
- `beinAccountId`
- `cardNumber`
- `packageName`
- `packagePrice`
- `balanceBefore`
- `balanceAfter`
- `beforeSource`: `final_pay_ok_page`, `package_load_diagnostic`, `missing`, `legacy`
- `afterSource`: `final_pay_result_page`, `final_pay_balance_check`, `missing`, `legacy`
- `contextMatched`: boolean indicating operation/account/card/package context consistency
- `capturedAt`

Validation:

- Provider debit amount is confirmed only when `beforeSource` and `afterSource` are final-payment sources and `contextMatched` is true.
- Package-load diagnostic balance cannot be used for confirmed debit.
- If either final payment balance is missing, debit amount remains unknown.

## ManualReviewDecision

Append-only admin decision record stored under financial review metadata for v1.

Fields:

- `action`: `BEIN_EXECUTED_NO_REFUND`, `REFUND_CUSTOMER`, or `KEEP_UNDER_REVIEW`
- `paymentStatus`: optional Arabic conclusion. No-refund defaults to `تم تأكيد الدفع`; refund defaults to `لم يتم تأكيد الدفع`.
- `cardRenewed`: optional boolean
- `actualBeinDebitAmount`: optional number
- `note`: optional string
- `source`: `admin_manual_review`, `stored_evidence_review`, or later `live_provider_check`
- `decidedBy`
- `decidedByUsername`
- `decidedAt`

Validation:

- Records are appended; previous decisions are not overwritten.
- Keep-under-review does not require or force payment status.
- If `actualBeinDebitAmount` is absent, no difference amount is calculated from manual verification.

## LegacyEvidenceClassification

Non-destructive classification for old rows that may contain inflated provider debit.

Fields:

- `classification`: `legacy-unverified`
- `originalStoredBeinDebitAmount`
- `originalSource`: ledger, audit snapshot, or both
- `reason`
- `classifiedAt`
- `classifiedBy`: system or admin

Validation:

- Classification is idempotent.
- Original stored values remain visible for audit.
- Legacy-unverified values do not satisfy provider charge evidence guards.

## Decision State Transitions

```text
REVIEW_REQUIRED + confirmed-final-pay + renewed/service confirmed
  -> no-refund allowed -> COMPLETED

REVIEW_REQUIRED + no trusted charge + manual/live not-renewed confirmation
  -> refund allowed -> FAILED with refund

REVIEW_REQUIRED + incomplete-evidence
  -> keep under review until manual verification

REVIEW_REQUIRED + legacy-unverified
  -> keep under review until manual verification

REVIEW_REQUIRED + provider charge confirmed + card not renewed
  -> conflict state, manual escalation
```
