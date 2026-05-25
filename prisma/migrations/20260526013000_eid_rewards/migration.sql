ALTER TYPE "PointLedgerSourceType" ADD VALUE IF NOT EXISTS 'EID_REWARD';

CREATE TYPE "EidRewardClaimPolicy" AS ENUM ('ONCE_PER_EVENT', 'ONCE_PER_DAY');

CREATE TABLE "eid_reward_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "event_key" TEXT NOT NULL DEFAULT 'eid-default',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "claim_policy" "EidRewardClaimPolicy" NOT NULL DEFAULT 'ONCE_PER_EVENT',
    "min_points" INTEGER NOT NULL DEFAULT 50,
    "max_points" INTEGER NOT NULL DEFAULT 500,
    "min_redeem_points" INTEGER NOT NULL DEFAULT 1,
    "show_popup_after_login" BOOLEAN NOT NULL DEFAULT true,
    "allow_later_dismiss" BOOLEAN NOT NULL DEFAULT true,
    "close_delay_seconds" INTEGER NOT NULL DEFAULT 0,
    "before_text" TEXT NOT NULL DEFAULT 'عيديتك جاهزة! افتح الظرف واحصل على نقاط عشوائية تقدر تحولها لرصيد داخل حسابك.',
    "after_text" TEXT NOT NULL DEFAULT 'يمكنك تحويل نقاطك إلى رصيد داخل الموقع.',
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eid_reward_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eid_reward_tiers" (
    "id" TEXT NOT NULL,
    "settings_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "probability_weight" INTEGER NOT NULL,
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eid_reward_tiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eid_reward_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "money_value" DOUBLE PRECISION,
    "claim_date" DATE NOT NULL,
    "event_key" TEXT NOT NULL,
    "claim_scope_key" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "point_ledger_entry_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eid_reward_claims_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "eid_reward_settings_enabled_starts_at_ends_at_idx" ON "eid_reward_settings"("enabled", "starts_at", "ends_at");
CREATE INDEX "eid_reward_tiers_settings_id_is_active_idx" ON "eid_reward_tiers"("settings_id", "is_active");
CREATE INDEX "eid_reward_claims_event_key_claim_date_idx" ON "eid_reward_claims"("event_key", "claim_date");
CREATE INDEX "eid_reward_claims_user_id_created_at_idx" ON "eid_reward_claims"("user_id", "created_at");
CREATE UNIQUE INDEX "eid_reward_claims_user_id_claim_scope_key_key" ON "eid_reward_claims"("user_id", "claim_scope_key");

ALTER TABLE "eid_reward_tiers"
ADD CONSTRAINT "eid_reward_tiers_settings_id_fkey"
FOREIGN KEY ("settings_id") REFERENCES "eid_reward_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "eid_reward_claims"
ADD CONSTRAINT "eid_reward_claims_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
