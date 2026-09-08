ALTER TYPE "IntegrityIssueType" ADD VALUE IF NOT EXISTS 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED';
ALTER TYPE "IntegrityIssueType" ADD VALUE IF NOT EXISTS 'FULFILLMENT_PROOF_CONFLICT';
ALTER TYPE "IntegrityIssueType" ADD VALUE IF NOT EXISTS 'DUPLICATE_RENEWAL_CHARGE_BURST';

CREATE TABLE "operation_fulfillment_proofs" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "bein_account_id" TEXT NOT NULL,
    "card_number_snapshot" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "selected_package_name" TEXT,
    "contract_package_name" TEXT,
    "contract_status" TEXT NOT NULL,
    "contract_type" TEXT,
    "contract_start_date" TEXT,
    "contract_expiry_date" TEXT,
    "verification_source" TEXT NOT NULL,
    "provider_checked_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operation_fulfillment_proofs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operation_fulfillment_proofs_invoice_nonempty" CHECK (length(btrim("invoice_no")) > 0)
);

CREATE UNIQUE INDEX "operation_fulfillment_proofs_operation_id_key"
    ON "operation_fulfillment_proofs"("operation_id");

CREATE UNIQUE INDEX "operation_fulfillment_proofs_bein_account_id_invoice_no_key"
    ON "operation_fulfillment_proofs"("bein_account_id", "invoice_no");

CREATE INDEX "operation_fulfillment_proofs_card_number_snapshot_verified_at_idx"
    ON "operation_fulfillment_proofs"("card_number_snapshot", "verified_at");

CREATE INDEX "operation_fulfillment_proofs_bein_account_id_provider_checked_at_idx"
    ON "operation_fulfillment_proofs"("bein_account_id", "provider_checked_at");

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "operation_fulfillment_proofs_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "operation_fulfillment_proofs_bein_account_id_fkey"
    FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
