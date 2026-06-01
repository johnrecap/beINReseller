# Contract: Credit Request Alert And Manual WhatsApp Handoff

## New Credit Request Alert

**Trigger**: Eligible customer submits a credit request.

**Expected outcome**:

- Credit request is created.
- Telegram alert is attempted only when enabled and configured.
- Request creation succeeds even if Telegram is disabled, missing configuration, or fails.

**Telegram message must include**:

- Customer username.
- Requested amount.
- Payment method.
- Agent/group information when available.
- Order number.
- Pending status.

**Admin list must show**:

- Latest notification status.
- Destination label or failure reason.
- Retry option when the request is still pending and notification failed or was disabled.

## Approval WhatsApp Handoff

**Trigger**: Admin approves a pending credit request.

**Expected outcome**:

- Balance approval behavior remains unchanged.
- WhatsApp handoff snapshot is created once.
- Prepared message is returned to the admin UI.
- UI attempts copy where allowed.
- UI shows message and copy/open buttons.
- UI opens WhatsApp destination if available.
- UI never sends the WhatsApp message automatically.

**WhatsApp message must include**:

- Customer username.
- Approved amount.
- Order number.
- Approval date.

**Destination behavior**:

- Group link opens when available and safe.
- Phone URL opens when no group is available but a valid phone is available.
- If neither exists, the message remains visible and copyable.

## Failure Behavior

- Telegram failure must not block request creation.
- Clipboard failure must not block approval.
- Missing WhatsApp destination must not block approval.
- Unsafe WhatsApp URLs must be ignored and not opened.
