# Feature Specification: Credit Request Notification Handoff

**Feature Branch**: `022-credit-notification-handoff`

**Created**: 2026-05-31

**Status**: Draft

**Input**: User description: "Keep WhatsApp manual. Clarify and redesign the credit request notification settings block. When a customer requests credit, a Telegram message reaches the admin. The admin opens the panel, approves the request, the approval information is prepared and copied where possible on desktop, Android, and iPhone, then the admin is sent to the WhatsApp destination saved for that customer/group to paste and send manually."

## User Scenarios & Testing

### User Story 1 - Understand And Save Notification Settings (Priority: P1)

An admin can open system settings and immediately understand what the credit request notification block does. The block clearly separates Telegram alerts from manual WhatsApp confirmation, uses Arabic labels, and follows the same visual style as the rest of the settings page.

**Why this priority**: The current block is confusing and looks detached from the page. Admins must understand the flow before relying on it.

**Independent Test**: Open system settings in Arabic, review the notification block without technical wording, save settings, and confirm the page explains that WhatsApp remains manual.

**Acceptance Scenarios**:

1. **Given** an admin is on system settings, **When** they view the notification block, **Then** they see Arabic sections for Telegram alerts and manual WhatsApp confirmation.
2. **Given** the admin edits Telegram or WhatsApp fields, **When** they save settings, **Then** the saved values reload correctly and the saved Telegram secret is not displayed.
3. **Given** WhatsApp is configured, **When** the admin reads the block, **Then** the page clearly states that WhatsApp will not send automatically.

---

### User Story 2 - Alert Admin On New Credit Request (Priority: P2)

When a customer submits a credit request, the admin receives a Telegram alert that identifies the customer, amount, payment method, agent/group, order number, and pending status.

**Why this priority**: The admin needs a fast alert outside the panel so pending credit requests are not missed.

**Independent Test**: Configure Telegram, submit a credit request from an eligible customer, and confirm one Telegram alert is sent with the required request details.

**Acceptance Scenarios**:

1. **Given** Telegram alerts are enabled and configured, **When** a customer submits a credit request, **Then** the admin Telegram destination receives a readable request alert.
2. **Given** Telegram alerts are disabled or incomplete, **When** a customer submits a credit request, **Then** the credit request is still created and the notification status clearly explains why no alert was sent.
3. **Given** a Telegram alert failed, **When** an admin retries from the credit requests page while the request is pending, **Then** the retry sends the same request details and updates the notification status.

---

### User Story 3 - Manual WhatsApp Confirmation After Approval (Priority: P3)

After an admin approves a credit request, the panel prepares a WhatsApp confirmation message with the customer name, amount, order number, and approval date. The panel copies the message where the device allows it, shows a manual copy fallback, and opens the saved WhatsApp group or phone destination for the admin to paste and send manually.

**Why this priority**: The user explicitly wants WhatsApp to remain manual while reducing admin effort and avoiding missed confirmation details.

**Independent Test**: Approve a pending credit request from desktop and mobile browser flows, confirm the message is visible, can be copied, and WhatsApp opens to the saved destination without sending automatically.

**Acceptance Scenarios**:

1. **Given** a pending request has a saved WhatsApp group destination, **When** an admin approves it, **Then** the confirmation message is prepared, copy is attempted, and the group opens for manual sending.
2. **Given** automatic clipboard copy is blocked by the browser, **When** the approval dialog appears, **Then** the admin can still press a visible copy button and send manually.
3. **Given** no WhatsApp destination is saved for the request, **When** the admin approves it, **Then** the message is still prepared and the panel clearly says no WhatsApp destination is configured.

---

### Edge Cases

- Telegram destination exists but the secret is missing or cleared.
- Telegram sends slowly or fails while the credit request itself is valid.
- Admin changes text after Telegram test but before save.
- Existing saved Telegram secret must remain hidden while still usable.
- Browser blocks clipboard access on iPhone, Android, or desktop.
- Browser blocks opening WhatsApp unless it is triggered by an admin action.
- Agent-owned customer has a saved request URL snapshot, current assignment URL, agent default, and global default; the request-specific destination wins. A null historical Source Group remains null and is never replaced by later group metadata.
- WhatsApp destination link is malformed or unsafe.
- Admin approves from a filtered credit request list and must see the handoff result without losing context.

## Requirements

### Functional Requirements

- **FR-001**: The notification settings block MUST be rewritten with clear Arabic labels and helper text.
- **FR-002**: The settings block MUST separate Telegram request alerts from manual WhatsApp confirmation settings.
- **FR-003**: The settings block MUST visually match the rest of the system settings page and not appear as an unrelated block.
- **FR-004**: The system MUST allow admins to enable or disable Telegram alerts for new credit requests.
- **FR-005**: The system MUST allow admins to save, keep, replace, or clear the Telegram secret without displaying the saved secret.
- **FR-006**: The system MUST allow admins to save a default WhatsApp group link, fallback phone, and destination label.
- **FR-007**: The system MUST provide a Telegram test action that sends a test message to the configured destination.
- **FR-008**: When an eligible customer creates a credit request, the system MUST create the request even if Telegram notification is disabled or fails.
- **FR-009**: When Telegram is enabled and configured, the system MUST send one Telegram alert for each new credit request.
- **FR-010**: Telegram alerts MUST include customer name, amount, payment method, order number, request-time agent and Source Group snapshot when present, and pending status; the Group line is omitted for a null/blank snapshot and never inferred later.
- **FR-011**: Notification status MUST be visible to admins on the credit request list, including failed or disabled states.
- **FR-012**: Admins MUST be able to retry a failed or disabled Telegram alert while the credit request is still pending.
- **FR-013**: On approval, the system MUST prepare a WhatsApp confirmation message containing customer name, approved amount, order number, and approval date.
- **FR-014**: On approval, the system MUST attempt to copy the WhatsApp confirmation message where the browser allows clipboard access.
- **FR-015**: On approval, the system MUST show the prepared WhatsApp message and a clear copy button as a fallback.
- **FR-016**: On approval, the system MUST open the saved WhatsApp destination when one is available, but MUST NOT send the WhatsApp message automatically.
- **FR-017**: Agent-owned request destinations MUST resolve request URL snapshot, current assignment URL, agent default, then global default. Admin-owned/legacy-admin-owned requests MUST use global defaults only and never query a later assignment. Destination fallback is independent from the historical Source Group label.
- **FR-018**: Unsafe or malformed WhatsApp destinations MUST not be opened.
- **FR-019**: Existing credit request creation, approval, rejection, cancellation, and balance behavior MUST continue unchanged except for clearer notification handoff behavior.

### Key Entities

- **Notification Settings**: Admin-controlled Telegram and default WhatsApp configuration.
- **Credit Request**: Customer request for balance that may trigger Telegram alert and later manual WhatsApp handoff.
- **Telegram Alert Log**: Record of whether the request alert was sent, disabled, or failed.
- **WhatsApp Handoff Snapshot**: Approval-time record of the prepared message and destination used for manual sending.
- **Customer WhatsApp Destination**: The group link or phone destination connected to the customer's active assignment, agent profile, or global default.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An admin can understand and save notification settings from the page in under 2 minutes without asking what each field means.
- **SC-002**: 100% of successful credit request submissions create a pending request even when Telegram is unavailable.
- **SC-003**: A configured Telegram alert includes all required request details in one readable message.
- **SC-004**: After approval, the admin can copy the WhatsApp confirmation message in no more than one click if automatic copy is blocked.
- **SC-005**: WhatsApp is never sent automatically by the panel; the admin remains responsible for the final paste-and-send action.
- **SC-006**: Existing approval balance behavior remains unchanged after the notification handoff changes.

## Assumptions

- WhatsApp remains manual for this version; no WhatsApp sending provider is added.
- The admin is expected to have a Telegram bot and destination already available.
- Customer/group WhatsApp destination is saved through existing assignment or agent/default settings.
- Browser clipboard behavior varies by device, so the visible copy fallback is required.
- No new database table is expected; existing notification, credit request, and handoff records are reused.
