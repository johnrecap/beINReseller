CREATE TYPE "EidRewardAudienceOverrideEffect" AS ENUM ('ALLOW', 'DENY');

ALTER TABLE "eid_reward_settings"
ADD COLUMN "audience_roles" "Role"[] NOT NULL DEFAULT ARRAY['ADMIN'::"Role", 'MANAGER'::"Role", 'AGENT'::"Role", 'USER'::"Role"],
ADD COLUMN "popup_texts" JSONB;

CREATE TABLE "eid_reward_audience_overrides" (
    "id" TEXT NOT NULL,
    "settings_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "effect" "EidRewardAudienceOverrideEffect" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eid_reward_audience_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "eid_reward_audience_overrides_settings_id_user_id_key" ON "eid_reward_audience_overrides"("settings_id", "user_id");
CREATE INDEX "eid_reward_audience_overrides_settings_id_effect_idx" ON "eid_reward_audience_overrides"("settings_id", "effect");
CREATE INDEX "eid_reward_audience_overrides_user_id_idx" ON "eid_reward_audience_overrides"("user_id");

ALTER TABLE "eid_reward_audience_overrides"
ADD CONSTRAINT "eid_reward_audience_overrides_settings_id_fkey"
FOREIGN KEY ("settings_id") REFERENCES "eid_reward_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "eid_reward_audience_overrides"
ADD CONSTRAINT "eid_reward_audience_overrides_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
