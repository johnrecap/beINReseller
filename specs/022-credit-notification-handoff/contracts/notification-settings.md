# Contract: Notification Settings Screen

## Purpose

Define the admin-facing behavior for the credit request notification settings block.

## Screen Sections

### Section 1: Telegram Alerts

**Visible meaning**: "When a customer requests credit, send an alert to admin Telegram."

**Controls**:

- Enable/disable Telegram request alerts.
- Telegram bot secret input.
- Clear saved Telegram secret option.
- Telegram destination input.
- Telegram destination label input.
- Test Telegram button.

**Required states**:

- Loading settings.
- Save in progress.
- Save success.
- Save error.
- Test in progress.
- Test success.
- Test error with readable reason.

**Privacy contract**:

- Saved Telegram secret is never shown raw.
- Placeholder may say a saved secret exists.
- Clearing the secret must be explicit.

### Section 2: Manual WhatsApp Confirmation

**Visible meaning**: "After approval, prepare and copy a WhatsApp message, then open WhatsApp for manual sending."

**Controls**:

- Default WhatsApp group link.
- Default WhatsApp phone.
- Destination label.

**Required helper text**:

- WhatsApp is manual.
- The panel copies/prepares the message and opens WhatsApp.
- The admin is responsible for paste and send.

## Save Behavior

**Input**: Current visible settings plus optional new Telegram secret and clear-secret flag.

**Result**:

- Settings are saved.
- Saved response returns masked Telegram secret status only.
- UI resets the raw secret input and clear-secret checkbox after successful save.

## Test Telegram Behavior

**Input**: Saved Telegram settings.

**Result**:

- If secret and destination exist, send a test message.
- If missing, show a clear setup error.
- Do not require creating a credit request.
