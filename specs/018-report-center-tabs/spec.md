# Feature Specification: Report Center Tabs

**Feature Branch**: `018-report-center-tabs`

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "The admin sidebar has become too crowded. Create a clear Spec Kit plan to consolidate analytics, reports, monitors, and logs into one panel page with tabs, without breaking existing admin behavior. Every task must include reason, expected outcome, risks, and a safe fix."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open One Reports Center (Priority: P1)

Admins need one clear place in the admin area for analytics, reports, monitoring, and logs so the sidebar stops feeling crowded and repetitive.

**Why this priority**: The main pain is navigation clutter. A single reports center delivers value even before every old page is fully refactored.

**Independent Test**: Open the admin sidebar, click one "Reports Center" item, and verify a page appears with tabs for the reporting and monitoring areas.

**Acceptance Scenarios**:

1. **Given** an admin is logged in, **When** they open the sidebar, **Then** they see one main reports entry instead of several separate report links.
2. **Given** an admin opens the reports center, **When** the page loads, **Then** the first tab shows a useful default report and the other tabs are visible.
3. **Given** a non-admin user tries to access the reports center, **When** the page loads, **Then** access is blocked the same way the old admin report pages are blocked.

---

### User Story 2 - Use Existing Reports From Tabs (Priority: P2)

Admins need the current report pages to work from tabs without losing their filters, tables, buttons, or current behavior.

**Why this priority**: Consolidation must not break reports that are already used in production.

**Independent Test**: Open each tab and compare its visible behavior with the old page route for the same report.

**Acceptance Scenarios**:

1. **Given** the admin opens the analytics tab, **When** they change the period filter, **Then** analytics refresh exactly as they do today.
2. **Given** the admin opens the integrity reports tab, **When** they scan, filter, paginate, or resolve an issue, **Then** the same actions remain available.
3. **Given** the admin opens beIN spend report, login monitor, balance monitor, activity monitor, or logs, **When** they use its current controls, **Then** behavior matches the old dedicated page.
4. **Given** an old direct URL is opened, **When** the route loads, **Then** it still works during and after the consolidation.

---

### User Story 3 - Keep The Page Fast And Safe (Priority: P3)

Admins need the new page to avoid loading every heavy report at once and to keep sensitive report permissions unchanged.

**Why this priority**: Some reports query large datasets or beIN account health data. Loading all tabs together can slow the dashboard or expose data in the wrong place.

**Independent Test**: Open the reports center and verify only the active tab loads its data; switching tabs loads the next report on demand.

**Acceptance Scenarios**:

1. **Given** the reports center opens, **When** only the analytics tab is active, **Then** inactive tab data requests do not run.
2. **Given** the admin switches tabs, **When** the tab becomes active, **Then** its data loads and displays a clear loading state.
3. **Given** a report API returns an error, **When** the tab is active, **Then** the error stays inside that tab and does not break the whole reports center.

---

### User Story 4 - Preserve Deep Links And Support Links (Priority: P4)

Admins and support staff need to share or reload a specific tab without explaining where to click.

**Why this priority**: Consolidating pages should not make support workflows harder.

**Independent Test**: Open `/dashboard/admin/reports?tab=bein-spend`, reload the page, and verify the beIN spend tab is active.

**Acceptance Scenarios**:

1. **Given** an admin selects a tab, **When** the URL updates, **Then** reloading keeps the same tab active.
2. **Given** an unknown tab value is used, **When** the page loads, **Then** it falls back to the default tab without crashing.
3. **Given** the old direct route is shared, **When** another admin opens it, **Then** it still works or redirects safely only after replacement is verified.

### Edge Cases

- A disabled sidebar setting for login failure or low balance monitors must hide the corresponding tab or show it as unavailable, matching current sidebar settings.
- A tab may have its own internal tabs or filters; those controls must remain inside the report tab and not conflict with the report center tabs.
- A heavy report must not fetch data before its tab is opened.
- Direct old routes must not be removed in the first implementation pass.
- Mobile and narrow desktop layouts must show tabs without horizontal layout breakage.
- Existing report pages with page titles must not keep overwriting the document title in a confusing way when nested in the report center.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The admin sidebar MUST provide one main entry for analytics, reports, monitoring, and logs.
- **FR-002**: The reports center MUST include tabs for Analytics, Activity Monitoring, Integrity Reports, beIN Spend Report, Account Login Monitor, Balance Alert Monitor, and Activity Logs.
- **FR-003**: The reports center MUST preserve all existing report controls, filters, actions, pagination, and refresh behavior.
- **FR-004**: Existing direct routes for the included pages MUST remain available during the first release.
- **FR-005**: Inactive tabs MUST not fetch their report data before the admin opens them.
- **FR-006**: A selected tab MUST be shareable through a URL query value.
- **FR-007**: Unknown tab query values MUST fall back to a safe default tab.
- **FR-008**: Access control MUST remain admin-only and match the old pages.
- **FR-009**: Sidebar settings for login failure and low balance monitors MUST continue to control whether those monitor areas are visible.
- **FR-010**: The reports center MUST provide loading, empty, and error states without breaking the full page.
- **FR-011**: The layout MUST work on desktop and mobile without text overlap or unusable tabs.
- **FR-012**: The implementation MUST avoid database migrations unless a later requirement introduces new saved preferences.

### Key Entities

- **Report Center**: The single admin destination that contains report and monitoring tabs.
- **Report Tab**: A named area inside the report center with label, key, route mapping, visibility rule, and content component.
- **Legacy Report Route**: An existing route that remains available while the new center is introduced.
- **Sidebar Report Entry**: The single sidebar link that replaces multiple report and monitor links.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin sidebar report and monitoring entries are reduced from at least six visible links to one visible reports center link.
- **SC-002**: Admins can reach every included report within two clicks from the sidebar.
- **SC-003**: Each included old report route still loads after the reports center is introduced.
- **SC-004**: Opening the reports center triggers data loading for only one tab on initial load.
- **SC-005**: Switching across all tabs shows no full-page crash and no inaccessible report content for an admin account.
- **SC-006**: The page is usable at desktop width and mobile width without overlapping tab labels or hidden critical actions.

## Assumptions

- The first release is navigation consolidation only; it does not redesign the internals of every report.
- Existing report APIs remain the source of truth.
- Existing admin authentication remains the access control boundary.
- Existing report routes remain as fallback routes until the tabbed center is verified in production.
- No new database table is needed for this feature.
