# Research: beIN Connection Mode

## 2026-10-30 incident decisions

- Production evidence shows sameDayReportReadOnlyRetry selecting assigned_proxy after the global direct-mode switch; GET and POST return 402 then generic credential failures disable the account. Current source confirms both verification branches resolve legacy/snapshot routes.
- HTTP login accepts status below 500 and parses HTML before checking 402/407/429; fallback titles/unknown pages can mark sessions valid. Classify status first and require positive authenticated content.
- Existing counter tracking increments and disables in separate writes. Manual reset deletes account lock/rate keys while omitting the login counter. Use atomic SQL and the existing ownership primitive for all reset/tracking writers.
- Chosen: manual single-account ADMIN recovery; no migration/backfill; conservative unknown errors. Rejected: bulk SQL activation (races and stale sessions), deleting Redis locks (ownership theft), retrying direct automatically (purchase drift), increasing retry/worker budgets (load).
- Official specify-cli 1.2.5 was restored locally from the official package. Version/features and integration status ran; Codex files are intact. Six customized shared scripts/templates were reviewed and preserved; official converge was bootstrapped separately without overwriting them.
- Tests prove local contracts only. Original provider authentication HTML and real-service concurrency/live PM2 acceptance need current evidence; never claim them from mocks. Historical 036 missing plan-guard remains open.

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

**Decision**: keepalive resolves effective route through the same worker helper used by operations. The 2026-10-30 recovery amendment makes HTTP clients cycle-local and restores only the account/effective-route Redis cache, preventing old in-memory state from undoing manual invalidation.

**Rationale**: keepalive must not refresh a proxy session while operations are in server-IP mode, or reuse a client from a different route.

**Alternatives considered**:
- Disable keepalive in emergency mode: rejected because it changes workflow and may increase fresh login pressure.
- Leave keepalive on assigned proxies: rejected because it can keep stale route sessions and hide the actual active route.
