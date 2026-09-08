-- Bind every fulfillment proof/evidence row to the exact operation, account,
-- invoice claim, and baseline context it is intended to prove.

ALTER TABLE "provider_invoice_claims"
    ADD CONSTRAINT "provider_invoice_claims_invoice_trimmed_check"
    CHECK ("invoice_no" = btrim("invoice_no"));

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "operation_fulfillment_proofs_invoice_trimmed_check"
    CHECK ("invoice_no" = btrim("invoice_no"));

ALTER TABLE "operation_manual_fulfillment_evidence"
    ADD CONSTRAINT "operation_manual_fulfillment_evidence_invoice_trimmed_check"
    CHECK ("invoice_no" = btrim("invoice_no"));

ALTER TABLE "provider_invoice_claims"
    ADD CONSTRAINT "provider_invoice_claim_context_key"
    UNIQUE ("id", "operation_id", "bein_account_id", "invoice_no");

ALTER TABLE "operation_fulfillment_baselines"
    ADD CONSTRAINT "fulfillment_baseline_context_key"
    UNIQUE ("id", "operation_id", "bein_account_id");

ALTER TABLE "operation_fulfillment_proofs"
    ADD CONSTRAINT "fulfillment_proof_claim_context_key"
    UNIQUE ("invoice_claim_id", "operation_id", "bein_account_id", "invoice_no");

ALTER TABLE "operation_manual_fulfillment_evidence"
    ADD CONSTRAINT "manual_evidence_claim_context_key"
    UNIQUE ("invoice_claim_id", "operation_id", "bein_account_id", "invoice_no");

ALTER TABLE "operation_fulfillment_proofs"
    DROP CONSTRAINT "operation_fulfillment_proofs_invoice_claim_id_fkey",
    ADD CONSTRAINT "operation_fulfillment_proofs_claim_context_fkey"
        FOREIGN KEY ("invoice_claim_id", "operation_id", "bein_account_id", "invoice_no")
        REFERENCES "provider_invoice_claims" ("id", "operation_id", "bein_account_id", "invoice_no")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operation_fulfillment_proofs"
    DROP CONSTRAINT "operation_fulfillment_proofs_baseline_id_fkey",
    ADD CONSTRAINT "operation_fulfillment_proofs_baseline_context_fkey"
        FOREIGN KEY ("baseline_id", "operation_id", "bein_account_id")
        REFERENCES "operation_fulfillment_baselines" ("id", "operation_id", "bein_account_id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operation_manual_fulfillment_evidence"
    DROP CONSTRAINT "operation_manual_fulfillment_evidence_invoice_claim_id_fkey",
    ADD CONSTRAINT "operation_manual_fulfillment_evidence_claim_context_fkey"
        FOREIGN KEY ("invoice_claim_id", "operation_id", "bein_account_id", "invoice_no")
        REFERENCES "provider_invoice_claims" ("id", "operation_id", "bein_account_id", "invoice_no")
        ON DELETE RESTRICT ON UPDATE CASCADE;
