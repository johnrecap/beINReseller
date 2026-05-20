# Research: Simple Announcements and Waiting Screen

## Decision 1: Keep the new admin flow simple by default

**Decision**: The primary admin screen should show only upload, reorder, remove, ticker, preview, and save controls.

**Rationale**: The user explicitly said the current controls are too complex. Reducing visible controls is the highest-value change.

**Alternatives considered**:

- Keep all current controls visible: rejected because it preserves the current pain point.
- Create separate pages for images and ticker: rejected because it adds navigation overhead.

## Decision 2: Use a live preview connected to the main-page layout

**Decision**: Admin changes should be shown in a main-page preview before saving.

**Rationale**: The user wants image upload and ordering to be tied to the main screen. A live preview prevents surprises.

**Alternatives considered**:

- Save first, then inspect the public page: rejected because it is slower and riskier.
- Use a static thumbnail preview only: rejected because it does not show ticker and responsive layout behavior.

## Decision 3: Operation pause waiting screen should copy the Stitch maintenance design

**Decision**: The waiting screen used when renewal/check operations are paused should copy `maintenance_screen` from Stitch exactly and include a countdown when the admin sets a duration in hours or days.

**Rationale**: The admin wants to communicate the expected pause window. The countdown must be stored as an end time so all visitors see the same remaining time.

**Alternatives considered**:

- Reinterpret the waiting screen with a calmer custom style: rejected because the owner wants the provided Stitch design exactly.
- Plain text maintenance page: rejected because the user wants a more professional waiting experience.
- Visitor-local countdown from page open: rejected because every visitor would see a different timer.

## Decision 4: Operation pause must happen before operation creation

**Decision**: Any future implementation must check pause settings before creating an operation, dispatching a worker job, or charging balance.

**Rationale**: The site handles customer balances. If renewal or check is paused, the safest behavior is to block before financial or queue side effects.

**Alternatives considered**:

- Create the operation then mark it paused: rejected because it can create confusing active records.
- Deduct then refund after pause detection: rejected because it creates avoidable financial risk.

## Decision 5: No financial or worker behavior changes in this plan

**Decision**: This feature must not touch balances, renewal flow, verification flow, queues, worker locks, refunds, beIN accounts, or production financial data.

**Rationale**: The project is live with real customer balances. This is a UI/display feature and should remain isolated.

**Alternatives considered**:

- Reuse worker or job infrastructure for announcements: rejected because it increases risk without benefit.

## Decision 6: Stitch design is exact visual source, not navigation content

**Decision**: Use the Stitch dashboard files as the exact visual source across announcements, waiting screen, settings controls, and sidebar styling, but keep the production sidebar navigation inventory unchanged.

**Rationale**: The user wants the same designs exactly. The existing sidebar contains real route, role, permission, and settings logic, so only placeholder content is replaced with production content while the visual design remains unchanged.

**Alternatives considered**:

- Replace production sidebar items with Stitch items: rejected because Stitch contains placeholder labels like "CORE ENGINE", "Maintenance", and "Emergency Stop".
- Keep current sidebar unchanged: rejected because it would not match the exact Stitch visual design.
- Redesign sidebar and change routes at the same time: rejected because route/content changes should be a separate approval path.
