# Tasks: Simple Announcements and Waiting Screen

**Input**: Design documents from `specs/004-simple-announcements-waiting-screen/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/ui-contract.md`, `quickstart.md`

**Tests**: Include focused tests for public display fallback and waiting screen rendering when implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup and Baseline

**Purpose**: Confirm current behavior before changing it.

- [ ] T001 Read `specs/004-simple-announcements-waiting-screen/spec.md` and confirm scope excludes balance mutations, worker changes, queue changes, and beIN automation changes unless a later implementation task explicitly adds pre-operation pause checks.
- [ ] T002 Review current admin announcement UI in `src/components/admin/AnnouncementSettings.tsx`.
- [ ] T003 Review current public renderer in `src/components/announcements/AnnouncementBannerView.tsx`.
- [ ] T004 Review current public wrapper in `src/components/AnnouncementBanner.tsx`.
- [ ] T005 Review current admin announcement APIs in `src/app/api/admin/announcement/route.ts` and `src/app/api/admin/announcement/[id]/route.ts`.
- [ ] T006 Review current public announcement API in `src/app/api/announcement/active/route.ts`.
- [ ] T007 Review current upload API in `src/app/api/admin/upload/route.ts`.
- [ ] T008 Review current maintenance status flow in `src/hooks/useMaintenance.ts`, `src/app/api/maintenance-status/route.ts`, and `src/components/shared/MaintenanceOverlay.tsx`.
- [ ] T009 Review current renewal page blocking behavior in `src/app/dashboard/renew/page.tsx`.
- [ ] T010 Open `docs/mockups/simple-announcements-waiting-screen.html` and confirm the desired admin and operation-pause waiting screen shape with the owner.
- [ ] T011 Review Stitch design references in `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/admin_settings_panel`, `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/announcement_widget`, `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/maintenance_screen`, and `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/hyper_lattice_tech/DESIGN.md`.
- [ ] T012 Review current sidebar behavior in `src/components/layout/Sidebar.tsx`, including role links, active-route rules, mobile overlay, RTL placement, footer, logout, and admin sidebar settings.

---

## Phase 2: Foundational Contracts and Helpers

**Purpose**: Prepare shared validation and display rules before UI work.

- [ ] T013 Add or update simple announcement DTO rules in `src/lib/announcement/schema.ts`.
- [ ] T014 Add helper for ordered slide fallback in `src/lib/announcement/helpers.ts`.
- [ ] T015 Add helper for ticker visibility rules in `src/lib/announcement/helpers.ts`.
- [ ] T016 Add shared UI constants for image count, ticker speed presets, corner presets, and exact Stitch visual tokens in `src/lib/announcement/constants.ts` or a local UI constants file.
- [ ] T017 Verify helpers preserve legacy single-image records from `AnnouncementBanner.imageUrl`.
- [ ] T018 Define operation-pause display rules in `src/components/shared/MaintenanceOverlay.tsx` or a new `src/components/maintenance/OperationPauseWaitingScreen.tsx` without changing business behavior yet.
- [ ] T019 Define pause timer settings keys for duration value, duration unit, pause start time, and pause end time in the implementation notes before editing `src/components/admin/SettingsForm.tsx`.
- [ ] T020 Review and update `specs/004-simple-announcements-waiting-screen/sidebar-navigation-inventory.md` from `src/components/layout/Sidebar.tsx` before styling changes.

**Checkpoint**: Shared behavior is ready before admin or public UI changes.

---

## Phase 3: User Story 1 - Simple Image Announcement Manager (Priority: P1) MVP

**Goal**: Admin can upload, preview, reorder, remove, and save images through a simple flow.

**Independent Test**: Upload 10 images, reorder them, remove one, save, reload the page, and verify the order remains.

### Tests for User Story 1

- [ ] T021 [P] [US1] Add a component test or manual test checklist for image add/reorder/remove in `src/components/admin/announcements/SimpleAnnouncementManager.tsx`.
- [ ] T022 [P] [US1] Add API validation coverage for ordered slides in `src/app/api/admin/announcement/route.ts`.

### Implementation for User Story 1

- [ ] T023 [P] [US1] Create `src/components/admin/announcements/AnnouncementImageCard.tsx` for one image card with preview, move, and remove controls.
- [ ] T024 [P] [US1] Create `src/components/admin/announcements/SimpleAnnouncementUploader.tsx` for selecting multiple image files and showing upload progress.
- [ ] T025 [US1] Create `src/components/admin/announcements/SimpleAnnouncementManager.tsx` to manage image draft state and ordering.
- [ ] T026 [US1] Connect `SimpleAnnouncementManager` to the existing upload API in `src/app/api/admin/upload/route.ts`.
- [ ] T027 [US1] Connect saved image order to `src/app/api/admin/announcement/route.ts`.
- [ ] T028 [US1] Replace or wrap the complex image section in `src/components/admin/AnnouncementSettings.tsx`.
- [ ] T029 [US1] Confirm existing saved `imageUrl` appears as a first editable image when no slides exist.
- [ ] T030 [US1] Apply the exact Stitch admin panel visual structure to the simplified image cards, including the same dark glass surface, labels, spacing, colors, borders, and glow.

**Checkpoint**: Admin can manage images without touching ticker or waiting screen work.

---

## Phase 4: User Story 2 - Simple Text Ticker Controls (Priority: P1)

**Goal**: Admin can enable, edit, position, and round the ticker from a compact control group.

**Independent Test**: Enable ticker, edit text, change position and corner style, save, reload, and verify values remain.

### Tests for User Story 2

- [ ] T031 [P] [US2] Add validation test or checklist for empty ticker text hiding the ticker in `src/lib/announcement/helpers.ts`.
- [ ] T032 [P] [US2] Add admin UI test or checklist for ticker enable/text/position/radius in `src/components/admin/announcements/SimpleTickerControls.tsx`.

### Implementation for User Story 2

- [ ] T033 [P] [US2] Create `src/components/admin/announcements/SimpleTickerControls.tsx`.
- [ ] T034 [US2] Add ticker radius mapping in `src/lib/announcement/constants.ts`.
- [ ] T035 [US2] Connect ticker values to `SimpleAnnouncementManager` in `src/components/admin/announcements/SimpleAnnouncementManager.tsx`.
- [ ] T036 [US2] Save ticker values through `src/app/api/admin/announcement/route.ts`.
- [ ] T037 [US2] Confirm disabled ticker leaves no visible public ticker.
- [ ] T038 [US2] Match ticker styling and movement exactly to Stitch, while still allowing no reserved space when disabled.

**Checkpoint**: Ticker can be managed independently from images.

---

## Phase 5: User Story 4 - Main Page Public Display (Priority: P2)

**Goal**: Visitors see a clean image strip or banner and optional ticker on the main page.

**Independent Test**: With one image, the public page shows one banner. With multiple images, it shows ordered cards. With ticker off, no ticker appears.

### Tests for User Story 4

- [ ] T039 [P] [US4] Add public renderer fallback test for slides versus legacy image in `src/components/announcements/AnnouncementBannerView.tsx`.
- [ ] T040 [P] [US4] Add responsive manual checklist for desktop and mobile display in `specs/004-simple-announcements-waiting-screen/quickstart.md`.

### Implementation for User Story 4

- [ ] T041 [US4] Update `src/app/api/announcement/active/route.ts` to return the simple public announcement shape.
- [ ] T042 [US4] Update `src/components/announcements/AnnouncementBannerView.tsx` to render ordered image cards.
- [ ] T043 [US4] Add single-image fallback rendering in `src/components/announcements/AnnouncementBannerView.tsx`.
- [ ] T044 [US4] Add ticker rendering with rounded corners in `src/components/announcements/AnnouncementBannerView.tsx`.
- [ ] T045 [US4] Implement the exact Stitch stacked card movement where the front card exits from right to left and the remaining cards peek behind it.
- [ ] T046 [US4] Use a readable autoplay interval of about 4.8 seconds unless later tuned by the owner.
- [ ] T047 [US4] Verify `src/components/AnnouncementBanner.tsx` handles empty announcement output without spacing bugs.

**Checkpoint**: Public main-page display works without waiting screen changes.

---

## Phase 6: User Story 3 - Calm Operation Pause Waiting Screen (Priority: P1)

**Goal**: Visitors see the exact Stitch maintenance screen when renewal/check operations are paused from settings, with the same countdown layout and styling.

**Independent Test**: Enable maintenance mode or a controlled operation-pause setting in a safe environment and open the renewal/check page as a visitor.

### Tests for User Story 3

- [ ] T048 [P] [US3] Add render test or manual checklist for waiting screen copy and countdown in `src/components/maintenance/OperationPauseWaitingScreen.tsx`.
- [ ] T049 [P] [US3] Add mobile viewport checklist for waiting screen in `specs/004-simple-announcements-waiting-screen/quickstart.md`.
- [ ] T050 [P] [US3] Add API-side checklist that pause checks happen before operation creation in `src/app/api/operations/start-renewal/route.ts` and `src/app/api/operations/signal-check/route.ts`.

### Implementation for User Story 3

- [ ] T051 [P] [US3] Create `src/components/maintenance/OperationPauseWaitingScreen.tsx`.
- [ ] T052 [US3] Add pause duration number and hours/days unit controls to `src/components/admin/SettingsForm.tsx`.
- [ ] T053 [US3] Store a shared pause end time through `src/app/api/settings/route.ts` when the admin applies the pause timer.
- [ ] T054 [US3] Return pause timer fields from `src/app/api/maintenance-status/route.ts`.
- [ ] T055 [US3] Extend `src/hooks/useMaintenance.ts` to expose pause end time and remaining-time inputs to the UI.
- [ ] T056 [US3] Replace the plain overlay usage in `src/components/shared/MaintenanceOverlay.tsx` or `src/app/dashboard/renew/page.tsx` with the new waiting design.
- [ ] T057 [US3] Connect waiting screen to the existing `maintenance_mode`, `maintenance_message`, and new pause timer values from `src/hooks/useMaintenance.ts`.
- [ ] T058 [US3] Plan optional settings keys for operation-specific pauses, such as `renewal_paused`, `check_paused`, and `operation_pause_message`, without applying them until approved.
- [ ] T059 [US3] If operation-specific pause keys are implemented later, check them in `src/app/api/operations/start-renewal/route.ts` and `src/app/api/operations/signal-check/route.ts` before creating operations, jobs, or balance transactions.
- [ ] T060 [US3] Add safe default title, message, status text, and countdown-ended text in `src/components/maintenance/OperationPauseWaitingScreen.tsx`.
- [ ] T061 [US3] Match the waiting screen exactly to the Stitch maintenance screen: centered glass panel, countdown cells, background, glow, colors, spacing, typography, and status/footer pills.
- [ ] T062 [US3] Confirm the waiting screen countdown is based on stored end time, not visitor page-open time.
- [ ] T063 [US3] Confirm admin/login behavior follows the existing maintenance access rules.

**Checkpoint**: Maintenance mode has the new visitor-facing screen.

---

## Phase 7: User Story 5 - Live Sidebar Visual Refresh (Priority: P2)

**Goal**: The dashboard sidebar copies the Stitch sidebar visuals exactly while keeping the exact current production content and behavior.

**Independent Test**: Compare the sidebar navigation inventory before and after the redesign for admin, manager, and normal user roles.

### Tests for User Story 5

- [ ] T064 [P] [US5] Use `specs/004-simple-announcements-waiting-screen/sidebar-navigation-inventory.md` as the before/after checklist for admin, manager, and normal user links.
- [ ] T065 [P] [US5] Add manual checks for hidden admin links controlled by `sidebar_show_login_failures` and `sidebar_show_low_balance`.
- [ ] T066 [P] [US5] Add responsive checks for desktop fixed sidebar, mobile overlay, close button, and RTL/LTR placement.

### Implementation for User Story 5

- [ ] T067 [US5] Refresh `src/components/layout/Sidebar.tsx` styling with the exact Stitch glass side rail, dark surface layering, lime active state, purple secondary accent, hover states, spacing, and motion.
- [ ] T068 [US5] Keep existing arrays `resellerLinks`, `managerLinks`, and `adminLinks` content unchanged except for visual metadata if absolutely needed.
- [ ] T069 [US5] Preserve `canAccessSubscription(userRole)`, `isAdmin`, `isManager`, and admin sidebar setting checks exactly.
- [ ] T070 [US5] Preserve existing active route matching for direct route and child routes.
- [ ] T071 [US5] Preserve existing logout behavior and user footer content while copying the Stitch footer visual treatment exactly.
- [ ] T072 [US5] Preserve mobile overlay, close behavior, z-index intent, and RTL/LTR slide direction.
- [ ] T073 [US5] Do not add Stitch placeholder links such as "Maintenance", "Operations", "Emergency Stop", or "Support" unless they already exist in production navigation; use existing production links inside the exact Stitch sidebar shell.
- [ ] T074 [US5] Confirm translated labels and fallback labels still render without overflow.

**Checkpoint**: Sidebar looks exactly like the Stitch sidebar but navigates exactly like the current production sidebar.

---

## Phase 8: Final Verification and Rollout

**Purpose**: Validate safely before production.

- [ ] T075 Run `npm run build` from repository root.
- [ ] T076 Run any targeted tests added for announcement helpers and renderer.
- [ ] T077 Manually validate the implemented UI against the Stitch files and confirm no unapproved visual changes were introduced.
- [ ] T078 Validate admin upload, reorder, remove, save, and reload behavior in staging.
- [ ] T079 Validate public display on desktop and mobile.
- [ ] T080 Validate operation-pause waiting screen with maintenance mode enabled and disabled.
- [ ] T081 Validate countdown for hours and days from two browser sessions.
- [ ] T082 Validate paused renewal/check endpoints do not create operations, jobs, or balance transactions.
- [ ] T083 Validate sidebar inventory, route destinations, active state, mobile behavior, RTL/LTR behavior, and logout behavior.
- [ ] T084 Confirm no files under worker, balance, refund, queue, or beIN automation logic changed unless explicitly approved.
- [ ] T085 Prepare rollback note: disable new simplified display and use legacy banner fallback; if sidebar has issues, revert only the sidebar visual refresh.

## Dependencies and Execution Order

- Phase 1 must happen first.
- Phase 2 blocks all implementation phases.
- Phase 3 is the MVP and should be completed before ticker and public polish.
- Phase 4 can start after Phase 2 and can run alongside Phase 3 if separate workers are available.
- Phase 5 depends on the data shape from Phases 3 and 4.
- Phase 6 can run after Phase 2 and is independent from announcement image management.
- Phase 7 can run after Phase 1 sidebar inventory and Phase 2 shared visual constants.
- Phase 8 depends on selected implementation phases.

## MVP Scope

MVP is Phase 1, Phase 2, and Phase 3:

- Simple image upload.
- Image cards.
- Reorder.
- Remove.
- Save.
- Existing public fallback preserved.

Ticker, modern public renderer, and waiting screen can follow as separate increments.
