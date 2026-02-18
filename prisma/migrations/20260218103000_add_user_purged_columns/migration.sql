ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMP(3);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "purged_by_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "users_purged_at_idx" ON "users"("purged_at");
CREATE INDEX IF NOT EXISTS "users_deleted_at_purged_at_idx" ON "users"("deleted_at", "purged_at");
