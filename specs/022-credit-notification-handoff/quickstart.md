# Quickstart: Credit Request Notification Handoff

## Prerequisites

- Admin account.
- Eligible customer account assigned to an agent.
- Telegram bot token and destination for real Telegram delivery tests.
- A customer/assignment or default WhatsApp group link for manual handoff tests.

## Automated Checks

```bash
npx tsx --test tests/unit/credit-request-notifications.test.ts
npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts
npx tsc --noEmit
npm run build
```

## Manual Check 1: Settings Screen Clarity

1. Open `/dashboard/admin/settings` as admin.
2. Confirm the notification settings block is in Arabic and visually matches the settings page.
3. Confirm Telegram and WhatsApp are in separate sections.
4. Confirm the WhatsApp helper text says sending is manual.
5. Save settings and reload the page.
6. Confirm the Telegram secret is not displayed raw.

## Manual Check 2: Telegram Alert

1. Enable Telegram alerts and save a valid Telegram secret and destination.
2. Use an eligible customer to submit a credit request.
3. Confirm the customer sees the request as pending.
4. Confirm the admin receives one Telegram message with customer, amount, payment method, agent/group, order number, and pending status.
5. Open admin credit requests and confirm notification status is visible.

## Manual Check 3: Manual WhatsApp Approval

1. Ensure the credit request has a saved WhatsApp group link through the customer assignment or global default.
2. Approve the request as admin.
3. Confirm the WhatsApp handoff dialog appears.
4. Confirm the message includes customer username, amount, order number, and approval date.
5. Confirm the message can be copied with the visible copy button.
6. Confirm WhatsApp opens to the configured destination.
7. Confirm the panel does not send the WhatsApp message automatically.

## Manual Check 4: Mobile Clipboard Fallback

1. Repeat approval from Android browser if available.
2. Repeat approval from iPhone browser if available.
3. If automatic copy is blocked, confirm the visible copy button and textarea still allow the admin to send manually.

## Encoding Check

```bash
rg -n "أ¢|أ¯طںآ½|أƒ|أ‚|â|Ã|Â" src/components/admin/NotificationSettingsForm.tsx src/components/admin/credit-requests/AdminCreditRequestsClient.tsx src/lib/credit-requests tests/unit specs/022-credit-notification-handoff
git diff --check
```

## Deployment Notes

- No Prisma migration is expected.
- Use the safe production order from `AGENTS.md`: stop `bein-web`, remove `.next`, build, restart `bein-web`, then build/restart worker processes if needed.
