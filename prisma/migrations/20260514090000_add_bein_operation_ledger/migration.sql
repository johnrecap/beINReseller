CREATE TABLE "bein_account_spend_ledger" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bein_account_id" TEXT NOT NULL,
    "proxy_id" TEXT,
    "operation_type" "OperationType" NOT NULL,
    "operation_status_at_record" "OperationStatus" NOT NULL,
    "card_number_snapshot" TEXT NOT NULL,
    "selected_package_name" TEXT,
    "selected_package_price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "dealer_balance_before" DOUBLE PRECISION NOT NULL,
    "dealer_balance_after" DOUBLE PRECISION NOT NULL,
    "spend_amount" DOUBLE PRECISION NOT NULL,
    "evidence_source" TEXT NOT NULL,
    "evidence_confidence" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "bein_username_snapshot" TEXT NOT NULL,
    "bein_label_snapshot" TEXT,
    "proxy_label_snapshot" TEXT,
    "charged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bein_account_spend_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bein_account_spend_ledger_operation_id_key" ON "bein_account_spend_ledger"("operation_id");
CREATE INDEX "bein_account_spend_ledger_bein_account_id_charged_at_idx" ON "bein_account_spend_ledger"("bein_account_id", "charged_at");
CREATE INDEX "bein_account_spend_ledger_user_id_charged_at_idx" ON "bein_account_spend_ledger"("user_id", "charged_at");
CREATE INDEX "bein_account_spend_ledger_operation_type_charged_at_idx" ON "bein_account_spend_ledger"("operation_type", "charged_at");
CREATE INDEX "bein_account_spend_ledger_charged_at_idx" ON "bein_account_spend_ledger"("charged_at");

ALTER TABLE "bein_account_spend_ledger" ADD CONSTRAINT "bein_account_spend_ledger_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bein_account_spend_ledger" ADD CONSTRAINT "bein_account_spend_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bein_account_spend_ledger" ADD CONSTRAINT "bein_account_spend_ledger_bein_account_id_fkey" FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bein_account_spend_ledger" ADD CONSTRAINT "bein_account_spend_ledger_proxy_id_fkey" FOREIGN KEY ("proxy_id") REFERENCES "proxies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
