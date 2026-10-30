# Contract: Session Route Safety

## Shared Session Cache

Session cache operations must accept a route key or route context.

Expected behavior:
- Save session for `accountId + routeKey`.
- Get session only for `accountId + routeKey`.
- Delete session only for `accountId + routeKey` unless an explicit all-route cleanup is requested.

## Legacy Keys

Existing account-only keys are considered legacy.

Rules:
- New route-aware code must not import legacy account-only sessions.
- Legacy keys may expire naturally.
- No destructive Redis cleanup is required for rollout.

## Operation-Scoped Session Snapshots

Operation session snapshots must be route guarded.

Rules:
- Save route metadata with the operation session snapshot when a route is known.
- Before import, compare snapshot route to the operation route.
- If route mismatches, do not import the snapshot; perform a fresh login or fail safely depending on the flow.

## Keepalive Client Cache

keepalive client cache keys must include account id and effective route key.

Example identities:
- `accountId:direct`
- `accountId:proxy:proxyId`

## Security

## 2026-10-30 read and recovery amendment

Deferred verification clients use only account-and-current-route reusable sessions, stripping purchase ViewState/prepared context. They do not restore operation snapshots or legacy account-only sessions. Pin the selected route for the entire read job, including re-login. Manual recovery acquires the account's existing execution ownership, rejects busy/reserved accounts, invalidates reusable sessions for that account only, and releases by owner comparison. Operation snapshots, reservations, request budgets and foreign locks must survive.

Route keys and route metadata are safe to log. Session bodies, cookies, ViewState, storage state, and secrets are not safe to log.
