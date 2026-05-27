# Feature Specification: Points Analysis Report

**Feature Branch**: `019-points-analysis-report`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "Add a simple admin panel page that explains where points came from, whether they were converted to money or are still only points, and which customer, agent, manager, or admin owns them. The page should live with the reports tabs and be understandable to a non-programmer."

## User Scenarios & Testing

### User Story 1 - See The Whole Points Picture (Priority: P1)

An admin opens the Reports Center and sees a Points Analysis tab that summarizes all points in plain language: earned, available, converted to balance, reversed, pending, and cancelled.

**Why this priority**: This answers the main business question without requiring database access or code knowledge.

**Independent Test**: Open `/dashboard/admin/reports?tab=points-analysis` as admin and confirm the page shows totals and a ledger table even when filters are empty.

**Acceptance Scenarios**:

1. **Given** the admin is authenticated, **When** they open the Points Analysis tab, **Then** they see summary cards for earned, available, converted, reversed, pending, and cancelled points.
2. **Given** there are point ledger rows from operations, Eid rewards, cash conversions, and reversals, **When** the report loads, **Then** every row labels the source in business language and shows the owner user.
3. **Given** the points program is disabled, **When** the admin opens the report, **Then** historical ledger data still appears and a separate settings status explains conversion may be disabled.

---

### User Story 2 - Trace One Owner's Points (Priority: P2)

An admin searches for a customer, agent, manager, or admin and sees a timeline explaining where that owner's points came from and what happened to them.

**Why this priority**: Support questions are usually about one account, so the report must quickly answer "why does this account have these points?"

**Independent Test**: Search an owner that has an Eid reward, an operation spend award, and a cash conversion. Confirm the owner drawer or detail section shows the full path from source to current status.

**Acceptance Scenarios**:

1. **Given** the admin searches by username or email, **When** a matching owner is selected, **Then** the page shows that owner's totals and ledger timeline.
2. **Given** a ledger entry came from an operation spend award, **When** it is displayed, **Then** the row shows operation reference, amount snapshot, rate snapshot, and created time in Africa/Cairo.
3. **Given** a ledger entry was converted to balance, **When** it is displayed, **Then** the row links it to the cash redemption and transaction reference where available.

---

### User Story 3 - Filter And Audit Safely (Priority: P3)

An admin filters the report by date, role, owner, source type, status, and conversion state without changing any points or balances.

**Why this priority**: Filtering makes the report usable at production scale while keeping it read-only and safe.

**Independent Test**: Apply role, source, status, and date filters and confirm returned rows and summary totals match the filtered result set.

**Acceptance Scenarios**:

1. **Given** a date range is selected, **When** the admin applies the filter, **Then** all displayed dates use Egypt time and totals match only that range.
2. **Given** the admin filters by source type, **When** they choose Eid rewards, operation spend, cash conversion, reversal, or legacy sources, **Then** only matching rows appear.
3. **Given** a non-admin attempts to access the report API, **When** the request is made, **Then** the system rejects the request.

---

### Edge Cases

- Empty ledger: show zero totals and a clear empty state.
- Deleted or inactive owner: keep ledger rows visible and label the owner status instead of hiding history.
- Legacy point sources: include them in a separate "legacy/manual" bucket so they do not look like spend or Eid earnings.
- Negative rows: cash conversion and reversal rows must be explained as deductions, not displayed as new earnings.
- Duplicate source references: rely on existing ledger uniqueness and never create or mutate ledger rows from the report.
- Missing related operation, transaction, or redemption: show the ledger entry with "reference unavailable" instead of failing the page.
- Large ledgers: paginate server-side and avoid loading all rows into the browser.
- Timezone: display filters and timestamps in Africa/Cairo consistently.

## Requirements

### Functional Requirements

- **FR-001**: System MUST add a `points-analysis` tab to the existing admin Reports Center.
- **FR-002**: System MUST keep the report read-only; it must not create, update, release, reverse, or convert points.
- **FR-003**: System MUST use `point_ledger_entries` as the source of truth for point movement.
- **FR-004**: System MUST join owner user data so each row identifies the account, role, email, and active/deleted state.
- **FR-005**: System MUST show aggregate totals for earned, available, converted, reversed, pending, cancelled, and legacy/manual points.
- **FR-006**: System MUST show whether points have been converted to balance by reading `point_cash_redemptions`, the related ledger entry, and transaction data where available.
- **FR-007**: System MUST separate point source labels into plain business categories: operation spend, Eid reward, cash conversion, reversal, reward redemption, admin/manual, credit request, manager top-up, and release.
- **FR-008**: System MUST provide filters for date range, role, owner search, source type, ledger status, and conversion state.
- **FR-009**: System MUST provide an owner detail view or expandable section showing a selected owner's point timeline and totals.
- **FR-010**: System MUST format all displayed dates with the existing Africa/Cairo time helpers.
- **FR-011**: System MUST protect all new APIs and pages with admin authorization.
- **FR-012**: System MUST paginate ledger rows server-side and return stable ordering by newest first.
- **FR-013**: System MUST not expose internal stack traces or sensitive beIN/account secrets in report responses.
- **FR-014**: System SHOULD add targeted database indexes only if query review shows existing indexes are insufficient for production date/filter queries.
- **FR-015**: System MUST keep existing rewards, point settings, and user rewards pages working unchanged.

### Key Entities

- **Point ledger entry**: Existing record of every point movement, including owner, source type, source id, points, status, snapshots, and timestamps.
- **Point owner**: Existing user account that owns points, with role USER, AGENT, MANAGER, or ADMIN.
- **Point cash redemption**: Existing conversion record connecting deducted points to a wallet/balance transaction.
- **Transaction**: Existing balance transaction created when points are converted to money.
- **Operation**: Existing operation reference for spend-based points.
- **Report row**: Read-only view model combining one ledger entry with owner and optional related references.
- **Owner point summary**: Read-only aggregate for one owner calculated from ledger rows using the same balance rules as the wallet.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Admin can answer "where did these points come from?" for a searched owner in under 30 seconds.
- **SC-002**: Admin can distinguish available points from converted-to-balance points without opening the database.
- **SC-003**: The report returns the first page of ledger rows using server-side pagination and does not mount unrelated report tabs on initial load.
- **SC-004**: Non-admin requests to the new report APIs are rejected.
- **SC-005**: Existing points conversion and rewards flows pass their current unit/build checks after the report is added.

## Assumptions

- The report is admin-only for the first release.
- Existing ledger records are trusted; no backfill or recalculation is part of this feature.
- The first release does not export CSV unless added later.
- The report belongs inside the current Reports Center rather than a new sidebar item.
- The current site currency display follows the existing balance/transaction formatting rules.
