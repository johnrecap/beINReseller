# Research: Report Center Tabs

## Decision 1: Add a new reports center page instead of moving old pages immediately

**Decision**: Create `/dashboard/admin/reports` as the new entry point, while keeping existing routes such as `/dashboard/admin/analytics`, `/dashboard/admin/reports/integrity`, `/dashboard/admin/reports/bein-spend`, `/dashboard/admin/bein-accounts/login-failures`, `/dashboard/admin/bein-accounts/low-balance`, `/dashboard/admin/users/activity`, and `/dashboard/admin/logs`.

**Rationale**: This gives the admin a cleaner sidebar without removing working production routes. It also allows phased rollout and simple rollback if a tab has a UI issue.

**Alternatives considered**:
- Delete old routes and move everything into one page. Rejected because it is high risk and breaks bookmarks/support links.
- Use sidebar accordions only. Rejected because it still leaves the sidebar long and does not solve the user's "one page with tabs" request.

## Decision 2: Extract reusable panel components from existing pages

**Decision**: Move each page's visible client UI into a reusable panel component, then let both the old route and the new tab import that panel.

**Rationale**: This avoids duplicating report logic and keeps old pages working. It also makes each panel independently testable.

**Alternatives considered**:
- Import page components directly into the report center. Rejected because page components own route-level auth and document titles, which can conflict when nested.
- Rewrite every report. Rejected because the feature is navigation consolidation, not full report redesign.

## Decision 3: Lazy-load tab content

**Decision**: Only render and fetch the active tab. Use loading placeholders for newly opened tabs.

**Rationale**: Analytics, integrity reports, spend reports, logs, and monitors can all fetch data. Loading them all together would make the page slow and can produce noisy API traffic.

**Alternatives considered**:
- Render all tabs in the DOM and hide inactive ones. Rejected because hidden tabs would still run effects and fetch data.

## Decision 4: Use query string tab state

**Decision**: Use a `tab` query value such as `/dashboard/admin/reports?tab=bein-spend`.

**Rationale**: Query state is easy to share, reload, and support. It does not require a new database preference.

**Alternatives considered**:
- Store active tab only in local state. Rejected because reload/share behavior is lost.
- Create a route segment per tab. Rejected for the first release because existing legacy routes already provide deep route coverage.

## Decision 5: Keep sidebar settings behavior for beIN monitors

**Decision**: The existing sidebar settings for login failures and low balance continue to decide whether those monitor tabs are visible.

**Rationale**: Admins already have configuration for these monitors. The new center should respect that rather than reintroducing hidden sections.

**Alternatives considered**:
- Always show the monitor tabs. Rejected because it ignores existing admin configuration.
