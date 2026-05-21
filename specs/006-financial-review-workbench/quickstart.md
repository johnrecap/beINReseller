# Quickstart: Financial Review Workbench

## Preconditions

1. Use a branch that contains this Spec Kit plan.
2. Confirm current schema has `OperationStatus.REVIEW_REQUIRED`.
3. Confirm at least one test or staging operation can be moved to `REVIEW_REQUIRED`.
4. Do not test refund behavior on production money unless the admin intentionally approves a real refund.

## Manual Validation Flow

1. Start from a clean working tree.
2. Implement Phase 1 and Phase 2 tasks from `tasks.md`.
3. Build the web app:

```bash
npm run build
```

4. Open `/dashboard/admin/financial-review` as admin.
5. Verify the sidebar contains "Financial Review" or the agreed localized label.
6. Verify pending review operations appear as cards.
7. Open a card and verify:
   - operation id
   - user/customer
   - card number
   - amount
   - selected package
   - beIN account
   - user deduction evidence
   - beIN balance evidence
   - refund state
   - latest card verification result, if present
   - plain-language reason
   - recommendation
8. Run "check card now" on a staging record and verify:
   - no renewal or payment is submitted
   - no refund or user-balance change is created
   - the result is stored with checked time and admin identity
   - the card shows a readable outcome: likely renewed, not confirmed, or could not verify
9. Try "Keep under review" with a note and verify the item remains visible.
10. Try "beIN executed - no refund" on a staging record and verify no refund transaction is created.
11. Try "Refund customer" on a staging record and verify exactly one operation-linked refund transaction is created.
12. Refresh and repeat the refund submit. Expected: duplicate refund is blocked.
13. Open Integrity Reports and verify it still works and links to Financial Review for pending review operations.

## Production Safety Gate

Before deploying:

- Confirm no generic balance adjustment is used for review refunds.
- Confirm admin-only authorization on all new routes.
- Confirm duplicate refund protection.
- Confirm card verification cannot charge beIN or mutate balances.
- Confirm primary UI text is readable without internal issue-code knowledge.
- Confirm the new decision action writes an audit trail.
- Confirm `npm run build` succeeds.
- Confirm no database migration is applied without a backup plan.
