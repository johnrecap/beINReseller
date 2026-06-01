# Feature Specification: Maintenance Resume And Media Cache Fixes

**Feature Branch**: `025-maintenance-media-cache`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "Fix the agreed second-agent solution: maintenance must reopen automatically when its timer ends, dashboard and announcement images must stop downloading again on navigation or carousel movement, uploaded public images must be cached safely, and image upload security must be tightened without starting the broader security scan."

## User Scenarios & Testing

### User Story 1 - Maintenance Reopens When Timer Ends (Priority: P1)

When an admin enables timed maintenance, users see the maintenance countdown. When the countdown reaches the configured end time, the panel becomes usable again without the admin manually disabling maintenance.

**Why this priority**: Timed maintenance currently blocks users after the timer has ended, which makes the timer misleading and can stop renewal work.

**Independent Test**: Configure timed maintenance with a future end time, verify users are blocked before it ends, then verify users and renewal requests are allowed after the end time without admin action.

**Acceptance Scenarios**:

1. **Given** maintenance mode is enabled with a future end time, **When** a non-admin opens the renewal page before the timer ends, **Then** the maintenance screen remains visible and renewal start requests are blocked.
2. **Given** maintenance mode is enabled with an end time in the past, **When** a non-admin opens the renewal page or starts a renewal, **Then** the panel is treated as open and the renewal request is not blocked by maintenance.
3. **Given** maintenance mode is enabled without an end time, **When** users access the panel, **Then** maintenance remains manual and users stay blocked until an admin disables it.
4. **Given** maintenance mode has an invalid end time, **When** users access the panel, **Then** the system treats it as manual maintenance instead of accidentally opening.

---

### User Story 2 - Public Display Images Stop Re-Downloading (Priority: P2)

Users browsing the dashboard and maintenance screen should not repeatedly download the same logo or announcement images during normal navigation or carousel movement.

**Why this priority**: Repeated image downloads add server load and make user devices do unnecessary work.

**Independent Test**: Open the dashboard with browser cache enabled, navigate between dashboard pages and rotate the announcement carousel, then verify repeated image requests are served from browser cache or validation responses rather than full downloads.

**Acceptance Scenarios**:

1. **Given** the dashboard uses static brand images, **When** a user navigates between dashboard pages, **Then** those images use browser caching instead of full repeated downloads.
2. **Given** announcement images are uploaded with generated filenames, **When** a user sees the same uploaded image more than once, **Then** the browser can reuse the cached image for a long period.
3. **Given** a cached uploaded image is revalidated, **When** the browser sends matching validation headers, **Then** the server can answer that the image has not changed without reading and sending the full file.
4. **Given** Chrome DevTools has "Disable cache" enabled, **When** the user tests image loading, **Then** the team understands this mode forces downloads and is not used as the production success signal.

---

### User Story 3 - Uploaded Image Files Are Safer To Serve (Priority: P3)

Admins can upload public product, category, and announcement images, while the system rejects dangerous or mismatched files and never overwrites an existing uploaded URL.

**Why this priority**: Long-lived public caching is only safe when uploaded URLs are immutable public assets and unsafe file types cannot be served.

**Independent Test**: Upload valid JPG, PNG, WebP, and GIF files, verify they save with generated filenames and cache safely. Try spoofed SVG or mismatched file content and verify the upload is rejected.

**Acceptance Scenarios**:

1. **Given** an admin uploads a valid supported image, **When** the upload succeeds, **Then** the stored URL is newly generated and not reused for a changed file.
2. **Given** an admin uploads an SVG file or a file whose bytes do not match a supported image type, **When** the server validates it, **Then** the upload is rejected.
3. **Given** an old SVG or invalid uploaded path is requested directly, **When** the public upload route receives the request, **Then** the file is not served.
4. **Given** two generated filenames collide, **When** saving the upload, **Then** the server retries with a new filename instead of overwriting the old file.

---

### Edge Cases

- Maintenance timer expires while many users are polling the public status endpoint.
- Admin extends maintenance at the same time a user refreshes the maintenance screen.
- Admin browser clock is wrong when setting timed maintenance.
- `maintenance_pause_until` is empty, invalid, or points to the past.
- Static brand image URL is not versioned and may change across deploys.
- Uploaded image is deleted from disk but still referenced by old browser cache.
- Browser sends `If-None-Match`, `If-Modified-Since`, both, or neither.
- Chrome DevTools cache is disabled during testing.
- Uploaded file claims a safe MIME type but contains SVG or non-image bytes.
- Existing uploaded SVG files may already exist on disk.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST compute an effective maintenance state from saved settings and current server time.
- **FR-002**: The public maintenance status endpoint MUST remain read-only and MUST NOT update saved settings.
- **FR-003**: If timed maintenance has expired, user-facing status and renewal start checks MUST treat maintenance as off.
- **FR-004**: If maintenance has no valid end time, the system MUST keep maintenance active until an admin disables it.
- **FR-005**: Admin settings save MUST compute timed maintenance end time using server time rather than trusting the admin browser clock.
- **FR-006**: The maintenance screen MUST refetch status when the countdown expires without waiting for only the normal polling interval.
- **FR-007**: Maintenance screen copy MUST not say that admin confirmation is required when timed maintenance is expected to reopen automatically.
- **FR-008**: The global no-store cache rule MUST NOT apply to public static brand images or public uploaded display images.
- **FR-009**: Public uploaded image responses MUST include safe cache headers, validation headers, content length, and no-sniff protection.
- **FR-010**: Public uploaded image responses MUST support not-modified responses when the browser presents current validators.
- **FR-011**: Generated uploaded image URLs MUST be treated as immutable only after the upload path is guaranteed not to overwrite an existing file.
- **FR-012**: Static `/images` assets MUST use moderate caching unless their filenames are versioned.
- **FR-013**: Upload validation MUST reject SVG files and files whose bytes do not match a supported image type.
- **FR-014**: Upload save behavior MUST derive the stored file extension from detected image bytes, not from the original filename alone.
- **FR-015**: Public upload serving MUST reject SVG and unsupported extensions even if such files already exist on disk.
- **FR-016**: The carousel implementation MUST NOT be changed in this feature unless browser verification with normal cache still shows repeated full image downloads or unacceptable client-side image churn.
- **FR-017**: The broader security scan MUST remain out of scope for this feature and be tracked as follow-up work.

### Key Entities

- **Maintenance Settings**: Saved admin controls for maintenance mode, message, duration, and end time.
- **Effective Maintenance Status**: Computed state that decides whether users are actually blocked at a given server time.
- **Public Uploaded Image**: Product, category, or announcement image stored under public uploads and served to any user.
- **Cache Validator**: File metadata used to decide whether an image changed since the browser cached it.
- **Image Upload Validation Result**: Server decision about detected image type, extension, dimensions, and whether the file can be saved.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of timed maintenance states with an expired end time allow users back into renewal without manual admin action.
- **SC-002**: 100% of manual maintenance states without a valid end time continue blocking users until an admin disables maintenance.
- **SC-003**: Repeated requests for the same uploaded image do not transfer the full image body when the browser has valid cached validators.
- **SC-004**: Normal dashboard navigation with browser cache enabled no longer shows repeated full downloads for unchanged brand or announcement images.
- **SC-005**: 100% of SVG uploads and MIME-spoofed non-image uploads tested by the suite are rejected.
- **SC-006**: Existing valid JPG, PNG, WebP, and GIF uploads continue to work after hardening.

## Assumptions

- Uploaded product, category, and announcement images are public display assets, not private or sensitive documents.
- Replacing an uploaded image creates a new generated URL rather than changing bytes at an existing URL.
- Static brand images are not currently filename-versioned, so they need moderate cache rather than one-year immutable cache.
- Maintenance status can be computed without a new database table or migration.
- The full security scan remains a separate feature after these production fixes.
