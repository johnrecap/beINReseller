CREATE TABLE "card_administrative_releases" (
  "id" TEXT PRIMARY KEY, "decision_key" TEXT NOT NULL UNIQUE, "card_number" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "note" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3), "last_error" TEXT,
  CONSTRAINT "card_release_state_valid" CHECK (state IN ('REQUESTED', 'DRAINING', 'COMPLETED'))
);
CREATE INDEX "card_administrative_releases_state_requested_at_idx" ON "card_administrative_releases"("state", "requested_at");
CREATE INDEX "card_administrative_releases_card_number_requested_at_idx" ON "card_administrative_releases"("card_number", "requested_at");
CREATE UNIQUE INDEX "card_release_one_pending" ON "card_administrative_releases"("card_number") WHERE state <> 'COMPLETED';
ALTER TABLE "operations"
  ADD COLUMN "administrative_stop_requested_at" TIMESTAMP(3),
  ADD COLUMN "administrative_archived_at" TIMESTAMP(3),
  ADD COLUMN "administrative_release_id" TEXT REFERENCES "card_administrative_releases"("id") ON DELETE RESTRICT;
CREATE INDEX "operations_administrative_release_id_idx" ON "operations"("administrative_release_id");
ALTER TABLE operations ADD CONSTRAINT administrative_release_context CHECK (
  (administrative_stop_requested_at IS NULL OR administrative_release_id IS NOT NULL)
  AND (administrative_archived_at IS NULL OR (administrative_release_id IS NOT NULL AND administrative_stop_requested_at IS NOT NULL))
);
CREATE TABLE "operation_provider_requests" (
  "id" TEXT PRIMARY KEY, "operation_id" TEXT NOT NULL REFERENCES "operations"("id") ON DELETE RESTRICT,
  "method" TEXT NOT NULL, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadline_at" TIMESTAMP(3) NOT NULL, "finished_at" TIMESTAMP(3), "result_code" TEXT,
  "observed_after_stop" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "operation_provider_requests_operation_id_finished_at_deadline_at_idx"
  ON "operation_provider_requests"("operation_id", "finished_at", "deadline_at");

-- EXECUTION_FENCES: also installed in the socket-free SQL regression fixture.
CREATE OR REPLACE FUNCTION administrative_operation_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.administrative_archived_at IS NOT NULL AND NEW.administrative_archived_at IS DISTINCT FROM OLD.administrative_archived_at THEN
    RAISE EXCEPTION 'ADMIN_OPERATION_STOPPED';
  END IF;
  IF OLD.administrative_stop_requested_at IS NOT NULL AND
    (to_jsonb(NEW) - ARRAY['updated_at', 'administrative_archived_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['updated_at', 'administrative_archived_at']) THEN
    RAISE EXCEPTION 'ADMIN_OPERATION_STOPPED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER administrative_operation_fence BEFORE UPDATE ON operations
  FOR EACH ROW EXECUTE FUNCTION administrative_operation_fence();

CREATE OR REPLACE FUNCTION administrative_related_operation_fence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op_id TEXT; stopped TIMESTAMP;
BEGIN
  op_id := to_jsonb(NEW)->>'operation_id';
  IF TG_TABLE_NAME = 'wallet_transactions' THEN op_id := to_jsonb(NEW)->>'reference_id'; END IF;
  SELECT administrative_stop_requested_at INTO stopped FROM operations WHERE id = op_id FOR UPDATE;
  IF stopped IS NOT NULL THEN
    IF TG_TABLE_NAME IN ('card_lifecycle_reservations', 'provider_account_causal_reservations') AND
      to_jsonb(NEW)->>'released_at' IS NOT NULL THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'operation_dispatches' AND to_jsonb(NEW)->>'status' = 'CANCELLED' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'ADMIN_OPERATION_STOPPED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['operation_dispatches', 'card_lifecycle_reservations', 'provider_account_causal_reservations',
    'transactions', 'wallet_transactions', 'operation_fulfillment_proofs', 'operation_manual_fulfillment_evidence',
    'provider_invoice_claims', 'bein_account_spend_ledger', 'renewal_refund_settlements',
    'operation_completion_effects', 'operation_spend_award_runs'] LOOP
    EXECUTE format('CREATE TRIGGER administrative_related_fence BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION administrative_related_operation_fence()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION administrative_request_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stopped TIMESTAMP;
BEGIN
  SELECT administrative_stop_requested_at INTO stopped FROM operations WHERE id = NEW.operation_id FOR UPDATE;
  IF stopped IS NOT NULL THEN RAISE EXCEPTION 'ADMIN_OPERATION_STOPPED'; END IF;
  IF NEW.deadline_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '60 seconds' THEN
    RAISE EXCEPTION 'PROVIDER_REQUEST_DEADLINE_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER administrative_request_admission BEFORE INSERT ON operation_provider_requests
  FOR EACH ROW EXECUTE FUNCTION administrative_request_admission();
