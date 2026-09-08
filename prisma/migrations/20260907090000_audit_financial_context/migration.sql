-- T004 expansion only. No historical evidence or money is backfilled.
BEGIN;
CREATE TYPE "OperationPurpose" AS ENUM ('RENEWAL', 'INSTALLMENT', 'LEGACY_UNKNOWN');
ALTER TYPE "ProviderMutationStage" ADD VALUE IF NOT EXISTS 'INSTALLMENT_PAY';
ALTER TABLE "operations" ADD COLUMN "purpose" "OperationPurpose";
ALTER TABLE "bein_account_spend_ledger" ADD COLUMN "customer_id" TEXT;
ALTER TABLE "bein_account_spend_ledger" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "bein_account_spend_ledger" ADD CONSTRAINT "bein_account_spend_ledger_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "bein_account_spend_ledger_customer_id_charged_at_idx" ON "bein_account_spend_ledger"("customer_id", "charged_at");
-- Enforced for new/updated rows; historical validation and operation-owner agreement remain T010/T040/T052.
ALTER TABLE "bein_account_spend_ledger" ADD CONSTRAINT "bein_spend_exactly_one_owner_check"
    CHECK (("user_id" IS NOT NULL)::int + ("customer_id" IS NOT NULL)::int = 1) NOT VALID;

CREATE TABLE "operation_installment_evidence" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "bein_account_id" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "installment_id" TEXT NOT NULL,
    "correlation_key" TEXT NOT NULL,
    "mutation_started_at" TIMESTAMP(3) NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "payment_state" TEXT NOT NULL,
    "settlement_state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "amount" DECIMAL(18,4),
    "currency" TEXT,
    "settlement_reference" TEXT,
    "rejection_reference" TEXT,
    "evidence_version" INTEGER NOT NULL DEFAULT 1,
    "reason_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "operation_installment_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operation_installment_evidence_operation_id_key" ON "operation_installment_evidence"("operation_id");
CREATE UNIQUE INDEX "operation_installment_evidence_correlation_key_key" ON "operation_installment_evidence"("correlation_key");
CREATE INDEX "operation_installment_evidence_bein_account_id_observed_at_idx" ON "operation_installment_evidence"("bein_account_id", "observed_at");
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_bein_account_id_fkey" FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_check_1" CHECK ("payment_state" IN ('CHARGED','NOT_CHARGED','UNKNOWN'));
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_check_2" CHECK ("settlement_state" IN ('SETTLED','NOT_SETTLED','UNKNOWN'));
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_check_3" CHECK ("observed_at" >= "mutation_started_at" AND "evidence_version" > 0);
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_check_4" CHECK ("amount" IS NULL OR ("amount" >= 0 AND "amount" <> 'NaN'::numeric));
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_check_5" CHECK (("amount" IS NULL) = ("currency" IS NULL));
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_check_6" CHECK ("settlement_state" <> 'SETTLED' OR length(btrim("settlement_reference")) > 0 AND "settlement_reference" IS NOT NULL);
ALTER TABLE "operation_installment_evidence" ADD CONSTRAINT "operation_installment_evidence_check_7" CHECK (length(btrim("installment_id")) > 0 AND length(btrim("correlation_key")) > 0);

COMMIT;
