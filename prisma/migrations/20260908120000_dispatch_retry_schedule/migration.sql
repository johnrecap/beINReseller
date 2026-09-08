-- Additive delivery scheduling only. No financial/evidence backfill.
ALTER TABLE "operation_dispatches"
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "operation_dispatches_status_next_attempt_at_idx"
  ON "operation_dispatches"("status", "next_attempt_at");
CREATE INDEX "operation_dispatches_status_updated_at_idx"
  ON "operation_dispatches"("status", "updated_at");
