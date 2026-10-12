ALTER TABLE "operations" ADD COLUMN "renewal_cooldown_until" TIMESTAMP(3);
CREATE INDEX "operations_card_number_renewal_cooldown_until_idx"
    ON "operations"("card_number", "renewal_cooldown_until");

-- All workers/finalizers share this clock. Follow-up proof, heartbeat, refund
-- and status writes cannot restart the window for the same operation.
CREATE FUNCTION preserve_renewal_card_cooldown() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD."renewal_cooldown_until" IS NOT NULL THEN
        NEW."renewal_cooldown_until" := OLD."renewal_cooldown_until";
    ELSE
        NEW."renewal_cooldown_until" := NULL;
        IF NEW."type" = 'RENEW'
           AND NEW."purpose" IS DISTINCT FROM 'INSTALLMENT'
           AND NEW."status" IN ('COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVIEW_REQUIRED')
           AND (TG_OP = 'INSERT' OR NEW."status" IS DISTINCT FROM OLD."status") THEN
            NEW."renewal_cooldown_until" := (statement_timestamp() AT TIME ZONE 'UTC') + INTERVAL '5 minutes';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operations_preserve_renewal_card_cooldown
BEFORE INSERT OR UPDATE ON "operations"
FOR EACH ROW EXECUTE FUNCTION preserve_renewal_card_cooldown();

-- No historical backfill: updated_at can be a heartbeat or an evidence edit,
-- and completed_at is not present for every old failed/review attempt.
