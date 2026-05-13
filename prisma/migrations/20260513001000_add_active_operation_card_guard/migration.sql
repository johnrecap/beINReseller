CREATE UNIQUE INDEX "operations_one_active_per_card"
ON "operations" ("card_number")
WHERE "status" IN (
  'PENDING',
  'PROCESSING',
  'AWAITING_CAPTCHA',
  'AWAITING_PACKAGE',
  'AWAITING_FINAL_CONFIRM',
  'COMPLETING'
);
