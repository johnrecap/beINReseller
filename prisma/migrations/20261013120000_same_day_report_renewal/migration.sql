ALTER TYPE "FulfillmentAuthority" ADD VALUE IF NOT EXISTS 'AUTOMATED_REPORT';
ALTER TYPE "FulfillmentProofKind" ADD VALUE IF NOT EXISTS 'SOLD_REPORT_SAME_DAY';
ALTER TYPE "ProviderInvoiceClaimKind" ADD VALUE IF NOT EXISTS 'SOLD_REPORT_SAME_DAY';

ALTER TABLE "operations"
    ADD COLUMN "renewal_flow_version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "provider_pay_requested_at" TIMESTAMP(3);
ALTER TABLE "operations"
    ADD CONSTRAINT "operations_renewal_flow_version_valid"
    CHECK ("renewal_flow_version" IN (1, 2));

ALTER TABLE "operation_fulfillment_proofs"
    ALTER COLUMN "contract_status" DROP NOT NULL,
    ADD COLUMN "report_date" DATE,
    ADD COLUMN "provider_submitted_at" TIMESTAMP(3),
    ADD COLUMN "promo_code_snapshot" TEXT,
    ADD COLUMN "customer_charged_amount" DECIMAL(18,2);

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "operation_fulfillment_proofs_legacy_contract_status"
    CHECK ("proof_kind" = 'SOLD_REPORT_SAME_DAY' OR "contract_status" IS NOT NULL);

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "operation_fulfillment_proofs_same_day_complete"
    CHECK (
        "proof_kind" <> 'SOLD_REPORT_SAME_DAY'
        OR (
            "baseline_id" IS NULL AND "baseline_captured_at" IS NULL
            AND "session_generation" IS NULL
            AND "contract_observed_at" IS NULL
            AND "contract_status" IS NULL
            AND "contract_package_name" IS NULL
            AND "contract_type" IS NULL
            AND "report_date" IS NOT NULL
            AND "provider_submitted_at" IS NOT NULL
            AND "report_observed_at" IS NOT NULL
            AND "report_row_fingerprint" ~ '^[0-9a-f]{64}$'
            AND "provider_amount" > 0
            AND "currency" = 'USD'
            AND "report_package_name" IS NOT NULL
            AND length(btrim("report_package_name")) > 0
            AND "report_item_type" IS NOT NULL
            AND length(btrim("report_item_type")) > 0
            AND "dealer_context_hash" ~ '^[0-9a-f]{64}$'
            AND "customer_charged_amount" >= 0
        )
    );
