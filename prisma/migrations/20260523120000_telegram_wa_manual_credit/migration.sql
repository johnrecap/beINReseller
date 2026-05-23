ALTER TYPE "WhatsAppProvider" ADD VALUE IF NOT EXISTS 'TELEGRAM';
ALTER TYPE "WhatsAppProvider" ADD VALUE IF NOT EXISTS 'MANUAL';

ALTER TYPE "WhatsAppNotificationTargetType" ADD VALUE IF NOT EXISTS 'TELEGRAM_CHAT';
ALTER TYPE "WhatsAppNotificationTargetType" ADD VALUE IF NOT EXISTS 'WHATSAPP_GROUP';
ALTER TYPE "WhatsAppNotificationTargetType" ADD VALUE IF NOT EXISTS 'WHATSAPP_PHONE';

ALTER TYPE "WhatsAppNotificationStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

ALTER TABLE "agent_profiles"
  ADD COLUMN IF NOT EXISTS "whatsapp_handoff_group_url" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_handoff_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_handoff_label" TEXT;

CREATE TABLE IF NOT EXISTS "notification_settings" (
  "id" TEXT NOT NULL,
  "telegram_enabled" BOOLEAN NOT NULL DEFAULT false,
  "telegram_bot_token_encrypted" TEXT,
  "telegram_target_id" TEXT,
  "telegram_target_label" TEXT,
  "default_whatsapp_group_url" TEXT,
  "default_whatsapp_phone" TEXT,
  "default_whatsapp_label" TEXT,
  "updated_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "whatsapp_handoff_snapshots" (
  "id" TEXT NOT NULL,
  "credit_request_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "destination_label" TEXT,
  "whatsapp_group_url" TEXT,
  "whatsapp_phone" TEXT,
  "message_text" TEXT NOT NULL,
  "group_open_available" BOOLEAN NOT NULL DEFAULT false,
  "phone_open_available" BOOLEAN NOT NULL DEFAULT false,
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_handoff_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_handoff_snapshots_credit_request_id_fkey"
    FOREIGN KEY ("credit_request_id") REFERENCES "credit_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_handoff_snapshots_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_handoff_snapshots_credit_request_id_key"
  ON "whatsapp_handoff_snapshots"("credit_request_id");

CREATE INDEX IF NOT EXISTS "whatsapp_handoff_snapshots_agent_id_created_at_idx"
  ON "whatsapp_handoff_snapshots"("agent_id", "created_at");
