# Feature Specification: beIN Connection Mode

**Feature Branch**: `027-bein-connection-mode`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Add a safe option that lets admins switch beIN renewal/login operations between assigned proxies and emergency server IP mode without changing saved proxy assignments, without mixing sessions across routes, and without increasing retries, load, or operation concurrency."

## User Scenarios & Testing

### User Story 1 - Switch beIN Connection Mode Safely (Priority: P1)

An admin can switch all beIN account traffic between the normal assigned-proxy path and an emergency server-IP path without editing every account or losing saved proxy assignments.

**Why this priority**: The current proxy provider can fail for all proxies at once. The admin needs a controlled emergency path that restores work without permanently changing account setup.

**Independent Test**: Open admin settings, switch from "Use assigned proxies" to "Emergency: use server IP", save, start one low-risk renewal, and confirm the operation uses no proxy while account proxy assignments remain visible and unchanged.

**Acceptance Scenarios**:

1. **Given** a beIN account has an assigned proxy, **When** the admin selects emergency server-IP mode and starts a new renewal, **Then** the operation connects without that proxy and the account still shows the saved proxy assignment.
2. **Given** emergency server-IP mode is active, **When** the admin switches back to assigned-proxy mode, **Then** new operations use the saved per-account proxies again.
3. **Given** an account has no proxy assigned, **When** assigned-proxy mode is active, **Then** that account continues to use the server IP exactly as it does today.

---

### User Story 2 - Keep Each Operation On One Route (Priority: P1)

Once a renewal or related beIN operation starts, it stays on the same connection route until it completes, fails, expires, or is cancelled.

**Why this priority**: Switching route mid-operation can invalidate beIN sessions, trigger CAPTCHA, break final confirmation, or make a purchase state hard to audit.

**Independent Test**: Start a renewal in assigned-proxy mode, change the global setting to emergency server-IP mode while the operation waits for package or final confirmation, and confirm the continuation still uses the original assigned-proxy route.

**Acceptance Scenarios**:

1. **Given** a renewal starts in assigned-proxy mode, **When** the admin changes the global mode before package selection or final confirmation, **Then** the existing operation continues on the route captured at start.
2. **Given** a renewal starts in emergency server-IP mode, **When** the admin changes the global mode before final confirmation, **Then** the existing operation continues through server IP.
3. **Given** an older operation has no captured route, **When** a continuation step runs, **Then** it uses the legacy assigned-proxy behavior rather than silently switching to emergency server-IP mode.

---

### User Story 3 - Keep Sessions Route-Safe (Priority: P1)

The system keeps beIN sessions created through proxies separate from sessions created through server IP so cookies and cached session state are not reused on the wrong path.

**Why this priority**: Session mixing is the highest-risk part of this feature. Incorrect reuse can cause repeated login failures, CAPTCHA churn, or operation failures.

**Independent Test**: Create or simulate a cached session for an assigned-proxy route, switch to emergency server-IP mode, and confirm the worker does not import that proxy session for the server-IP route.

**Acceptance Scenarios**:

1. **Given** a beIN account has a valid cached proxy session, **When** emergency server-IP mode is used for a new operation, **Then** the system performs or imports only a server-IP route session.
2. **Given** a beIN account has a server-IP route session, **When** assigned-proxy mode is used later, **Then** the system does not import the server-IP session for the proxy route.
3. **Given** an operation has an operation-scoped session snapshot, **When** a continuation step restores it, **Then** the stored route metadata must match the route snapshot before importing it.

---

### User Story 4 - Preserve Load And Worker Behavior (Priority: P2)

Emergency mode must not increase retry count, worker concurrency, account lock scope, keepalive frequency, or the number of simultaneous beIN account uses.

**Why this priority**: The user explicitly wants this feature to avoid damaging load, normal workflow, and account locking guarantees.

**Independent Test**: Compare worker settings and operation logs before and after enabling emergency mode; the number of workers, retries, queue wait behavior, and keepalive cadence remain unchanged.

**Acceptance Scenarios**:

1. **Given** emergency server-IP mode is enabled, **When** workers process renewals, **Then** they use the same account locks and queue rules as assigned-proxy mode.
2. **Given** keepalive is running, **When** the connection mode changes, **Then** keepalive uses the effective route for each account without increasing refresh frequency.
3. **Given** a proxy returns 502, **When** assigned-proxy mode is active, **Then** the system does not automatically retry the same operation through server IP in this feature.

---

### User Story 5 - Give Admins Clear Runtime Evidence (Priority: P3)

Admins and maintainers can tell which connection mode and route were used by each worker action without exposing secrets.

**Why this priority**: When proxy failures happen, the admin needs clear evidence to decide whether to stay on proxies, switch to emergency mode, or contact the proxy provider.

**Independent Test**: Run one operation in each mode and inspect logs and operation details; the mode and route are clear, while proxy password, cookies, sessions, and tokens are absent.

**Acceptance Scenarios**:

1. **Given** an operation starts, **When** the worker resolves its connection route, **Then** logs include operation id, account label or username, mode, route key, and proxy label/id if used.
2. **Given** route metadata is stored for an operation, **When** an admin or maintainer reads it, **Then** it contains no proxy credentials, cookies, sessions, passwords, TOTP secrets, or tokens.

### Edge Cases

- Admin toggles the global connection mode while multiple operations are waiting for package selection or final confirmation.
- A beIN account has no proxy assigned while assigned-proxy mode is active.
- A beIN account has a proxy assignment but the proxy record is inactive or missing.
- Legacy cached sessions exist under the old account-only cache key.
- Existing operation-scoped session snapshots exist without route metadata.
- A continuation step intentionally changes to a different beIN account after balance or login failure.
- keepalive has an in-memory HTTP client created under a different route before the mode switch.
- Proxy provider returns `CONNECT tunnel failed, response 502` while assigned-proxy mode is active.

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a single global beIN connection mode with allowed values "assigned proxies" and "emergency server IP".
- **FR-002**: System MUST default to assigned-proxy mode when the setting is missing or invalid.
- **FR-003**: Admins MUST be able to view and change the connection mode from the existing admin settings area.
- **FR-004**: Emergency server-IP mode MUST ignore assigned account proxies at runtime without deleting, clearing, or mutating saved proxy assignments.
- **FR-005**: Assigned-proxy mode MUST preserve current behavior: use the assigned proxy when present and use server IP for accounts with no proxy.
- **FR-006**: System MUST resolve an effective route for every new beIN worker action before creating the HTTP client.
- **FR-007**: System MUST capture a route snapshot when a new operation starts, including only non-secret metadata: mode, route key, account id, optional proxy id, optional proxy label, and created time.
- **FR-008**: Continuation steps MUST use the stored route snapshot when it belongs to the same beIN account.
- **FR-009**: If a continuation step switches to a different beIN account intentionally, system MUST compute and store a new route snapshot for the new account.
- **FR-010**: Older operations with no route snapshot MUST keep legacy assigned-proxy behavior rather than adopting emergency server-IP mode mid-flow.
- **FR-011**: Shared beIN session cache MUST separate sessions by account and route so proxy sessions and server-IP sessions cannot be reused across routes.
- **FR-012**: Legacy account-only cached sessions MUST NOT be imported as valid sessions for the new route-aware paths.
- **FR-013**: Operation-scoped session snapshots MUST include route metadata or be checked against the operation route before import; mismatches MUST be rejected and handled through fresh login or safe failure.
- **FR-014**: Account locks, login locks, and operation locks MUST remain account-based and MUST NOT become route-based.
- **FR-015**: keepalive MUST use the same connection-mode resolver as operation workers and must cache clients by effective account route.
- **FR-016**: keepalive MUST NOT increase its refresh interval frequency, retry count, or account concurrency because of this feature.
- **FR-017**: System MUST NOT automatically fail over from proxy to server IP on 502 or other proxy failures in this feature.
- **FR-018**: Logs MUST show connection mode and effective route without exposing proxy passwords, beIN passwords, TOTP secrets, cookies, sessions, ViewState, or tokens.
- **FR-019**: The feature MUST include tests or explicit verification for mode resolution, route snapshots, session key separation, operation continuation route stability, and keepalive route usage.
- **FR-020**: Production deployment instructions MUST warn that emergency server-IP mode sends all affected beIN traffic through the server IP and should be tested with one low-risk operation before normal traffic.

### Key Entities

- **Connection Mode Setting**: The global admin-controlled value that decides whether new beIN worker actions use assigned proxies or server IP.
- **Effective beIN Route**: The resolved runtime route for one account action: direct server IP or a specific assigned proxy.
- **Operation Route Snapshot**: Non-secret metadata stored with an operation so continuation steps use the same route selected at start.
- **Shared Session Cache Entry**: Cached beIN session data separated by account and route.
- **Operation Session Snapshot**: Session state saved for a specific operation, guarded by route metadata before reuse.
- **beIN Account Proxy Assignment**: Existing account-to-proxy relationship that remains the saved source of normal proxy routing.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Admin can switch new beIN operations between assigned-proxy mode and emergency server-IP mode in one settings change.
- **SC-002**: After switching to emergency server-IP mode, saved account proxy assignments remain unchanged.
- **SC-003**: A new operation started in emergency mode creates an HTTP client without proxy configuration.
- **SC-004**: A new operation started in assigned-proxy mode with an assigned proxy creates an HTTP client with that proxy.
- **SC-005**: An in-progress operation continues with the route it started with even if the global setting changes before final confirmation.
- **SC-006**: Route-aware session tests prove proxy-route cache entries are not imported for server-IP route actions and server-IP entries are not imported for proxy-route actions.
- **SC-007**: keepalive uses the same route decision as operation workers without increasing configured cadence or concurrency.
- **SC-008**: Production build and focused worker tests complete successfully.
- **SC-009**: Logs and stored route metadata contain no proxy credentials or sensitive beIN/session data.

## Assumptions

- The current project does not require mobile app changes for this feature.
- The existing optional `proxyId` on beIN accounts remains the source of saved per-account proxy assignment.
- The settings table can store a new key without a schema migration.
- Emergency server-IP mode is an admin-controlled operational fallback, not an automatic proxy health system.
- Existing operations already in progress before deployment may lack route snapshots and should use legacy assigned-proxy behavior.
- It is acceptable for the first server-IP action for an account to require a fresh beIN login because proxy sessions must not be reused.
- If beIN blocks the server IP, emergency mode will fail for all accounts using it; this feature only provides the controlled route option, not guaranteed upstream access.
