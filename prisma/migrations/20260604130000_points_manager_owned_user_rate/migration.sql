ALTER TYPE "PointRuleOwnerType" ADD VALUE IF NOT EXISTS 'MANAGER_OWNED_USER_DEFAULT';

ALTER TABLE "point_program_settings"
ADD COLUMN IF NOT EXISTS "manager_owned_user_points_enabled" BOOLEAN NOT NULL DEFAULT false;
