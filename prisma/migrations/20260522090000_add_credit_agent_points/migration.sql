ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AGENT';

DO $$
BEGIN
  CREATE TYPE "CreditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PointRuleOwnerType" AS ENUM ('USER_GLOBAL', 'AGENT_DEFAULT', 'AGENT_OVERRIDE', 'MANAGER_DEFAULT', 'MANAGER_OVERRIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PointLedgerSourceType" AS ENUM ('CREDIT_REQUEST', 'MANAGER_TOPUP', 'REWARD_REDEMPTION', 'ADMIN_RELEASE', 'ADMIN_ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PointLedgerStatus" AS ENUM ('PENDING', 'AVAILABLE', 'REDEEMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RewardRedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsAppProvider" AS ENUM ('WHAPI');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsAppNotificationEventType" AS ENUM ('CREDIT_REQUEST_CREATED', 'CREDIT_REQUEST_ESCALATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsAppNotificationTargetType" AS ENUM ('GROUP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsAppNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "agent_profiles" (
  "agent_id" TEXT NOT NULL,
  "display_name" TEXT,
  "whatsapp_provider" "WhatsAppProvider" NOT NULL DEFAULT 'WHAPI',
  "whapi_group_id" TEXT,
  "whapi_group_name" TEXT,
  "whatsapp_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
  "default_source_group" TEXT,
  "points_per_thousand_override" DOUBLE PRECISION,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("agent_id"),
  CONSTRAINT "agent_profiles_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "agent_assignments" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_group" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "assigned_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3),

  CONSTRAINT "agent_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_assignments_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_assignments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_assignments_assigned_by_admin_id_fkey"
    FOREIGN KEY ("assigned_by_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "credit_requests" (
  "id" TEXT NOT NULL,
  "request_number" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "username_snapshot" TEXT NOT NULL,
  "amount_usd" DOUBLE PRECISION NOT NULL,
  "payment_method" TEXT NOT NULL,
  "notes" TEXT,
  "agent_id_snapshot" TEXT,
  "agent_name_snapshot" TEXT,
  "source_group_snapshot" TEXT,
  "status" "CreditRequestStatus" NOT NULL DEFAULT 'PENDING',
  "escalated" BOOLEAN NOT NULL DEFAULT false,
  "escalation_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3),
  "decided_by_admin_id" TEXT,
  "decision_note" TEXT,
  "transaction_id" TEXT,

  CONSTRAINT "credit_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_requests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "credit_requests_agent_id_snapshot_fkey"
    FOREIGN KEY ("agent_id_snapshot") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "credit_requests_decided_by_admin_id_fkey"
    FOREIGN KEY ("decided_by_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "credit_requests_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "credit_request_status_history" (
  "id" TEXT NOT NULL,
  "credit_request_id" TEXT NOT NULL,
  "from_status" "CreditRequestStatus",
  "to_status" "CreditRequestStatus",
  "actor_id" TEXT,
  "actor_role" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_request_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_request_status_history_credit_request_id_fkey"
    FOREIGN KEY ("credit_request_id") REFERENCES "credit_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "credit_request_status_history_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "point_rules" (
  "id" TEXT NOT NULL,
  "owner_type" "PointRuleOwnerType" NOT NULL,
  "owner_user_id" TEXT,
  "points_per_thousand" DOUBLE PRECISION NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by_admin_id" TEXT,

  CONSTRAINT "point_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_rules_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "point_rules_updated_by_admin_id_fkey"
    FOREIGN KEY ("updated_by_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "point_ledger_entries" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "owner_role_at_time" "Role" NOT NULL,
  "source_type" "PointLedgerSourceType" NOT NULL,
  "source_id" TEXT NOT NULL,
  "credit_request_id" TEXT,
  "points" DOUBLE PRECISION NOT NULL,
  "status" "PointLedgerStatus" NOT NULL DEFAULT 'PENDING',
  "rate_per_thousand_snapshot" DOUBLE PRECISION,
  "amount_usd_snapshot" DOUBLE PRECISION,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMP(3),
  "released_by_admin_id" TEXT,
  "notes" TEXT,

  CONSTRAINT "point_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_ledger_entries_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "point_ledger_entries_credit_request_id_fkey"
    FOREIGN KEY ("credit_request_id") REFERENCES "credit_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "point_ledger_entries_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "point_ledger_entries_released_by_admin_id_fkey"
    FOREIGN KEY ("released_by_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "rewards" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "points_cost" DOUBLE PRECISION NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "fulfillment_notes" TEXT,
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rewards_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "reward_redemptions" (
  "id" TEXT NOT NULL,
  "reward_id" TEXT NOT NULL,
  "reward_name_snapshot" TEXT NOT NULL,
  "points_cost_snapshot" DOUBLE PRECISION NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "status" "RewardRedemptionStatus" NOT NULL DEFAULT 'PENDING',
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3),
  "decided_by_admin_id" TEXT,
  "decision_note" TEXT,
  "ledger_entry_id" TEXT,

  CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reward_redemptions_reward_id_fkey"
    FOREIGN KEY ("reward_id") REFERENCES "rewards"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reward_redemptions_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reward_redemptions_decided_by_admin_id_fkey"
    FOREIGN KEY ("decided_by_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "reward_redemptions_ledger_entry_id_fkey"
    FOREIGN KEY ("ledger_entry_id") REFERENCES "point_ledger_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "whatsapp_notification_logs" (
  "id" TEXT NOT NULL,
  "event_type" "WhatsAppNotificationEventType" NOT NULL,
  "provider" "WhatsAppProvider" NOT NULL DEFAULT 'WHAPI',
  "target_type" "WhatsAppNotificationTargetType" NOT NULL DEFAULT 'GROUP',
  "target_group_id" TEXT,
  "target_group_name_snapshot" TEXT,
  "credit_request_id" TEXT,
  "agent_id" TEXT,
  "payload_summary" TEXT,
  "status" "WhatsAppNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "provider_message_id" TEXT,
  "provider_response" JSONB,
  "error" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_attempt_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),

  CONSTRAINT "whatsapp_notification_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_notification_logs_credit_request_id_fkey"
    FOREIGN KEY ("credit_request_id") REFERENCES "credit_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_notification_logs_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_assignments_user_id_active_unique"
  ON "agent_assignments"("user_id") WHERE "is_active" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_requests_request_number_key"
  ON "credit_requests"("request_number");

CREATE UNIQUE INDEX IF NOT EXISTS "credit_requests_transaction_id_key"
  ON "credit_requests"("transaction_id");

CREATE UNIQUE INDEX IF NOT EXISTS "point_ledger_entries_owner_source_key"
  ON "point_ledger_entries"("owner_user_id", "source_type", "source_id");

CREATE UNIQUE INDEX IF NOT EXISTS "reward_redemptions_ledger_entry_id_key"
  ON "reward_redemptions"("ledger_entry_id");

CREATE UNIQUE INDEX IF NOT EXISTS "point_rules_active_global_unique"
  ON "point_rules"("owner_type") WHERE "owner_user_id" IS NULL AND "is_active" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "point_rules_active_override_unique"
  ON "point_rules"("owner_type", "owner_user_id") WHERE "owner_user_id" IS NOT NULL AND "is_active" = true;

CREATE INDEX IF NOT EXISTS "agent_profiles_is_active_idx" ON "agent_profiles"("is_active");
CREATE INDEX IF NOT EXISTS "agent_assignments_agent_id_is_active_idx" ON "agent_assignments"("agent_id", "is_active");
CREATE INDEX IF NOT EXISTS "agent_assignments_user_id_is_active_idx" ON "agent_assignments"("user_id", "is_active");
CREATE INDEX IF NOT EXISTS "agent_assignments_created_at_idx" ON "agent_assignments"("created_at");
CREATE INDEX IF NOT EXISTS "credit_requests_status_created_at_idx" ON "credit_requests"("status", "created_at");
CREATE INDEX IF NOT EXISTS "credit_requests_user_id_created_at_idx" ON "credit_requests"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_requests_agent_id_snapshot_status_idx" ON "credit_requests"("agent_id_snapshot", "status");
CREATE INDEX IF NOT EXISTS "credit_request_status_history_credit_request_id_created_at_idx" ON "credit_request_status_history"("credit_request_id", "created_at");
CREATE INDEX IF NOT EXISTS "credit_request_status_history_actor_id_created_at_idx" ON "credit_request_status_history"("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "point_rules_owner_type_owner_user_id_is_active_idx" ON "point_rules"("owner_type", "owner_user_id", "is_active");
CREATE INDEX IF NOT EXISTS "point_ledger_entries_owner_user_id_status_idx" ON "point_ledger_entries"("owner_user_id", "status");
CREATE INDEX IF NOT EXISTS "point_ledger_entries_source_type_source_id_idx" ON "point_ledger_entries"("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "point_ledger_entries_credit_request_id_idx" ON "point_ledger_entries"("credit_request_id");
CREATE INDEX IF NOT EXISTS "rewards_is_active_idx" ON "rewards"("is_active");
CREATE INDEX IF NOT EXISTS "reward_redemptions_owner_user_id_status_idx" ON "reward_redemptions"("owner_user_id", "status");
CREATE INDEX IF NOT EXISTS "reward_redemptions_reward_id_idx" ON "reward_redemptions"("reward_id");
CREATE INDEX IF NOT EXISTS "reward_redemptions_requested_at_idx" ON "reward_redemptions"("requested_at");
CREATE INDEX IF NOT EXISTS "whatsapp_notification_logs_credit_request_id_created_at_idx" ON "whatsapp_notification_logs"("credit_request_id", "created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_notification_logs_agent_id_created_at_idx" ON "whatsapp_notification_logs"("agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_notification_logs_status_created_at_idx" ON "whatsapp_notification_logs"("status", "created_at");
