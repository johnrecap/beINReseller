-- Keep only one active pending credit request per user before adding the guard.
-- The newest pending request is preserved; older duplicates are cancelled so the
-- unique index can be created safely.
WITH duplicate_pending AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS rn
  FROM "credit_requests"
  WHERE "status" = 'PENDING'
)
UPDATE "credit_requests" cr
SET
  "status" = 'CANCELLED',
  "decided_at" = COALESCE(cr."decided_at", CURRENT_TIMESTAMP),
  "decision_note" = COALESCE(
    cr."decision_note",
    'Auto-cancelled duplicate pending request by credit request hardening migration'
  )
FROM duplicate_pending dp
WHERE cr."id" = dp."id"
  AND dp.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_requests_user_id_pending_unique"
  ON "credit_requests"("user_id")
  WHERE "status" = 'PENDING';

-- Ensure one active agent assignment per user. This index already exists in
-- earlier credit-agent migrations, but it is repeated defensively for installs
-- that skipped the previous migration file.
WITH duplicate_assignments AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS rn
  FROM "agent_assignments"
  WHERE "is_active" = true
)
UPDATE "agent_assignments" aa
SET
  "is_active" = false,
  "ended_at" = COALESCE(aa."ended_at", CURRENT_TIMESTAMP)
FROM duplicate_assignments da
WHERE aa."id" = da."id"
  AND da.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_assignments_user_id_active_unique"
  ON "agent_assignments"("user_id")
  WHERE "is_active" = true;

-- Collapse notification settings into one canonical row.
ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "singleton_key" TEXT NOT NULL DEFAULT 'default';

WITH ranked_settings AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN "telegram_bot_token_encrypted" IS NOT NULL OR "telegram_target_id" IS NOT NULL
            OR "default_whatsapp_group_url" IS NOT NULL OR "default_whatsapp_phone" IS NOT NULL
          THEN 0
          ELSE 1
        END,
        "updated_at" DESC,
        "created_at" DESC,
        "id" DESC
    ) AS rn
  FROM "notification_settings"
)
DELETE FROM "notification_settings" ns
USING ranked_settings rs
WHERE ns."id" = rs."id"
  AND rs.rn > 1;

UPDATE "notification_settings"
SET "singleton_key" = 'default'
WHERE "singleton_key" <> 'default';

CREATE UNIQUE INDEX IF NOT EXISTS "notification_settings_singleton_key_key"
  ON "notification_settings"("singleton_key");
