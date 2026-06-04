# Tasks: Eid Reward Audience And Copy

**Input**: Design documents from `specs/028-eid-reward-audience-copy/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api-contract.md`

**Tests**: Required because this controls who can receive points that can later become balance.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Phase 1: Setup

- [X] T001 Inspect the current Eid reward settings, status, claim, popup, and admin files before editing: `src/lib/eid-rewards/settings.ts`, `src/lib/eid-rewards/claim.ts`, `src/components/eid-rewards/EidRewardPopup.tsx`, `src/components/admin/eid-rewards/AdminEidRewardsClient.tsx`, `src/app/api/admin/eid-rewards/settings/route.ts`
  - Reason: The change must preserve existing Eid Rewards behavior.
  - Expected: Implementer knows current field names, current hardcoded popup copy, and current API shape before modifying code.
  - Possible bugs: Starting edits without reading can duplicate state or break existing before/after text behavior.
  - Fix/Mitigation: Record the current response shape and keep backward-compatible fields during implementation.
  - Verification: `git diff -- src/lib/eid-rewards/settings.ts src/lib/eid-rewards/claim.ts src/components/eid-rewards/EidRewardPopup.tsx src/components/admin/eid-rewards/AdminEidRewardsClient.tsx src/app/api/admin/eid-rewards/settings/route.ts` after edits shows targeted changes only.

- [X] T002 Create focused failing audience tests in `tests/unit/eid-rewards-audience.test.ts`
  - Reason: Audience precedence controls reward access and must be test-first.
  - Expected: Tests cover role allowed, role denied, allow override, deny override wins, inactive user denied, and deleted user denied.
  - Possible bugs: Tests can mirror the wrong implementation if they use database behavior too early.
  - Fix/Mitigation: Keep this as pure helper tests with plain input objects.
  - Verification: `npx tsx --test tests/unit/eid-rewards-audience.test.ts` fails before the helper exists and passes after implementation.

- [X] T003 Create focused failing popup copy tests in `tests/unit/eid-rewards-popup-copy.test.ts`
  - Reason: Admin copy validation and legacy defaults must be predictable.
  - Expected: Tests cover default text normalization, before/after legacy fallback, required fields, length limits, and unsupported placeholders.
  - Possible bugs: Tests can allow broken placeholders or miss old settings rows.
  - Fix/Mitigation: Include a case with `popupTexts` missing and existing `beforeText`/`afterText` present.
  - Verification: `npx tsx --test tests/unit/eid-rewards-popup-copy.test.ts` fails before copy helpers exist and passes after implementation.

## Phase 2: Foundational Data And Services

- [X] T004 Add Prisma schema changes in `prisma/schema.prisma` for audience roles, popup text bundle, and audience overrides
  - Reason: Audience and text settings need a persistent source of truth.
  - Expected: Schema includes `audienceRoles`, `popupTexts`, `EidRewardAudienceOverrideEffect`, and `EidRewardAudienceOverride` with required indexes.
  - Possible bugs: Wrong relation names or missing indexes can break Prisma generation or slow status checks.
  - Fix/Mitigation: Use one override per user per settings record and add indexes from `data-model.md`.
  - Verification: `npx prisma validate`.

- [X] T005 Mirror Prisma schema changes into `worker/prisma/schema.prisma`
  - Reason: The repository requires app and worker Prisma schemas to stay synchronized.
  - Expected: Worker schema has the same added enum, fields, model, relations, and indexes.
  - Possible bugs: App build passes but worker build or schema sync fails.
  - Fix/Mitigation: Copy only the exact Prisma additions and run the sync script.
  - Verification: `node scripts/check-prisma-schema-sync.js`.

- [X] T006 Create a production-safe migration under `prisma/migrations/*_eid_reward_audience_copy/migration.sql`
  - Reason: Production has a live database and must use migrations, not schema push.
  - Expected: Migration adds new fields/tables/indexes and defaults audience to all current roles without altering claims or ledgers.
  - Possible bugs: Existing rows can get null audience roles or enum array defaults can fail.
  - Fix/Mitigation: Inspect generated SQL and add a backfill statement for the singleton settings row if needed.
  - Verification: `npx prisma migrate deploy` on a local or staging database.

- [X] T007 Add popup text defaults, normalization, and validation helpers in `src/lib/eid-rewards/settings.ts`
  - Reason: Status, claim, and admin settings must all use one validated copy source.
  - Expected: Helpers produce a complete text bundle from old or new settings and reject invalid placeholders.
  - Possible bugs: Existing `beforeText` and `afterText` can stop matching the popup.
  - Fix/Mitigation: Normalize `popupTexts.beforeText` and `popupTexts.afterText` from existing fields when missing, and save them back in admin PUT.
  - Verification: `npx tsx --test tests/unit/eid-rewards-popup-copy.test.ts`.

- [X] T008 Add audience decision helper in `src/lib/eid-rewards/audience.ts`
  - Reason: Status and claim must share one rule so they cannot disagree.
  - Expected: Helper returns allowed/denied based on inactive/deleted state, deny override, allow override, and role list.
  - Possible bugs: Deny and allow precedence can be reversed.
  - Fix/Mitigation: Keep rule order explicit and covered by tests.
  - Verification: `npx tsx --test tests/unit/eid-rewards-audience.test.ts`.

## Phase 3: User Story 1 - Admin Controls Who Sees Eid Rewards (Priority: P1)

**Goal**: Admin can control role visibility and per-user exceptions from the existing Eid Rewards settings page.

**Independent Test**: Save roles and overrides as admin, refresh the page, and verify the saved audience state is displayed.

- [X] T009 [P] [US1] Add admin settings integration tests for audience load/save in `tests/integration/eid-rewards-admin-settings.test.ts`
  - Reason: Admin settings are the control surface for who can receive rewards.
  - Expected: Tests cover default all roles, role subset save, allow override save, deny override save, duplicate override rejection, and non-admin rejection.
  - Possible bugs: Tests may depend on existing database state.
  - Fix/Mitigation: Create isolated users/settings rows in the test setup and clean them after each test.
  - Verification: `npx tsx --test tests/integration/eid-rewards-admin-settings.test.ts`.

- [X] T010 [US1] Extend `src/app/api/admin/eid-rewards/settings/route.ts` GET response with audience roles and safe audience overrides
  - Reason: The admin page needs the saved audience state.
  - Expected: GET returns `audienceRoles` and `audienceOverrides` with safe user fields only.
  - Possible bugs: API can leak password hash, deleted data, or other sensitive user fields.
  - Fix/Mitigation: Use an explicit select list for user `id`, `username`, `email`, `role`, and `isActive`.
  - Verification: Integration test confirms response excludes `passwordHash`, sessions, and tokens.

- [X] T011 [US1] Extend `src/app/api/admin/eid-rewards/settings/route.ts` PUT validation and save for audience roles and overrides
  - Reason: Audience changes must save atomically with the rest of settings.
  - Expected: PUT validates roles, validates user IDs, replaces overrides safely, and keeps previous settings on failure.
  - Possible bugs: Partial saves can update text but fail overrides, leaving confusing admin state.
  - Fix/Mitigation: Wrap settings update, tier replacement, and override replacement in one transaction.
  - Verification: `npx tsx --test tests/integration/eid-rewards-admin-settings.test.ts`.

- [X] T012 [US1] Add role selection controls to `src/components/admin/eid-rewards/AdminEidRewardsClient.tsx`
  - Reason: Admins need a visible way to choose role audience.
  - Expected: Settings tab shows checkboxes or toggles for `ADMIN`, `MANAGER`, `AGENT`, and `USER` with default all selected.
  - Possible bugs: UI can submit an empty role list accidentally.
  - Fix/Mitigation: Allow empty role list intentionally but show helper text that only explicit allow users will see rewards.
  - Verification: Manual admin page test saves all roles, one role, and no roles.

- [X] T013 [US1] Add user allow/deny override controls to `src/components/admin/eid-rewards/AdminEidRewardsClient.tsx`
  - Reason: Admins need per-account exceptions without changing the account role.
  - Expected: Admin can add a user override, choose ALLOW or DENY, remove an override, and see an empty state when no overrides exist.
  - Possible bugs: The same user can appear twice or the UI can lose unsaved changes.
  - Fix/Mitigation: De-duplicate by `userId` in component state and show validation before save.
  - Verification: Manual admin page test adds, changes, removes, saves, and refreshes overrides.

## Phase 4: User Story 2 - Reward Claim Is Protected By Audience Rules (Priority: P1)

**Goal**: Users outside the audience cannot see or claim Eid Rewards.

**Independent Test**: Deny a user and verify status hides the popup while claim creates no claim or point ledger records.

- [X] T014 [P] [US2] Add status audience integration tests in `tests/integration/eid-rewards-audience-status.test.ts`
  - Reason: Popup visibility must match saved audience rules.
  - Expected: Tests cover role denied, allow override, deny override, already claimed, disabled event, and public response hiding rule details.
  - Possible bugs: Status can reveal full audience details or show popup when event is inactive.
  - Fix/Mitigation: Assert response shape does not contain `audienceRoles` or override lists.
  - Verification: `npx tsx --test tests/integration/eid-rewards-audience-status.test.ts`.

- [X] T015 [P] [US2] Add claim audience integration tests in `tests/integration/eid-rewards-audience-claim.test.ts`
  - Reason: The server must reject out-of-audience claim attempts before writing financial records.
  - Expected: Tests cover denied role, deny override, allow override success, and no `EidRewardClaim` or `PointLedgerEntry` created on denial.
  - Possible bugs: Claim service can create a claim before checking audience.
  - Fix/Mitigation: Test record counts before and after denied claim.
  - Verification: `npx tsx --test tests/integration/eid-rewards-audience-claim.test.ts`.

- [X] T016 [US2] Update `src/lib/eid-rewards/claim.ts` status flow to load the current user and audience override
  - Reason: Status currently checks event activity and previous claim only.
  - Expected: Status returns `eligible=false` and `popup.show=false` for users outside the audience.
  - Possible bugs: Adding user lookup can break anonymous assumptions or slow status.
  - Fix/Mitigation: Status already requires auth; select only fields needed for audience and use indexed override lookup.
  - Verification: `npx tsx --test tests/integration/eid-rewards-audience-status.test.ts`.

- [X] T017 [US2] Update `src/lib/eid-rewards/claim.ts` claim transaction to enforce audience before creating claim records
  - Reason: Manual claim calls must not bypass the hidden popup.
  - Expected: Out-of-audience users receive `NOT_ELIGIBLE_AUDIENCE`, with no claim and no point ledger entry.
  - Possible bugs: Error handling can convert audience denial to a generic server error.
  - Fix/Mitigation: Add a dedicated `EidRewardError` code and map it in the claim route.
  - Verification: `npx tsx --test tests/integration/eid-rewards-audience-claim.test.ts`.

- [X] T018 [US2] Update `src/app/api/eid-rewards/claim/route.ts` to return a safe audience denial response
  - Reason: Users should receive a clear but non-sensitive failure if they call claim directly.
  - Expected: Audience denial returns a non-success status and no internal audience rules.
  - Possible bugs: Response can reveal admin targeting details.
  - Fix/Mitigation: Return only a generic not-available message and code.
  - Verification: Contract assertion in `tests/integration/eid-rewards-audience-claim.test.ts`.

## Phase 5: User Story 3 - Admin Edits All Eid Reward Popup Text (Priority: P2)

**Goal**: Admin can edit every visible popup/card text from the same Eid Rewards settings page.

**Independent Test**: Save custom text for all fields, open the dashboard, and verify the popup uses saved copy through claim and redeem states.

- [X] T019 [P] [US3] Add popup text API integration tests in `tests/integration/eid-rewards-admin-settings.test.ts`
  - Reason: Text validation must be enforced by the server, not only the browser.
  - Expected: Tests cover saving all fields, required text rejection, length rejection, placeholder rejection, and legacy fallback.
  - Possible bugs: Invalid text can save and later break the popup.
  - Fix/Mitigation: Validate all text fields in the existing settings schema.
  - Verification: `npx tsx --test tests/integration/eid-rewards-admin-settings.test.ts`.

- [X] T020 [US3] Extend admin settings GET/PUT in `src/app/api/admin/eid-rewards/settings/route.ts` with `popupTexts`
  - Reason: The admin UI needs to load and save all editable copy fields.
  - Expected: GET returns normalized `popupTexts`; PUT validates and saves `popupTexts`, `beforeText`, and `afterText` consistently.
  - Possible bugs: Admin save can overwrite old before/after text incorrectly.
  - Fix/Mitigation: Treat text bundle as primary for UI but mirror before/after values for compatibility.
  - Verification: `npx tsx --test tests/integration/eid-rewards-admin-settings.test.ts`.

- [X] T021 [US3] Add popup text editor controls to `src/components/admin/eid-rewards/AdminEidRewardsClient.tsx`
  - Reason: Admins need direct control over every visible phrase.
  - Expected: Settings tab exposes title, intro, buttons, loading, success, points, money preview, after text, later, already claimed, inactive, and generic error fields.
  - Possible bugs: Too many fields can make the page hard to use or overflow.
  - Fix/Mitigation: Group fields into compact sections and keep existing admin page visual pattern.
  - Verification: Manual desktop and narrow viewport check of the admin settings page.

- [X] T022 [US3] Update `src/lib/eid-rewards/claim.ts` status response to return normalized popup texts
  - Reason: The dashboard popup must receive all saved copy from the server.
  - Expected: Status includes `popup.texts` and keeps old `beforeText`/`afterText` compatibility until the component is migrated.
  - Possible bugs: Existing popup component can break if it expects old fields only.
  - Fix/Mitigation: Return both old fields and new `texts` during the transition.
  - Verification: `npx tsx --test tests/integration/eid-rewards-audience-status.test.ts`.

- [X] T023 [US3] Update `src/components/eid-rewards/EidRewardPopup.tsx` to render all text from `status.popup.texts`
  - Reason: Hardcoded visible copy prevents admin edits from appearing.
  - Expected: Popup uses saved title, buttons, loading, success, points, conversion preview, after text, later, redeemed, already claimed, inactive, and error copy.
  - Possible bugs: Missing text can render blank buttons or broken placeholders.
  - Fix/Mitigation: Use normalized defaults from status and local fallback only for defensive rendering.
  - Verification: Manual dashboard flow with custom text values for every state.

- [X] T024 [US3] Update claim success text handling in `src/app/api/eid-rewards/claim/route.ts`
  - Reason: The claim response currently has fixed success copy.
  - Expected: User-facing success copy matches the saved text template where the response is displayed.
  - Possible bugs: Template replacement can show `{points}` literally.
  - Fix/Mitigation: Use the same safe formatting helper used by the popup.
  - Verification: Claim integration test asserts custom points text is rendered or returned correctly.

## Phase 6: User Story 4 - Admin Can Review A Clear Settings State (Priority: P3)

**Goal**: Admin can understand current audience and copy settings without guessing.

**Independent Test**: Open the admin page with defaults, saved roles, overrides, invalid attempted save, and API failure states.

- [X] T025 [P] [US4] Add admin UI state tests or manual test notes for settings state in `specs/028-eid-reward-audience-copy/quickstart.md`
  - Reason: This feature is admin-heavy and needs clear validation scenarios.
  - Expected: Quickstart includes role, override, text, error, refresh, and denied-user checks.
  - Possible bugs: Manual validation can miss a state if the checklist is incomplete.
  - Fix/Mitigation: Keep quickstart steps aligned with acceptance scenarios.
  - Verification: Follow `specs/028-eid-reward-audience-copy/quickstart.md` end to end.

- [X] T026 [US4] Add save error and validation display handling in `src/components/admin/eid-rewards/AdminEidRewardsClient.tsx`
  - Reason: Admin must know when audience or copy settings did not save.
  - Expected: Invalid role, duplicate user, missing text, unsupported placeholder, and API failure show clear errors without clearing the form.
  - Possible bugs: A failed save can leave UI looking saved.
  - Fix/Mitigation: Keep server response errors visible and only show success after a successful response.
  - Verification: Manual admin test with invalid placeholders and duplicate override.

## Final Phase: Polish And Verification

- [X] T027 Run focused test suite for Eid audience and popup copy
  - Reason: This proves the main behavior before builds.
  - Expected: Audience, popup copy, admin settings, status, and claim tests pass.
  - Possible bugs: Integration tests can fail due to local database setup.
  - Fix/Mitigation: If DB-backed tests are gated, run all available unit tests and document any skipped integration requirement.
  - Verification: `npx tsx --test tests/unit/eid-rewards-audience.test.ts tests/unit/eid-rewards-popup-copy.test.ts tests/integration/eid-rewards-audience-status.test.ts tests/integration/eid-rewards-audience-claim.test.ts tests/integration/eid-rewards-admin-settings.test.ts`.

- [X] T028 Run schema and generation checks
  - Reason: App and worker must agree on Prisma schema before deployment.
  - Expected: Prisma schema validates, client generates, and schema sync passes.
  - Possible bugs: Worker schema can drift from app schema.
  - Fix/Mitigation: Compare both schema files and rerun sync.
  - Verification: `npx prisma validate && npx prisma generate && node scripts/check-prisma-schema-sync.js`.

- [X] T029 Run production build checks
  - Reason: UI and API changes must compile in the production build.
  - Expected: Web and worker builds pass.
  - Possible bugs: Client/server imports can accidentally cross boundaries in popup text helpers.
  - Fix/Mitigation: Keep formatting helpers safe for both server and client, or split server-only validation from client rendering.
  - Verification: `npm run build && npm --prefix worker run build`.

- [X] T030 Run encoding and mojibake safety check on changed files
  - Reason: The repository has strict encoding rules and Arabic UI text is sensitive.
  - Expected: No new mojibake patterns are introduced by edited files.
  - Possible bugs: Editing Arabic strings with unsafe tooling can corrupt text.
  - Fix/Mitigation: Use `apply_patch` for manual edits and avoid full-file rewrites.
  - Verification: Build a read-only search pattern from the mojibake code points listed in `AGENTS.md`, run it against changed files, and inspect any intentional pre-existing matches.

- [X] T031 Prepare production deployment commands using migration deploy
  - Reason: Production has a live database and must not use schema push.
  - Expected: Deployment instructions use `git fetch`, intended branch checkout, `npm ci` if needed, `npx prisma migrate deploy`, `npx prisma generate`, stop web, remove `.next`, build, restart web and workers, and check logs.
  - Possible bugs: Building while `bein-web` serves the same `.next` can cause stale chunks.
  - Fix/Mitigation: Follow `AGENTS.md` production order exactly.
  - Verification: Compare final commands against `AGENTS.md` before sending them.

## Dependencies & Execution Order

- Phase 1 must run first.
- Phase 2 blocks all user stories.
- User Story 1 and User Story 3 can be implemented after Phase 2, but both touch the admin settings route and component, so coordinate file ownership.
- User Story 2 depends on the audience helper and schema changes.
- User Story 4 depends on admin UI changes.
- Final verification depends on selected story phases being complete.

## Parallel Opportunities

- T002 and T003 can run in parallel.
- T009, T014, T015, and T019 can be drafted in parallel after the schema plan is clear.
- T012 and T013 can be split only if one implementer owns role controls and another owns override controls in the same component carefully.
- T016 and T017 can be separate if one owns status and one owns claim.

## MVP

MVP is Phase 1, Phase 2, User Story 1, and User Story 2. User Story 3 is required for the full user request because it makes all popup text editable.
