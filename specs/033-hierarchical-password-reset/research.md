# Research: Hierarchical Password Reset

## Decision 1: Centralize supervisor reset

- **Decision**: Use one server service for authorization, locking, hashing, update, and audit; role routes are thin adapters.
- **Rationale**: Prevents admin, manager, and agent behavior from drifting and keeps the sensitive mutation in one reviewable place.
- **Alternatives considered**: Duplicate route logic was rejected because ownership and audit rules would diverge.

## Decision 2: Reuse existing session invalidation

- **Decision**: Update the existing passwordChangedAt value and require all panel web/mobile authentication to re-read it.
- **Rationale**: The project already compares the timestamp with session/token issue time, so no session table or migration is needed.
- **Alternatives considered**: A new session-revocation table and token blacklist were unnecessary for the current session model.

## Decision 3: Fail closed on dirty ownership

- **Decision**: Manager and agent resets require one unambiguous current direct relationship; mixed manager/agent or duplicate contradictory evidence returns OWNERSHIP_CONFLICT.
- **Rationale**: Password reset is more sensitive than read access and must not use manager-first or latest-row guesses.
- **Alternatives considered**: Deterministic precedence was rejected because it could authorize the wrong owner during data conflict.

## Decision 4: Lock the target before ownership decision

- **Decision**: Reuse the ownership subject-row lock and re-read ownership inside the same transaction as the password update.
- **Rationale**: This prevents an old owner from winning a race with ownership transfer.
- **Alternatives considered**: Checking ownership before the transaction leaves a time-of-check/time-of-use gap.

## Decision 5: Keep permission policy dynamic

- **Decision**: Enable users.reset_password by default for ADMIN, MANAGER, and AGENT while honoring existing role settings and user overrides.
- **Rationale**: It matches the requested hierarchy and existing permission-control architecture.
- **Alternatives considered**: Role-only hardcoding would bypass configured security controls.

## Decision 6: No public forgot-password reset

- **Decision**: Login offers contact-supervisor guidance only.
- **Rationale**: Username knowledge alone must not become an account-recovery credential.
- **Alternatives considered**: Username reset and emailed temporary password are outside current identity-verification capabilities.

## Decision 7: No Worker or schema change

- **Decision**: Keep the feature in panel web/API code and existing database fields.
- **Rationale**: Worker does not own panel credential recovery; User already has passwordHash and passwordChangedAt.
- **Alternatives considered**: Worker endpoints and migrations add risk without supporting a requirement.
