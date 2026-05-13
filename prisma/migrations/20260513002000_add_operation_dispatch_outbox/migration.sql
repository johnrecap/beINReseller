CREATE TABLE "operation_dispatches" (
  "id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "job_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "dispatched_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operation_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operation_dispatches_operation_id_job_type_key"
ON "operation_dispatches" ("operation_id", "job_type");

CREATE INDEX "operation_dispatches_status_created_at_idx"
ON "operation_dispatches" ("status", "created_at");

CREATE INDEX "operation_dispatches_operation_id_idx"
ON "operation_dispatches" ("operation_id");

ALTER TABLE "operation_dispatches"
ADD CONSTRAINT "operation_dispatches_operation_id_fkey"
FOREIGN KEY ("operation_id") REFERENCES "operations" ("id")
ON DELETE CASCADE ON UPDATE CASCADE;
