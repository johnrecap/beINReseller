# Tasks: Report Center Tabs

**Input**: Design documents from `specs/018-report-center-tabs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required for tab registry and navigation behavior. This feature changes admin navigation and route composition.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a tested tab registry and reusable route definitions before moving page content.

- [ ] T001 Create failing tab registry tests in `tests/unit/report-center-tabs.test.ts`
  - Reason: The report center depends on stable tab keys, labels, legacy routes, and unknown-tab fallback behavior.
  - Expected: Tests assert the required tab keys, unique keys, legacy hrefs, and default fallback.
  - Possible bugs: Tests can overfit implementation details and make harmless label changes fail.
  - Fix/Mitigation: Assert stable keys and routes, not exact styling or component implementation.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts` fails because the registry does not exist yet.

- [ ] T002 Create `src/components/admin/report-center/report-tabs.ts`
  - Reason: One registry prevents duplicated tab definitions across sidebar, page, tests, and deep links.
  - Expected: File exports tab keys, default tab key, legacy route mapping, and `resolveReportTabKey`.
  - Possible bugs: A missing tab or duplicate key can hide a report.
  - Fix/Mitigation: Keep the T001 uniqueness and required-key tests as a guard.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts` passes.

- [ ] T003 Add report center route contract checks to `tests/unit/report-center-tabs.test.ts`
  - Reason: Deep links must remain predictable and unknown values must not crash the page.
  - Expected: Tests cover `analytics`, `bein-spend`, and unknown tab fallback.
  - Possible bugs: Query parsing can treat empty string or array values as valid keys.
  - Fix/Mitigation: Normalize only single string query values and fallback otherwise.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the report center shell without changing old report pages yet.

- [ ] T004 Create `src/components/admin/report-center/ReportCenterTabs.tsx`
  - Reason: The tabs need one reusable UI surface that is responsive and consistent with the current dashboard style.
  - Expected: Component renders tab buttons, active state, and accessible labels from the registry.
  - Possible bugs: Long labels can overlap on mobile or resize the layout.
  - Fix/Mitigation: Use fixed-height controls, horizontal overflow on small screens, and no viewport-scaled fonts.
  - Verification: Manual viewport check at desktop and mobile widths.

- [ ] T005 Create `src/components/admin/report-center/AdminReportCenterClient.tsx`
  - Reason: The report center needs a client controller for query-based tab state and lazy panel rendering.
  - Expected: Component reads `tab`, resolves the active tab, updates URL on tab change, and renders only the active panel placeholder.
  - Possible bugs: Switching tabs can add duplicate history entries or lose back-button behavior.
  - Fix/Mitigation: Use route replacement for tab changes unless a product decision requires full history.
  - Verification: Open `/dashboard/admin/reports?tab=unknown` and confirm it falls back to the default tab.

- [ ] T006 Create new route `src/app/dashboard/admin/reports/page.tsx`
  - Reason: Admins need one URL for the consolidated reports center.
  - Expected: Route enforces admin access and renders `AdminReportCenterClient`.
  - Possible bugs: A non-admin can briefly see the shell if access checks are only client-side.
  - Fix/Mitigation: Match the strongest existing route access pattern used by current admin pages.
  - Verification: Manual non-admin access attempt redirects or blocks access.

- [ ] T007 Add placeholder panels in `src/components/admin/report-center/*Panel.tsx`
  - Reason: The shell should be demonstrable before extracting every old page.
  - Expected: Each required tab renders a clear placeholder naming the legacy route it will replace.
  - Possible bugs: Placeholder text can ship accidentally if extraction is incomplete.
  - Fix/Mitigation: Track every placeholder replacement in user-story tasks and verify before final build.
  - Verification: Open each tab and confirm the correct placeholder appears.

**Checkpoint**: A safe empty reports center exists, old routes are untouched, and the sidebar has not been changed yet.

---

## Phase 3: User Story 1 - Open One Reports Center (Priority: P1) MVP

**Goal**: Admins can open a single reports center page with all intended tabs.

**Independent Test**: Open `/dashboard/admin/reports` as admin and verify the tab shell works without touching old report routes.

### Tests for User Story 1

- [ ] T008 [P] [US1] Add URL state tests in `tests/unit/report-center-tabs.test.ts`
  - Reason: The MVP must support shareable tab URLs.
  - Expected: Tests cover default tab, known tab, hidden or unknown tab fallback.
  - Possible bugs: A hidden monitor tab can still be selected by direct URL.
  - Fix/Mitigation: Make tab resolution accept a visible-tab list when settings hide monitors.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts`.

### Implementation for User Story 1

- [ ] T009 [US1] Wire visible tab filtering in `src/components/admin/report-center/AdminReportCenterClient.tsx`
  - Reason: Existing login and balance monitor settings must still control visibility.
  - Expected: Hidden monitor tabs do not appear and cannot be activated through query string.
  - Possible bugs: Settings fetch failure can hide tabs unexpectedly or show disabled monitors.
  - Fix/Mitigation: Use the same default settings behavior currently used by `Sidebar.tsx`.
  - Verification: Toggle sidebar settings and verify monitor tabs match them.

- [ ] T010 [US1] Add report center title and summary in `src/components/admin/report-center/AdminReportCenterClient.tsx`
  - Reason: Admins need clear context after entering the new grouped page.
  - Expected: Header explains this is the central reports and monitoring area without instructional clutter.
  - Possible bugs: Header can look like a marketing hero and waste dashboard space.
  - Fix/Mitigation: Keep compact dashboard typography and no large decorative hero.
  - Verification: Desktop screenshot shows content above the fold with tabs visible.

- [ ] T011 [US1] Update sidebar active-path logic in `src/components/layout/Sidebar.tsx`
  - Reason: The reports center should highlight when the new route or old report routes are active.
  - Expected: `/dashboard/admin/reports` and legacy report URLs highlight the same grouped entry.
  - Possible bugs: Active matching can accidentally highlight reports for unrelated admin pages.
  - Fix/Mitigation: Use explicit route list from the report tab registry, not broad string matching.
  - Verification: Visit each legacy route and confirm only Reports Center is highlighted.

**Checkpoint**: User Story 1 is complete when the grouped page works and can be reached directly.

---

## Phase 4: User Story 2 - Use Existing Reports From Tabs (Priority: P2)

**Goal**: Every report tab shows the existing report UI and old routes continue to work.

**Independent Test**: Compare each tab with its old route and confirm controls still behave the same.

### Tests for User Story 2

- [ ] T012 [P] [US2] Add import smoke tests for report panels in `tests/unit/report-center-tabs.test.ts`
  - Reason: Moving page content into panels must not leave missing exports or broken imports.
  - Expected: Tests can import the registry and each panel module without executing report data requests.
  - Possible bugs: Importing client panels in a Node test can fail if browser-only globals run at module load.
  - Fix/Mitigation: Keep browser APIs inside effects and avoid module-level `window` or `document` access.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts`.

### Implementation for User Story 2

- [ ] T013 [US2] Extract analytics content into `src/components/admin/report-center/AnalyticsReportPanel.tsx`
  - Reason: Analytics must be reusable from the new tab and the old analytics route.
  - Expected: `/dashboard/admin/analytics` and the analytics tab render the same analytics controls.
  - Possible bugs: Route-level auth or document title logic can run twice when nested.
  - Fix/Mitigation: Keep access checks in route wrappers and move only report UI/data logic into the panel.
  - Verification: Change the analytics period in both old route and tab.

- [ ] T014 [US2] Update `src/app/dashboard/admin/analytics/page.tsx` to render `AnalyticsReportPanel`
  - Reason: The old route must remain available while sharing one implementation.
  - Expected: Old analytics URL still works with the extracted panel.
  - Possible bugs: The old page can lose metadata, redirects, or layout spacing.
  - Fix/Mitigation: Keep the wrapper structure and only replace the inner report body.
  - Verification: Open `/dashboard/admin/analytics` and run period filter.

- [ ] T015 [US2] Extract activity monitoring content into `src/components/admin/report-center/ActivityReportPanel.tsx`
  - Reason: Activity monitoring currently lives under users but belongs in monitoring tabs.
  - Expected: Activity overview and inactive-user controls render inside the report center.
  - Possible bugs: The activity page has its own internal tabs that can conflict visually with report center tabs.
  - Fix/Mitigation: Keep internal activity tabs inside the panel body and visually separate them from top-level tabs.
  - Verification: Open activity tab and switch its internal overview/inactive controls.

- [ ] T016 [US2] Update `src/app/dashboard/admin/users/activity/page.tsx` to render `ActivityReportPanel`
  - Reason: Old support links to activity monitoring must remain valid.
  - Expected: Old route still shows the same activity monitoring experience.
  - Possible bugs: `useRouter` actions can navigate relative to the wrong base route.
  - Fix/Mitigation: Use absolute dashboard routes for navigation actions.
  - Verification: Open `/dashboard/admin/users/activity` and use filters.

- [ ] T017 [US2] Extract integrity report content into `src/components/admin/report-center/IntegrityReportPanel.tsx`
  - Reason: Integrity reports are one of the main monitoring pages to group.
  - Expected: Scan, filter, resolve, backfill, and pagination behavior remain available inside the tab.
  - Possible bugs: Destructive review actions can be triggered from an incorrectly scoped state.
  - Fix/Mitigation: Preserve existing confirmation and API calls exactly; do not change action semantics.
  - Verification: Open the tab, run a non-destructive filter, and verify scan button state.

- [ ] T018 [US2] Update `src/app/dashboard/admin/reports/integrity/page.tsx` to render `IntegrityReportPanel`
  - Reason: Legacy integrity route must remain functional.
  - Expected: Existing URL continues to render the same integrity interface.
  - Possible bugs: Server/client boundary can change if the old page was a server wrapper.
  - Fix/Mitigation: Keep a thin route wrapper and place client behavior only in the panel.
  - Verification: Open `/dashboard/admin/reports/integrity` and paginate.

- [ ] T019 [US2] Create `src/components/admin/report-center/BeinSpendReportPanel.tsx`
  - Reason: beIN spend already has a reusable `BeinSpendReportClient`, but the report center needs a tab panel wrapper.
  - Expected: Tab renders the existing beIN spend report client without duplicating logic.
  - Possible bugs: The component can fetch twice if mounted both in placeholder and active body.
  - Fix/Mitigation: Render it only when `bein-spend` is active.
  - Verification: Open `/dashboard/admin/reports?tab=bein-spend` and confirm filters work.

- [ ] T020 [US2] Extract login monitor content into `src/components/admin/report-center/LoginMonitorPanel.tsx`
  - Reason: Login monitor should be accessible from the report center while respecting current settings.
  - Expected: Accounts with login failures and reset actions appear in the tab.
  - Possible bugs: Reset action could run while tab unmounts, losing feedback.
  - Fix/Mitigation: Preserve current loading and toast handling inside the panel.
  - Verification: Open login monitor tab and refresh the list.

- [ ] T021 [US2] Update `src/app/dashboard/admin/bein-accounts/login-failures/page.tsx` to render `LoginMonitorPanel`
  - Reason: The old login monitor route must remain valid.
  - Expected: Old route still shows the same monitor and actions.
  - Possible bugs: Hidden sidebar setting can hide the tab but should not necessarily break direct admin route access.
  - Fix/Mitigation: Keep old route behavior unchanged; visibility setting only controls navigation/tab visibility.
  - Verification: Open `/dashboard/admin/bein-accounts/login-failures` directly.

- [ ] T022 [US2] Extract balance monitor content into `src/components/admin/report-center/BalanceMonitorPanel.tsx`
  - Reason: Low balance monitoring should be grouped with reporting and monitoring.
  - Expected: Low balance accounts, threshold, refresh, and reactivate actions work in the tab.
  - Possible bugs: Balance formatting can differ from old route.
  - Fix/Mitigation: Move existing formatting helper with the panel unchanged.
  - Verification: Open balance monitor tab and refresh accounts.

- [ ] T023 [US2] Update `src/app/dashboard/admin/bein-accounts/low-balance/page.tsx` to render `BalanceMonitorPanel`
  - Reason: Existing low balance route must remain a fallback.
  - Expected: Old route still loads after extraction.
  - Possible bugs: Active account actions can be lost if props are not carried over.
  - Fix/Mitigation: Move all current state and handlers into the panel before changing the page wrapper.
  - Verification: Open `/dashboard/admin/bein-accounts/low-balance` directly.

- [ ] T024 [US2] Extract logs content into `src/components/admin/report-center/LogsReportPanel.tsx`
  - Reason: Activity logs are part of support monitoring and should live in the reports center.
  - Expected: Logs search, filters, table, and pagination work inside the tab.
  - Possible bugs: The logs table can render too wide inside a tab layout.
  - Fix/Mitigation: Preserve existing table container width and overflow behavior.
  - Verification: Open logs tab, search, filter, and paginate.

- [ ] T025 [US2] Update `src/app/dashboard/admin/logs/page.tsx` to render `LogsReportPanel`
  - Reason: Old logs route must remain available.
  - Expected: `/dashboard/admin/logs` continues to show activity logs.
  - Possible bugs: Metadata or title changes can regress old route display.
  - Fix/Mitigation: Keep existing route metadata and only replace table rendering with the panel.
  - Verification: Open `/dashboard/admin/logs` directly and search.

**Checkpoint**: User Story 2 is complete when every tab uses real report UI and all old URLs still work.

---

## Phase 5: User Story 3 - Keep The Page Fast And Safe (Priority: P3)

**Goal**: The reports center loads active tabs only and preserves security boundaries.

**Independent Test**: Open the reports center and verify inactive tabs do not trigger their data requests until selected.

### Tests for User Story 3

- [ ] T026 [P] [US3] Add lazy-render behavior test in `tests/unit/report-center-tabs.test.ts`
  - Reason: The most important performance rule is active-tab-only rendering.
  - Expected: Test proves inactive tab loaders are not called before selection.
  - Possible bugs: The test can require React DOM complexity beyond the current test setup.
  - Fix/Mitigation: Test the pure tab selection function and keep browser verification for actual network calls.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts`.

### Implementation for User Story 3

- [ ] T027 [US3] Lazy-load tab panels in `src/components/admin/report-center/AdminReportCenterClient.tsx`
  - Reason: Rendering all report panels at once would trigger multiple API requests and slow the admin dashboard.
  - Expected: Only the active tab panel mounts.
  - Possible bugs: Switching tabs can lose state every time if panels always unmount.
  - Fix/Mitigation: Accept state reset for first release, or cache only lightweight panel state after measuring need.
  - Verification: Browser network panel shows only active tab requests on initial load.

- [ ] T028 [US3] Add tab-scoped error boundaries or error state in `src/components/admin/report-center/AdminReportCenterClient.tsx`
  - Reason: One failing report should not blank the whole reports center.
  - Expected: Active tab errors show inside the content area while tab navigation remains usable.
  - Possible bugs: Errors thrown inside child effects may not be caught by a simple wrapper.
  - Fix/Mitigation: Preserve each panel's existing error state and add a lightweight fallback for import/loading errors.
  - Verification: Temporarily force a bad tab import in development and confirm shell remains usable, then revert.

- [ ] T029 [US3] Preserve admin authorization checks in all route wrappers
  - Reason: Consolidation must not weaken access to logs, monitoring, or beIN account health.
  - Expected: New route and old routes are admin-only.
  - Possible bugs: Extracted panels can be imported somewhere without route auth.
  - Fix/Mitigation: Keep panels under admin-only route usage and do not export them through public dashboards.
  - Verification: Manual non-admin access to `/dashboard/admin/reports` and one legacy report route.

**Checkpoint**: User Story 3 is complete when network behavior is lazy and admin-only access remains intact.

---

## Phase 6: User Story 4 - Preserve Deep Links And Support Links (Priority: P4)

**Goal**: Admins can share a direct tab URL and old direct report URLs still work.

**Independent Test**: Open and reload every tab URL plus every legacy URL.

### Implementation for User Story 4

- [ ] T030 [US4] Update tab change URL behavior in `src/components/admin/report-center/AdminReportCenterClient.tsx`
  - Reason: Support staff need to copy the current tab URL.
  - Expected: Selecting a tab updates `?tab=` without a full page reload.
  - Possible bugs: Browser back button can behave unexpectedly if every tab click pushes history.
  - Fix/Mitigation: Use replace behavior unless user testing shows back-button tab history is desired.
  - Verification: Select `beIN Spend`, copy URL, reload, and confirm same tab opens.

- [ ] T031 [US4] Add legacy route helper text or link in each tab panel header
  - Reason: During rollout, admins may need to open the old full-page route for support comparison.
  - Expected: Each tab can expose a small "Open full page" link to its legacy route.
  - Possible bugs: Extra links can clutter compact dashboards.
  - Fix/Mitigation: Use a compact icon/text link in the tab header, not a large button.
  - Verification: Click the full-page link from each tab and confirm old route opens.

- [ ] T032 [US4] Update `src/components/layout/Sidebar.tsx` to replace grouped report links with one Reports Center link
  - Reason: This is the user-visible sidebar cleanup requested.
  - Expected: Sidebar shows one grouped reports entry instead of separate analytics, integrity, spend, login monitor, balance monitor, activity monitoring, and logs links.
  - Possible bugs: Removing links too early can hide a page that is not yet available in tabs.
  - Fix/Mitigation: Perform this after all panels are wired and manually verified.
  - Verification: Sidebar count drops and all reports are reachable through the new page.

**Checkpoint**: User Story 4 is complete when direct tab URLs and old report URLs work after sidebar cleanup.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Verify UI quality, safety, and deploy readiness.

- [ ] T033 Run focused unit tests and TypeScript
  - Reason: Registry, route imports, and component props must compile before build.
  - Expected: Unit tests and TypeScript pass.
  - Possible bugs: Existing unrelated type errors can obscure this feature's issues.
  - Fix/Mitigation: Run focused tests first, then full type check; document unrelated failures if any.
  - Verification: `npx tsx --test tests/unit/report-center-tabs.test.ts && npx tsc --noEmit --pretty false`.

- [ ] T034 Run production build
  - Reason: Next.js route composition and dynamic imports must work in optimized build.
  - Expected: Build completes.
  - Possible bugs: Client/server boundary errors can pass unit tests but fail build.
  - Fix/Mitigation: Move browser-only logic into client components and route wrappers into server/client boundaries intentionally.
  - Verification: `npm run build`.

- [ ] T035 Perform browser smoke test across desktop and mobile widths
  - Reason: The request is primarily a UI/navigation cleanup and must be visually usable.
  - Expected: Tabs do not overlap, content fits, and each tab can be opened.
  - Possible bugs: Report tables can overflow the tab container.
  - Fix/Mitigation: Preserve existing table overflow containers and add responsive tab scrolling.
  - Verification: Browser screenshot at desktop and mobile widths.

- [ ] T036 Scan changed text files for mojibake patterns
  - Reason: Repository rules require encoding safety and existing files contain Arabic text.
  - Expected: No new mojibake signatures are introduced by this feature.
  - Possible bugs: Copying Arabic labels with unsafe encodings can corrupt source.
  - Fix/Mitigation: Use `apply_patch` for manual edits and avoid risky PowerShell text writers.
  - Verification: Search changed files for `â`, `ï؟½`, `Ã`, and `Â`, treating pre-existing occurrences separately.

- [ ] T037 Prepare deployment notes
  - Reason: Production has a live database and this feature should not use schema push.
  - Expected: Final deploy commands skip migrations unless implementation later adds one.
  - Possible bugs: Running unnecessary migrations can slow or risk production deploy.
  - Fix/Mitigation: State "no migration expected" and use build plus PM2 restart.
  - Verification: Final response includes branch, build, worker build, PM2 restart, and logs commands.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks user stories.
- **User Story 1 (P1)**: Depends on Foundational.
- **User Story 2 (P2)**: Depends on User Story 1 shell.
- **User Story 3 (P3)**: Depends on real panels from User Story 2.
- **User Story 4 (P4)**: Depends on User Stories 1 and 2 so sidebar cleanup does not hide missing content.
- **Polish**: Depends on selected stories being complete.

### Parallel Opportunities

- T001 and documentation review can run in parallel.
- T013/T015/T017/T019/T020/T022/T024 can be split by report panel after the shell exists.
- T014/T016/T018/T021/T023/T025 can follow each corresponding extraction independently.
- T033 and T036 can run after implementation changes are staged.

### MVP Scope

MVP is User Story 1: a new reports center page with working tabs and placeholders while old routes remain untouched. Full user value requires User Story 2 and User Story 4 because the sidebar should only be cleaned after real panels are available.

### Implementation Strategy

1. Build and test tab registry.
2. Add report center shell.
3. Extract one panel at a time, keeping old route wrappers.
4. Verify each tab and old route independently.
5. Lazy-load active panels only.
6. Replace sidebar report links with one Reports Center link.
7. Run type check, build, browser smoke, and mojibake scan.
