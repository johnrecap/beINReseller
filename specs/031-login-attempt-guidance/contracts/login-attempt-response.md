# Contract: Panel Login Attempt Feedback

This contract describes the user-visible feedback required after panel login attempts. The implementation may deliver these values through AuthJS error mapping, a companion status endpoint, or another local UI-safe mechanism, but the visible behavior must match this contract.

## Public Feedback Fields

```json
{
  "status": "invalid_credentials",
  "message": "Login name or password is not correct.",
  "remainingAttempts": 2,
  "cooldownSeconds": 0,
  "canRetry": true
}
```

## Status Values

- `invalid_credentials`: Login failed and retry is allowed now.
- `cooldown_active`: Retry is temporarily blocked for the current exact login/context.
- `missing_input`: Login name or password is empty.
- `unexpected_error`: A non-credential failure occurred; the UI should show a generic retry/contact support message.

## Required Public Messages

### First failed attempt

```json
{
  "status": "invalid_credentials",
  "message": "Login name or password is not correct. 2 attempts remaining.",
  "remainingAttempts": 2,
  "cooldownSeconds": 0,
  "canRetry": true
}
```

### Second failed attempt

```json
{
  "status": "invalid_credentials",
  "message": "Login name or password is not correct. 1 attempt remaining.",
  "remainingAttempts": 1,
  "cooldownSeconds": 0,
  "canRetry": true
}
```

### Third failed attempt and active cooldown

```json
{
  "status": "cooldown_active",
  "message": "Too many unsuccessful attempts. Try again after 02:00.",
  "remainingAttempts": 0,
  "cooldownSeconds": 120,
  "canRetry": false
}
```

## Security Rules

- Public feedback must not say whether the account exists.
- Public feedback must not say whether the account is disabled.
- Public feedback must not say whether the password alone was wrong.
- Public feedback must never include passwords, hashes, cookies, tokens, or sessions.
- Letter case remains meaningful for account identity. `Mobarak2030` and `mobarak2030` are not equivalent.
