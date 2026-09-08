DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "operation_fulfillment_proofs"
        GROUP BY "bein_account_id", btrim("invoice_no")
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot upgrade fulfillment proof invoices: trimmed account/invoice duplicates exist';
    END IF;
END $$;

CREATE TYPE "ProviderPaymentState" AS ENUM ('NOT_SUBMITTED', 'CHARGED', 'NOT_CHARGED', 'UNKNOWN');
CREATE TYPE "FulfillmentState" AS ENUM ('UNVERIFIED', 'VERIFYING', 'VERIFIED', 'NOT_FOUND', 'CHECK_FAILED', 'PROOF_CONFLICT');
CREATE TYPE "FulfillmentVerificationOutcome" AS ENUM ('MATCHED', 'VALID_NO_MATCH', 'REPORT_ONLY', 'CONTRACT_ONLY', 'INCOMPLETE_SCAN', 'CHECK_FAILED', 'PROOF_CONFLICT');
CREATE TYPE "FulfillmentAuthority" AS ENUM ('NONE', 'AUTOMATED_COMPOSITE', 'MANUAL_PROVIDER_CONFIRMATION');
CREATE TYPE "FulfillmentProofMode" AS ENUM ('REVIEW_ONLY', 'ENFORCE');
CREATE TYPE "FulfillmentProofKind" AS ENUM ('LEGACY_CONTRACT_ONLY', 'SOLD_REPORT_CONTRACT_CORRELATION');
CREATE TYPE "ProviderInvoiceClaimKind" AS ENUM ('LEGACY_PROOF', 'SOLD_REPORT_CONTRACT_CORRELATION', 'MANUAL_PROVIDER_CONFIRMATION');
CREATE TYPE "FulfillmentVerificationState" AS ENUM ('PENDING', 'VERIFYING', 'REVIEW_ONLY', 'VERIFIED', 'NO_MATCH', 'CONFLICT', 'CHECK_FAILED');
CREATE TYPE "ProviderMutationStage" AS ENUM ('FINAL_OK');

ALTER TABLE "operations"
    ADD COLUMN "provider_payment_state" "ProviderPaymentState",
    ADD COLUMN "fulfillment_state" "FulfillmentState",
    ADD COLUMN "fulfillment_verification_outcome" "FulfillmentVerificationOutcome",
    ADD COLUMN "fulfillment_authority" "FulfillmentAuthority" DEFAULT 'NONE',
    ADD COLUMN "provider_mutation_started_at" TIMESTAMP(3),
    ADD COLUMN "provider_mutation_stage" "ProviderMutationStage";

CREATE INDEX "operations_fulfillment_state_fulfillment_verification_outcome_idx"
    ON "operations"("fulfillment_state", "fulfillment_verification_outcome");
CREATE INDEX "operations_provider_mutation_started_at_idx"
    ON "operations"("provider_mutation_started_at");

ALTER TABLE "bein_accounts"
    ADD COLUMN "automation_exclusive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "operation_fulfillment_proofs"
    ADD COLUMN "invoice_claim_id" TEXT,
    ADD COLUMN "proof_kind" "FulfillmentProofKind" NOT NULL DEFAULT 'LEGACY_CONTRACT_ONLY',
    ADD COLUMN "baseline_id" TEXT,
    ADD COLUMN "session_generation" TEXT,
    ADD COLUMN "baseline_captured_at" TIMESTAMP(3),
    ADD COLUMN "report_observed_at" TIMESTAMP(3),
    ADD COLUMN "contract_observed_at" TIMESTAMP(3),
    ADD COLUMN "report_row_fingerprint" TEXT,
    ADD COLUMN "provider_amount" DECIMAL(18,2),
    ADD COLUMN "currency" TEXT,
    ADD COLUMN "report_package_name" TEXT,
    ADD COLUMN "report_item_type" TEXT,
    ADD COLUMN "dealer_context_hash" TEXT;

CREATE TABLE "provider_invoice_claims" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "bein_account_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "claim_kind" "ProviderInvoiceClaimKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_invoice_claims_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_invoice_claims_invoice_nonempty" CHECK (length(btrim("invoice_no")) > 0)
);

INSERT INTO "provider_invoice_claims" (
    "id",
    "operation_id",
    "bein_account_id",
    "invoice_no",
    "claim_kind",
    "created_at"
)
SELECT
    'legacy_' || md5("operation_id" || ':' || "bein_account_id" || ':' || btrim("invoice_no")),
    "operation_id",
    "bein_account_id",
    btrim("invoice_no"),
    'LEGACY_PROOF'::"ProviderInvoiceClaimKind",
    "created_at"
FROM "operation_fulfillment_proofs";

UPDATE "operation_fulfillment_proofs" AS proof
SET
    "invoice_no" = btrim(proof."invoice_no"),
    "invoice_claim_id" = claim."id"
FROM "provider_invoice_claims" AS claim
WHERE claim."operation_id" = proof."operation_id";

ALTER TABLE "operation_fulfillment_proofs"
    ALTER COLUMN "invoice_claim_id" SET NOT NULL;

CREATE UNIQUE INDEX "provider_invoice_claims_operation_id_key"
    ON "provider_invoice_claims"("operation_id");
CREATE UNIQUE INDEX "provider_invoice_claims_bein_account_id_invoice_no_key"
    ON "provider_invoice_claims"("bein_account_id", "invoice_no");
CREATE INDEX "provider_invoice_claims_claim_kind_created_at_idx"
    ON "provider_invoice_claims"("claim_kind", "created_at");
CREATE UNIQUE INDEX "operation_fulfillment_proofs_invoice_claim_id_key"
    ON "operation_fulfillment_proofs"("invoice_claim_id");

ALTER TABLE "provider_invoice_claims"
    ADD CONSTRAINT "provider_invoice_claims_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "provider_invoice_claims_bein_account_id_fkey"
    FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "operation_fulfillment_proofs_invoice_claim_id_fkey"
    FOREIGN KEY ("invoice_claim_id") REFERENCES "provider_invoice_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "operation_fulfillment_verifications" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "state" "FulfillmentVerificationState" NOT NULL DEFAULT 'PENDING',
    "active_baseline_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_check_at" TIMESTAMP(3),
    "last_outcome" "FulfillmentVerificationOutcome",
    "last_reason_code" TEXT,
    "started_at" TIMESTAMP(3),
    "terminal_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operation_fulfillment_verifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operation_fulfillment_verifications_attempt_count_nonnegative" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "operation_fulfillment_verifications_operation_id_key"
    ON "operation_fulfillment_verifications"("operation_id");
CREATE UNIQUE INDEX "operation_fulfillment_verifications_active_baseline_id_key"
    ON "operation_fulfillment_verifications"("active_baseline_id");
CREATE INDEX "operation_fulfillment_verifications_state_next_check_at_idx"
    ON "operation_fulfillment_verifications"("state", "next_check_at");

ALTER TABLE "operation_fulfillment_verifications"
    ADD CONSTRAINT "operation_fulfillment_verifications_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "operation_fulfillment_baselines" (
    "id" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "bein_account_id" TEXT NOT NULL,
    "card_number_snapshot" TEXT NOT NULL,
    "baseline_sequence" INTEGER NOT NULL,
    "session_generation" TEXT NOT NULL,
    "dealer_context_hash" TEXT NOT NULL,
    "invoice_set" JSONB NOT NULL,
    "target_card_rows" JSONB NOT NULL,
    "page_count" INTEGER NOT NULL,
    "row_count" INTEGER NOT NULL,
    "first_page_watermark" TEXT NOT NULL,
    "scan_attempt_count" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "superseded_at" TIMESTAMP(3),
    "superseded_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operation_fulfillment_baselines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operation_fulfillment_baselines_complete_scan" CHECK (
        "baseline_sequence" > 0
        AND "page_count" > 0
        AND "row_count" >= 0
        AND "scan_attempt_count" IN (1, 2)
        AND length(btrim("session_generation")) > 0
        AND "dealer_context_hash" ~ '^[0-9a-f]{64}$'
        AND length(btrim("first_page_watermark")) > 0
        AND jsonb_typeof("invoice_set") = 'array'
        AND jsonb_typeof("target_card_rows") = 'array'
    )
);

CREATE UNIQUE INDEX "operation_fulfillment_baselines_verification_id_baseline_sequence_key"
    ON "operation_fulfillment_baselines"("verification_id", "baseline_sequence");
CREATE INDEX "operation_fulfillment_baselines_operation_id_superseded_at_idx"
    ON "operation_fulfillment_baselines"("operation_id", "superseded_at");
CREATE INDEX "operation_fulfillment_baselines_bein_account_id_captured_at_idx"
    ON "operation_fulfillment_baselines"("bein_account_id", "captured_at");

ALTER TABLE "operation_fulfillment_baselines"
    ADD CONSTRAINT "operation_fulfillment_baselines_verification_id_fkey"
    FOREIGN KEY ("verification_id") REFERENCES "operation_fulfillment_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "operation_fulfillment_baselines_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "operation_fulfillment_baselines_bein_account_id_fkey"
    FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operation_fulfillment_verifications"
    ADD CONSTRAINT "operation_fulfillment_verifications_active_baseline_id_fkey"
    FOREIGN KEY ("active_baseline_id") REFERENCES "operation_fulfillment_baselines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "operation_fulfillment_proofs_baseline_id_fkey"
    FOREIGN KEY ("baseline_id") REFERENCES "operation_fulfillment_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "operation_fulfillment_proofs_composite_complete" CHECK (
        "proof_kind" <> 'SOLD_REPORT_CONTRACT_CORRELATION'
        OR (
            "baseline_id" IS NOT NULL
            AND "session_generation" IS NOT NULL AND length(btrim("session_generation")) > 0
            AND "baseline_captured_at" IS NOT NULL
            AND "report_observed_at" IS NOT NULL
            AND "contract_observed_at" IS NOT NULL
            AND "report_row_fingerprint" ~ '^[0-9a-f]{64}$'
            AND "provider_amount" > 0
            AND "currency" = 'USD'
            AND "report_package_name" IS NOT NULL AND length(btrim("report_package_name")) > 0
            AND "report_item_type" IS NOT NULL AND length(btrim("report_item_type")) > 0
            AND "dealer_context_hash" ~ '^[0-9a-f]{64}$'
            AND lower(btrim("contract_status")) = 'active'
        )
    );

CREATE TABLE "operation_fulfillment_verification_attempts" (
    "id" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "baseline_id" TEXT,
    "attempt_no" INTEGER NOT NULL,
    "outcome" "FulfillmentVerificationOutcome" NOT NULL,
    "complete_scan" BOOLEAN NOT NULL,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "candidate_count" INTEGER NOT NULL DEFAULT 0,
    "candidate_invoice_no" TEXT,
    "report_observed_at" TIMESTAMP(3),
    "contract_observed_at" TIMESTAMP(3),
    "reason_code" TEXT NOT NULL,
    "retry_due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_fulfillment_verification_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operation_fulfillment_verification_attempts_counts_nonnegative" CHECK (
        "attempt_no" > 0 AND "page_count" >= 0 AND "row_count" >= 0 AND "candidate_count" >= 0
    )
);

CREATE UNIQUE INDEX "operation_fulfillment_verification_attempts_verification_id_attempt_no_key"
    ON "operation_fulfillment_verification_attempts"("verification_id", "attempt_no");
CREATE INDEX "operation_fulfillment_verification_attempts_outcome_created_at_idx"
    ON "operation_fulfillment_verification_attempts"("outcome", "created_at");
CREATE INDEX "operation_fulfillment_verification_attempts_retry_due_at_idx"
    ON "operation_fulfillment_verification_attempts"("retry_due_at");

ALTER TABLE "operation_fulfillment_verification_attempts"
    ADD CONSTRAINT "operation_fulfillment_verification_attempts_verification_id_fkey"
    FOREIGN KEY ("verification_id") REFERENCES "operation_fulfillment_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "operation_fulfillment_verification_attempts_baseline_id_fkey"
    FOREIGN KEY ("baseline_id") REFERENCES "operation_fulfillment_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "operation_manual_fulfillment_evidence" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "bein_account_id" TEXT NOT NULL,
    "invoice_claim_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "card_number_snapshot" TEXT NOT NULL,
    "package_name_snapshot" TEXT NOT NULL,
    "provider_amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "evidence_source" TEXT NOT NULL,
    "evidence_note" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_manual_fulfillment_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operation_manual_fulfillment_evidence_complete" CHECK (
        length(btrim("invoice_no")) > 0
        AND length(btrim("card_number_snapshot")) > 0
        AND length(btrim("package_name_snapshot")) > 0
        AND "provider_amount" > 0
        AND "currency" ~ '^[A-Z]{3}$'
        AND length(btrim("evidence_source")) BETWEEN 1 AND 100
        AND length(btrim("evidence_note")) BETWEEN 1 AND 2000
        AND length(btrim("actor_user_id")) > 0
    )
);

CREATE UNIQUE INDEX "operation_manual_fulfillment_evidence_operation_id_key"
    ON "operation_manual_fulfillment_evidence"("operation_id");
CREATE UNIQUE INDEX "operation_manual_fulfillment_evidence_invoice_claim_id_key"
    ON "operation_manual_fulfillment_evidence"("invoice_claim_id");
CREATE INDEX "operation_manual_fulfillment_evidence_bein_account_id_observed_at_idx"
    ON "operation_manual_fulfillment_evidence"("bein_account_id", "observed_at");
CREATE INDEX "operation_manual_fulfillment_evidence_actor_user_id_created_at_idx"
    ON "operation_manual_fulfillment_evidence"("actor_user_id", "created_at");

ALTER TABLE "operation_manual_fulfillment_evidence"
    ADD CONSTRAINT "operation_manual_fulfillment_evidence_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "operation_manual_fulfillment_evidence_bein_account_id_fkey"
    FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "operation_manual_fulfillment_evidence_invoice_claim_id_fkey"
    FOREIGN KEY ("invoice_claim_id") REFERENCES "provider_invoice_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "operation_manual_fulfillment_evidence_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "card_lifecycle_reservations" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,

    CONSTRAINT "card_lifecycle_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "card_lifecycle_reservations_card_nonempty" CHECK (length(btrim("card_number")) > 0)
);

CREATE UNIQUE INDEX "card_lifecycle_reservations_operation_id_key"
    ON "card_lifecycle_reservations"("operation_id");
CREATE UNIQUE INDEX "card_lifecycle_reservations_active_card_key"
    ON "card_lifecycle_reservations"("card_number") WHERE "released_at" IS NULL;
CREATE INDEX "card_lifecycle_reservations_card_number_released_at_idx"
    ON "card_lifecycle_reservations"("card_number", "released_at");

ALTER TABLE "card_lifecycle_reservations"
    ADD CONSTRAINT "card_lifecycle_reservations_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "provider_account_causal_reservations" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "bein_account_id" TEXT NOT NULL,
    "reservation_generation" INTEGER NOT NULL DEFAULT 1,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "automatic_window_ends_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,

    CONSTRAINT "provider_account_causal_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_account_causal_reservations_generation_positive" CHECK ("reservation_generation" > 0)
);

CREATE UNIQUE INDEX "provider_account_causal_reservations_operation_id_key"
    ON "provider_account_causal_reservations"("operation_id");
CREATE UNIQUE INDEX "provider_account_causal_reservations_active_account_key"
    ON "provider_account_causal_reservations"("bein_account_id") WHERE "released_at" IS NULL;
CREATE INDEX "provider_account_causal_reservations_bein_account_id_released_at_idx"
    ON "provider_account_causal_reservations"("bein_account_id", "released_at");
CREATE INDEX "provider_account_causal_reservations_automatic_window_ends_at_idx"
    ON "provider_account_causal_reservations"("automatic_window_ends_at");

ALTER TABLE "provider_account_causal_reservations"
    ADD CONSTRAINT "provider_account_causal_reservations_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "provider_account_causal_reservations_bein_account_id_fkey"
    FOREIGN KEY ("bein_account_id") REFERENCES "bein_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
