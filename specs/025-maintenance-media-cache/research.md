# Research: Maintenance Resume And Media Cache Fixes

## Decision 1: Compute effective maintenance state without public DB writes

**Decision**: Add a pure server helper that reads raw maintenance settings and current server time, then returns the effective blocking state. If `maintenance_mode=true` and `maintenance_pause_until` is a valid past date, the helper returns not in maintenance. Public status checks must not persist cleanup.

**Rationale**: Writing from a public polling endpoint could create many simultaneous database writes at expiry time and can race with an admin extending maintenance.

**Alternatives considered**:

- Persist cleanup from `/api/maintenance-status`: rejected because it turns a high-frequency public read into a write path.
- Require admin confirmation after expiry: rejected because the user wants timed maintenance to reopen automatically.
- Add a cron cleanup first: deferred because it is not required for user-facing correctness.

## Decision 2: Compute maintenance end time on the server

**Decision**: Normalize timed maintenance in the admin settings API using server time and duration fields, rather than trusting a browser-generated `maintenance_pause_until` timestamp.

**Rationale**: Admin device clocks can be wrong. Server time is the only consistent clock for deciding when users are blocked or allowed.

**Alternatives considered**:

- Keep the current client timestamp: rejected because it can create wrong end times.
- Add a dedicated maintenance settings endpoint now: rejected because the existing settings endpoint can be hardened narrowly without broad settings refactor.

## Decision 3: Cache generated uploaded images as immutable public assets

**Decision**: Use long immutable caching for generated public upload URLs only after enforcing no-overwrite saves. Add `ETag`, `Last-Modified`, `Content-Length`, `X-Content-Type-Options: nosniff`, and not-modified response support.

**Rationale**: Uploaded announcement/product/category images use generated filenames. If the same URL is never overwritten, the browser can safely reuse the cached file and server load drops.

**Alternatives considered**:

- Keep one-hour cache: rejected because it still allows repeated validation and avoidable traffic.
- Long immutable cache for all images including `/images`: rejected because static brand filenames are not versioned.
- Rely only on carousel changes: rejected because cache headers are the root cause for repeated byte transfer.

## Decision 4: Use moderate cache for `/images`

**Decision**: Exclude `/images` from blanket `no-store`, but use moderate cache and validators rather than one-year immutable caching.

**Rationale**: Static brand files can be updated at the same path during deploys. Moderate cache improves navigation without trapping stale branding for a year.

**Alternatives considered**:

- One-year immutable for `/images`: rejected until filenames are versioned.
- Keep `no-store`: rejected because it causes repeated full downloads for unchanged static assets.

## Decision 5: Reject SVG and detect image type from bytes

**Decision**: Reject SVG uploads and serving. Detect supported image type from file bytes and derive the stored extension from the detected type. Reject claimed MIME types that do not match image bytes or dimensions.

**Rationale**: SVG can execute active content in some contexts and MIME spoofing can bypass extension checks. Long caching should only apply to verified safe public images.

**Alternatives considered**:

- Trust browser-provided `file.type`: rejected because it can be spoofed.
- Allow SVG with sanitization: rejected because the project does not need SVG uploads and safe SVG sanitization is a larger task.

## Decision 6: Defer carousel structural changes

**Decision**: Do not rewrite the announcement carousel in this patch unless browser verification with normal cache still shows full downloads or unacceptable image churn.

**Rationale**: Cache headers should remove repeated byte downloads. Carousel remounting may affect decode/flicker, but changing it now risks UI regressions without proof.

**Alternatives considered**:

- Rewrite carousel keys and rendering now: deferred to avoid bundling a guessed UI fix with confirmed cache/header fixes.
