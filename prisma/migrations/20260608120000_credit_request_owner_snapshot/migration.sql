ALTER TABLE "credit_requests"
ADD COLUMN IF NOT EXISTS "owner_type_snapshot" TEXT,
ADD COLUMN IF NOT EXISTS "owner_id_snapshot" TEXT,
ADD COLUMN IF NOT EXISTS "owner_label_snapshot" TEXT;

CREATE INDEX IF NOT EXISTS "credit_requests_owner_type_snapshot_status_idx"
ON "credit_requests"("owner_type_snapshot", "status");
