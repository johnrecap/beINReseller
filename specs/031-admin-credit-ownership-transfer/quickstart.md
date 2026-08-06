# Quickstart: Admin Credit Requests And Unified Ownership Transfer

## Prerequisites

- Test database available with Prisma migrations applied.
- One active admin.
- One active manager/distributor.
- One active agent.
- Three active normal users: admin-owned, manager-owned, and agent-owned.
- Notification settings configured for Telegram target id and default WhatsApp destination when testing notifications.

## Scenario 1: Admin-Owned User Requests Credit

1. Sign in as an active normal user owned by admin.
2. Open `/dashboard/credit-requests`.
3. Submit a credit request with amount and payment method.
4. Confirm the request appears in recent requests.
5. Sign in as admin and open `/dashboard/admin/credit-requests`.
6. Confirm the card shows admin/direct owner wording and no fake agent name.

Expected result: request is pending admin review and Telegram notification is marked as sent when settings are configured.

## Scenario 2: Manager-Owned User Remains Blocked

1. Sign in as an active normal user owned by a manager/distributor.
2. Open `/dashboard/credit-requests`.
3. Try to submit a credit request.

Expected result: form is blocked with a clear owner/permission reason.

## Scenario 3: Admin-Owned WhatsApp Handoff

1. Use the admin-owned request from Scenario 1.
2. Approve it from admin review.
3. Confirm copied text contains the request information.
4. Confirm the opened WhatsApp link uses the default WhatsApp destination.

Expected result: no current or later agent assignment is used for this request.

## Scenario 4: Transfer Admin-Owned User To Agent

1. Sign in as admin.
2. Open the admin users page.
3. Search for an admin-owned normal user.
4. Open the transfer action.
5. Select target type `Agent`, choose an active agent, leave Source Group empty, and save.
6. Refresh the admin users page and the agent users page.

Expected result: the user appears under the selected agent with localized `No group`, no longer appears as admin-owned, and all financial values/history remain unchanged.

## Scenario 5: Transfer Agent-Owned User To Manager

1. Search for a normal user currently owned by an agent.
2. Open the transfer action.
3. Select target type `Manager`, choose an active manager/distributor, and save.
4. Refresh admin and manager views.

Expected result: the active agent ownership is closed and the user appears under the selected manager/distributor only.

## Scenario 6: Transfer Manager-Owned User To Admin

1. Search for a normal user currently owned by a manager/distributor.
2. Open the transfer action.
3. Select target type `Admin`, choose admin, and save.
4. Refresh admin and manager views.

Expected result: the old manager ownership is removed and the user appears as admin-owned/direct only.

## Scenario 7: Source Group Presence Semantics

1. Transfer to an agent with a configured default and omit Source Group; confirm the default is stored.
2. Edit the same agent without sending Source Group; confirm it is preserved.
3. Edit the same agent with blank/`null`; confirm it becomes `null`.
4. Transfer to a different agent without a default; confirm the old Source Group and WhatsApp URL do not carry over.
5. Set a manual value and confirm trimming plus the 120-character limit.

Expected result: resolution modes are `AGENT_DEFAULT`, `PRESERVED`, `CLEARED`, `NONE`, and `EXPLICIT` respectively; WhatsApp behavior is independent.

## Scenario 8: Concurrent Transfer Protection

1. Load the same user in two admin sessions and retain both ownership tokens.
2. Transfer the user from the first session.
3. Submit a different target from the second session with its stale token.

Expected result: first transfer commits; second returns `409 OWNERSHIP_CHANGED`, asks for refresh/confirmation, and changes no ownership or financial rows.

## Scenario 9: Historical No-Group Request

1. Create a credit request while an agent assignment has no Source Group.
2. Add or change the assignment Source Group after request creation.
3. Review/filter/retry notification for the old request.

Expected result: the request remains in the explicit no-group filter, Telegram omits Group, and WhatsApp destination fallback still works without inventing a historical group label.

## Verification Commands

```bash
npx tsx --test tests/unit/user-ownership-classification.test.ts
npx tsx --test tests/unit/credit-request-ownership.test.ts
npx tsx --test tests/unit/credit-request-telegram.test.ts
npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts
npx tsx --test tests/unit/user-ownership-transfer.test.ts
npx tsx --test tests/integration/credit-request-admin-owned.test.ts
npx tsx --test tests/integration/admin-user-ownership-transfer.test.ts
npx tsx --test tests/integration/admin-agent-assignments.test.ts
npx tsx --test tests/integration/admin-credit-requests-source-group-filter.test.ts
npx prisma validate
npm run check:schema-sync
npm run build
npm --prefix worker run build
npx playwright test tests/e2e/admin-user-ownership-transfer.spec.ts
```

## Production Data Audit

Before deploy, run the read-only bounded audit:

```bash
npx tsx scripts/audit-user-ownership-conflicts.ts --limit=100
```

Review the returned counts and user ids for:

- users with more than one current manager/admin ownership link.
- users with more than one active agent assignment.
- users with both manager/admin ownership and active agent assignment.
- users with no current owner but `createdById` pointing to admin.

Do not add strict ownership uniqueness constraints until this audit is reviewed.

After the audit is clean, apply the reviewed one-manager-link-per-user migration. Keep the canonical row locks because they also serialize manager-versus-agent cross-table ownership and completion-time point capture.
