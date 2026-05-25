ALTER TYPE "PointLedgerSourceType" ADD VALUE IF NOT EXISTS 'OPERATION_SPEND';
ALTER TYPE "PointLedgerSourceType" ADD VALUE IF NOT EXISTS 'POINT_CASH_REDEMPTION';
ALTER TYPE "PointLedgerSourceType" ADD VALUE IF NOT EXISTS 'POINT_REVERSAL';

CREATE TABLE IF NOT EXISTS "point_program_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "points_enabled" BOOLEAN NOT NULL DEFAULT false,
  "points_start_at" TIMESTAMP(3),
  "cash_conversion_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cash_conversion_amount_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updated_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "point_program_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_program_settings_updated_by_admin_id_fkey"
    FOREIGN KEY ("updated_by_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "point_program_settings" (
  "id",
  "points_enabled",
  "points_start_at",
  "cash_conversion_points",
  "cash_conversion_amount_usd",
  "updated_at"
)
VALUES ('default', false, NULL, 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "point_ledger_entries"
  ADD COLUMN IF NOT EXISTS "operation_id" TEXT;

DO $$
BEGIN
  ALTER TABLE "point_ledger_entries"
    ADD CONSTRAINT "point_ledger_entries_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "point_cash_redemptions" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "points_converted" DOUBLE PRECISION NOT NULL,
  "balance_amount_usd" DOUBLE PRECISION NOT NULL,
  "conversion_points_snapshot" DOUBLE PRECISION NOT NULL,
  "conversion_amount_usd_snapshot" DOUBLE PRECISION NOT NULL,
  "ledger_entry_id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "point_cash_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_cash_redemptions_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "point_cash_redemptions_ledger_entry_id_fkey"
    FOREIGN KEY ("ledger_entry_id") REFERENCES "point_ledger_entries"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "point_cash_redemptions_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "point_cash_redemptions_ledger_entry_id_key"
  ON "point_cash_redemptions"("ledger_entry_id");

CREATE UNIQUE INDEX IF NOT EXISTS "point_cash_redemptions_transaction_id_key"
  ON "point_cash_redemptions"("transaction_id");

CREATE INDEX IF NOT EXISTS "point_cash_redemptions_owner_user_id_requested_at_idx"
  ON "point_cash_redemptions"("owner_user_id", "requested_at");

CREATE INDEX IF NOT EXISTS "point_ledger_entries_owner_user_id_status_source_type_idx"
  ON "point_ledger_entries"("owner_user_id", "status", "source_type");

CREATE INDEX IF NOT EXISTS "point_ledger_entries_operation_id_idx"
  ON "point_ledger_entries"("operation_id");
