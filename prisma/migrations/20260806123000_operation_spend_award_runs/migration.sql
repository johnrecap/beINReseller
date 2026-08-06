CREATE TYPE "OperationSpendAwardRunStatus" AS ENUM (
  'CAPTURED',
  'AWARDED',
  'SKIPPED',
  'LEGACY_REVIEW_REQUIRED'
);

ALTER TABLE "point_program_settings"
  ADD COLUMN "operation_spend_snapshot_cutover_at" TIMESTAMP(3);

ALTER TABLE "point_ledger_entries"
  ADD COLUMN "operation_spend_award_run_id" TEXT;

CREATE TABLE "operation_spend_award_runs" (
  "id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "policy_version" TEXT NOT NULL,
  "completion_source" TEXT NOT NULL,
  "completed_at_snapshot" TIMESTAMP(3),
  "operation_type_snapshot" "OperationType" NOT NULL,
  "amount_usd_snapshot" DOUBLE PRECISION NOT NULL,
  "operation_user_id_snapshot" TEXT,
  "ownership_kind_snapshot" TEXT,
  "ownership_owner_id_snapshot" TEXT,
  "points_enabled_snapshot" BOOLEAN,
  "points_start_at_snapshot" TIMESTAMP(3),
  "manager_owned_user_points_enabled_snapshot" BOOLEAN,
  "ownership_evidence_snapshot" JSONB,
  "recipients_snapshot" JSONB,
  "status" "OperationSpendAwardRunStatus" NOT NULL,
  "reason_code" TEXT,
  "ledger_entry_count" INTEGER NOT NULL DEFAULT 0,
  "finalization_attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_finalization_attempt_at" TIMESTAMP(3),
  "next_finalization_attempt_at" TIMESTAMP(3),
  "last_finalization_error_code" TEXT,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalized_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operation_spend_award_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operation_spend_award_runs_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "operation_spend_award_runs_operation_id_key"
  ON "operation_spend_award_runs"("operation_id");

CREATE INDEX "operation_spend_award_runs_status_captured_at_idx"
  ON "operation_spend_award_runs"("status", "captured_at");

CREATE INDEX "op_spend_award_retry_due_idx"
  ON "operation_spend_award_runs"("status", "next_finalization_attempt_at", "captured_at");

CREATE INDEX "operation_spend_award_runs_completion_source_captured_at_idx"
  ON "operation_spend_award_runs"("completion_source", "captured_at");

CREATE UNIQUE INDEX "point_ledger_entries_operation_spend_award_run_id_owner_user_id_key"
  ON "point_ledger_entries"("operation_spend_award_run_id", "owner_user_id");

CREATE INDEX "point_ledger_entries_operation_spend_award_run_id_idx"
  ON "point_ledger_entries"("operation_spend_award_run_id");

ALTER TABLE "point_ledger_entries"
  ADD CONSTRAINT "point_ledger_entries_operation_spend_award_run_id_fkey"
  FOREIGN KEY ("operation_spend_award_run_id") REFERENCES "operation_spend_award_runs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
