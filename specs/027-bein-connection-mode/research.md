# Research: beIN Connection Mode

## Decision: Use a manual global mode, not automatic fallback

**Decision**: Add `bein_connection_mode` with values `assigned_proxy` and `server_ip`. Do not automatically retry direct server IP after a proxy `502`.

**Rationale**: Automatic fallback can double login attempts, hide proxy-provider failures, switch route mid-flow, and create unclear evidence for failed operations. A manual admin mode is safer during incidents.

**Alternatives considered**:
- Automatic proxy-to-server fallback after 502: rejected because it increases attempts and can change route mid-operation.
- Per-account only toggle: rejected as too slow during a provider-wide outage.
- Removing account proxies when emergency mode is needed: rejected because it destroys saved production configuration.

## Decision: Keep account locks account-based

**Decision**: Account locks, login locks, and keepalive locks remain based on beIN account id, not connection route.

**Rationale**: A beIN account should not be used in two operations at the same time just because one route is proxy and one route is direct. The current accounting and renewal safety depends on one active operation per account.

**Alternatives considered**:
- Route-based locks: rejected because it could let one beIN account run concurrently through proxy and server IP.

## Decision: Make sessions route-aware

**Decision**: Shared session cache keys include route identity, for example account plus `direct` or account plus `proxy:<proxyId>`.

**Rationale**: beIN sessions, cookies, and ViewState can be tied to the network path. Reusing a proxy session through server IP can create invalid sessions, CAPTCHA churn, or failed confirmations.

**Alternatives considered**:
- Clear all sessions on every mode switch: rejected because it causes unnecessary logins and does not protect in-progress operations from operation-scoped session snapshots.
- Keep account-only session keys: rejected because it allows route mixing.

## Decision: Snapshot route at operation start

**Decision**: Store non-secret route metadata in `operations.responseData` when a new beIN operation starts. Continuation steps use the stored route when it matches the account.

**Rationale**: Package selection, promo application, final confirmation, signal, and installment continuations can run after the admin toggles mode. The operation must not silently switch route mid-flow.

**Alternatives considered**:
- Always use current global mode: rejected because it can change route during final confirmation.
- Store proxy credentials in operation data: rejected for security and privacy.

## Decision: Legacy operations default to assigned-proxy behavior

**Decision**: If an existing operation has no route snapshot, use legacy assigned-proxy behavior for continuations.

**Rationale**: Existing operations were created before this feature and should not be changed by a new global setting. This keeps the safest compatibility path and avoids unexpected server-IP use.

**Alternatives considered**:
- Apply the global mode to old operations: rejected because it can switch route mid-operation.

## Decision: Use existing settings storage

**Decision**: Store `bein_connection_mode` in the existing `settings` table, with no schema migration.

**Rationale**: Production has a live database, and the setting is a small global string value. Existing settings API already supports upsert.

**Alternatives considered**:
- Add a dedicated schema column/table: rejected as unnecessary migration risk.

## Decision: keepalive uses the same resolver

**Decision**: keepalive resolves effective route through the same worker helper used by operations and caches HTTP clients by account plus effective route.

**Rationale**: keepalive must not refresh a proxy session while operations are in server-IP mode, or reuse a client from a different route.

**Alternatives considered**:
- Disable keepalive in emergency mode: rejected because it changes workflow and may increase fresh login pressure.
- Leave keepalive on assigned proxies: rejected because it can keep stale route sessions and hide the actual active route.
