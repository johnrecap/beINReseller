# Research: Login Attempt Guidance

## Decision: Preserve exact case-sensitive login identity

**Rationale**: The owner explicitly requires `Mobarak2030` and `mobarak2030` to remain different accounts. Login lookup must therefore preserve the exact saved username/email casing after trimming accidental outer spaces from the submitted form field.

**Alternatives considered**:
- Case-insensitive matching: rejected because it would merge accounts the owner wants kept separate.
- Lowercasing new account names: rejected because uppercase letters are allowed and meaningful for account identity.

## Decision: Replace the current long username-only limiter for normal mistakes

**Rationale**: The current web login limiter is 5 attempts per 15 minutes keyed only by the typed username. That can feel like a stuck account and can be abused to block a known login name globally. The normal mistake flow should be shorter: two visible warnings and a two-minute wait only after the third failed result.

**Alternatives considered**:
- Keep 5 attempts per 15 minutes: rejected because it is too harsh for normal mistakes and does not meet the requested guidance.
- Permanent account lock: rejected because the owner explicitly does not want accounts to hang or require manual unlock.

## Decision: Scope normal cooldown by exact login name plus browser/address context

**Rationale**: A short wait should affect the person making repeated mistakes, not every user of the same account name. Combining exact login name with address/browser context reduces the chance that another person can intentionally pause the real user's login.

**Alternatives considered**:
- Cooldown by account/login name only: rejected because it allows intentional account blocking.
- Cooldown by address only: rejected because shared connections can affect unrelated users.

## Decision: Count all failed login outcomes the same publicly

**Rationale**: Public behavior must not reveal whether the account exists, is disabled, or only the password was wrong. All normal failures count toward the same visible remaining-attempt flow.

**Alternatives considered**:
- Count only wrong passwords: rejected because it requires different behavior when an account exists, which can leak account existence.
- Show exact failure reason publicly: rejected for privacy and security.

## Decision: Keep passwords exact during login

**Rationale**: Passwords are secrets and users may intentionally include spaces or case differences. Login should not trim, lowercase, or otherwise change submitted passwords.

**Alternatives considered**:
- Trim login passwords: rejected for this feature because it can make password behavior inconsistent with existing hashes.

## Decision: Use safe private diagnostics

**Rationale**: Admins need enough information to support users, but logs must never contain passwords, password hashes, cookies, tokens, or sessions. Diagnostics should use categories and safe identifiers only.

**Alternatives considered**:
- Verbose raw request logging: rejected because it risks exposing secrets.
- No diagnostics: rejected because support would continue guessing.
