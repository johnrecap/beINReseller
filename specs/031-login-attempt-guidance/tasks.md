# Tasks: Login Attempt Guidance

**Input**: Design documents from `/specs/031-login-attempt-guidance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/login-attempt-response.md, quickstart.md

**Tests**: Required. Authentication feedback and cooldown behavior are security-sensitive and must be covered before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Every task includes exact file paths and the required detail block

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare focused test and helper locations without changing behavior.

- [X] T001 Create failing unit test scaffold for login attempt windows in `tests/unit/login-attempt-guidance.test.ts`
  - Reason: The attempt counter and cooldown rules are the core behavior and need a test seam before auth changes.
  - Expected: A new test file imports planned helper names and contains skipped or failing tests for first failure, second failure, third correct attempt, third failed cooldown, cooldown non-extension, and success clearing.
  - Possible bugs: Tests may depend on Redis and become flaky.
  - Fix/Mitigation: Use an in-memory fake store in tests and keep Redis integration outside unit tests.
  - Verification: `node --test --import tsx tests/unit/login-attempt-guidance.test.ts` fails because helpers are not implemented yet.

- [X] T002 [P] Create failing redaction tests in `tests/unit/login-diagnostics-redaction.test.ts`
  - Reason: Login diagnostics must never expose passwords or secrets.
  - Expected: Tests assert diagnostic payloads contain reason category and context but do not contain submitted password, password hash, cookie, token, or session fields.
  - Possible bugs: Tests may only check exact property names and miss nested secrets.
  - Fix/Mitigation: Test both direct fields and serialized JSON string output.
  - Verification: `node --test --import tsx tests/unit/login-diagnostics-redaction.test.ts` fails until diagnostic helper exists.

- [X] T003 [P] Create failing login feedback tests in `tests/unit/login-form-feedback.test.ts`
  - Reason: The visible `Configuration` message must be replaced with useful guidance.
  - Expected: Tests cover mapping AuthJS `Configuration`/`CredentialsSignin` to safe messages, rendering remaining attempts, and countdown text.
  - Possible bugs: Component tests may be hard if no React test harness exists.
  - Fix/Mitigation: Extract pure formatting helpers from `LoginForm.tsx` and test those helpers with Node test runner.
  - Verification: `node --test --import tsx tests/unit/login-form-feedback.test.ts` fails until formatting helpers exist.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the reusable attempt, diagnostics, and feedback helpers before touching login flow.

- [X] T004 Implement attempt state types and constants in `src/lib/auth/login-attempts.ts`
  - Reason: Central constants prevent mismatched attempt limits and wait duration across server and UI.
  - Expected: File exports `MAX_LOGIN_FAILURES = 3`, `LOGIN_COOLDOWN_SECONDS = 120`, and typed results for `allowed`, `failed`, `cooldown`.
  - Possible bugs: Naming could imply global account lock.
  - Fix/Mitigation: Name state as "attempt window" or "mistake cooldown", not "account lock".
  - Verification: `node --test --import tsx tests/unit/login-attempt-guidance.test.ts` progresses past missing exports.

- [X] T005 Implement exact-login attempt key builder in `src/lib/auth/login-attempts.ts`
  - Reason: Cooldown must apply to the same typed login context without merging letter case.
  - Expected: `buildLoginAttemptKey({ loginName, ip, userAgent })` trims outer spaces but preserves case and punctuation in the login portion.
  - Possible bugs: Accidentally lowercasing the login name would violate the user's explicit requirement.
  - Fix/Mitigation: Add tests proving `Mobarak2030` and `mobarak2030` produce different keys.
  - Verification: `node --test --import tsx tests/unit/login-attempt-guidance.test.ts` includes a passing case-sensitive key test.

- [X] T006 Implement in-memory store adapter for tests in `src/lib/auth/login-attempts.ts`
  - Reason: Unit tests need deterministic behavior without Redis.
  - Expected: The attempt helper accepts a store interface with `get`, `set`, and `delete` operations and a test fake can be injected.
  - Possible bugs: Production code might accidentally use the test store.
  - Fix/Mitigation: Export the fake only from the test file or keep it local to tests.
  - Verification: `node --test --import tsx tests/unit/login-attempt-guidance.test.ts` can simulate time and attempts without Redis.

- [X] T007 Implement Redis-backed attempt window functions in `src/lib/auth/login-attempts.ts`
  - Reason: Production web instances need shared short-lived state.
  - Expected: Exports functions to check cooldown before login, record failed result, clear on success, and report remaining attempts/cooldown seconds.
  - Possible bugs: Attempts during cooldown could extend the wait forever.
  - Fix/Mitigation: When cooldown exists, return it without resetting expiry.
  - Verification: Unit test proves repeated attempts during cooldown keep the original `cooldownUntil`.

- [X] T008 Implement safe diagnostics helper in `src/lib/auth/login-diagnostics.ts`
  - Reason: Support needs reason categories without leaking secrets.
  - Expected: Helper accepts safe metadata and writes a structured console warning/info with no password-like fields.
  - Possible bugs: Future callers may pass raw credentials into a generic metadata object.
  - Fix/Mitigation: Type the helper parameters explicitly and reject/omit forbidden keys before logging.
  - Verification: `node --test --import tsx tests/unit/login-diagnostics-redaction.test.ts` passes.

## Phase 3: User Story 1 - Clear Failed Login Guidance (Priority: P1)

**Goal**: Replace `Configuration` with useful messages and remaining-attempt counts.

**Independent Test**: Wrong login attempts show remaining attempts and never expose account-existence details.

- [X] T009 [US1] Add pure feedback formatter in `src/components/auth/LoginForm.tsx`
  - Reason: UI message rules need testable formatting independent of React rendering.
  - Expected: Export or locally expose a pure function that maps status, remaining attempts, and cooldown seconds to Arabic/English/Bengali-safe message keys.
  - Possible bugs: Exporting from a client component may complicate tests.
  - Fix/Mitigation: If needed, place formatter in `src/components/auth/loginFeedback.ts` and import it from `LoginForm.tsx`.
  - Verification: `node --test --import tsx tests/unit/login-form-feedback.test.ts` passes formatter tests.

- [X] T010 [US1] Add login feedback translations in `src/i18n/translations/ar.ts`, `src/i18n/translations/en.ts`, and `src/i18n/translations/bn.ts`
  - Reason: The login page is localized and must not fall back to raw AuthJS codes.
  - Expected: Auth translation objects include invalid-login, attempts remaining, cooldown, and generic retry messages.
  - Possible bugs: Missing keys in one locale can show undefined or raw fallback text.
  - Fix/Mitigation: Tests should verify all three locale objects expose the same new keys.
  - Verification: `node --test --import tsx tests/unit/login-form-feedback.test.ts` checks required keys exist.

- [X] T011 [US1] Map AuthJS raw errors to safe public messages in `src/components/auth/LoginForm.tsx`
  - Reason: Users currently see `Configuration`, which is not actionable.
  - Expected: `Configuration`, `CredentialsSignin`, and generic credential failures show the same safe invalid-login guidance unless cooldown status is known.
  - Possible bugs: Unexpected infrastructure errors might be hidden as bad credentials.
  - Fix/Mitigation: Keep a separate fallback message for unexpected failures after status lookup fails.
  - Verification: `node --test --import tsx tests/unit/login-form-feedback.test.ts` proves `Configuration` is never displayed.

## Phase 4: User Story 2 - Short Cooldown After Three Failed Attempts (Priority: P1)

**Goal**: Enforce three failed results then a two-minute wait without permanent account lock.

**Independent Test**: Two failures allow retry, correct third attempt succeeds, third failed result starts a cooldown, and retry works after expiry.

- [X] T012 [US2] Replace normal web login limiter usage in `src/lib/auth.ts`
  - Reason: The current 5 attempts/15 minutes username-only limiter conflicts with the requested behavior.
  - Expected: Web login checks the new two-minute attempt window before credential validation and no longer uses `RATE_LIMITS.login` for normal web mistakes.
  - Possible bugs: Removing the old limiter could weaken abuse protection.
  - Fix/Mitigation: Keep broader abuse protection as a separate guard in a later task and preserve admin diagnostics.
  - Verification: Tests prove first and second failures are not blocked by a 15-minute limiter.

- [X] T013 [US2] Preserve exact case-sensitive lookup in `src/lib/auth.ts`
  - Reason: The owner explicitly requires `Mobarak2030` and `mobarak2030` to be different.
  - Expected: The lookup trims outer spaces from the submitted login field but uses exact case and punctuation for username/email matching.
  - Possible bugs: Accidentally using `mode: 'insensitive'` or lowercasing would merge accounts.
  - Fix/Mitigation: Add tests that fail if wrong-case login matches an account.
  - Verification: `node --test --import tsx tests/unit/login-attempt-guidance.test.ts` includes wrong-case rejection.

- [X] T014 [US2] Record failed outcomes after credential validation in `src/lib/auth.ts`
  - Reason: The third attempt must be evaluated normally; cooldown starts only after the third failed result.
  - Expected: Unknown login, missing password hash, disabled account, and wrong password all record a generic failed outcome for the attempt window.
  - Possible bugs: Public behavior may leak the exact reason if different errors are thrown.
  - Fix/Mitigation: Throw or return a single safe credential failure while logging only private categories.
  - Verification: Unit tests cover all failure categories producing the same public status.

- [X] T015 [US2] Clear the attempt window after successful login in `src/lib/auth.ts`
  - Reason: A successful login should reset the normal mistake sequence.
  - Expected: After success, the next wrong attempt starts again at "2 attempts remaining."
  - Possible bugs: Clearing too broadly could erase abuse signals for unrelated attempts.
  - Fix/Mitigation: Clear only the exact login/context mistake key, not broader abuse keys.
  - Verification: Unit test proves success clears normal mistake counter only.

- [X] T016 [US2] Add active cooldown response support in `src/components/auth/LoginForm.tsx`
  - Reason: The UI must show a countdown and prevent login during the two-minute wait.
  - Expected: During cooldown, submit button is disabled or guarded, and text updates from `02:00` down to retry.
  - Possible bugs: Client timer may drift from server state.
  - Fix/Mitigation: Base initial countdown on server-provided seconds and allow retry when it reaches zero; next server attempt remains authoritative.
  - Verification: `node --test --import tsx tests/unit/login-form-feedback.test.ts` validates countdown formatting; manual quickstart validates UI behavior.

## Phase 5: User Story 3 - Exact Case-Sensitive Account Identity (Priority: P1)

**Goal**: Make exact saved login names clear and prevent accidental case merging.

**Independent Test**: Wrong case and missing punctuation do not match existing accounts.

- [X] T017 [US3] Add exact identity tests in `tests/unit/login-attempt-guidance.test.ts`
  - Reason: This captures the user's explicit correction to the earlier plan.
  - Expected: Tests assert `Mobarak2030` does not match `mobarak2030`, and `khaled20200` does not match `khaled-20200`.
  - Possible bugs: Tests may mock lookup too shallowly and miss actual Prisma query behavior.
  - Fix/Mitigation: Keep lookup helper pure and test its normalized submitted value plus query shape expectations.
  - Verification: `node --test --import tsx tests/unit/login-attempt-guidance.test.ts` includes exact identity assertions.

- [X] T018 [US3] Ensure login form does not alter letter case in `src/components/auth/LoginForm.tsx`
  - Reason: UI must not lowercase or uppercase user input.
  - Expected: The form may trim edge spaces for submission guidance but preserves typed letter case.
  - Possible bugs: Browser autocomplete or helper code may transform the value.
  - Fix/Mitigation: Do not call `.toLowerCase()` on login name in the form.
  - Verification: Unit test proves submitted `Mobarak2030` remains `Mobarak2030`.

## Phase 6: User Story 4 - Safe Admin Diagnostics (Priority: P2)

**Goal**: Provide safe private diagnosis without leaking secrets.

**Independent Test**: Logs include categories and context but no secrets.

- [X] T019 [US4] Add private reason categories in `src/lib/auth/login-diagnostics.ts`
  - Reason: Support needs to distinguish normal mistake, cooldown, disabled account, and suspicious traffic internally.
  - Expected: Categories include `unknown_login`, `wrong_password`, `disabled_account`, `missing_password_hash`, `cooldown_active`, and `unexpected_error`.
  - Possible bugs: Over-specific public mapping could reveal account state.
  - Fix/Mitigation: Keep category use private and map public output to generic messages.
  - Verification: `node --test --import tsx tests/unit/login-diagnostics-redaction.test.ts` confirms category-only logging.

- [X] T020 [US4] Add broader abuse guard placeholder or integration in `src/lib/auth.ts`
  - Reason: Normal mistake cooldown should not be the only defense against heavy attacks.
  - Expected: The old long limiter is either replaced by a separate address/many-name guard or retained only as an IP-heavy-traffic guard that does not globally block a username.
  - Possible bugs: A too-broad guard can block shared offices or mobile networks.
  - Fix/Mitigation: Scope abuse guard by request address and high-volume patterns, not exact account name alone.
  - Verification: Unit test or documented manual check proves another browser/address cannot pause the real user's normal login by failing the same login name.

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final checks, docs, and deployment safety.

- [X] T021 Run focused tests and build validation
  - Reason: Authentication changes can block all users if broken.
  - Expected: Focused tests pass and production build succeeds.
  - Possible bugs: Build may fail because NextAuth error classes or client/server imports are incompatible.
  - Fix/Mitigation: Keep server-only helpers out of client files and client-only formatting out of server files.
  - Verification: `node --test --import tsx tests/unit/login-attempt-guidance.test.ts`, `node --test --import tsx tests/unit/login-diagnostics-redaction.test.ts`, `node --test --import tsx tests/unit/login-form-feedback.test.ts`, and `npm run build`.

- [X] T022 Run encoding and secret-safety scan on changed files
  - Reason: Repository rules require mojibake and secret-safety checks after edits.
  - Expected: No new mojibake markers and no password/hash/token logging in changed login files.
  - Possible bugs: Arabic translations can be damaged by encoding-unsafe edits.
  - Fix/Mitigation: Use `apply_patch` only and scan changed files for mojibake markers.
  - Verification: `rg -n "â|ï؟½|Ã|Â|passwordHash|password:|token|cookie|session" src/lib/auth.ts src/lib/auth src/components/auth src/i18n/translations tests/unit/login-*`.

- [ ] T023 Validate quickstart manually against a local or staging login flow
  - Reason: Countdown and button-disable behavior are visible user experience, not only pure logic.
  - Expected: Manual quickstart steps pass, including third-correct-attempt success and cooldown non-extension.
  - Possible bugs: Client countdown can appear stuck if timer cleanup is wrong.
  - Fix/Mitigation: Use a single interval tied to cooldown end time and clear it on unmount or success.
  - Verification: Follow `specs/031-login-attempt-guidance/quickstart.md` and record pass/fail notes.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup tests.
- **US1 and US2**: Depend on Foundational helpers.
- **US3**: Can proceed after T005 but should finish before final auth behavior is accepted.
- **US4**: Can proceed after diagnostics helper T008.
- **Polish**: Depends on selected stories being complete.

### MVP Scope

MVP includes US1, US2, and US3. US4 diagnostics are strongly recommended before production deployment but can be reviewed separately if urgent.

### Parallel Opportunities

- T002 and T003 can run in parallel with T001.
- T009/T010 can run after T003 while T012-T015 proceed after T004-T008.
- T017/T018 can run in parallel with UI feedback work after T005.
- T019/T020 can run after T008.

## Implementation Strategy

1. Write and run failing tests first.
2. Build `login-attempts.ts` and `login-diagnostics.ts`.
3. Integrate helpers into `src/lib/auth.ts`.
4. Update `LoginForm.tsx` and translations for visible guidance.
5. Verify exact case-sensitive identity remains preserved.
6. Run focused tests, build, mojibake scan, and manual quickstart.
