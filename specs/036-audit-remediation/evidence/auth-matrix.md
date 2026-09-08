# Current panel authentication matrix — 2026-09-08

T027-T029 accepted locally. The 19 operation route files / 21 HTTP handlers use current panel identity through `getAuthenticatedUser` or the collection's `withAuth`. The persisted-state suite invokes the actual central guard and actual handlers; provider, Redis and financial adapters are forbidden on denial. The database contains synthetic actors only.

| Boundary | Verified behavior |
| --- | --- |
| Disabled, deleted, password-reset and missing actor | Current database state denies the old credential before a domain side effect. |
| Demoted actor | Current role wins over the credential's old role. Existing permission checks still apply. |
| Malformed panel subject / customer-family credential | Missing, blank or non-string panel ID is rejected before Prisma; a customer subject is not a panel identity. |
| Own operation | ADMIN, MANAGER, AGENT and USER retain the applicable route-specific access. Collection remains scoped to the current user for every role. |
| Foreign operation | Denied; heartbeat retains its existing 404 behavior. |
| Existing ADMIN exceptions | Detail GET, packages GET, installment GET and confirm-installment POST retain their pre-existing exception. No new blanket ADMIN override. |
| Non-panel cancellation | Existing separate guard preserved; no store/mobile source changes. |

Evidence: `tests/unit/operation-auth-contract.test.ts` (28 cases), `tests/integration/operation-auth-revocation-db.test.ts` (10 top-level cases, including the role/owner handler matrix), and existing hierarchy/password-reset/ownership suites in the unit/database manifests. These checks establish local guard behavior, not production session state.
