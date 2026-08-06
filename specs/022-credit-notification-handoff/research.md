# Research: Credit Request Notification Handoff

## Decision: Keep WhatsApp Manual

**Decision**: The panel will not send WhatsApp messages automatically. It will prepare the confirmation text, copy it where possible, show a fallback copy button, and open the saved WhatsApp destination.

**Rationale**: The user explicitly wants manual sending. Manual handoff reduces provider dependency and keeps the admin in control of the final customer/group message.

**Alternatives considered**:

- Add WhatsApp API sending: rejected because it changes the agreed manual workflow and adds provider/account risk.
- Only show the message without opening WhatsApp: rejected because it leaves too much manual work for admins.

## Decision: Split Settings Into Telegram And WhatsApp Sections

**Decision**: The settings block should become two clear Arabic sections: Telegram alerts for new requests, and manual WhatsApp confirmation after approval.

**Rationale**: The current mixed form makes it hard to understand which settings affect alerts and which settings affect post-approval handoff.

**Alternatives considered**:

- Keep the existing two-column field grid: rejected because it is the source of confusion.
- Move notification settings to a separate page: rejected for this version because the user asked to fix the current screen and keep scope focused.

## Decision: Always Show Copy Fallback

**Decision**: After approval, always show the prepared WhatsApp message and a visible copy button, even if automatic copy succeeds.

**Rationale**: Clipboard access is inconsistent across desktop, Android, and iPhone browsers. A visible fallback prevents admin dead-ends.

**Alternatives considered**:

- Depend only on automatic copy: rejected because mobile browsers can block it.
- Make the admin manually select text every time: rejected because it slows the approval flow.

## Decision: Preserve Existing Destination Priority

**Decision**: For agent-owned requests, WhatsApp URL/phone priority remains request URL snapshot, current assignment URL, agent default, global default. Admin/legacy-admin requests use global defaults only. Historical Source Group is separate: null remains null and cannot inherit current/default group metadata.

**Rationale**: This protects the destination captured when the request was created while still allowing fallbacks.

**Alternatives considered**:

- Always use global default: rejected because customer/group-specific routing would be lost.
- Always use current assignment: rejected because assignment changes after request creation could send the admin to the wrong group; current assignment remains only a destination fallback for requests captured as agent-owned, never a historical Group label.

## Decision: Harden Telegram Secret Handling In Place

**Decision**: Keep using the current settings field but ensure the raw Telegram secret is never returned, logged, or shown. If encryption is added, it must support already saved plaintext values until an admin re-saves.

**Rationale**: The current field name implies protected storage. The plan should reduce token exposure risk without requiring a schema migration.

**Alternatives considered**:

- Add a new column: rejected because no schema migration is needed for this UI/flow feature.
- Leave secret handling untouched: rejected because the feature area already handles provider secrets and should not leak them while being updated.
