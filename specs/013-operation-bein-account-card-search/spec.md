# Feature Specification: Operation beIN Account Card Search

**Feature Branch**: `013-operation-bein-account-card-search`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "Analyze the beIN Spend Report workflow, make every operation traceable to the beIN account used for it, and allow searching for operations by the card number used in the operation."

## User Scenarios & Testing

### User Story 1 - Audit the beIN Account Used By an Operation (Priority: P1)

An admin reviewing a financial operation can identify which beIN account was used for the operation, whether the beIN balance change is confirmed, and whether the stored operation account link matches the confirmed spend evidence.

**Why this priority**: This is the core financial audit requirement. Search and reporting are not trustworthy unless each operation has a reliable account link and conflict behavior.

**Independent Test**: Complete one renewal or installment flow in a controlled environment, then open the operation detail or financial review view and confirm the beIN account identity, card number, spend evidence, and operation status are consistent.

**Acceptance Scenarios**:

1. **Given** an operation reaches a confirmed beIN balance debit, **When** an admin opens its details, **Then** the admin sees the beIN account identity, card number, debit amount, and balance before/after evidence.
2. **Given** a confirmed spend row is created for an operation, **When** the stored operation account differs from the confirmed spend account, **Then** the operation is not silently accepted and is flagged for admin review.
3. **Given** a legacy operation has no confirmed beIN balance debit, **When** an admin views it, **Then** the system distinguishes it from confirmed spend instead of inventing spend evidence.

---

### User Story 2 - Search the beIN Spend Report By Card Number (Priority: P2)

An admin can type a smart card number in the beIN Spend Report and find confirmed spend rows for that card within the selected date range, while still being able to combine that search with beIN account, user, type, and date filters.

**Why this priority**: The screenshot shows the report is already the admin's main audit surface. Card-number search directly solves the reported workflow gap.

**Independent Test**: Use a known card number from a confirmed spend ledger row, search the report by that card number, and confirm only matching detail rows and matching grouped totals are returned.

**Acceptance Scenarios**:

1. **Given** confirmed spend rows exist for a card, **When** the admin searches by the full card number, **Then** all matching rows in the date range appear and totals reflect the filtered rows.
2. **Given** the admin enters spaces or separators around the card number, **When** the search runs, **Then** the system normalizes the input and returns the same matches as the raw digits.
3. **Given** no confirmed spend rows match the card number, **When** the search runs, **Then** the report shows an empty state without changing unrelated filters.

---

### User Story 3 - Search Operation History By Card Number (Priority: P3)

A signed-in panel user can filter their own operation history by card number, and an admin can use admin reporting surfaces to locate operations by card number for investigation.

**Why this priority**: The general operation history already contains card numbers and is the correct place to locate non-confirmed, cancelled, failed, or in-progress operations that may not appear in confirmed spend.

**Independent Test**: Search history using a card number with multiple operation states and verify only operations owned by the current user are returned in user history, while admin-only surfaces remain the source for global audit.

**Acceptance Scenarios**:

1. **Given** a user has operations for multiple cards, **When** the user filters history by one card number, **Then** only their own matching operations are returned.
2. **Given** an operation is failed, cancelled, expired, or under review, **When** the matching card number is searched in operation history, **Then** it can still be found even if it has no confirmed spend ledger row.
3. **Given** a user searches for another user's card number, **When** the history endpoint runs, **Then** no unauthorized operation data is returned.

---

### Edge Cases

- Card search input contains spaces, dashes, hidden whitespace, or fewer than the normal number of digits.
- Multiple operations use the same card across different beIN accounts and dates.
- An operation has `beinAccountId` but no confirmed spend ledger row.
- A confirmed ledger row exists but operation status later changes to review.
- Legacy operations have no account link and no balance evidence.
- The admin combines card number, beIN account, user, operation type, and date filters.
- The date range is valid but contains no rows.
- Sensitive beIN account secrets must not be exposed in API responses.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST retain the beIN account identity selected for an operation once processing starts.
- **FR-002**: The system MUST retain confirmed beIN spend evidence separately from unconfirmed or review-only evidence.
- **FR-003**: The system MUST flag account-link conflicts when confirmed spend evidence does not match the operation's stored beIN account.
- **FR-004**: Admins MUST be able to search confirmed beIN spend by card number.
- **FR-005**: Admin card searches MUST support combination with date range, beIN account, panel user, and operation type filters.
- **FR-006**: The beIN Spend Report MUST show which beIN account is associated with each detail row using a human-readable label or username.
- **FR-007**: Users MUST be able to search their own operation history by card number.
- **FR-008**: Non-admin users MUST NOT receive another user's operations through card-number search.
- **FR-009**: The system MUST normalize card-number search input to digits before applying filters.
- **FR-010**: The system MUST not expose beIN passwords, TOTP secrets, cookies, session state, ViewState, or provider tokens in any report or operation response.
- **FR-011**: Legacy operations that cannot be proven as confirmed beIN spend MUST remain visible in operation history but MUST NOT be counted as confirmed spend.
- **FR-012**: The implementation MUST include verification for report filters, history filters, account-link consistency, and UI empty/error states.

### Key Entities

- **Operation**: A user or customer action against a smart card. Key business attributes include operation id, owner, card number, status, operation type, amount, timestamps, and the beIN account selected by the worker.
- **beIN Account**: A configured dealer account used to perform provider actions. Business-visible attributes include account id, username, optional label, active state, and current dealer balance.
- **Confirmed beIN Spend**: Immutable audit evidence that a beIN account balance decreased for an operation. It includes operation id, beIN account identity, card number snapshot, package snapshot, balance before/after, spend amount, and evidence source.
- **Operation History Filter**: User-facing criteria used to narrow operations by type, status, date, and card number.
- **Report Filter**: Admin-facing criteria used to narrow confirmed spend by date, account, user, type, and card number.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Admins can locate a known confirmed spend operation by card number in under 10 seconds.
- **SC-002**: 100% of new confirmed spend rows include an operation id, beIN account id, card number snapshot, spend amount, and balance before/after evidence.
- **SC-003**: Card-number search returns only matching rows for full-card exact searches and never returns another user's operations in user history.
- **SC-004**: Legacy operations without confirmed beIN spend remain searchable in operation history while contributing 0 to confirmed spend totals.
- **SC-005**: Report and history screens show clear empty states for no-match searches with no server error.
- **SC-006**: Build verification succeeds for the app and worker after the feature is implemented; any pre-existing lint debt is reported separately.

## Assumptions

- The existing `Operation` account link and confirmed spend ledger are the correct source-of-truth primitives.
- Admins are allowed to see beIN account username or label for audit, but credentials and session artifacts remain secret.
- Card-number search should normalize formatting but should not implement fuzzy matching beyond digit containment unless explicitly requested later.
- Historical rows without balance evidence cannot be converted into confirmed spend safely.
- This feature targets the existing web panel and worker; mobile app UI changes are out of scope unless they consume existing operation detail responses.
