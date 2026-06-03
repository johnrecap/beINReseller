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

Route keys and route metadata are safe to log. Session bodies, cookies, ViewState, storage state, and secrets are not safe to log.
