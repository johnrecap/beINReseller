# UI Contract: Simple Announcements and Waiting Screen

## Admin Announcement Manager

### Inputs

- Multiple image files selected from the browser.
- Optional ticker text.
- Ticker enabled/disabled state.
- Ticker position.
- Ticker speed preset.
- Ticker rounded corner preset.
- Ordered image list.

### Outputs

- Live main-page preview.
- Saved announcement payload sent to existing admin announcement APIs.
- Clear validation messages for invalid image files.

### Required Behaviors

- Uploading images adds cards without hiding existing saved images.
- Reordering cards changes preview order immediately.
- Removing a card changes preview immediately.
- Saving persists the current order and ticker settings.
- Canceling leaves the saved public display unchanged.

## Public Announcement Display

### Inputs

- Active announcement response from `src/app/api/announcement/active/route.ts`.

### Outputs

- Responsive image card strip or single banner.
- Optional ticker strip above or below images.

### Required Behaviors

- If slides exist, render slides.
- If no slides exist but legacy image exists, render the legacy image.
- If ticker disabled or empty, render no ticker.
- If no images and no ticker exist, render nothing.

## Operation Pause Waiting Screen

### Inputs

- Existing maintenance status and any future operation pause status.
- Optional waiting screen settings, operation scope, pause duration, pause unit, and pause end time.

### Outputs

- Calm waiting layer or full-page screen for visitors when renewal/check operations are paused.

### Required Behaviors

- Countdown timer displays days, hours, minutes, and seconds when a shared pause end time exists.
- No custom color palette changes outside the provided Stitch maintenance design.
- Brand and message remain visible on mobile.
- Admin access behavior follows existing maintenance rules.
- New renewal/check actions are blocked before operation creation, job dispatch, or balance deduction.
- Countdown displays the same remaining time for all visitors based on stored `pauseEndsAt`.
- Countdown reaching zero changes the display state but does not start operations automatically.

## Sidebar Visual Refresh

### Inputs

- Current pathname.
- Current authenticated user role.
- Existing translated sidebar labels and fallback labels.
- Existing sidebar visibility settings from `/api/admin/sidebar-settings`.
- Mobile open/close state.
- Current layout direction, RTL or LTR.

### Outputs

- Same role-aware production navigation items as today.
- Same route destinations as today.
- Same logout action as today.
- Exact Stitch visual styling for the sidebar shell, nav items, active item, hover state, footer, and mobile drawer.

### Required Behaviors

- Admin, manager, and normal user menus keep the same content and permissions.
- Hidden admin links remain hidden when sidebar settings disable them.
- Active route matching keeps the current direct and child-route behavior.
- Mobile overlay and close button keep working.
- RTL and LTR side placement remains correct.
- Stitch placeholder navigation content is not copied into production, but the Stitch visual shell and states are copied exactly.
- Visual updates do not change renewal, verification, balance, queue, worker, or beIN behavior.
