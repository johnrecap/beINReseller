# Data Model: Maintenance Resume And Media Cache Fixes

## Maintenance Settings

**Purpose**: Existing saved settings controlled by admins.

**Fields**:

- `maintenance_mode`: string setting, expected values `true` or `false`.
- `maintenance_message`: string setting shown to users while maintenance is active.
- `maintenance_pause_until`: optional ISO timestamp string. A valid future value means timed maintenance. Empty value means manual maintenance when mode is true.
- `maintenance_pause_duration_value`: submitted admin form value used to compute a future pause end time.
- `maintenance_pause_duration_unit`: submitted admin form unit, supported values `hours` and `days` initially.

**Validation rules**:

- If `maintenance_mode=false`, clear effective pause end time.
- If `maintenance_mode=true` and duration is valid, compute `maintenance_pause_until` from server time.
- If `maintenance_mode=true` and no valid duration is supplied, keep manual maintenance semantics.
- Invalid saved `maintenance_pause_until` must not open the panel.

## Effective Maintenance Status

**Purpose**: Computed status used by public status and renewal blocking.

**Fields**:

- `maintenanceMode`: boolean effective blocking state.
- `message`: display message.
- `pauseUntil`: original valid pause end timestamp if present.
- `expiredTimedMaintenance`: boolean indicating saved settings are expired and therefore not blocking.
- `manualMaintenance`: boolean indicating active maintenance has no valid automatic end.

**State transitions**:

- Saved off -> effective off.
- Saved on + future valid pause -> effective on until the timestamp passes.
- Saved on + past valid pause -> effective off.
- Saved on + missing/invalid pause -> effective on manual.

## Public Uploaded Image

**Purpose**: Public image file shown in product, category, or announcement UI.

**Fields**:

- `folder`: one of `products`, `categories`, `announcements`.
- `filename`: generated unique filename.
- `detectedType`: one of `jpeg`, `png`, `webp`, `gif`.
- `extension`: derived from detected type.
- `size`: file byte length.
- `lastModified`: filesystem timestamp.
- `etag`: validator derived from stable file metadata.

**Validation rules**:

- Folder must be approved.
- Path must remain inside `public/uploads`.
- Extension must be supported and not SVG.
- File bytes must match detected image type.
- Save must not overwrite an existing file.

## Cache Validator

**Purpose**: Allows browser to avoid full file downloads.

**Fields**:

- `etag`: strong enough validator for a public immutable file, based on file metadata.
- `lastModified`: HTTP date from file metadata.
- `contentLength`: file size.
- `cacheControl`: long immutable for uploads, moderate for static images.

**Validation rules**:

- If request `If-None-Match` matches current `etag`, return not modified without file body.
- If request `If-Modified-Since` is at or after `lastModified`, return not modified without file body.
- Compute validators before reading the full file body where possible.
