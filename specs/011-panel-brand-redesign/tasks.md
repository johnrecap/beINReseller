# Tasks: Panel Brand Redesign

**Input**: Design documents from `specs/011-panel-brand-redesign/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ui-contract.md](./contracts/ui-contract.md), [user-actions.md](./user-actions.md)

**Tests**: Visual redesign needs build/lint plus manual screenshot QA. Automated business tests are not the primary target because no business logic should change.

**Organization**: Tasks are grouped by user story so each section can be implemented and validated independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare assets and baseline without changing behavior.

- [ ] T001 Create implementation branch and record dirty-worktree boundaries.
  - Reason: Protect unrelated current work and avoid accidentally reverting active changes.
  - Expected: A branch exists and the implementer knows which files are unrelated.
  - Risk: Existing modified files get overwritten.
  - Mitigation: Run `git status --short` before and after each task; use minimal diffs only.

- [ ] T002 Capture baseline screenshots for login, dashboard, admin, financial review, transactions, renewal, and mobile sidebar.
  - Reason: Visual comparison is needed to catch layout regressions.
  - Expected: Before screenshots are saved or attached to the implementation notes.
  - Risk: Redesign improves one page but breaks another unnoticed.
  - Mitigation: Use the QA matrix from `quickstart.md`.

- [ ] T003 [P] Confirm owner choices from `specs/011-panel-brand-redesign/user-actions.md`.
  - Reason: Logo/banner/icon decisions are product decisions, not implementation guesses.
  - Expected: Final selected logo, icon, banner, robot usage, and theme mode are known.
  - Risk: Rework if the wrong asset is chosen.
  - Mitigation: Do not copy/optimize final assets until choices are confirmed.

- [ ] T004 [P] Create `public/images/brand/` and copy only approved assets.
  - Reason: Production code needs stable public paths.
  - Expected: App-owned assets exist with clean names.
  - Risk: Shipping too many large source images.
  - Mitigation: Copy only selected files and document source-to-public mapping.

- [ ] T005 [P] Optimize approved images for their target surfaces.
  - Reason: Source images are large and may slow login/dashboard load.
  - Expected: Logo, icon, hero, and empty-state images are resized/compressed.
  - Risk: Image quality loss or bad crop.
  - Mitigation: Keep original source files untouched and review optimized previews.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build shared visual foundations before changing individual pages.

**CRITICAL**: No page-level redesign should begin until this phase is complete.

- [ ] T006 Define final brand tokens in `src/styles/tokens.css`.
  - Reason: Central tokens prevent scattered hard-coded colors.
  - Expected: Brand, surface, text, border, status, shadow, and motion tokens exist.
  - Risk: A token change may affect many components unexpectedly.
  - Mitigation: Change tokens in small groups and check key pages after each group.

- [ ] T007 Align Tailwind CSS variables in `src/app/globals.css` with the new tokens.
  - Reason: Tailwind utility classes consume global theme variables.
  - Expected: Light/dark variables align with the new palette without duplicate meanings.
  - Risk: Existing components using `bg-background`, `card`, or `primary` may shift too far.
  - Mitigation: Keep semantic variable names stable and only change values deliberately.

- [ ] T008 Create or update a brand asset manifest in `src/components/brand/` or `src/lib/brand/`.
  - Reason: Future image usage should be discoverable from one place.
  - Expected: Public paths, alt text, category, and fallback rules are documented in code.
  - Risk: Components directly reference random image paths.
  - Mitigation: Route all brand image use through the manifest or `BrandLogo`.

- [ ] T009 Update `src/components/brand/BrandLogo.tsx` to support full, compact, and fallback states.
  - Reason: Sidebar, login, and favicon/collapsed usage need different treatments.
  - Expected: One component handles logo variants consistently.
  - Risk: Missing image breaks the shell.
  - Mitigation: Add text/fallback rendering and keep existing image as backup.

- [ ] T010 Normalize shared primitive styles in `src/components/ui/button.tsx`, `card.tsx`, `table.tsx`, `badge.tsx`, and `input.tsx`.
  - Reason: Operational pages depend on these primitives.
  - Expected: Components consume tokens and preserve hover/focus/disabled states.
  - Risk: Changing primitives can affect every page.
  - Mitigation: Validate one representative page per primitive before broad rollout.

- [ ] T011 Add reduced-motion support for new glow/animation utilities in `src/app/globals.css`.
  - Reason: Decorative motion must not reduce usability or accessibility.
  - Expected: Motion is disabled or simplified when `prefers-reduced-motion` is enabled.
  - Risk: Heavy animations harm performance.
  - Mitigation: Keep animations subtle and use CSS-only transforms sparingly.

**Checkpoint**: Tokens, assets, logo variants, and primitives are ready. Page work can begin.

---

## Phase 3: User Story 1 - Branded Panel Shell (Priority: P1) MVP

**Goal**: Make the login page and dashboard shell feel like one branded product without changing routes or permissions.

**Independent Test**: Login and open dashboards for ADMIN, MANAGER, AGENT, and USER. Navigation and permissions remain unchanged.

- [ ] T012 [US1] Redesign `src/app/login/page.tsx` and login card surfaces.
  - Reason: Login is the first brand impression.
  - Expected: Login uses approved logo/hero/robot visual with readable form controls.
  - Risk: Decorative image may distract from login form or clip on mobile.
  - Mitigation: Keep form as the primary visual focus and test mobile crop.

- [ ] T013 [US1] Update `src/components/layout/DashboardShell.tsx` page background and content rhythm.
  - Reason: Shell sets the base feel for every dashboard page.
  - Expected: Brand background is consistent and not visually noisy.
  - Risk: Background makes dense tables harder to read.
  - Mitigation: Use low-contrast background effects and solid table/card surfaces.

- [ ] T014 [US1] Update `src/components/layout/Header.tsx` with the new brand spacing and controls.
  - Reason: Header contains common controls like language, menu, and page title.
  - Expected: Header looks aligned with sidebar and remains compact.
  - Risk: Header controls overlap on small screens.
  - Mitigation: Test 390px mobile and keep controls wrapped/collapsed.

- [ ] T015 [US1] Update `src/components/layout/Sidebar.tsx` brand header, active nav, footer, and mobile drawer.
  - Reason: Sidebar is the strongest persistent brand surface.
  - Expected: Approved logo, purple active state, green system indicator, readable nav.
  - Risk: Role-specific links may disappear or become unreadable.
  - Mitigation: Compare role navigation before/after and keep link arrays unchanged.

- [ ] T016 [US1] Update favicon/app icon using approved square brand icon.
  - Reason: Browser tab and shortcuts should match the redesigned brand.
  - Expected: App icon uses selected square logo.
  - Risk: Wrong file format or stale browser cache.
  - Mitigation: Keep existing favicon as fallback and document cache clearing.

**Checkpoint**: Shell MVP complete and usable for all roles.

---

## Phase 4: User Story 2 - Operational Screens Stay Usable (Priority: P1)

**Goal**: Apply the new design to core operational pages while preserving readability and status meaning.

**Independent Test**: Open tables/forms/review pages and confirm statuses, values, and actions remain clear.

- [ ] T017 [US2] Update dashboard summary cards in `src/components/dashboard/` and `src/components/admin/`.
  - Reason: Cards are high-visibility and should establish the new look.
  - Expected: Stats use consistent card surfaces, accent icons, and readable numbers.
  - Risk: Overuse of gradients/glows makes metrics harder to scan.
  - Mitigation: Keep numbers high contrast and decoration secondary.

- [ ] T018 [US2] Update financial surfaces in `src/components/transactions/` and admin financial review components.
  - Reason: Financial pages are sensitive and need high clarity.
  - Expected: Deposits, deductions, refunds, balances, and review states remain distinct.
  - Risk: Brand green conflicts with positive amount or success status.
  - Mitigation: Define distinct status/amount tokens and document usage.

- [ ] T019 [US2] Update operation history tables in `src/components/history/`.
  - Reason: Logs/history are dense and need consistent filters and table rows.
  - Expected: Filters, table header, row hover, badges, and empty states use the new system.
  - Risk: Long Arabic/English labels overflow.
  - Mitigation: Apply truncation/wrap rules and test both languages.

- [ ] T020 [US2] Update renewal and signal-flow components in `src/components/renewal/`.
  - Reason: Renewal screens directly support core business workflows.
  - Expected: Package cards, contracts, card status, and confirmation panels are readable.
  - Risk: Visual changes could hide critical package or status details.
  - Mitigation: Do not reorder business data; only adjust visual treatment.

- [ ] T021 [US2] Update credit request, points, rewards, and agent/admin pages.
  - Reason: New role/credit/points features need to match the redesigned shell.
  - Expected: Request status and approval/reward states are visually consistent.
  - Risk: Pending/approved/rejected badges become unclear.
  - Mitigation: Use StatusSemantic rules from `data-model.md`.

- [ ] T022 [US2] Update settings, users, and manager pages without changing form behavior.
  - Reason: Admin/manager maintenance pages must not look like old UI.
  - Expected: Forms, lists, dialogs, and action buttons use shared primitives.
  - Risk: Settings forms are easy to break visually due many controls.
  - Mitigation: Validate save/cancel/error states after visual changes.

**Checkpoint**: Operational screens are visually updated and still usable.

---

## Phase 5: User Story 3 - Asset Library Used Correctly (Priority: P2)

**Goal**: Use the images in the right places without cluttering operational pages.

**Independent Test**: Inspect asset usage and verify no robot/banner appears where it hurts task flow.

- [ ] T023 [US3] Add selected banner to login/dashboard hero surfaces only.
  - Reason: Banners are strong visuals and should not compete with tables.
  - Expected: Banner appears in high-level areas with correct crop.
  - Risk: Embedded banner text conflicts with UI language.
  - Mitigation: Treat banner as visual background unless text is approved.

- [ ] T024 [US3] Add selected bot image to empty/success/pending states.
  - Reason: Robot art is useful for friendly states but risky in dense workflows.
  - Expected: Empty states feel branded without covering actions.
  - Risk: Repetition makes the panel feel less professional.
  - Mitigation: Limit bot use to a small number of reusable states.

- [ ] T025 [US3] Use selected icon images only where they add meaning.
  - Reason: Custom icons can support cards for wallet, rewards, users, reports.
  - Expected: Icons complement lucide action icons instead of replacing standard controls.
  - Risk: Custom images in buttons reduce recognizability.
  - Mitigation: Keep lucide icons for actions and use image icons for decorative summaries.

- [ ] T026 [US3] Document final asset source-to-public mapping.
  - Reason: Future maintenance needs traceability.
  - Expected: Implementation notes list original file and final path.
  - Risk: Later replacement becomes confusing.
  - Mitigation: Keep mapping near the asset manifest or in implementation notes.

**Checkpoint**: Assets are organized and intentionally used.

---

## Phase 6: User Story 4 - Responsive RTL/LTR Experience (Priority: P2)

**Goal**: Ensure the redesigned panel works in Arabic/English and all target viewport sizes.

**Independent Test**: Capture screenshots in Arabic and English at mobile, tablet, desktop, and wide desktop widths.

- [ ] T027 [US4] Validate RTL/LTR spacing in sidebar, header, forms, and tables.
  - Reason: Arabic is a primary usage path.
  - Expected: Direction, active borders, icons, and spacing mirror correctly.
  - Risk: Existing physical CSS classes (`left/right`) fail in RTL.
  - Mitigation: Prefer logical direction handling and role/language screenshots.

- [ ] T028 [US4] Validate mobile shell and drawer behavior.
  - Reason: Mobile users must still access actions and navigation.
  - Expected: Sidebar drawer, logout, profile, and language controls remain reachable.
  - Risk: Tall logo/banner pushes nav/footer off screen.
  - Mitigation: Use fixed shell zones and scroll only the nav section.

- [ ] T029 [US4] Validate table overflow and filter wrapping on mobile.
  - Reason: Dense operations tables often fail on small screens.
  - Expected: Tables scroll intentionally or switch to compact layout without hidden actions.
  - Risk: Horizontal scroll hides important status/action columns.
  - Mitigation: Keep critical columns visible or add responsive row summaries.

- [ ] T030 [US4] Validate long Arabic/English labels in buttons, badges, and cards.
  - Reason: Translation length varies across languages.
  - Expected: Text wraps/truncates professionally and does not overlap icons.
  - Risk: Brand fonts/letter spacing reduce readability.
  - Mitigation: Avoid negative letter spacing and use stable component dimensions.

**Checkpoint**: Responsive and language QA passes.

---

## Phase 7: User Story 5 - Handoff And Maintenance Guide (Priority: P3)

**Goal**: Make future changes to brand assets and color choices understandable.

**Independent Test**: A maintainer can replace an asset or adjust colors using documentation and the manifest.

- [ ] T031 [US5] Update `specs/011-panel-brand-redesign/user-actions.md` with final owner choices.
  - Reason: The plan should reflect actual approved images.
  - Expected: Future readers know which images were chosen and why.
  - Risk: Documentation drifts from implementation.
  - Mitigation: Update it in the same PR as asset selection.

- [ ] T032 [US5] Add a short brand maintenance note in implementation docs.
  - Reason: Future edits should not scatter new colors/images.
  - Expected: Maintainers know to edit tokens and asset manifest first.
  - Risk: Later quick fixes reintroduce hard-coded colors.
  - Mitigation: Link docs from the final implementation summary.

- [ ] T033 [US5] Record final screenshot set and any deferred visual items.
  - Reason: Deployment needs clear approval evidence.
  - Expected: Owner can approve based on screenshots.
  - Risk: Subjective visual disagreement after deployment.
  - Mitigation: Get approval before production push.

**Checkpoint**: Handoff is complete.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all redesigned surfaces.

- [ ] T034 Run `npm run lint`.
  - Reason: Catch TypeScript/ESLint/style integration issues.
  - Expected: Lint passes or known unrelated failures are documented.
  - Risk: Existing unrelated changes cause noise.
  - Mitigation: Separate redesign failures from pre-existing failures in final notes.

- [ ] T035 Run `npm run build`.
  - Reason: Confirm Next.js compiles with updated assets and CSS.
  - Expected: Production build succeeds.
  - Risk: Large images or bad imports break build.
  - Mitigation: Use public paths for images and avoid importing huge files into JS.

- [ ] T036 Run `git diff --check`.
  - Reason: Catch whitespace and patch issues.
  - Expected: No diff check errors.
  - Risk: Minor whitespace blocks clean commit.
  - Mitigation: Fix only affected lines.

- [ ] T037 Run mojibake scan on changed files.
  - Reason: Repository rules require checking encoding corruption.
  - Expected: No new mojibake patterns in changed files.
  - Risk: Arabic strings/comments can be corrupted by unsafe edits.
  - Mitigation: Use `apply_patch` and avoid risky PowerShell write APIs.

- [ ] T038 Capture final screenshot matrix from `quickstart.md`.
  - Reason: Visual QA must prove the redesign works across roles/languages/devices.
  - Expected: Screenshot set is attached or summarized.
  - Risk: A page passes build but looks broken.
  - Mitigation: Do not finish until screenshots pass.

- [ ] T039 Verify no business logic files changed unexpectedly.
  - Reason: This is a visual redesign only.
  - Expected: Diffs are limited to styles, UI components, assets, and docs.
  - Risk: Accidental route/worker/schema changes.
  - Mitigation: Review `git diff --name-only` and revert only accidental changes made by this feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundation**: Depends on selected assets and baseline screenshots.
- **US1 Shell**: Depends on tokens and logo/asset manifest.
- **US2 Operational Screens**: Depends on tokens and shared primitives.
- **US3 Asset Usage**: Depends on selected/optimized images.
- **US4 Responsive QA**: Depends on US1-US3.
- **US5 Handoff**: Can run throughout, final update after screenshots.
- **Final Phase**: Depends on all desired implementation tasks.

### Parallel Opportunities

- T003, T004, and T005 can proceed in parallel after owner choices.
- Asset optimization and token definition can be parallel if paths are agreed.
- Operational page groups in US2 can be split by area after shared primitives are ready.
- Screenshot QA can be split by role/language.

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 only.
3. Validate login and shell across roles.
4. Then continue to operational page groups.

## Notes

- Do not implement all visual changes as one large unreviewed patch.
- Keep business routes, Prisma schemas, worker code, and financial logic untouched.
- Use the image assets as product branding, not as decoration inside every panel.
- If a visual choice conflicts with readability, readability wins.
