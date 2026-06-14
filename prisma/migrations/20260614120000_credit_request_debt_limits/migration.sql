DO $$
BEGIN
  CREATE TYPE "CreditDebtLedgerEntryType" AS ENUM ('CREDIT_APPROVED', 'PAYMENT_RECORDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "credit_debt_limit_usd" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "credit_debt_ledger_entries" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "entry_type" "CreditDebtLedgerEntryType" NOT NULL,
  "amount_usd" DOUBLE PRECISION NOT NULL,
  "debt_after_usd" DOUBLE PRECISION NOT NULL,
  "credit_request_id" TEXT,
  "transaction_id" TEXT,
  "owner_type_snapshot" TEXT,
  "owner_id_snapshot" TEXT,
  "owner_label_snapshot" TEXT,
  "recorded_by_user_id" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_debt_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_debt_ledger_entries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "credit_debt_ledger_entries_credit_request_id_fkey"
    FOREIGN KEY ("credit_request_id") REFERENCES "credit_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "credit_debt_ledger_entries_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "credit_debt_ledger_entries_recorded_by_user_id_fkey"
    FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

DROP INDEX IF EXISTS "credit_requests_user_id_pending_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "credit_debt_ledger_entries_credit_request_id_entry_type_key"
  ON "credit_debt_ledger_entries"("credit_request_id", "entry_type");

CREATE INDEX IF NOT EXISTS "credit_debt_ledger_entries_user_id_created_at_idx"
  ON "credit_debt_ledger_entries"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "credit_debt_ledger_entries_owner_id_snapshot_created_at_idx"
  ON "credit_debt_ledger_entries"("owner_id_snapshot", "created_at");

CREATE INDEX IF NOT EXISTS "credit_debt_ledger_entries_entry_type_created_at_idx"
  ON "credit_debt_ledger_entries"("entry_type", "created_at");
