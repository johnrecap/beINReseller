# Contract: Maintenance Status And Renewal Blocking

## Public Status Response

**Endpoint**: `GET /api/maintenance-status`

**Access**: Public read-only.

**Must return**:

- `maintenance_mode`: effective boolean blocking state.
- `maintenance_message`: display message or empty/default when not blocking.
- `maintenance_pause_until`: saved valid pause timestamp or null.
- `installment_dev_mode`: existing public flag, unchanged by this feature.

**Must not**:

- Write or clean up database settings.
- Expose unrelated admin settings.
- Treat invalid `maintenance_pause_until` as expired.

## Renewal Start Behavior

**Endpoint**: `POST /api/operations/start-renewal`

**Access**: Existing authenticated renewal permission.

**Maintenance rule**:

- Admins keep existing bypass behavior.
- Non-admin users are blocked only when effective maintenance mode is active.
- Expired timed maintenance must not block renewal start.
- Manual maintenance with no valid end time must block renewal start.

## Admin Settings Behavior

**Endpoint**: `GET /api/settings`

**Access**: ADMIN only.

**Expected behavior**:

- Returns settings in a way that does not mislead admins after timed maintenance has expired.
- Does not require public maintenance status to mutate data.

**Endpoint**: `PUT /api/settings`

**Access**: ADMIN only.

**Expected behavior**:

- Computes `maintenance_pause_until` from server time when maintenance mode and valid duration are submitted.
- Clears pause end time when maintenance mode is disabled.
- Keeps manual maintenance if no valid duration is supplied.
