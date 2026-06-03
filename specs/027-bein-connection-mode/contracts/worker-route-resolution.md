# Contract: Worker Route Resolution

## Purpose

Every worker action that creates an HTTP client must first resolve an effective beIN route.

## Helper Contract

```text
resolveBeinRoute(account, options) -> EffectiveBeinRoute
```

Inputs:
- beIN account with optional proxy relation.
- Optional operation route snapshot for continuation.
- Optional fallback behavior for legacy operations.

Outputs:
- `mode`
- `routeKey`
- `accountId`
- optional `proxyId`
- optional `proxyLabel`
- runtime-only `proxyConfig`

## Rules

- Valid matching operation route snapshot overrides the current global setting for continuations.
- Snapshot is valid only when `snapshot.accountId` matches the account used by the action.
- Missing snapshot on legacy continuation uses assigned-proxy behavior.
- New operation start uses the current global setting.
- `server_ip` mode returns no `proxyConfig`.
- `assigned_proxy` mode returns proxy config only when the account has a proxy.

## Logging

Worker logs should include:
- operation id when available
- account label or username
- `mode`
- `routeKey`
- proxy id or label when proxy is used

Worker logs must not include proxy password or session data.
