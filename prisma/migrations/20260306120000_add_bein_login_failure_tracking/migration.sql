ALTER TABLE "bein_accounts"
  ADD COLUMN IF NOT EXISTS "consecutive_login_failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_login_attempt_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_login_failure_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_login_failure_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "last_successful_login_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "bein_accounts_consecutive_login_failures_last_login_failure_at_idx"
  ON "bein_accounts"("consecutive_login_failures", "last_login_failure_at");
