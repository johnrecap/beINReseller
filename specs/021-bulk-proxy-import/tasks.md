# Tasks: Bulk Proxy Import

**Input**: Design documents from `specs/021-bulk-proxy-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature handles secrets and bulk record creation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the isolated parsing/import seam before touching the UI.

- [x] T001 Create failing parser tests in `tests/unit/proxy-bulk-import.test.ts`
  - Reason: Bulk parsing is the core risk and must be proven before implementation.
  - Expected: Tests cover valid Webshare rows, blank lines, invalid field counts, invalid ports, auth pair validation, and duplicate rows.
  - Possible bugs: Tests can miss whitespace and line-ending variations.
  - Fix/Mitigation: Include rows with extra spaces and mixed `\r\n`/`\n` style text.
  - Verification: `npx tsx --test tests/unit/proxy-bulk-import.test.ts` fails before implementation.

- [x] T002 Create `src/lib/proxies/bulk-import.ts`
  - Reason: Parser and classification logic need a shared testable home.
  - Expected: File exports parser/classifier helpers without DB writes.
  - Possible bugs: Logic can leak plaintext passwords through returned preview rows.
  - Fix/Mitigation: Return `hasPassword` for preview rows and keep plaintext only in server-internal parsed objects.
  - Verification: Unit tests pass after implementation.

---

## Phase 2: Foundational (Server Validation And Import Service)

**Purpose**: Add authoritative server-side validation and duplicate handling.

- [x] T003 Add label sequence helper tests in `tests/unit/proxy-bulk-import.test.ts`
  - Reason: Imported labels must continue from existing `بروكسي N` values.
  - Expected: Existing labels `بروكسي 1`, `بروكسي 3` produce next label `بروكسي 4`.
  - Possible bugs: Non-matching labels or Arabic spacing can affect numbering.
  - Fix/Mitigation: Match only exact prefix plus numeric suffix and ignore unrelated labels.
  - Verification: `npx tsx --test tests/unit/proxy-bulk-import.test.ts`.

- [x] T004 Implement label sequence and duplicate classification in `src/lib/proxies/bulk-import.ts`
  - Reason: API and UI summary depend on consistent classification.
  - Expected: Helpers return valid rows, invalid rows, duplicate rows, and assigned labels.
  - Possible bugs: Duplicate rows may consume labels even though they are skipped.
  - Fix/Mitigation: Assign labels only to valid non-duplicate rows.
  - Verification: Unit tests pass.

---

## Phase 3: User Story 1 - Paste Many Proxies At Once (Priority: P1) MVP

**Goal**: Admin can paste a bulk proxy list and save valid rows in one action.

**Independent Test**: Commit 50 valid rows and verify 50 proxies are created with encrypted passwords.

### Tests for User Story 1

- [x] T005 [P] [US1] Add API contract tests or route-level test coverage for bulk commit in `tests/unit/proxy-bulk-import.test.ts`
  - Reason: Commit mode must not behave like preview and must protect password output.
  - Expected: Expected response shape includes created proxies with `hasPassword`, not plaintext password.
  - Possible bugs: Tests may not exercise encryption because DB is mocked or omitted.
  - Fix/Mitigation: Assert import service passes passwords through encryption boundary in implementation review.
  - Verification: Unit/contract tests pass.

### Implementation for User Story 1

- [x] T006 [US1] Add admin import route in `src/app/api/admin/proxies/import/route.ts`
  - Reason: Existing `POST /api/admin/proxies` creates only one proxy.
  - Expected: New route accepts `mode`, `text`, `labelPrefix`, and `isActive`.
  - Possible bugs: Route might allow non-admin users or oversized payloads.
  - Fix/Mitigation: Reuse `requireRoleAPIWithMobile(request, 'ADMIN')` and enforce row limit.
  - Verification: Manual API call and build.

- [x] T007 [US1] Persist valid imported proxies in `src/app/api/admin/proxies/import/route.ts`
  - Reason: Bulk import must create records in the existing `proxies` table.
  - Expected: Valid non-duplicate rows are saved with encrypted passwords and active status.
  - Possible bugs: Race condition can hit unique `host + port` constraint.
  - Fix/Mitigation: Check duplicates before create and catch DB uniqueness errors gracefully.
  - Verification: Import sample rows and inspect API summary.

---

## Phase 4: User Story 2 - See Duplicates And Invalid Rows Before Saving (Priority: P2)

**Goal**: Admin sees a clear preview summary before committing.

**Independent Test**: Paste a mixed list and verify the preview separates valid, duplicate, and invalid rows.

### Implementation for User Story 2

- [x] T008 [P] [US2] Add import preview UI state to `src/app/dashboard/admin/proxies/page.tsx`
  - Reason: Admin needs to understand what will happen before saving.
  - Expected: Dialog shows textarea, preview button, summary counts, and example invalid rows.
  - Possible bugs: Large invalid lists can overwhelm the dialog.
  - Fix/Mitigation: Show a bounded preview sample with counts for the full result.
  - Verification: Manual UI test with mixed pasted rows.

- [x] T009 [US2] Wire preview action to `POST /api/admin/proxies/import` in `src/app/dashboard/admin/proxies/page.tsx`
  - Reason: Server validation must be authoritative.
  - Expected: Preview displays server results and disables commit when no valid rows exist.
  - Possible bugs: Client-side stale preview can be committed after text changes.
  - Fix/Mitigation: Clear preview when textarea or options change.
  - Verification: Change text after preview and confirm commit requires fresh preview or uses current text safely.

---

## Phase 5: User Story 3 - Auto-Name Imported Proxies Sequentially (Priority: P3)

**Goal**: Imported proxies receive readable labels automatically.

**Independent Test**: Import three rows after existing labels and verify numbering continues correctly.

### Implementation for User Story 3

- [x] T010 [US3] Display assigned labels in preview in `src/app/dashboard/admin/proxies/page.tsx`
  - Reason: Admin should know the names before saving.
  - Expected: Preview shows labels like `بروكسي 21`, `بروكسي 22`.
  - Possible bugs: UI can show labels that differ from commit result if new proxies are added between preview and commit.
  - Fix/Mitigation: Recalculate labels on commit and report final labels in the result.
  - Verification: Manual preview and import test.

- [x] T011 [US3] Refresh proxy table after successful import in `src/app/dashboard/admin/proxies/page.tsx`
  - Reason: Admin must immediately see created proxies.
  - Expected: Dialog closes or shows success, table reloads, and counts update.
  - Possible bugs: Dialog can leave stale pasted passwords in component state.
  - Fix/Mitigation: Clear textarea and preview state after success or dialog close.
  - Verification: Confirm pasted text is cleared after import.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T012 Add Arabic and English UI strings in `src/i18n/translations/ar.ts` and `src/i18n/translations/en.ts`
  - Reason: Page already uses translation objects.
  - Expected: Import dialog text is localized and no fallback English appears in Arabic mode.
  - Possible bugs: Translation object shape mismatch can break rendering.
  - Fix/Mitigation: Follow existing `adminProxies` nesting.
  - Verification: TypeScript and manual Arabic UI review.

- [x] T013 Run tests and TypeScript checks
  - Reason: Parser/API/UI changes can break build boundaries.
  - Expected: Relevant tests and type checks pass.
  - Possible bugs: Next route typing can pass unit tests but fail build.
  - Fix/Mitigation: Run build after unit tests.
  - Verification: `npx tsx --test tests/unit/proxy-bulk-import.test.ts`, `npx tsc --noEmit`, `npm run build`.

- [x] T014 Perform encoding and diff safety checks
  - Reason: Repository has strict encoding safety rules and Arabic labels are involved.
  - Expected: No mojibake and no whitespace errors.
  - Possible bugs: Arabic text can be corrupted by unsafe editing tools.
  - Fix/Mitigation: Use `apply_patch` and run checks.
  - Verification: `rg -n "â|Ã|Â" src/app/dashboard/admin/proxies src/lib/proxies tests/unit/proxy-bulk-import.test.ts specs/021-bulk-proxy-import` and `git diff --check`.

- [x] T015 Prepare deployment notes
  - Reason: Production has live Next.js and PM2 processes.
  - Expected: Final notes state no migration required and use safe `.next` build order from `AGENTS.md`.
  - Possible bugs: Running build while web is live can reintroduce chunk mismatch.
  - Fix/Mitigation: Include stop web, remove `.next`, build, restart web.
  - Verification: Compare commands with `AGENTS.md`.

---

## Dependencies

- Phase 1 before API/UI implementation.
- Phase 2 before commit mode.
- User Story 1 is MVP.
- User Story 2 depends on preview contract from Phase 2.
- User Story 3 depends on label helper from Phase 2.

## Parallel Opportunities

- T001 and T003 can be written together.
- T008 and T012 can run after route contract is stable if they touch different sections carefully.
- T013 and T014 are final verification tasks and should run after implementation.

## Implementation Strategy

1. Implement parser/classifier with tests first.
2. Add admin API preview/commit.
3. Add UI dialog on the existing proxy page.
4. Add translations and final verification.
