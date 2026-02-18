-- Integrity reporting enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrityIssueType') THEN
    CREATE TYPE "IntegrityIssueType" AS ENUM (
      'NO_BEIN_BALANCE_CHANGE',
      'BEIN_DEBIT_NO_USER_DEDUCT',
      'BEIN_DEBIT_USER_UNDERDEDUCTED',
      'TELEMETRY_MISSING'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrityIssueSeverity') THEN
    CREATE TYPE "IntegrityIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrityIssueStatus') THEN
    CREATE TYPE "IntegrityIssueStatus" AS ENUM (
      'OPEN',
      'ACKNOWLEDGED',
      'RESOLVED',
      'FALSE_POSITIVE',
      'IGNORED'
    );
  END IF;
END $$;

-- Integrity issue table
CREATE TABLE IF NOT EXISTS "operation_integrity_issues" (
  "id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "user_id" TEXT,
  "bein_account_id" TEXT,
  "issue_type" "IntegrityIssueType" NOT NULL,
  "severity" "IntegrityIssueSeverity" NOT NULL DEFAULT 'HIGH',
  "status" "IntegrityIssueStatus" NOT NULL DEFAULT 'OPEN',
  "operation_amount" DOUBLE PRECISION,
  "user_deduct_amount" DOUBLE PRECISION,
  "bein_username_snapshot" TEXT,
  "user_balance_before" DOUBLE PRECISION,
  "user_balance_after" DOUBLE PRECISION,
  "bein_balance_before" DOUBLE PRECISION,
  "bein_balance_after" DOUBLE PRECISION,
  "bein_delta" DOUBLE PRECISION,
  "details" JSONB,
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_note" TEXT,
  CONSTRAINT "operation_integrity_issues_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operation_integrity_issues"
  ADD CONSTRAINT "operation_integrity_issues_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "operations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operation_integrity_issues"
  ADD CONSTRAINT "operation_integrity_issues_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_integrity_issues"
  ADD CONSTRAINT "operation_integrity_issues_bein_account_id_fkey"
  FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_integrity_issues"
  ADD CONSTRAINT "operation_integrity_issues_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "operation_integrity_issues_operation_id_issue_type_key"
  ON "operation_integrity_issues"("operation_id", "issue_type");

CREATE INDEX IF NOT EXISTS "operation_integrity_issues_status_detected_at_idx"
  ON "operation_integrity_issues"("status", "detected_at");

CREATE INDEX IF NOT EXISTS "operation_integrity_issues_issue_type_severity_idx"
  ON "operation_integrity_issues"("issue_type", "severity");

CREATE INDEX IF NOT EXISTS "operation_integrity_issues_user_id_detected_at_idx"
  ON "operation_integrity_issues"("user_id", "detected_at");

CREATE INDEX IF NOT EXISTS "operation_integrity_issues_bein_account_id_detected_at_idx"
  ON "operation_integrity_issues"("bein_account_id", "detected_at");

-- Safety for environments where table already existed before these snapshot columns
ALTER TABLE "operation_integrity_issues" ADD COLUMN IF NOT EXISTS "bein_username_snapshot" TEXT;
ALTER TABLE "operation_integrity_issues" ADD COLUMN IF NOT EXISTS "user_balance_before" DOUBLE PRECISION;
ALTER TABLE "operation_integrity_issues" ADD COLUMN IF NOT EXISTS "user_balance_after" DOUBLE PRECISION;
