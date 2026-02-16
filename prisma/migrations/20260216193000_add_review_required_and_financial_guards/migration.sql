-- Add REVIEW_REQUIRED terminal status for uncertain beIN confirmation outcomes.
ALTER TYPE "OperationStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';

-- Financial idempotency guards:
-- 1) At most one refund transaction per operation.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_transactions_refund_once"
ON "transactions" ("operation_id")
WHERE "operation_id" IS NOT NULL AND "type" = 'REFUND';

-- 2) At most one OPERATION_DEDUCT transaction per operation.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_transactions_deduct_once"
ON "transactions" ("operation_id")
WHERE "operation_id" IS NOT NULL AND "type" = 'OPERATION_DEDUCT';

-- 3) At most one customer wallet refund per operation reference.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_wallet_refund_once"
ON "wallet_transactions" ("reference_id")
WHERE "reference_id" IS NOT NULL AND "reference_type" = 'REFUND';
