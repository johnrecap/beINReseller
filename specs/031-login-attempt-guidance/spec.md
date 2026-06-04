# Feature Specification: Login Attempt Guidance

**Feature Branch**: `031-login-attempt-guidance`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Create a Spec Kit plan for improved panel login guidance. Keep usernames case-sensitive: `Mobarak2030` and `mobarak2030` must not be treated as the same account. Show remaining attempts after failed login, start a two-minute countdown only after the third failed attempt, and allow retry after the countdown without permanent account lock."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clear Failed Login Guidance (Priority: P1)

A panel user who enters the wrong login name or password sees a clear message explaining that the login failed and how many attempts remain before a short wait starts.

**Why this priority**: This directly replaces the confusing `Configuration` message that currently causes support escalation.

**Independent Test**: Attempt login with invalid credentials twice from the same browser/address and verify that the page shows the invalid-login message with the correct remaining attempt count.

**Acceptance Scenarios**:

1. **Given** a user is not in a wait period, **When** the first login attempt fails, **Then** the user sees "Login name or password is not correct. 2 attempts remaining."
2. **Given** the same user/browser/address has one failed attempt, **When** the second attempt fails, **Then** the user sees "Login name or password is not correct. 1 attempt remaining."
3. **Given** any normal login failure, **When** the result is shown publicly, **Then** the message does not reveal whether the account exists, is disabled, or whether only the password was wrong.

---

### User Story 2 - Short Cooldown After Three Failed Attempts (Priority: P1)

A panel user who fails three consecutive attempts from the same browser/address and exact login name must wait two minutes before trying again, without any permanent account lock.

**Why this priority**: It prevents repeated guessing while avoiding the current long "hung account" experience.

**Independent Test**: Fail the same exact login name three times from the same browser/address and verify that the third failed result starts a two-minute countdown; verify another attempt is allowed after the countdown.

**Acceptance Scenarios**:

1. **Given** a user has two failed attempts, **When** the third attempt uses correct credentials, **Then** login succeeds and no cooldown starts.
2. **Given** a user has two failed attempts, **When** the third attempt also fails, **Then** the system starts a two-minute wait and displays a countdown.
3. **Given** a countdown is active, **When** the user keeps clicking login, **Then** the existing countdown is shown and is not restarted.
4. **Given** the countdown has expired, **When** the user tries again, **Then** the system accepts the attempt normally.

---

### User Story 3 - Exact Case-Sensitive Account Identity (Priority: P1)

Administrators and users must be able to rely on the exact saved login name. Uppercase and lowercase letters are meaningful and must not be merged.

**Why this priority**: The owner explicitly requires `Mobarak2030` and `mobarak2030` to remain different accounts.

**Independent Test**: Create or inspect two login names that differ only by letter case and verify that login lookup does not merge them.

**Acceptance Scenarios**:

1. **Given** an account is saved as `Mobarak2030`, **When** a user enters `mobarak2030`, **Then** it must not match the `Mobarak2030` account.
2. **Given** an account is saved as `mobarak2030`, **When** a user enters `Mobarak2030`, **Then** it must not match the `mobarak2030` account.
3. **Given** an account is saved as `khaled-20200`, **When** a user enters `khaled20200`, **Then** the system must not treat the missing hyphen as a match.

---

### User Story 4 - Safe Admin Diagnostics (Priority: P2)

Administrators need private, safe information that helps diagnose login failures without exposing passwords or secrets.

**Why this priority**: Support must understand whether failures are normal mistakes, cooldowns, disabled accounts, or suspicious repeated attempts.

**Independent Test**: Trigger each failure category and verify private logs contain a reason category and context, but no password, hash, token, or session data.

**Acceptance Scenarios**:

1. **Given** a failed login attempt, **When** the system records private diagnostics, **Then** it records only safe metadata such as reason category, exact attempted login name, matched user id if any, address/browser context, failure count, and wait-until time.
2. **Given** a password was submitted, **When** logs are reviewed, **Then** the password and password hash are absent.

### Edge Cases

- Correct credentials on the third attempt must succeed; the cooldown starts only after the third failed result.
- Attempts during an active cooldown must not extend the existing two-minute wait.
- The same exact login name from a different browser/address should not be blocked by another person's short mistake cooldown.
- Case changes are not normalization. `A` and `a` remain different for panel login identity.
- Leading and trailing spaces typed in the login form may be ignored for attempt tracking and user convenience, but internal account matching must still use the exact saved login name after trimming the submitted field.
- Existing accounts that differ only by case must not be auto-merged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST replace public `Configuration` login errors with clear user-facing messages for normal failures and cooldowns.
- **FR-002**: The system MUST show remaining attempts after failed login attempts: two remaining after the first failure, one remaining after the second failure.
- **FR-003**: The system MUST evaluate the third attempt normally; correct credentials on the third attempt must log in successfully.
- **FR-004**: The system MUST start a two-minute wait only after the third failed attempt for the same exact login name from the same browser/address context.
- **FR-005**: The system MUST reject login attempts during the two-minute wait and display the remaining wait time.
- **FR-006**: The system MUST NOT restart or extend the two-minute wait when a user clicks repeatedly during the active wait.
- **FR-007**: The system MUST clear the normal mistake counter after a successful login for that exact login name and browser/address context.
- **FR-008**: The system MUST keep a separate broader abuse guard for heavy repeated traffic, without permanently locking a user account.
- **FR-009**: The system MUST treat uppercase and lowercase letters as distinct account identity characters. `Mobarak2030` and `mobarak2030` are different login names.
- **FR-010**: The system MUST NOT fuzzy-match missing punctuation, changed digits, hyphens, dots, underscores, or other symbols.
- **FR-011**: The system MUST NOT publicly reveal whether a login name exists, whether an account is disabled, or whether only the password was wrong.
- **FR-012**: The system MUST privately record safe diagnostic categories for failed attempts and cooldowns without storing submitted passwords, password hashes, cookies, tokens, or sessions.
- **FR-013**: The system MUST preserve existing account casing and must not perform bulk account cleanup as part of this feature.
- **FR-014**: The login form MUST prevent repeated submissions during a known cooldown and display a countdown that updates until retry is allowed.

### Key Entities *(include if feature involves data)*

- **Login Attempt Window**: Short-lived tracking record for an exact submitted login name plus browser/address context. Tracks failure count, first failure time, cooldown end time, and last failure category.
- **Panel User Account**: Existing account record with exact case-sensitive username and email values.
- **Login Diagnostic Event**: Safe private record or log entry describing a login outcome category without secrets.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Public `Configuration` login messages no longer appear in tested wrong-password, unknown-user, disabled-account, cooldown, or missing-field scenarios.
- **SC-002**: First and second failed attempts display the correct remaining attempt count in 100% of automated login guidance tests.
- **SC-003**: The third attempt logs in successfully when credentials are correct, even if the first two attempts failed.
- **SC-004**: A two-minute countdown starts only after the third failed attempt and expires without manual admin action.
- **SC-005**: Repeated clicks during the cooldown do not extend the wait time in automated tests.
- **SC-006**: Case-sensitive identity tests prove `Mobarak2030` and `mobarak2030` are not merged.
- **SC-007**: Security log safety tests find no submitted password, password hash, cookie, token, or session value in login diagnostics.

## Assumptions

- Panel web login is the target for this feature. Mobile login is out of scope for implementation in the current project state, but the plan should avoid blocking future alignment.
- Redis or the existing rate-limit storage remains available for short-lived attempt tracking; if unavailable, the existing in-memory fallback pattern may be used with reduced cross-process consistency.
- No production database cleanup is included in this feature.
- The exact saved username or email remains the source of truth for account identity.
