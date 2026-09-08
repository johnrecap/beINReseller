CREATE TYPE "StoreCreditLedgerEntryType" AS ENUM ('DEBIT', 'REFUND');

-- Existing order/admin writers do not all take the subscription claim's
-- customer lock. This database boundary makes a stale concurrent decrement
-- fail closed instead of letting the shared store-credit balance go negative.
-- NOT VALID avoids silently blocking deployment on historical bad rows while
-- still enforcing the constraint for every new insert/update.
ALTER TABLE "customers"
    ADD CONSTRAINT "customers_store_credit_nonnegative_check"
    CHECK (
        "store_credit" >= 0 AND
        "store_credit" < 'Infinity'::double precision AND
        "store_credit" <> 'NaN'::double precision
    ) NOT VALID;

CREATE TABLE "store_credit_ledger_entries" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "entry_type" "StoreCreditLedgerEntryType" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "balance_before_minor" INTEGER NOT NULL,
    "balance_after_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_credit_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_credit_ledger_entries_positive_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "store_credit_ledger_entries_nonnegative_balance_check" CHECK (
        "balance_before_minor" >= 0 AND "balance_after_minor" >= 0
    ),
    CONSTRAINT "store_credit_ledger_entries_balance_direction_check" CHECK (
        ("entry_type" = 'DEBIT' AND "balance_before_minor" - "balance_after_minor" = "amount_minor") OR
        ("entry_type" = 'REFUND' AND "balance_after_minor" - "balance_before_minor" = "amount_minor")
    ),
    CONSTRAINT "store_credit_ledger_entries_currency_check" CHECK (
        "currency" IN ('SAR', 'EGP')
    )
);

CREATE UNIQUE INDEX "store_credit_ledger_entries_subscription_id_entry_type_key"
    ON "store_credit_ledger_entries"("subscription_id", "entry_type");

CREATE INDEX "store_credit_ledger_entries_customer_id_created_at_idx"
    ON "store_credit_ledger_entries"("customer_id", "created_at");

ALTER TABLE "store_credit_ledger_entries"
    ADD CONSTRAINT "store_credit_ledger_entries_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "store_subscriptions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "store_credit_ledger_entries"
    ADD CONSTRAINT "store_credit_ledger_entries_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
