# Data Model: Report Center Tabs

No database migration is planned for this feature.

## ReportCenterTab

Represents one tab in the new reports center.

**Fields**:
- `key`: Stable identifier used in URLs, for example `analytics`, `activity`, `integrity`, `bein-spend`, `login-monitor`, `balance-monitor`, or `logs`.
- `label`: Display label for the tab.
- `description`: Short help text for the tab header or empty state.
- `legacyHref`: Existing old route for direct access and fallback.
- `visibilitySetting`: Optional sidebar setting key that controls whether the tab is visible.
- `component`: The panel shown when the tab is active.

**Validation rules**:
- `key` must be unique.
- Unknown keys must resolve to the default tab.
- Hidden tabs must not be selectable from the tab list.

## ReportPanel

Reusable UI content extracted from an existing admin report page.

**Fields**:
- `title`: Existing page title or tab-specific title.
- `active`: Whether the tab is currently active.
- `sourceRoute`: The legacy route that still owns direct access.

**State transitions**:
- `inactive`: no data fetch.
- `loading`: active tab has requested data.
- `ready`: active tab has data or an empty state.
- `error`: active tab failed but report center remains usable.

## SidebarReportEntry

The single sidebar link that replaces multiple report links.

**Fields**:
- `href`: `/dashboard/admin/reports`
- `label`: Reports Center or the Arabic equivalent through existing translation patterns.
- `activePaths`: The new route plus legacy routes that should highlight the same sidebar entry.

## LegacyReportRoute

Existing route retained for backward compatibility.

**Rules**:
- Must keep old access control.
- Must render the same reusable panel as the report center tab when practical.
- Must not be removed in the first release.
