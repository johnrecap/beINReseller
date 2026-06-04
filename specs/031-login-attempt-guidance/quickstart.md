# Quickstart: Login Attempt Guidance

## Manual Verification Flow

1. Start the local app with configured Redis and database.
2. Open `/login`.
3. Enter an existing exact username with a wrong password.
4. Verify the page shows: `Login name or password is not correct. 2 attempts remaining.`
5. Repeat with the same exact username and another wrong password.
6. Verify the page shows: `Login name or password is not correct. 1 attempt remaining.`
7. Try a correct password on the third attempt.
8. Verify login succeeds and no countdown appears.
9. Sign out, then repeat steps 3-6.
10. Enter a wrong password on the third attempt.
11. Verify a two-minute countdown appears and login is disabled for that exact login/context.
12. Click login repeatedly during the countdown.
13. Verify the countdown does not restart.
14. Wait until the countdown expires.
15. Verify a correct login succeeds.

## Case-Sensitive Identity Flow

1. Confirm an account exists as `Mobarak2030`.
2. Attempt login as `mobarak2030` with the password for `Mobarak2030`.
3. Verify the login does not match `Mobarak2030`.
4. Attempt login as `Mobarak2030` with the correct password.
5. Verify the exact-case login succeeds.

## Punctuation Flow

1. Confirm an account exists as `khaled-20200`.
2. Attempt login as `khaled20200`.
3. Verify the login does not match `khaled-20200`.
4. Attempt login as `khaled-20200`.
5. Verify the exact punctuation is required.

## Commands

```bash
npm run build
```

```bash
npm --prefix worker run build
```

Run the focused unit tests added by this feature:

```bash
node --test --import tsx tests/unit/login-attempt-guidance.test.ts
```

Run any login form tests added by this feature:

```bash
node --test --import tsx tests/unit/login-form-feedback.test.ts
```
