# Feature Specification: Bulk Proxy Import

**Feature Branch**: `021-bulk-proxy-import`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Analyze the current proxy entry flow. Current admin panel adds proxies one by one manually. Add a practical way to paste many proxies at once from a text source like Webshare. Use a textarea instead of file upload for the first version. Each line uses host:port:username:password. Imported proxies should be automatically named sequentially as بروكسي 1, بروكسي 2, بروكسي 3, continuing after existing names."

## User Scenarios & Testing

### User Story 1 - Paste Many Proxies At Once (Priority: P1)

An admin can open proxy management, paste a block of proxy lines, preview validation, and import all valid rows in one action instead of adding every proxy manually.

**Why this priority**: This removes the current slow manual workflow and makes importing provider proxy lists practical.

**Independent Test**: Paste 50 valid `host:port:username:password` lines, preview them, save, and confirm 50 active proxies are created without exposing passwords.

**Acceptance Scenarios**:

1. **Given** the admin has 50 valid Webshare proxy lines, **When** they paste and import them, **Then** all valid non-duplicate proxies are created.
2. **Given** the pasted text includes blank lines, **When** the admin previews/imports, **Then** blank lines are ignored and do not count as errors.
3. **Given** the admin imports valid proxies with username and password, **When** the import finishes, **Then** the password is stored securely and never shown back in the UI.

---

### User Story 2 - See Duplicates And Invalid Rows Before Saving (Priority: P2)

An admin can see a clear import summary showing valid, duplicate, and invalid rows before committing changes.

**Why this priority**: Bulk actions can create many bad records quickly; preview prevents accidental imports and reduces cleanup work.

**Independent Test**: Paste a mixed list containing valid rows, duplicate host:port rows, invalid ports, and malformed rows; confirm the preview summary classifies each group correctly.

**Acceptance Scenarios**:

1. **Given** a pasted list contains duplicate host:port values already in the panel, **When** the admin previews/imports, **Then** duplicates are skipped and reported.
2. **Given** a pasted row has an invalid port or missing fields, **When** the admin previews/imports, **Then** that row is not saved and the row number appears in the error list.
3. **Given** the same host:port appears twice in the pasted text, **When** the admin previews/imports, **Then** only the first valid occurrence is eligible and the later duplicate is reported.

---

### User Story 3 - Auto-Name Imported Proxies Sequentially (Priority: P3)

Imported proxies are assigned readable Arabic labels automatically, starting from the next available number.

**Why this priority**: The admin should not have to name every proxy manually, and the resulting list should stay easy to scan.

**Independent Test**: If existing labels include `بروكسي 1` and `بروكسي 2`, import three new proxies and confirm they are named `بروكسي 3`, `بروكسي 4`, and `بروكسي 5`.

**Acceptance Scenarios**:

1. **Given** no existing imported proxy labels, **When** the admin imports three valid proxies, **Then** labels are `بروكسي 1`, `بروكسي 2`, and `بروكسي 3`.
2. **Given** existing matching labels already exist, **When** new proxies are imported, **Then** numbering continues from the highest existing matching number.
3. **Given** an import contains invalid or duplicate rows, **When** labels are assigned, **Then** only saved rows consume label numbers.

---

### Edge Cases

- Pasted text contains spaces around fields.
- Pasted text contains Windows or Unix line endings.
- Pasted text contains more than the allowed maximum rows.
- Password contains characters that need safe encryption and must not be logged or returned.
- Username exists without password, or password exists without username.
- Host is malformed or contains unsafe characters.
- Port is not numeric or outside `1..65535`.
- Admin closes the dialog after preview without saving.
- Existing manual add/edit/delete proxy flow must continue to work.

## Requirements

### Functional Requirements

- **FR-001**: Admins MUST be able to paste multiple proxy rows into a bulk import dialog in the proxy management page.
- **FR-002**: The system MUST support `host:port:username:password` rows for authenticated proxies.
- **FR-003**: The system SHOULD support `host:port` rows for unauthenticated proxies if both username and password are absent.
- **FR-004**: The system MUST ignore blank lines.
- **FR-005**: The system MUST trim whitespace around fields before validation.
- **FR-006**: The system MUST reject malformed rows and report their row numbers.
- **FR-007**: The system MUST reject ports outside `1..65535`.
- **FR-008**: The system MUST reject rows where only username or only password is provided.
- **FR-009**: The system MUST skip duplicates based on `host + port` against existing records.
- **FR-010**: The system MUST skip duplicates within the same pasted batch.
- **FR-011**: The system MUST save only valid non-duplicate rows.
- **FR-012**: The system MUST encrypt imported passwords using the same secret storage behavior used by single proxy creation.
- **FR-013**: The system MUST never return imported plaintext passwords in API responses.
- **FR-014**: The system MUST auto-label saved proxies using the Arabic prefix `بروكسي` and sequential numbers.
- **FR-015**: The system MUST continue numbering after the highest existing label matching `بروكسي <number>`.
- **FR-016**: The system MUST provide an import summary including total rows, valid rows, imported rows, skipped duplicates, and invalid rows.
- **FR-017**: The system MUST keep existing single-proxy add/edit/delete/test behavior unchanged.
- **FR-018**: The system MUST limit import size to a safe maximum to prevent accidental oversized requests.

### Key Entities

- **Proxy Import Row**: One pasted line containing host, port, and optional authentication fields.
- **Import Preview Result**: A non-persistent classification of pasted rows as valid, duplicate, or invalid.
- **Imported Proxy**: A saved proxy record created from a valid import row.
- **Auto Label Sequence**: The next available `بروكسي N` label number based on existing labels and newly saved rows.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An admin can import 50 proxies from pasted text in under 2 minutes.
- **SC-002**: Invalid and duplicate rows are reported with row numbers before or during import.
- **SC-003**: Existing proxy records are not duplicated when the same host:port appears in the paste or already exists in the panel.
- **SC-004**: Imported proxy passwords are not exposed in list, preview, or import result responses.
- **SC-005**: Existing manual proxy operations continue to pass their current behavior checks.

## Assumptions

- The first version uses textarea paste import, not file upload.
- Admin-only access matches the current proxy management permission model.
- The default label prefix is fixed as `بروكسي` for this version.
- Imported proxies default to active unless the UI exposes an explicit toggle.
- No database migration is required because the existing `proxies` table already stores all needed fields.
