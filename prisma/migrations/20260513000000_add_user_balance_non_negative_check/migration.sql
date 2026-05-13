ALTER TABLE "users"
ADD CONSTRAINT "users_balance_non_negative"
CHECK ("balance" >= 0) NOT VALID;
