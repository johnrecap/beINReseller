# Tasks: Eid Rewards

**Input**: Design documents from `specs/016-eid-rewards/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api-contract.md`

**Tests**: Required for claim uniqueness, weighted random, point summary, conversion, and API contracts because this feature affects points and balance.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Phase 1: Setup

- [X] T001 Add `lottie-react` dependency in `package.json` and `package-lock.json`
  - Reason: The dashboard popup needs local Lottie rendering for React/Next.
  - Expected: `lottie-react` is installed and reproducible in production builds.
  - Possible bugs: Adding a mismatched animation package can break React 19 build.
  - Fix/Mitigation: Use the current npm installer, inspect peer warnings, and verify `npm run build`.
  - Verification: `npm ls lottie-react && npm run build`.

- [X] T002 Track Eid Lottie assets in `public/assets/eid-rewards/`
  - Reason: Server deployment pulls from Git; untracked files will be missing in production.
  - Expected: `animation1.json`, `animation2.json`, and `animation3.json` are committed.
  - Possible bugs: Large JSON assets can be accidentally omitted or renamed.
  - Fix/Mitigation: Add exact paths and verify file names case-sensitively.
  - Verification: `git ls-files public/assets/eid-rewards`.

## Phase 2: Foundational Data And Services

- [X] T003 [P] Add Prisma models and enum changes in `prisma/schema.prisma` and sync `worker/prisma/schema.prisma`
  - Reason: Claims/settings/tiers need persistent source-of-truth tables and `EID_REWARD` ledger source.
  - Expected: Prisma includes `EidRewardSettings`, `EidRewardTier`, `EidRewardClaim`, `EidRewardClaimPolicy`, and `PointLedgerSourceType.EID_REWARD`.
  - Possible bugs: App and worker schemas can drift or enum migration can be unsafe.
  - Fix/Mitigation: Run Prisma format, copy schema to worker, and use migration deploy path.
  - Verification: `node scripts/check-prisma-schema-sync.js`.

- [X] T004 Create migration `prisma/migrations/*_eid_rewards/migration.sql`
  - Reason: Production database must be changed through migrations, not `db push`.
  - Expected: Migration adds enum value, settings table, tiers table, claims table, indexes, and unique constraints without touching old rows.
  - Possible bugs: PostgreSQL enum alteration order can fail if wrapped incorrectly.
  - Fix/Mitigation: Generate/check Prisma migration locally and inspect SQL before deploy.
  - Verification: `npx prisma migrate deploy` on staging/local database.

- [X] T005 [P] Add point summary support for `EID_REWARD` in `src/lib/points/balance.ts`
  - Reason: Eid points must be spendable/convertible through the existing balance summary.
  - Expected: Positive `EID_REWARD` entries increase `available` and `lifetimeEarned`.
  - Possible bugs: Legacy points or reward redemption summaries can change unexpectedly.
  - Fix/Mitigation: Add focused tests for existing sources and new Eid source.
  - Verification: `npx tsx --test tests/unit/points-calculation.test.ts tests/unit/eid-rewards-balance.test.ts`.

- [X] T006 [P] Add Eid reward calculation helpers in `src/lib/eid-rewards/calculation.ts`
  - Reason: Weighted random, min/max fallback, claim date, and scope key need deterministic test seams.
  - Expected: Pure functions cover `selectWeightedReward`, `selectRangeReward`, `buildClaimScopeKey`, and conversion preview.
  - Possible bugs: Off-by-one random boundaries or daily scope using wrong timezone.
  - Fix/Mitigation: Use `crypto.randomInt` injection for tests and fixed Africa/Cairo date formatting.
  - Verification: `npx tsx --test tests/unit/eid-rewards-calculation.test.ts`.

- [X] T007 Add Eid settings validation in `src/lib/eid-rewards/settings.ts`
  - Reason: Admin inputs must be rejected before database writes.
  - Expected: Validation covers dates, event key, min/max points, min redeem points, close delay, text length, and tiers.
  - Possible bugs: Invalid active settings can allow zero-point claims or event key changes after claims.
  - Fix/Mitigation: Warn or block event key changes while claims exist unless admin explicitly disables event first.
  - Verification: `npx tsx --test tests/unit/eid-rewards-settings.test.ts`.

- [X] T008 Implement claim service in `src/lib/eid-rewards/claim.ts`
  - Reason: API route must not contain financial and race-condition logic directly.
  - Expected: Service loads settings, checks active window, checks claim scope, selects server-side points, creates claim and positive point ledger in one transaction.
  - Possible bugs: Double claims can happen under concurrent requests.
  - Fix/Mitigation: Use unique `(userId, claimScopeKey)` and catch Prisma unique errors as already-claimed.
  - Verification: `npx tsx --test tests/integration/eid-rewards-claim.test.ts`.

- [X] T009 Implement Eid redeem service in `src/lib/eid-rewards/redeem.ts`
  - Reason: Eid conversion must support all roles and use the existing conversion settings.
  - Expected: Service validates points/min threshold, checks available points, creates negative point ledger, `PointCashRedemption`, `Transaction`, and increments `User.balance`.
  - Possible bugs: Admin role may remain blocked if generic redemption service is reused unchanged.
  - Fix/Mitigation: Either safely broaden shared redemption role support or implement Eid-specific wrapper that supports all roles.
  - Verification: `npx tsx --test tests/integration/eid-rewards-redeem.test.ts`.

## Phase 3: User Story 1 - Claim Eid Points From Main Dashboard (P1)

- [X] T010 [P] [US1] Add claim service tests in `tests/integration/eid-rewards-claim.test.ts`
  - Reason: Claim logic is financially relevant and must be tested before API/UI.
  - Expected: Tests cover success, disabled event, inactive dates, once-per-event duplicate, once-per-day duplicate, and concurrent duplicate.
  - Possible bugs: Integration tests may require a real database.
  - Fix/Mitigation: Gate DB tests with existing integration env pattern and keep pure unit coverage for logic.
  - Verification: `npx tsx --test tests/integration/eid-rewards-claim.test.ts`.

- [X] T011 [US1] Add `GET /api/eid-rewards/status` in `src/app/api/eid-rewards/status/route.ts`
  - Reason: The dashboard must know eligibility from the server.
  - Expected: Route returns safe status/copy/conversion preview without tier weights.
  - Possible bugs: Route can expose probability weights or internal validation reasons.
  - Fix/Mitigation: Shape response explicitly instead of returning settings objects.
  - Verification: Contract check against `contracts/api-contract.md`.

- [X] T012 [US1] Add `POST /api/eid-rewards/claim` in `src/app/api/eid-rewards/claim/route.ts`
  - Reason: Users need secure backend-only claim execution.
  - Expected: Route requires auth, rate limits, ignores request body points, calls claim service, and returns result.
  - Possible bugs: Double-click can submit multiple requests before UI disables.
  - Fix/Mitigation: Backend uniqueness is authoritative; frontend disabling is only UX.
  - Verification: `npx tsx --test tests/integration/eid-rewards-claim.test.ts`.

- [X] T013 [US1] Build `EidRewardPopup` in `src/components/eid-rewards/EidRewardPopup.tsx`
  - Reason: The main dashboard needs the Arabic premium popup/card experience.
  - Expected: Component supports loading, eligible, claiming, claimedSuccess, alreadyClaimed, eventInactive, and error states.
  - Possible bugs: Popup can become annoying after "لاحقا" or after already-claimed.
  - Fix/Mitigation: Use `sessionStorage` only for "later" dismissal and always trust server status.
  - Verification: Manual dashboard test plus component state smoke test if available.

- [X] T014 [US1] Build Lottie/fallback envelope components in `src/components/eid-rewards/EidRewardEnvelope.tsx`
  - Reason: Assets can be missing or invalid; UI must still work.
  - Expected: Uses `animation2`, `animation1`, `animation3` when available and CSS fallback otherwise.
  - Possible bugs: JSON imports can bloat initial server bundle or fail in SSR.
  - Fix/Mitigation: Use client-only component and dynamic loading/fetching of public JSON.
  - Verification: Temporarily rename one JSON file locally and verify fallback appears.

- [X] T015 [US1] Mount popup in `src/components/dashboard/DashboardContent.tsx`
  - Reason: User clarified popup appears on the main dashboard page only.
  - Expected: Dashboard loads popup after auth without affecting quick actions or recent operations layout.
  - Possible bugs: Popup can render for logged-out users or on admin subpages.
  - Fix/Mitigation: Dashboard page already requires auth; mount only in this component.
  - Verification: Open `/dashboard`, `/dashboard/admin`, and `/login` manually.

## Phase 4: User Story 2 - Convert Eid Points To Balance (P2)

- [X] T016 [P] [US2] Add redeem tests in `tests/integration/eid-rewards-redeem.test.ts`
  - Reason: Redeem changes real user balance and must be test-first.
  - Expected: Tests cover enough points, insufficient points, invalid settings, min redeem threshold, and all roles.
  - Possible bugs: Conversion could redeem non-Eid points unexpectedly.
  - Fix/Mitigation: Decide whether Eid redeem uses all available points or requested points from full ledger; document and test behavior.
  - Verification: `npx tsx --test tests/integration/eid-rewards-redeem.test.ts`.

- [X] T017 [US2] Add `POST /api/eid-rewards/redeem` in `src/app/api/eid-rewards/redeem/route.ts`
  - Reason: Popup needs a role-inclusive conversion endpoint.
  - Expected: Route requires auth, rate limits, validates points, calls Eid redeem service, and returns balance result.
  - Possible bugs: Frontend could try to redeem more than available points.
  - Fix/Mitigation: Backend recalculates available points and rejects invalid requests.
  - Verification: API contract and integration tests.

- [X] T018 [US2] Add redeem UI state to `EidRewardPopup`
  - Reason: Users need a clear conversion action after claim.
  - Expected: Button shows redeeming, redeemedSuccess, disabled/error states, and updated balance/points copy.
  - Possible bugs: User can click redeem repeatedly.
  - Fix/Mitigation: Disable while request is in flight; backend handles repeated insufficient points.
  - Verification: Manual click spam on popup after claim.

## Phase 5: User Story 3 - Admin Settings Page (P3)

- [X] T019 [P] [US3] Add admin settings API tests in `tests/integration/eid-rewards-admin-settings.test.ts`
  - Reason: Admin settings control security and reward values.
  - Expected: Tests cover auth, validation, tier replacement, and public non-exposure of weights.
  - Possible bugs: Invalid settings can be partially saved.
  - Fix/Mitigation: Save settings and tiers in one transaction.
  - Verification: `npx tsx --test tests/integration/eid-rewards-admin-settings.test.ts`.

- [X] T020 [US3] Add `GET/PUT /api/admin/eid-rewards/settings` route
  - Reason: Admin page needs settings and tier management.
  - Expected: Exact admin auth, validation, transaction save, and conversion settings preview.
  - Possible bugs: Event key changes after claims can confuse once-per-event history.
  - Fix/Mitigation: Add warning/blocking rule documented in validation.
  - Verification: Integration tests and manual save.

- [X] T021 [US3] Build admin page `src/app/dashboard/admin/eid-rewards/page.tsx`
  - Reason: User requested a standalone admin page.
  - Expected: Page requires admin and renders `AdminEidRewardsClient`.
  - Possible bugs: Non-admin could access the page shell.
  - Fix/Mitigation: Use same admin guard pattern as other admin pages.
  - Verification: Manual non-admin access redirects.

- [X] T022 [US3] Build `AdminEidRewardsClient` in `src/components/admin/eid-rewards/AdminEidRewardsClient.tsx`
  - Reason: Admins need a usable settings UI matching current design.
  - Expected: Supports settings form, tier editor, validation errors, save success, and loading states.
  - Possible bugs: Dense settings can overflow on mobile.
  - Fix/Mitigation: Use existing cards, grids, small labels, and responsive columns.
  - Verification: Desktop/mobile screenshot or browser smoke test.

- [X] T023 [US3] Add admin sidebar link in `src/components/layout/Sidebar.tsx`
  - Reason: Standalone page must be discoverable.
  - Expected: Admin menu includes "عيدية العيد" / "Eid Rewards" with gift icon.
  - Possible bugs: Link can be grouped under the wrong section or active state can conflict.
  - Fix/Mitigation: Add to System & Content section near Rewards.
  - Verification: Manual sidebar navigation.

## Phase 6: User Story 4 - Audit Claims And Conversions (P4)

- [X] T024 [P] [US4] Add admin claims API in `src/app/api/admin/eid-rewards/claims/route.ts`
  - Reason: Admins need claim audit visibility.
  - Expected: Paginated, searchable, admin-only claims list with user and role data.
  - Possible bugs: Query can leak sensitive user fields.
  - Fix/Mitigation: Select explicit safe fields only.
  - Verification: API integration test and manual table check.

- [X] T025 [P] [US4] Add admin transactions API in `src/app/api/admin/eid-rewards/transactions/route.ts`
  - Reason: Admins need to review conversion/balance impacts.
  - Expected: Paginated point/balance conversion records related to Eid points.
  - Possible bugs: Transactions unrelated to Eid can appear.
  - Fix/Mitigation: Filter by Eid claim source or point cash redemption linkage.
  - Verification: Seed two unrelated transactions and ensure they do not appear.

- [X] T026 [US4] Add Claims and Transactions tabs to `AdminEidRewardsClient`
  - Reason: Settings alone is not enough for accounting review.
  - Expected: Admin page has settings, claims, and transactions views with loading/empty/error states.
  - Possible bugs: Large claims table can overflow or fetch every row.
  - Fix/Mitigation: Use pagination and horizontal overflow like existing admin tables.
  - Verification: Manual page with >25 claims.

## Final Phase: Polish And Verification

- [X] T027 Run schema sync, Prisma generate, app build, and worker build
  - Reason: App and worker share Prisma schema and production build must pass.
  - Expected: All required build commands pass.
  - Possible bugs: Worker TypeScript can fail if schema sync or generated client is stale.
  - Fix/Mitigation: Run app and worker build after Prisma generate.
  - Verification: `node scripts/check-prisma-schema-sync.js && npx prisma generate && npm run build && npm --prefix worker run build`.

- [X] T028 Run focused lint on changed files
  - Reason: Full repo lint has known pre-existing failures; changed files must stay clean.
  - Expected: ESLint passes for Eid service/routes/components/tests.
  - Possible bugs: React hook rules can flag popup effects.
  - Fix/Mitigation: Avoid setState-in-effect patterns and keep effects tied to external sync only.
  - Verification: `npx eslint <changed files>`.

- [X] T029 Perform manual UX smoke test
  - Reason: Animation, popup, RTL, and responsive behavior need browser validation.
  - Expected: Popup works on desktop/mobile, Lottie and fallback work, no text overlap.
  - Possible bugs: Lottie JSON may not load from public path in production.
  - Fix/Mitigation: Use public asset URLs and fallback on load error.
  - Verification: Browser test on `/dashboard` and `/dashboard/admin/eid-rewards`.

- [X] T030 Prepare production deployment commands
  - Reason: Production database is live and must use safe command order.
  - Expected: Final response includes `git pull`, backup, `npx prisma migrate deploy`, generate, app build, worker build, PM2 restart.
  - Possible bugs: Using `db push` can bypass migration history.
  - Fix/Mitigation: Explicitly forbid `db push` in deployment instructions.
  - Verification: Compare final commands to `AGENTS.md` production notes.

## Dependencies & Execution Order

- Setup tasks T001-T002 can run first.
- Foundational tasks T003-T009 block all stories.
- US1 can start after T003-T008.
- US2 depends on point summary and redeem service work.
- US3 can start after settings model/API design.
- US4 depends on claim/redeem records existing.
- Polish depends on all selected user stories.

## MVP

MVP is US1 plus admin settings enough to enable/disable and set min/max points. Full requested scope requires US2-US4.
