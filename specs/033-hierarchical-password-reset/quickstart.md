# Quickstart: Hierarchical Password Reset

## Safe Verification Boundary

- Use local source and isolated test doubles only.
- Do not start the website.
- Do not connect to or mutate the production database.
- Do not build or restart the Worker.

## Focused Checks

1. Run password-policy and route-contract tests.
2. Run locale parity and UI source assertions.
3. Run TypeScript or the narrowest safe project validation available.
4. Run git diff --check.
5. Scan changed files for accidental secrets, password/hash output, and newly introduced mojibake.

## Acceptance Matrix

- Admin -> active MANAGER/AGENT/USER: allowed.
- Admin -> self/ADMIN/inactive/deleted: denied.
- Manager -> one directly managed active USER: allowed.
- Manager -> other or conflicting ownership: denied.
- Agent -> one directly assigned active USER: allowed.
- Agent -> expired/transferred/conflicting ownership: denied.
- Fourth actor-target attempt in one hour: rate limited.
- Successful reset: old web/mobile sessions rejected.
- Response/audit/log: no password or hash.
- Forgot password: contact-supervisor guidance only.
