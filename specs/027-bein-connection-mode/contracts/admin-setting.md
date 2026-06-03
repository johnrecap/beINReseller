# Contract: Admin beIN Connection Mode Setting

## Surface

Existing admin settings API and screen.

## Setting Key

`bein_connection_mode`

## Allowed Values

- `assigned_proxy`: Use each beIN account's saved proxy when it has one; use server IP for accounts without a proxy.
- `server_ip`: Ignore saved account proxies at runtime and use server IP for new beIN worker actions.

## GET `/api/settings`

Response includes:

```json
{
  "bein_connection_mode": "assigned_proxy"
}
```

If the setting is missing, UI should behave as if value is `assigned_proxy`.

## PUT `/api/settings`

Accepted payload subset:

```json
{
  "bein_connection_mode": "server_ip"
}
```

Validation:
- Reject values other than `assigned_proxy` and `server_ip`.
- Admin-only access remains required.

## UI Requirements

- Show explicit labels:
  - "Use assigned proxies"
  - "Emergency: use server IP"
- Warn that server-IP mode sends new beIN traffic through the production server IP.
- Explain that saved account proxy assignments are not deleted.

## Security

The settings response and activity log must not include proxy passwords, beIN passwords, TOTP secrets, session data, cookies, ViewState, or tokens.
