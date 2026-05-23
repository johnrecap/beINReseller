# Feature Specification: Panel Brand Redesign

**Feature Branch**: `011-panel-brand-redesign`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "اعمل خطه كامله باستخدام ال speckit تغير فيها التصميم الكامل للبانل والالوان بحيث تتناسب مع المرجعيات والالوان وتستخدم فيها الصور كمان اعمل خطط شامله كامله تكتب فيها كل تاسك هايعمل ايه والمتوقع ايه والمخاطر ايه وحلها ايه وتعمل ملف تقولي فيه ايه المطلوب مني اني اعمله"

## User Scenarios & Testing

### User Story 1 - Branded Panel Shell (Priority: P1)

As an admin, manager, agent, or reseller, I want the panel shell to feel like one consistent Desh Panel product using the selected logo, dark operational theme, purple accents, and neon green status highlights, without changing any business operation.

**Why this priority**: The shell is visible on every page. If the sidebar/header/login surfaces are inconsistent, the whole redesign feels incomplete even if inner pages are improved.

**Independent Test**: Open login and the main dashboard for ADMIN, MANAGER, AGENT, and USER roles. The shell should show the correct brand identity, remain readable, and keep all current links and permissions unchanged.

**Acceptance Scenarios**:

1. **Given** a logged-in admin, **When** they open `/dashboard/admin`, **Then** the sidebar, header, logo, and background use the new brand system without hiding any existing admin route.
2. **Given** a regular user, **When** they open `/dashboard`, **Then** they see the same branded shell with only their existing permitted navigation items.
3. **Given** the login page, **When** it loads on desktop and mobile, **Then** it uses an approved logo/banner/robot asset with no text overlap and no broken image.

---

### User Story 2 - Operational Screens Stay Usable (Priority: P1)

As an operator handling renewals, reviews, transactions, users, points, and logs, I want the redesigned colors to improve the look without reducing scanability, table readability, or status clarity.

**Why this priority**: The panel is an operations tool. A beautiful redesign that makes tables hard to read or status badges confusing would create real operational risk.

**Independent Test**: Open the main operational pages and verify tables, filters, forms, modals, toasts, pending states, success states, failed states, and review states are readable under the new theme.

**Acceptance Scenarios**:

1. **Given** a transactions table, **When** values include deposits, deductions, refunds, and balances, **Then** positive/negative/status colors remain distinguishable from decorative brand colors.
2. **Given** review pages with suspicious operations, **When** filters are changed, **Then** warning and decision states remain visually stronger than decoration.
3. **Given** a renewal or credit request form, **When** validation errors appear, **Then** error messages remain readable and are not confused with purple/green brand accents.

---

### User Story 3 - Asset Library Used Correctly (Priority: P2)

As an admin maintaining the panel, I want the images from `E:\work\panel_bien_sport\photos 1` organized into a clean asset map so each image type has a clear use and future replacements are simple.

**Why this priority**: The provided assets include logos, banners, robot art, icons, and screen references. Without a map, images can be overused or placed in the wrong operational context.

**Independent Test**: Inspect the brand asset folder and asset map. Every used image has a purpose, fallback, and recommended viewport behavior.

**Acceptance Scenarios**:

1. **Given** the `banner` images, **When** they are used, **Then** they appear only on hero/summary areas and not inside dense tables.
2. **Given** the `bot` images, **When** they are used, **Then** they appear only in login, empty states, confirmation states, or limited visual panels.
3. **Given** the `screens` images, **When** implementation happens, **Then** they are treated as design references only unless explicitly approved as content.

---

### User Story 4 - Responsive RTL/LTR Experience (Priority: P2)

As a user switching between Arabic and English, I want the new layout to work in RTL and LTR on desktop, tablet, and mobile without clipped text, broken icons, or wrong image cropping.

**Why this priority**: The current panel supports multiple languages and role-specific layouts. The redesign must not break Arabic-first usage or mobile access.

**Independent Test**: Capture screenshots for Arabic and English at 390px, 768px, 1440px, and wide desktop. No text overlap, no broken layout, and no image crop hides the main subject.

**Acceptance Scenarios**:

1. **Given** Arabic mode, **When** the sidebar opens on mobile, **Then** direction, spacing, icons, and active states are mirrored correctly.
2. **Given** English mode, **When** a long button or table label appears, **Then** it wraps or truncates professionally without pushing layout widths.
3. **Given** reduced motion preferences, **When** the dashboard loads, **Then** decorative animations are reduced or disabled.

---

### User Story 5 - Clear Handoff And Maintenance Guide (Priority: P3)

As the panel owner, I want a simple file telling me what I need to choose or provide before implementation, so the redesign can be executed without repeated guesswork.

**Why this priority**: The design work depends on final image choices and deployment preferences. A clear handoff prevents rework.

**Independent Test**: Read `user-actions.md` and confirm it lists every decision needed from the owner before implementation starts.

**Acceptance Scenarios**:

1. **Given** the plan is ready, **When** the owner opens `user-actions.md`, **Then** they can see the required choices for logo, banner, theme mode, and visual approval.
2. **Given** new images are added later, **When** the owner follows the guide, **Then** they know where each image category should go.

### Edge Cases

- Missing or deleted brand images should fall back to a text logo or existing `public/images/desh-panel-brand.jpeg`.
- Large images must not block login/dashboard loading on slow connections.
- Decorative purple/green accents must not weaken success, warning, error, refund, pending, or review-required status colors.
- Robot assets must not cover tables, modals, action buttons, or financial values.
- Image text embedded inside banners may conflict with Arabic/English UI text; use as background/visual context only unless the image text is approved.
- Existing dirty worktree changes must not be reverted while implementing this feature.
- Light theme behavior must be decided before implementation; default plan assumes dark-first with safe light fallback.
- Browser fallback must handle missing `backdrop-filter`.
- Mobile sidebar must not overflow or hide logout/profile controls.
- Performance must remain acceptable when the page has tables plus a branded background.

## Requirements

### Functional Requirements

- **FR-001**: The redesign MUST NOT change renewal, payment, credit request, points, rewards, review, worker, proxy, or auth business logic.
- **FR-002**: The redesign MUST centralize the new color palette in `src/styles/tokens.css` and `src/app/globals.css` before page-level changes.
- **FR-003**: The redesign MUST preserve existing role-based navigation and permissions for ADMIN, MANAGER, AGENT, and USER.
- **FR-004**: The redesign MUST introduce a documented brand asset map for logos, banners, robot images, icons, and reference screens.
- **FR-005**: The implementation MUST copy approved assets into a predictable app-owned path under `public/images/brand/` rather than reading from the external photos folder at runtime.
- **FR-006**: Images MUST be optimized or resized for their target use before production use.
- **FR-007**: The sidebar and header MUST use approved logo treatment and keep status/navigation labels readable.
- **FR-008**: The login page MUST use the brand visuals without forcing users to inspect decorative text inside an image to understand the form.
- **FR-009**: Dashboard cards, tables, filters, dialogs, toasts, badges, and forms MUST use the shared theme tokens instead of scattered hard-coded colors where feasible.
- **FR-010**: Operational status colors MUST remain semantically clear: success, error, warning, pending, refund, review-required, completed, failed, cancelled.
- **FR-011**: The design MUST support Arabic RTL and English LTR layouts.
- **FR-012**: The design MUST avoid nested decorative cards and heavy decorative backgrounds inside dense operational pages.
- **FR-013**: The design MUST include reduced-motion handling for animated glows, tickers, and hover motion.
- **FR-014**: The design MUST include a manual visual QA checklist covering desktop and mobile screenshots.
- **FR-015**: The design MUST include a clear owner handoff file named `user-actions.md`.

### Key Entities

- **Brand Asset**: A selected image with source path, public path, intended use, fallback, crop rule, and optimization target.
- **Design Token**: A reusable color, spacing, border, shadow, or typography value used by components.
- **Page Surface**: A UI area affected by the redesign, such as shell, sidebar, card, table, modal, login hero, or empty state.
- **Status Semantic**: A business state with a fixed visual meaning that must not be overridden by decorative brand colors.
- **Visual QA Snapshot**: A screenshot or manual verification record for a role, language, viewport, and page.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of primary role entry pages load with no missing images: login, user dashboard, admin dashboard, manager dashboard, agent dashboard.
- **SC-002**: 100% of primary operational pages retain readable status badges and action buttons at desktop and mobile widths.
- **SC-003**: No business API route, Prisma model, worker payment logic, or permission rule changes are required for the redesign.
- **SC-004**: Largest above-the-fold brand image is optimized for its target display and does not materially slow first load compared with the current page.
- **SC-005**: Arabic and English screenshots pass manual review with no overlapping text or clipped controls.
- **SC-006**: The owner can identify where each visual asset should be used from documentation without reading source code.

## Assumptions

- The visual source folder is `E:\work\panel_bien_sport\photos 1`.
- The app remains a Next.js App Router web app with Tailwind CSS v4 and CSS variables.
- The redesign is dark-first and operations-focused, not a marketing landing page.
- Purple and neon green are brand accents, while red/yellow/green status colors keep their operational meanings.
- The current `public/images/desh-panel-brand.jpeg` can be used as a fallback until final image selection is approved.
- No automatic WhatsApp, Telegram, credit request, or beIN behavior is part of this visual redesign.
