-- T004 dormant persistence. T021 must integrate financial vetoes before authorization.
BEGIN;
CREATE TABLE "renewal_refund_settlements" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "payment_id" TEXT,
    "source" TEXT NOT NULL,
    "user_id" TEXT,
    "customer_id" TEXT,
    "currency" TEXT NOT NULL,
    "original_external_minor" INTEGER NOT NULL DEFAULT 0,
    "original_store_credit_minor" INTEGER NOT NULL DEFAULT 0,
    "original_wallet_minor" INTEGER NOT NULL DEFAULT 0,
    "requested_external_minor" INTEGER NOT NULL DEFAULT 0,
    "requested_store_credit_minor" INTEGER NOT NULL DEFAULT 0,
    "requested_wallet_minor" INTEGER NOT NULL DEFAULT 0,
    "confirmed_external_minor" INTEGER NOT NULL DEFAULT 0,
    "confirmed_store_credit_minor" INTEGER NOT NULL DEFAULT 0,
    "confirmed_wallet_minor" INTEGER NOT NULL DEFAULT 0,
    "reserved_external_minor" INTEGER NOT NULL DEFAULT 0,
    "reserved_store_credit_minor" INTEGER NOT NULL DEFAULT 0,
    "reserved_wallet_minor" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason_code" TEXT,
    "actor_id" TEXT NOT NULL,
    "decision_note" TEXT NOT NULL,
    "command_key" TEXT NOT NULL,
    "payload_fingerprint" TEXT NOT NULL,
    "cancellation_evidence_reference" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "renewal_refund_settlements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "renewal_refund_settlements_command_key_key" ON "renewal_refund_settlements"("command_key");
CREATE UNIQUE INDEX "renewal_refund_settlements_operation_id_source_key" ON "renewal_refund_settlements"("operation_id", "source");
CREATE INDEX "renewal_refund_settlements_state_next_attempt_at_idx" ON "renewal_refund_settlements"("state", "next_attempt_at");
CREATE INDEX "renewal_refund_settlements_payment_id_idx" ON "renewal_refund_settlements"("payment_id");
CREATE INDEX "renewal_refund_settlements_subscription_id_idx" ON "renewal_refund_settlements"("subscription_id");
CREATE INDEX "renewal_refund_settlements_customer_id_idx" ON "renewal_refund_settlements"("customer_id");
CREATE INDEX "renewal_refund_settlements_user_id_idx" ON "renewal_refund_settlements"("user_id");
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "store_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_1" CHECK (("user_id" IS NOT NULL)::int + ("customer_id" IS NOT NULL)::int = 1);
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_2" CHECK (("source" = 'reseller' AND "user_id" IS NOT NULL) OR ("source" IN ('store_renewal','mobile_renewal') AND "customer_id" IS NOT NULL));
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_3" CHECK ("state" IN ('REQUESTED','DISPATCH_FENCED','PROVIDER_PENDING','PARTIAL','PROVIDER_CONFIRMED','LOCAL_SETTLED','COMPLETED','UNKNOWN','EVIDENCE_HOLD','EXHAUSTED','RETRY_FAILED','CANCELLED'));
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_4" CHECK ("original_external_minor" >= 0 AND "requested_external_minor" BETWEEN 0 AND "original_external_minor" AND "confirmed_external_minor" BETWEEN 0 AND "requested_external_minor" AND "reserved_external_minor" >= 0 AND "reserved_external_minor" <= "requested_external_minor" - "confirmed_external_minor");
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_5" CHECK ("original_store_credit_minor" >= 0 AND "requested_store_credit_minor" BETWEEN 0 AND "original_store_credit_minor" AND "confirmed_store_credit_minor" BETWEEN 0 AND "requested_store_credit_minor" AND "reserved_store_credit_minor" >= 0 AND "reserved_store_credit_minor" <= "requested_store_credit_minor" - "confirmed_store_credit_minor");
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_6" CHECK ("original_wallet_minor" >= 0 AND "requested_wallet_minor" BETWEEN 0 AND "original_wallet_minor" AND "confirmed_wallet_minor" BETWEEN 0 AND "requested_wallet_minor" AND "reserved_wallet_minor" >= 0 AND "reserved_wallet_minor" <= "requested_wallet_minor" - "confirmed_wallet_minor");
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_7" CHECK ("attempts" >= 0 AND length(btrim("decision_note")) BETWEEN 1 AND 2000);
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_8" CHECK ("state" <> 'CANCELLED' OR ("cancellation_evidence_reference" IS NOT NULL AND length(btrim("cancellation_evidence_reference")) > 0 AND "reserved_external_minor" = 0 AND "reserved_store_credit_minor" = 0 AND "reserved_wallet_minor" = 0 AND "confirmed_external_minor" = 0 AND "confirmed_store_credit_minor" = 0 AND "confirmed_wallet_minor" = 0));
ALTER TABLE "renewal_refund_settlements" ADD CONSTRAINT "renewal_refund_settlements_check_9" CHECK (length(btrim("command_key")) > 0 AND length(btrim("payload_fingerprint")) > 0);


CREATE TABLE "renewal_refund_requests" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "provider_idempotency_key" TEXT NOT NULL,
    "provider_refund_id" TEXT,
    "payload_fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "renewal_refund_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "renewal_refund_requests_provider_idempotency_key_key" ON "renewal_refund_requests"("provider_idempotency_key");
CREATE UNIQUE INDEX "renewal_refund_requests_provider_refund_id_key" ON "renewal_refund_requests"("provider_refund_id");
CREATE UNIQUE INDEX "renewal_refund_requests_settlement_id_sequence_key" ON "renewal_refund_requests"("settlement_id", "sequence");
ALTER TABLE "renewal_refund_requests" ADD CONSTRAINT "renewal_refund_requests_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "renewal_refund_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_requests" ADD CONSTRAINT "renewal_refund_requests_check_1" CHECK ("sequence" >= 0 AND "amount_minor" > 0);
ALTER TABLE "renewal_refund_requests" ADD CONSTRAINT "renewal_refund_requests_check_2" CHECK ("status" IN ('REQUESTED','PENDING','SUCCEEDED','FAILED','UNKNOWN','CANCELLED'));
ALTER TABLE "renewal_refund_requests" ADD CONSTRAINT "renewal_refund_requests_check_3" CHECK (length(btrim("provider_idempotency_key")) > 0 AND length(btrim("payload_fingerprint")) > 0);


CREATE TABLE "renewal_refund_observations" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "provider_refund_id" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "renewal_refund_observations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "renewal_refund_observations_provider_event_id_key" ON "renewal_refund_observations"("provider_event_id");
CREATE INDEX "renewal_refund_observations_request_id_observed_at_idx" ON "renewal_refund_observations"("request_id", "observed_at");
CREATE INDEX "renewal_refund_observations_payment_id_idx" ON "renewal_refund_observations"("payment_id");
ALTER TABLE "renewal_refund_observations" ADD CONSTRAINT "renewal_refund_observations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "renewal_refund_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_observations" ADD CONSTRAINT "renewal_refund_observations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "renewal_refund_observations" ADD CONSTRAINT "renewal_refund_observations_check_1" CHECK ("amount_minor" > 0 AND "status" IN ('PENDING','SUCCEEDED','FAILED','UNKNOWN','CANCELLED'));
ALTER TABLE "renewal_refund_observations" ADD CONSTRAINT "renewal_refund_observations_check_2" CHECK (length(btrim("provider_event_id")) > 0 AND length(btrim("provider_refund_id")) > 0);


CREATE TABLE "operation_review_adjudications" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "decision_key" TEXT NOT NULL,
    "payload_fingerprint" TEXT NOT NULL,
    "decision_kind" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "normalized_evidence" JSONB NOT NULL,
    "source_reference" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "reason_code" TEXT NOT NULL,
    "decision_note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operation_review_adjudications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operation_review_adjudications_decision_key_key" ON "operation_review_adjudications"("decision_key");
CREATE INDEX "operation_review_adjudications_operation_id_created_at_idx" ON "operation_review_adjudications"("operation_id", "created_at");
ALTER TABLE "operation_review_adjudications" ADD CONSTRAINT "operation_review_adjudications_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_review_adjudications" ADD CONSTRAINT "operation_review_adjudications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_review_adjudications" ADD CONSTRAINT "operation_review_adjudications_check_1" CHECK (length(btrim("decision_note")) BETWEEN 1 AND 2000 AND length(btrim("source_reference")) > 0);
ALTER TABLE "operation_review_adjudications" ADD CONSTRAINT "operation_review_adjudications_check_2" CHECK ("classification" IN ('MODERN_RENEWAL','PRE_MUTATION','INSTALLMENT','LEGACY_RECONCILABLE','LEGACY_EVIDENCE_HOLD','CONFLICT'));


CREATE TABLE "operation_completion_effects" (
    "id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "effect_kind" TEXT NOT NULL,
    "completion_snapshot" JSONB NOT NULL,
    "snapshot_version" INTEGER NOT NULL,
    "points_award_run_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "operation_completion_effects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operation_completion_effects_operation_id_effect_kind_key" ON "operation_completion_effects"("operation_id", "effect_kind");
CREATE INDEX "operation_completion_effects_state_next_attempt_at_idx" ON "operation_completion_effects"("state", "next_attempt_at");
ALTER TABLE "operation_completion_effects" ADD CONSTRAINT "operation_completion_effects_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_completion_effects" ADD CONSTRAINT "operation_completion_effects_points_award_run_id_fkey" FOREIGN KEY ("points_award_run_id") REFERENCES "operation_spend_award_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operation_completion_effects" ADD CONSTRAINT "operation_completion_effects_check_1" CHECK ("effect_kind" IN ('COMPLETION_NOTIFICATION','ACTIVITY_COUNTER','POINTS_AWARD_REFERENCE'));
ALTER TABLE "operation_completion_effects" ADD CONSTRAINT "operation_completion_effects_check_2" CHECK ("state" IN ('PENDING','DELIVERING','DELIVERED','EXHAUSTED'));
ALTER TABLE "operation_completion_effects" ADD CONSTRAINT "operation_completion_effects_check_3" CHECK ("attempts" >= 0 AND "snapshot_version" > 0);
ALTER TABLE "operation_completion_effects" ADD CONSTRAINT "operation_completion_effects_check_4" CHECK (("effect_kind" = 'POINTS_AWARD_REFERENCE') = ("points_award_run_id" IS NOT NULL));

-- Preserve the immutable request identity while permitting normalized status observations.
CREATE FUNCTION audit_preserve_refund_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.settlement_id, NEW.sequence, NEW.amount_minor, NEW.provider_idempotency_key, NEW.payload_fingerprint)
       IS DISTINCT FROM ROW(OLD.settlement_id, OLD.sequence, OLD.amount_minor, OLD.provider_idempotency_key, OLD.payload_fingerprint)
       OR (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id) THEN
        RAISE EXCEPTION 'AUDIT_REFUND_REQUEST_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER audit_preserve_refund_request BEFORE UPDATE ON "renewal_refund_requests"
    FOR EACH ROW EXECUTE FUNCTION audit_preserve_refund_request();

CREATE FUNCTION audit_preserve_refund_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.operation_id, NEW.subscription_id, NEW.payment_id, NEW.source, NEW.user_id, NEW.customer_id,
           NEW.currency, NEW.original_external_minor, NEW.original_store_credit_minor, NEW.original_wallet_minor,
           NEW.actor_id, NEW.decision_note, NEW.command_key, NEW.payload_fingerprint)
       IS DISTINCT FROM ROW(OLD.operation_id, OLD.subscription_id, OLD.payment_id, OLD.source, OLD.user_id, OLD.customer_id,
           OLD.currency, OLD.original_external_minor, OLD.original_store_credit_minor, OLD.original_wallet_minor,
           OLD.actor_id, OLD.decision_note, OLD.command_key, OLD.payload_fingerprint) THEN
        RAISE EXCEPTION 'AUDIT_REFUND_ORIGIN_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER audit_preserve_refund_origin BEFORE UPDATE ON "renewal_refund_settlements"
    FOR EACH ROW EXECUTE FUNCTION audit_preserve_refund_origin();

CREATE FUNCTION audit_immutable_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT_EVIDENCE_IMMUTABLE';
END;
$$;
CREATE TRIGGER audit_immutable_refund_observation BEFORE UPDATE ON "renewal_refund_observations"
    FOR EACH ROW EXECUTE FUNCTION audit_immutable_evidence();
CREATE TRIGGER audit_immutable_adjudication BEFORE UPDATE ON "operation_review_adjudications"
    FOR EACH ROW EXECUTE FUNCTION audit_immutable_evidence();

CREATE FUNCTION audit_preserve_completion_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.operation_id, NEW.effect_kind, NEW.completion_snapshot, NEW.snapshot_version, NEW.points_award_run_id)
       IS DISTINCT FROM ROW(OLD.operation_id, OLD.effect_kind, OLD.completion_snapshot, OLD.snapshot_version, OLD.points_award_run_id) THEN
        RAISE EXCEPTION 'AUDIT_COMPLETION_SNAPSHOT_IMMUTABLE';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER audit_preserve_completion_snapshot BEFORE UPDATE ON "operation_completion_effects"
    FOR EACH ROW EXECUTE FUNCTION audit_preserve_completion_snapshot();
COMMIT;
