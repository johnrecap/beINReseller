# Data Model: Credit Request Notification Handoff

## Notification Settings

**Represents**: Singleton admin configuration for Telegram request alerts and default WhatsApp handoff destination.

**Key fields**:

- `telegramEnabled`: whether new credit requests should trigger Telegram alerts.
- `telegramBotTokenEncrypted`: stored Telegram secret value; must never be returned raw.
- `telegramTargetId`: Telegram chat, group, or channel destination.
- `telegramTargetLabel`: admin-friendly label for the Telegram destination.
- `defaultWhatsappGroupUrl`: fallback WhatsApp group link.
- `defaultWhatsappPhone`: fallback WhatsApp phone destination.
- `defaultWhatsappLabel`: fallback destination label.
- `updatedByAdminId`: admin who last changed settings.

**Validation rules**:

- Empty text values are saved as empty/null equivalents.
- Saved Telegram secret is masked in responses.
- Unsafe WhatsApp URLs must not be opened.

## Credit Request

**Represents**: Customer request for balance requiring admin review.

**Key fields used by this feature**:

- `requestNumber`
- `usernameSnapshot`
- `amountUsd`
- `paymentMethod`
- `agentIdSnapshot`
- `agentNameSnapshot`
- `sourceGroupSnapshot`
- `whatsappGroupUrlSnapshot`
- `status`
- `decidedAt`
- `decidedByAdminId`

**State transitions in scope**:

- `PENDING` remains eligible for Telegram retry.
- `PENDING` to `APPROVED` creates the manual WhatsApp handoff snapshot.
- Rejection and cancellation do not create a WhatsApp handoff.

## Telegram Alert Log

**Represents**: The result of attempting to notify an admin about a new credit request.

**Key fields**:

- `eventType`: credit request created.
- `provider`: Telegram.
- `targetType`: Telegram chat.
- `targetGroupId`: configured Telegram target id.
- `targetGroupNameSnapshot`: configured label or target id.
- `creditRequestId`
- `agentId`
- `payloadSummary`
- `status`: pending, sent, failed, or disabled.
- `error`
- `attemptCount`
- `sentAt`

**Validation rules**:

- Payload summary may include request details but must not include Telegram secrets.
- Disabled settings still produce a clear disabled status for admin visibility.

## WhatsApp Handoff Snapshot

**Represents**: Approval-time manual WhatsApp message and destination.

**Key fields**:

- `creditRequestId`
- `agentId`
- `destinationLabel`
- `whatsappGroupUrl`
- `whatsappPhone`
- `messageText`
- `groupOpenAvailable`
- `phoneOpenAvailable`
- `createdByAdminId`
- `createdAt`

**Validation rules**:

- One snapshot per credit request.
- Message text must contain enough information for the admin to paste/send without editing.
- Group/phone availability flags must match the sanitized destination values.

## Customer WhatsApp Destination

**Represents**: The best available WhatsApp destination for a customer's manual confirmation.

**Resolution order**:

1. Credit request group snapshot.
2. Current active customer assignment group.
3. Agent profile default group/phone/label.
4. Global notification settings default group/phone/label.

2026-08-06 clarification: this order applies to the WhatsApp destination URL/phone and dedicated destination label. `sourceGroupSnapshot` is historical classification metadata: when it is null, no later assignment/default Source Group may be substituted as the historical Group label. A null Source Group does not stop destination fallback.

**Validation rules**:

- Group URLs must be safe HTTP/HTTPS URLs.
- Phone values must normalize to a usable WhatsApp phone URL.
