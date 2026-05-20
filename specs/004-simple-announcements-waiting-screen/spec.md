# Feature Specification: Simple Announcements and Waiting Screen

**Feature Branch**: `004-simple-announcements-waiting-screen`  
**Created**: 2026-05-20  
**Status**: Draft  
**Input**: User description: "Simplify the announcement image system, allow smooth multi-image upload and ordering, keep a modern public display connected to the main page, plan a waiting/operation-pause screen with an admin-controlled countdown duration in hours or days, and implement the Stitch dashboard designs exactly as provided without changing their visual shape, colors, layout, spacing, or motion. For the sidebar, keep the current production content and routes, but apply the Stitch sidebar design exactly."
**Design References**: `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/admin_settings_panel`, `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/announcement_widget`, `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/maintenance_screen`, `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/hyper_lattice_tech/DESIGN.md`

## User Scenarios & Testing

### User Story 1 - Simple Image Announcement Manager (Priority: P1)

An admin can open the announcements page, upload multiple images at once, see them as cards, reorder them, remove any image, and save the display without dealing with many advanced settings.

**Why this priority**: The current announcement controls are too complex. This is the core usability problem.

**Independent Test**: Can be tested by uploading 10 images in the admin UI mockup, reordering them, deleting one, saving, and seeing the same ordered images in the public preview.

**Acceptance Scenarios**:

1. **Given** the admin is on the announcement settings page, **When** they select multiple images, **Then** each image appears as a clear card preview.
2. **Given** image cards are visible, **When** the admin drags or moves an image, **Then** the public preview follows the new order.
3. **Given** an image is no longer needed, **When** the admin removes it, **Then** it disappears from the admin list and public preview.

---

### User Story 2 - Simple Text Ticker Controls (Priority: P1)

An admin can show or hide a moving text strip, enter the text, choose whether it appears above or below the images, and set rounded corners without touching advanced animation choices.

**Why this priority**: The ticker is a visible public element and must be simple enough to update quickly.

**Independent Test**: Can be tested by turning the ticker on, entering a sentence, changing the rounded corner size, and confirming the preview updates instantly.

**Acceptance Scenarios**:

1. **Given** ticker is disabled, **When** the admin enables it, **Then** a text strip appears in the preview.
2. **Given** ticker text exists, **When** the admin edits the text, **Then** the preview updates without saving.
3. **Given** the admin changes the corner setting, **When** preview refreshes, **Then** the ticker uses the selected corner style.

---

### User Story 3 - Calm Operation Pause Waiting Screen (Priority: P1)

When renewal, check, signal, or related operation flows are paused from the settings page, visitors see the Stitch maintenance screen design with the brand, status message, loading/status treatment, and a clear countdown based on the duration set by the admin.

**Why this priority**: The current pause/maintenance overlay is customer-facing during production work and should look professional while giving customers a clear estimated pause window.

**Independent Test**: Can be tested by enabling the relevant pause setting in a controlled environment and visiting the renewal/check page as a normal visitor.

**Acceptance Scenarios**:

1. **Given** operations are paused from settings, **When** a visitor opens the renewal/check page, **Then** they see the waiting screen instead of the plain blocking overlay.
2. **Given** the screen is open on mobile, **When** the viewport is narrow, **Then** the logo, message, and status area remain readable.
3. **Given** the screen has no configured custom message, **When** it renders, **Then** it uses a safe default message.
4. **Given** the visitor is already in an operation flow, **When** the pause setting becomes active, **Then** the interface blocks new action safely without creating a new operation or charging balance.
5. **Given** the admin sets the pause duration to a number of hours or days, **When** the visitor sees the waiting screen, **Then** the countdown displays days, hours, minutes, and seconds.

---

### User Story 4 - Main Page Public Display (Priority: P2)

Visitors see the announcement images and ticker on the main page in a modern, simple display that does not break the page layout.

**Why this priority**: The admin controls only matter if the public output is reliable and visually clean.

**Independent Test**: Can be tested by saving a set of images and opening the main dashboard page to verify the same image order and ticker settings.

**Acceptance Scenarios**:

1. **Given** multiple active images are saved, **When** the main page loads, **Then** the images display as a clean responsive carousel or card strip.
2. **Given** only one image exists, **When** the main page loads, **Then** it appears as a single banner without empty carousel controls.
3. **Given** ticker is disabled, **When** the main page loads, **Then** no ticker space is reserved.

---

### User Story 5 - Exact Stitch Sidebar Visual Refresh (Priority: P2)

Admins, managers, and users see the same sidebar links they already have, but the sidebar shell, active state, hover feedback, status treatment, spacing, and footer visuals match the Stitch sidebar design exactly.

**Why this priority**: The sidebar is visible across the dashboard. It should match the provided Stitch design exactly without changing navigation behavior or permissions.

**Independent Test**: Can be tested by opening the dashboard as admin, manager, and normal user, comparing the visible menu items against the current sidebar inventory, and verifying only visual presentation changed.

**Acceptance Scenarios**:

1. **Given** an admin opens the dashboard, **When** the sidebar renders, **Then** all current admin links remain present with the same destinations and visibility rules.
2. **Given** a manager opens the dashboard, **When** the sidebar renders, **Then** only the same manager links remain visible.
3. **Given** a normal user opens the dashboard, **When** the sidebar renders, **Then** renewal, history, transactions, and profile access follow the same permission rules as today.
4. **Given** sidebar settings hide login failure or low balance links, **When** the admin sidebar renders, **Then** those links remain hidden exactly as before.
5. **Given** the user changes pages, **When** a route is active, **Then** the active item has a clear live highlight without changing the route or label.

## Edge Cases

- If an uploaded file is not an image, show a clear admin error and do not add it to the preview.
- If an image is too large, show guidance instead of failing silently.
- If the admin uploads many images, keep the UI scrollable and avoid layout overflow.
- If no images exist, show a neutral empty state in admin and hide the public image area.
- If operation pause or maintenance mode is active, admin/login access rules must remain consistent with existing behavior.
- If renewal is paused but check remains available, only renewal actions should be blocked.
- If check is paused but renewal remains available, only check actions should be blocked.
- If all operation flows are paused, the user should see one calm waiting screen instead of multiple competing alerts.
- If the countdown reaches zero before the admin manually re-enables operations, the screen must not automatically create operations; it should show an ended/awaiting-resume state.
- If old announcement records exist, preserve them and show them through the simplified UI where possible.
- If the Stitch design contains placeholder sidebar items, replace only the placeholder labels/routes with the current production sidebar content while keeping the Stitch visual design unchanged.
- If the sidebar is open on mobile RTL layouts, it must keep the current open/close behavior and avoid covering content incorrectly.
- If a user lacks permission for a menu item, the redesign must not reveal that item visually or through hidden interactive controls.

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a simplified admin announcement interface focused on image upload, ordering, removal, ticker text, ticker visibility, and save/cancel actions.
- **FR-002**: Admin users MUST be able to select and preview multiple announcement images in one action.
- **FR-003**: Admin users MUST be able to reorder images before saving.
- **FR-004**: Admin users MUST be able to remove unsaved and saved images from the announcement sequence.
- **FR-005**: System MUST show a live preview that represents how the announcement will appear on the main page.
- **FR-006**: System MUST support a separate ticker strip with show/hide, text, position, speed preset, and rounded corner controls.
- **FR-007**: System MUST keep advanced announcement settings out of the primary flow unless explicitly expanded.
- **FR-008**: System MUST preserve compatibility with existing announcement image and ticker database records.
- **FR-009**: System MUST provide a waiting screen for paused renewal/check operation flows with an admin-controlled countdown timer.
- **FR-010**: Waiting screen MUST visually match `maintenance_screen` from Stitch exactly, while replacing placeholder copy only with approved production copy.
- **FR-011**: Waiting screen MUST not modify balances, operations, jobs, payments, renewals, verification, or beIN worker behavior.
- **FR-012**: System MUST include a rollout path that lets the old announcement display be restored quickly if the new display causes issues.
- **FR-013**: System MUST not create a new operation, dispatch a job, or deduct balance while the relevant operation type is paused.
- **FR-014**: Admin users MUST be able to set clear visitor-facing pause messages from the existing settings area or a directly related settings section.
- **FR-015**: Admin users MUST be able to set the pause duration as a number and choose hours or days.
- **FR-016**: The countdown MUST be based on a stored end time, not on each visitor's page-open time.
- **FR-017**: The admin announcement controls, public announcement display, waiting screen, and sidebar refresh MUST match the provided Stitch designs exactly, including layout, spacing, colors, typography, border radius, shadows/glow, animation timing, and component composition.
- **FR-018**: Sidebar redesign MUST preserve the current menu labels, routes, role-based visibility, permission checks, sidebar settings visibility, logout behavior, and mobile open/close behavior.
- **FR-019**: Sidebar redesign MUST copy the Stitch sidebar visual feedback exactly, including active indicators, hover states, motion, status treatment, and footer styling, while avoiding new business logic.
- **FR-020**: Sidebar redesign MUST not add, remove, rename, or reorder production navigation items unless a separate task explicitly requests a content change.
- **FR-021**: Stitch placeholder items such as "Maintenance", "Operations", "Emergency Stop", or "Support" MUST NOT replace existing production navigation content; only the visual container, spacing, states, and motion are copied exactly. Branding/status text such as "CORE ENGINE" may appear only if the owner approves it as a visual label.

### Key Entities

- **Announcement Image**: A public image item with URL, alt text, order, active state, and optional display fit.
- **Announcement Ticker**: The moving text strip settings, including text, enabled state, speed, position, and rounded corner size.
- **Announcement Display Settings**: The simple public display mode, including card count, autoplay preference, and fallback behavior.
- **Operation Pause Waiting Screen Settings**: The operation pause display copy, support link, brand image, visual style preset, operation type being paused, pause duration, pause unit, and pause end time.
- **Sidebar Navigation Inventory**: The current role-aware list of sidebar groups, links, labels, routes, icons, visibility settings, active route rules, mobile drawer state, and user footer actions.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Admin can add, reorder, preview, and save 10 images in under 2 minutes.
- **SC-002**: A non-technical admin can update ticker text and visibility without using advanced settings.
- **SC-003**: Main page announcement area renders correctly on desktop and mobile with 0 visible overlap.
- **SC-004**: Operation pause waiting screen renders a readable countdown on desktop and mobile.
- **SC-005**: Existing production announcement records continue to render after rollout.
- **SC-006**: The feature can be disabled or rolled back without changing financial or worker data.
- **SC-007**: Sidebar visual refresh passes a before/after navigation inventory check with 0 missing or extra production links for admin, manager, and normal user roles.
- **SC-008**: Sidebar remains readable and interactive on desktop, mobile, LTR, and RTL layouts with no text overlap.

## Assumptions

- The current Next.js, Prisma, upload, settings, and announcement API patterns remain in use.
- This feature is UI and display focused; it may plan settings-aware blocking states but must not change financial processing without a separate implementation review.
- Existing upload storage under `public/uploads/announcements/` remains valid.
- The HTML mockup is a design artifact only and does not replace production code.
- The first implementation should prefer fewer controls over full configurability.
- Stitch files are the exact visual source of truth. Production implementation should reuse existing React data, translation strings, routes, and permission logic, but the rendered shape must match Stitch unless a technical constraint is documented and approved.
