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
5. Select target type `Agent`, choose an active agent, enter source group, and save.
6. Refresh the admin users page and the agent users page.

Expected result: the user appears under the selected agent and no longer appears as admin-owned.

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

## Verification Commands

```bash
npx tsx --test tests/unit/user-ownership-classification.test.ts
npx tsx --test tests/unit/credit-request-ownership.test.ts
npx tsx --test tests/unit/credit-request-telegram.test.ts
npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts
npx tsx --test tests/unit/user-ownership-transfer.test.ts
npx tsx --test tests/integration/credit-request-admin-owned.test.ts
npx tsx --test tests/integration/admin-user-ownership-transfer.test.ts
npx prisma validate
npm run build
```

## Production Data Audit

Before deploy, run or include equivalent checks for:

- users with more than one current manager/admin ownership link.
- users with more than one active agent assignment.
- users with both manager/admin ownership and active agent assignment.
- users with no current owner but `createdById` pointing to admin.

Do not add strict ownership uniqueness constraints until this audit is reviewed.
