-- Preserve the published migrations and all existing financial classifications.
-- Administrative archive is an operational decision, not a financial outcome.
ALTER TABLE "operation_review_adjudications"
  DROP CONSTRAINT "operation_review_adjudications_check_2";
ALTER TABLE "operation_review_adjudications"
  ADD CONSTRAINT "operation_review_adjudications_check_2" CHECK (
    "classification" IN ('MODERN_RENEWAL','PRE_MUTATION','INSTALLMENT','LEGACY_RECONCILABLE','LEGACY_EVIDENCE_HOLD','CONFLICT')
    OR ("classification" = 'ADMINISTRATIVE_ARCHIVE' AND "decision_kind" = 'ADMIN_ARCHIVE_AND_UNLOCK_CARD')
  );
