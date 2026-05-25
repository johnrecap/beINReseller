# Quickstart: Operation beIN Account Card Search

## Pre-Implementation Baseline

1. Confirm current schema and generated client are valid:
   ```bash
   npm run check:schema-sync
   npx prisma generate
   ```

2. Confirm current build state:
   ```bash
   npm run build
   npm run worker:build
   ```

3. Note current known limitation:
   ```bash
   npm run lint
   ```
   Expected before lint cleanup: repository has pre-existing lint errors unrelated to this feature.

## Manual Verification After Implementation

1. Create or identify a confirmed renewal/installment operation with a known card number.
2. Open Admin > Reports > beIN Spend Report.
3. Select a date range containing the operation.
4. Search by the full card number.
5. Verify:
   - Detail rows all match the card number.
   - Grouped account totals update to filtered results.
   - Detail rows show beIN account username or label.
   - No password, TOTP, cookies, session state, ViewState, or provider token appears.

## Operation History Verification

1. Open a user account that owns operations for multiple cards.
2. Open Operations History.
3. Search by one card number.
4. Verify:
   - Only operations for that user's card appear.
   - Failed, cancelled, expired, and review operations can be found if they match.
   - Searching for a card owned by another user returns no rows.

## Conflict Verification

1. Use a test database or fixture where an operation has one `beinAccountId` and a confirmed ledger row references a different beIN account.
2. Run the ledger recording path or targeted test.
3. Verify:
   - The conflict is not silently accepted.
   - The operation moves to review or returns a review-required result.
   - The existing confirmed ledger row is preserved.

## Final Verification Commands

```bash
npm run check:schema-sync
npx prisma generate
npx tsx --test tests/unit/bein-spend-ledger-filters.test.ts tests/unit/bein-spend-report-card-search.test.ts tests/unit/operation-card-search-filter.test.ts tests/unit/operation-detail-redaction.test.ts
npx tsx --test tests/unit/operation-recovery-foundation.test.ts tests/unit/operation-recovery-classifier.test.ts tests/unit/operation-recovery-lock-release.test.ts
npx tsx --test tests/integration/operation-bein-account-link.test.ts
npm run build
npm run worker:build
```

`tests/integration/operation-bein-account-link.test.ts` skips by default when no database fixture is enabled. To run it against a configured test database:

```bash
RUN_DB_INTEGRATION=1 npx tsx --test tests/integration/operation-bein-account-link.test.ts
```

Optional if lint debt is addressed:

```bash
npm run lint
```
