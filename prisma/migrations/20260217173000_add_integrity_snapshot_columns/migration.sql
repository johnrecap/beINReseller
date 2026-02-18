ALTER TABLE "operation_integrity_issues"
  ADD COLUMN IF NOT EXISTS "bein_username_snapshot" TEXT;

ALTER TABLE "operation_integrity_issues"
  ADD COLUMN IF NOT EXISTS "user_balance_before" DOUBLE PRECISION;

ALTER TABLE "operation_integrity_issues"
  ADD COLUMN IF NOT EXISTS "user_balance_after" DOUBLE PRECISION;
