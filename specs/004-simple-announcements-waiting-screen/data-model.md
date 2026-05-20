# Data Model: Simple Announcements and Waiting Screen

## Existing Entities to Reuse

### AnnouncementBanner

Represents the active announcement configuration.

Relevant fields:

- `message`
- `imageUrl`
- `imageAlt`
- `isActive`
- `displayMode`
- `imageFit`
- `sliderEnabled`
- `sliderAutoplay`
- `sliderIntervalMs`
- `tickerEnabled`
- `tickerText`
- `tickerSpeed`
- `tickerPosition`
- `dismissalVersion`

Rules:

- Existing records must remain valid.
- If there are no slides, `imageUrl` remains the fallback.
- Ticker is hidden when `tickerEnabled` is false or `tickerText` is empty.

### AnnouncementSlide

Represents one uploaded image in the public display.

Relevant fields:

- `id`
- `bannerId`
- `imageUrl`
- `imageAlt`
- `title`
- `description`
- `sortOrder`
- `isActive`
- `imageFit`

Rules:

- Public display uses active slides ordered by `sortOrder`.
- Removed slides should not appear publicly.
- Upload order should be preserved until the admin changes it.

## Proposed Simple UI State

### SimpleAnnouncementDraft

Client-side draft state used by the simplified admin UI.

Fields:

- `images`: ordered list of image draft items
- `tickerEnabled`: boolean
- `tickerText`: string
- `tickerPosition`: `above` or `below`
- `tickerSpeed`: `slow`, `normal`, or `fast`
- `tickerRadius`: `none`, `small`, `medium`, `large`, or `pill`
- `previewMode`: `desktop` or `mobile`

Rules:

- Draft changes update preview immediately.
- Draft is not public until saved.
- Unsaved upload failures should not corrupt saved announcement data.

### OperationPauseWaitingScreenSettings

Optional settings for the waiting screen shown when renewal/check operation flows are paused from settings.

Fields:

- `enabled`: boolean, driven by existing operation pause or maintenance behavior
- `scope`: `all_operations`, `renewal`, `check`, `signal`, or `installment`
- `durationValue`: admin-entered positive number
- `durationUnit`: `hours` or `days`
- `pauseStartedAt`: timestamp when the pause timer is applied
- `pauseEndsAt`: timestamp used by all visitors for countdown remaining time
- `title`: default "This service is temporarily paused"
- `message`: short visitor-facing explanation
- `statusText`: default "Waiting for service to resume"
- `supportLabel`: optional
- `supportUrl`: optional
- `brandImageUrl`: optional
- `stylePreset`: default `stitch-maintenance-exact`

Rules:

- Countdown fields are required only when the admin enables a timed pause.
- Defaults must render safely when settings are absent.
- The screen must not expose admin-only details.
- The pause state must be checked before new operation creation, worker dispatch, or customer balance deduction.
- Countdown reaching zero does not automatically resume operations unless a later approved task explicitly adds that behavior.

### SidebarDisplayState

Client-side display state for the refreshed sidebar.

Fields:

- `role`: current user role
- `direction`: `rtl` or `ltr`
- `isOpen`: mobile/sidebar open state
- `pathname`: current route used for active matching
- `visibleLinks`: the existing production links after permission and setting filters
- `hiddenBySettings`: admin links hidden by sidebar settings
- `activeHref`: the route currently highlighted
- `userFooter`: username, role label, and logout action

Rules:

- This is not a new database model.
- Link labels, routes, and permissions come from the current sidebar logic.
- Styling may change, but route behavior must not change.
- Stitch placeholder links must not be persisted or rendered as production navigation unless a separate content change is approved.
- The sidebar visual shell, spacing, active states, hover states, and footer treatment must match Stitch exactly.
