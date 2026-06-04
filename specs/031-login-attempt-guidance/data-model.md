# Data Model: Login Attempt Guidance

## Entity: LoginAttemptWindow

Short-lived tracking state for a sequence of failed login attempts.

**Fields**:

- `key`: Derived from exact submitted login name after trimming outer spaces plus request address/browser context.
- `exactLoginName`: Submitted login name after trimming outer spaces. Letter case is preserved.
- `contextFingerprint`: Safe fingerprint of the request address/browser context.
- `failedCount`: Number of failed attempts currently counted in this window.
- `firstFailedAt`: Time the current failure sequence started.
- `lastFailedAt`: Time of the most recent failed attempt.
- `cooldownUntil`: Time when retry is allowed after the third failed result.
- `lastReasonCategory`: Safe category such as `unknown_login`, `wrong_password`, `disabled_account`, `missing_password_hash`, or `cooldown_active`.

**Validation rules**:

- `failedCount` starts at 0 and reaches cooldown at 3 failed results.
- `cooldownUntil` is set only after the third failed result.
- Attempts during cooldown do not extend `cooldownUntil`.
- Successful login clears the normal mistake window for the exact login/context key.

**Storage**:

- Redis short-lived keys following the existing rate-limit storage pattern.
- In-memory fallback is acceptable only as a degraded mode if Redis is unavailable.
- No production database migration is required for this feature.

## Entity: PanelUserAccount

Existing panel user account.

**Relevant fields**:

- `username`: Exact case-sensitive login name.
- `email`: Exact case-sensitive login email value.
- `passwordHash`: Stored password hash.
- `isActive`: Whether login is allowed.
- `deletedAt`: Soft-delete marker.

**Validation rules**:

- Username/email matching for this feature is exact after trimming submitted outer spaces.
- Uppercase and lowercase characters are not interchangeable.
- Missing punctuation or changed digits are not corrected automatically.

## Entity: LoginDiagnosticEvent

Safe private record or log line for support and security review.

**Fields**:

- `timestamp`
- `reasonCategory`
- `exactLoginName`
- `matchedUserId` when safely known
- `contextFingerprint`
- `failedCount`
- `cooldownUntil`

**Forbidden data**:

- Submitted password
- Password hash
- Cookies
- Tokens
- Sessions
- Any beIN credentials or provider secrets
