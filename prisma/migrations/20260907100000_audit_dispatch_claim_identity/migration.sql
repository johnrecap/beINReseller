-- T004: existing producers retain revision zero; T016 owns revision-aware activation.
BEGIN;
ALTER TABLE "operation_dispatches" ADD COLUMN "action_revision" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "operation_dispatches_operation_id_job_type_action_revision_key"
    ON "operation_dispatches"("operation_id", "job_type", "action_revision");
DROP INDEX "operation_dispatches_operation_id_job_type_key";
ALTER TABLE "operation_dispatches" ADD CONSTRAINT "audit_dispatch_revision_check"
    CHECK ("action_revision" >= 0 AND ("action_revision" = 0 OR "job_type" = 'APPLY_PROMO'));
ALTER TABLE "store_subscriptions"
    ADD COLUMN "payment_claimed_at" TIMESTAMP(3),
    ADD COLUMN "payment_claim_expires_at" TIMESTAMP(3),
    ADD COLUMN "payment_claim_key" TEXT,
    ADD COLUMN "selection_revision" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "store_subscriptions_payment_claim_key_key" ON "store_subscriptions"("payment_claim_key");
CREATE INDEX "store_subscriptions_status_payment_claim_expires_at_idx"
    ON "store_subscriptions"("status", "payment_claim_expires_at");
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "audit_claim_shape_check" CHECK (
    ("payment_claimed_at" IS NULL AND "payment_claim_expires_at" IS NULL AND "payment_claim_key" IS NULL)
    OR ("payment_claimed_at" IS NOT NULL AND "payment_claim_expires_at" IS NOT NULL
        AND "payment_claim_key" IS NOT NULL AND length(btrim("payment_claim_key")) > 0
        AND "payment_claim_expires_at" = "payment_claimed_at" + interval '2 minutes'));
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "audit_selection_revision_check" CHECK ("selection_revision" >= 0);
CREATE FUNCTION audit_preserve_claim_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.payment_claim_key IS NOT NULL AND NEW.payment_claim_key IS NOT DISTINCT FROM OLD.payment_claim_key
       AND (NEW.payment_claimed_at IS DISTINCT FROM OLD.payment_claimed_at
         OR NEW.payment_claim_expires_at IS DISTINCT FROM OLD.payment_claim_expires_at) THEN
        RAISE EXCEPTION 'AUDIT_PAYMENT_CLAIM_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER audit_preserve_claim_deadline BEFORE UPDATE ON "store_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION audit_preserve_claim_deadline();
COMMIT;
