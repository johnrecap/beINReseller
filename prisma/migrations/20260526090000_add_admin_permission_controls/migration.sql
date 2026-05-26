CREATE TABLE "role_permission_settings" (
  "id" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "permission_key" TEXT NOT NULL,
  "effect" TEXT NOT NULL,
  "reason" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "role_permission_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_permission_overrides" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "permission_key" TEXT NOT NULL,
  "effect" TEXT NOT NULL,
  "reason" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "global_permission_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "global_permission_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "protected_admins" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "protected" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "protected_admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permission_audit_events" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "permission_key" TEXT,
  "old_value" JSONB,
  "new_value" JSONB,
  "result" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "permission_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_permission_settings_role_permission_key_key" ON "role_permission_settings"("role", "permission_key");
CREATE INDEX "role_permission_settings_permission_key_idx" ON "role_permission_settings"("permission_key");
CREATE INDEX "role_permission_settings_updated_by_user_id_idx" ON "role_permission_settings"("updated_by_user_id");

CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_key_key" ON "user_permission_overrides"("user_id", "permission_key");
CREATE INDEX "user_permission_overrides_permission_key_idx" ON "user_permission_overrides"("permission_key");
CREATE INDEX "user_permission_overrides_updated_by_user_id_idx" ON "user_permission_overrides"("updated_by_user_id");

CREATE UNIQUE INDEX "global_permission_settings_key_key" ON "global_permission_settings"("key");
CREATE INDEX "global_permission_settings_updated_by_user_id_idx" ON "global_permission_settings"("updated_by_user_id");

CREATE UNIQUE INDEX "protected_admins_user_id_key" ON "protected_admins"("user_id");
CREATE INDEX "protected_admins_protected_idx" ON "protected_admins"("protected");
CREATE INDEX "protected_admins_created_by_user_id_idx" ON "protected_admins"("created_by_user_id");

CREATE INDEX "permission_audit_events_actor_user_id_created_at_idx" ON "permission_audit_events"("actor_user_id", "created_at");
CREATE INDEX "permission_audit_events_target_type_target_id_created_at_idx" ON "permission_audit_events"("target_type", "target_id", "created_at");
CREATE INDEX "permission_audit_events_permission_key_idx" ON "permission_audit_events"("permission_key");
