# Data Model: beIN Connection Mode

## ConnectionModeSetting

**Represents**: The admin-selected global route strategy for new beIN worker actions.

**Source of truth**: `settings` row with key `bein_connection_mode`.

**Fields**:
- `key`: Always `bein_connection_mode`.
- `value`: `assigned_proxy` or `server_ip`.

**Validation**:
- Missing, empty, or invalid values resolve to `assigned_proxy`.
- Only admins can update the value through `/api/settings`.

## EffectiveBeinRoute

**Represents**: The route a worker action will use for one beIN account action.

**Fields**:
- `mode`: `assigned_proxy` or `server_ip`.
- `routeKey`: `direct` or `proxy:<proxyId>`.
- `accountId`: beIN account id.
- `proxyId`: proxy id when a proxy is actually used.
- `proxyLabel`: proxy label when a proxy is actually used.
- `proxyConfig`: runtime-only proxy connection details used to build `HttpClientService`; never stored in operation response data.

**Validation**:
- `server_ip` mode always returns direct route with no proxy config.
- `assigned_proxy` mode uses a proxy only when the account has one.
- No proxy password or credential may be included in logs or stored route snapshot.

## OperationRouteSnapshot

**Represents**: Non-secret route evidence stored with an operation so later steps use the same route.

**Storage**: `operations.responseData.beinRoute`.

**Fields**:
- `mode`: `assigned_proxy` or `server_ip`.
- `routeKey`: `direct` or `proxy:<proxyId>`.
- `accountId`: beIN account id that owns the route.
- `proxyId`: optional proxy id.
- `proxyLabel`: optional proxy display label.
- `createdAt`: ISO timestamp.

**Validation**:
- Snapshot is valid for continuation only when `snapshot.accountId` matches the operation's current beIN account.
- If a retry intentionally switches beIN accounts, a new snapshot must be computed and stored.
- Snapshot must not include proxy username, proxy password, cookies, ViewState, beIN password, TOTP secret, or tokens.

## SharedSessionCacheEntry

**Represents**: Cached beIN login/session data shared between worker actions.

**Storage**: Redis.

**Route-aware identity**:
- New cache identity combines account id and route key.
- Proxy sessions and direct sessions are separate.
- Legacy account-only keys are ignored by route-aware code and expire naturally.

**Validation**:
- A session can only be imported by an action using the same account id and route key.
- Expiry validation remains unchanged.

## OperationSessionSnapshot

**Represents**: Session state saved for a specific operation continuation.

**Storage**: Redis or operation response data depending on existing flow.

**Route guard**:
- Snapshot must carry or be checked against route metadata.
- Continuation must reject/import-fresh when the current effective route does not match the snapshot route.

## Existing BeIN Account Proxy Assignment

**Represents**: The saved normal proxy relationship for a beIN account.

**Source of truth**: `bein_accounts.proxy_id` and related `proxies` record.

**Behavior**:
- Emergency server-IP mode ignores this relationship at runtime.
- The relationship is never mutated by toggling connection mode.
