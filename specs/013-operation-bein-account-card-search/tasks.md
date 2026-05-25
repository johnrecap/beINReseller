# Tasks: Operation beIN Account Card Search

**Input**: Design documents from `specs/013-operation-bein-account-card-search/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required for filter parsing, ownership filtering, and audit conflict behavior because this feature affects financial evidence and operation discovery.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently after the shared foundation is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after dependencies are met.
- **[Story]**: Maps to user stories in `spec.md`.
- Every task includes reason, expected result, possible bugs, fix/mitigation, and verification.

---

## Phase 1: Setup

**Purpose**: Establish the implementation baseline and protect existing behavior before changing audit/search logic.

- [x] T001 Review active Speckit documents in `specs/013-operation-bein-account-card-search/`
  - Reason: The feature touches financial reporting, worker evidence, and user search. Implementation must follow the approved scope.
  - Expected: The implementer understands the source of truth, security limits, and verification requirements before editing.
  - Possible bugs: Starting from memory may produce a duplicate mapping table or expose beIN secrets.
  - Fix/Mitigation: Re-read `spec.md`, `plan.md`, `data-model.md`, and both contract files before editing.
  - Verification: Confirm all listed docs exist and contain no unresolved clarification markers.

- [x] T002 Run baseline verification commands from `specs/013-operation-bein-account-card-search/quickstart.md`
  - Reason: Baseline state distinguishes feature regressions from pre-existing failures.
  - Expected: `npm run build` and `npm run worker:build` baseline behavior is known; existing lint debt is recorded if still present.
  - Possible bugs: A pre-existing failure can be misattributed to this feature.
  - Fix/Mitigation: Save the failing command name and first actionable error before editing.
  - Verification: Run `npm run check:schema-sync`, `npx prisma generate`, `npm run build`, and `npm run worker:build`.

- [x] T003 Inspect current account-link and card-search paths in `worker/src/http-queue-processor.ts`, `worker/src/lib/bein-spend-ledger.ts`, `src/lib/bein-spend-ledger.ts`, and `src/app/api/operations/route.ts`
  - Reason: The code already has partial support for `beinAccountId`, `cardNumber`, and ledger evidence.
  - Expected: Implementation uses existing patterns instead of creating duplicate state.
  - Possible bugs: Missing one operation path, such as installment or signal, leaves inconsistent audit behavior.
  - Fix/Mitigation: Search for every `beinAccountId`, `recordConfirmedBeinSpend`, and `/api/operations` filter usage before editing.
  - Verification: `rg -n "beinAccountId|recordConfirmedBeinSpend|cardNumber" src worker/src prisma -S -g '!**/node_modules/**' -g '!**/dist/**'`.

---

## Phase 2: Foundational

**Purpose**: Add shared primitives that all stories need.

**Critical**: No user story work should start until the foundation is complete.

- [x] T004 Add card search index in `prisma/migrations/20260525130000_add_bein_spend_card_search_index/migration.sql`
  - Reason: Admin spend report searches the ledger table, not the operation table.
  - Expected: Ledger lookups by card snapshot and date range can use an index.
  - Possible bugs: Wrong index column order may not help date-filtered card searches.
  - Fix/Mitigation: Use `card_number_snapshot, charged_at` to prioritize card lookup then range filtering.
  - Verification: Migration contains `CREATE INDEX` for `bein_account_spend_ledger` on `card_number_snapshot` and `charged_at`.

- [x] T005 Mirror the new ledger index in `prisma/schema.prisma`
  - Reason: Prisma schema and migration must stay synchronized.
  - Expected: `BeinAccountSpendLedger` includes an index for `cardNumberSnapshot` and `chargedAt`.
  - Possible bugs: Using mapped database column names in the Prisma index can break schema validation.
  - Fix/Mitigation: Use Prisma field names in `@@index([cardNumberSnapshot, chargedAt])`.
  - Verification: `npm run check:schema-sync` passes after migration and schema updates.

- [x] T006 Add card normalization helper in `src/lib/bein-spend-ledger.ts`
  - Reason: Admin report summary and details must normalize card input identically.
  - Expected: A helper converts pasted card search input to digit-only search text and ignores empty input.
  - Possible bugs: Treating a non-digit string as a real filter can return no rows unexpectedly.
  - Fix/Mitigation: Return `undefined` when normalization leaves no digits.
  - Verification: Unit test in T007 covers spaces, dashes, empty strings, and plain digits.

- [x] T007 [P] Add filter parsing tests in `tests/unit/bein-spend-ledger-filters.test.ts`
  - Reason: Card filter parsing is shared by report summary and detail endpoints.
  - Expected: Tests fail before T006/T008 implementation and pass after.
  - Possible bugs: The test may import a function that is not exported yet.
  - Fix/Mitigation: Export only small pure helpers needed for testability; keep Prisma query execution in the existing module.
  - Verification: Run `npx tsx --test tests/unit/bein-spend-ledger-filters.test.ts`.

- [x] T008 Apply normalized `cardNumber` to ledger and review filters in `src/lib/bein-spend-ledger.ts`
  - Reason: Summary totals, grouped accounts, detail rows, and review counts must use the same search semantics.
  - Expected: `ledgerWhere` filters `cardNumberSnapshot`; `reviewWhere` filters `Operation.cardNumber`.
  - Possible bugs: Summary totals may differ from detail rows if only one query path gets the filter.
  - Fix/Mitigation: Add `cardNumber` to `BeinSpendReportFilters` and consume it in both where builders.
  - Verification: T007 passes and a manual query to both report endpoints with the same card returns consistent totals.

---

## Phase 3: User Story 1 - Audit the beIN Account Used By an Operation (Priority: P1)

**Goal**: New confirmed spend keeps a trustworthy beIN account link, and conflicts are surfaced for review.

**Independent Test**: Simulate matching and conflicting account evidence and verify operation/ledger behavior without relying on UI changes.

### Tests for User Story 1

- [x] T009 [P] [US1] Add ledger conflict tests in `tests/integration/operation-bein-account-link.test.ts`
  - Reason: A confirmed spend row with a different beIN account must not silently override audit evidence.
  - Expected: Tests cover matching account, missing operation account, and conflicting operation account.
  - Possible bugs: Integration tests may require database setup not available in all environments.
  - Fix/Mitigation: Follow existing integration-test skip pattern using `RUN_DB_INTEGRATION`.
  - Verification: Run with database enabled: `RUN_DB_INTEGRATION=1 npx tsx --test tests/integration/operation-bein-account-link.test.ts`.

- [x] T010 [P] [US1] Add operation detail redaction tests in `tests/unit/operation-detail-redaction.test.ts`
  - Reason: Account visibility must not expose sensitive response data or beIN credentials.
  - Expected: Tests prove session/cookie/ViewState-like keys are redacted and audit-safe account fields remain allowed.
  - Possible bugs: Tests may couple too tightly to route internals.
  - Fix/Mitigation: Extract or export a small redaction helper if needed instead of testing a full Next route.
  - Verification: `npx tsx --test tests/unit/operation-detail-redaction.test.ts`.

### Implementation for User Story 1

- [x] T011 [US1] Validate operation account consistency in `worker/src/lib/bein-spend-ledger.ts`
  - Reason: Current ledger creation records the charged account but must also check whether the operation already points to a different account.
  - Expected: Matching account proceeds; missing account can be filled safely; conflicting account returns or triggers review-required behavior.
  - Possible bugs: Updating a terminal completed operation to review could be too aggressive after confirmed success.
  - Fix/Mitigation: Only mark review when there is a real account conflict; preserve existing ledger row and include a clear response message.
  - Verification: T009 passes.

- [x] T012 [US1] Persist missing operation account link during confirmed ledger creation in `worker/src/lib/bein-spend-ledger.ts`
  - Reason: Some flows may have reliable ledger evidence even if `Operation.beinAccountId` is missing because of an earlier update race.
  - Expected: If operation has no beIN account but ledger evidence is confirmed, the operation receives the ledger account id.
  - Possible bugs: A broad update can overwrite a concurrently assigned account.
  - Fix/Mitigation: Use conditional update where `beinAccountId` is null and operation id matches.
  - Verification: T009 missing-account scenario passes and operation row stores the account id.

- [x] T013 [US1] Include audit-safe account fallback in `src/app/api/operations/[id]/route.ts`
  - Reason: Operation details currently prefer charged ledger evidence; admins also need the selected account when no confirmed ledger exists.
  - Expected: Admins see audit-safe account id, username, and label from ledger when available, otherwise from the operation account relation.
  - Possible bugs: Non-admin users may receive internal beIN account identity unnecessarily.
  - Fix/Mitigation: Return account fallback only for admins, while preserving existing charged ledger evidence behavior.
  - Verification: T010 passes and manual operation detail response contains no secret fields.

- [x] T014 [US1] Preserve existing audit snapshot fields in `worker/src/http-queue-processor.ts`
  - Reason: Confirmed and review flows already persist audit snapshots used by financial review and integrity checks.
  - Expected: New account-link behavior does not remove `chargedBeinLedgerId`, balance before/after, or outcome category snapshots.
  - Possible bugs: Replacing response data instead of merging can drop recovery/session-safe audit evidence.
  - Fix/Mitigation: Continue using existing merge helpers and only add account-link evidence when needed.
  - Verification: Existing recovery and payment classification tests still pass.

- [x] T015 [US1] Verify financial review still resolves account evidence in `src/lib/financial-review/evidence.ts`
  - Reason: Financial review uses ledger evidence and operation account fallback for decisions.
  - Expected: Review items still show the correct beIN account and debit source.
  - Possible bugs: A new fallback field can conflict with existing `chargedBeinSpendLedger` evidence.
  - Fix/Mitigation: Keep ledger evidence higher priority than operation account fallback.
  - Verification: Manual review of a `REVIEW_REQUIRED` operation with ledger evidence shows ledger account.

**Checkpoint**: User Story 1 is complete when matching/missing/conflicting account-link cases are tested and no operation response exposes secrets.

---

## Phase 4: User Story 2 - Search the beIN Spend Report By Card Number (Priority: P2)

**Goal**: Admins can search confirmed beIN spend by smart card number and see account identity in the report.

**Independent Test**: Search a known confirmed ledger card in the report and verify detail rows and grouped totals both match.

### Tests for User Story 2

- [x] T016 [P] [US2] Add report contract tests in `tests/unit/bein-spend-report-card-search.test.ts`
  - Reason: Summary and details must share the same card filter.
  - Expected: Tests cover card-only, card plus account, card plus type, and empty card searches.
  - Possible bugs: Tests may require Prisma mocking that is too complex.
  - Fix/Mitigation: Test pure where-builder output or extracted query builder functions rather than live database calls.
  - Verification: `npx tsx --test tests/unit/bein-spend-report-card-search.test.ts`.

### Implementation for User Story 2

- [x] T017 [US2] Extend report response types in `src/components/admin/reports/BeinSpendReportClient.tsx`
  - Reason: The UI must understand beIN account label/username and card-filtered rows.
  - Expected: Type definitions include all fields returned by the existing report endpoints plus any new display field.
  - Possible bugs: Type mismatch can compile locally but break runtime rendering if fields are optional.
  - Fix/Mitigation: Keep optional fields nullable and preserve existing response shape.
  - Verification: `npm run build` reaches type-check phase without report type errors.

- [x] T018 [US2] Add card number filter state and request parameter in `src/components/admin/reports/BeinSpendReportClient.tsx`
  - Reason: Admins need an input to search the report by card number.
  - Expected: `cardNumber` state resets page to 1 and is included in summary/detail request params when non-empty.
  - Possible bugs: Changing the filter while on page 20 can request an empty page.
  - Fix/Mitigation: Reset `page` to 1 whenever card number changes.
  - Verification: Browser network request includes `cardNumber=` after entering a card.

- [x] T019 [US2] Render card search input and account display in `src/components/admin/reports/BeinSpendReportClient.tsx`
  - Reason: The screenshot report currently has account id and user filters but no card-number search.
  - Expected: Admin sees a clear card input and detail rows include readable beIN account identity.
  - Possible bugs: The filter grid can overflow or become hard to use on small widths.
  - Fix/Mitigation: Use existing responsive grid patterns and avoid long placeholder text.
  - Verification: Manual desktop and mobile-width browser check shows no overlapping controls.

- [x] T020 [US2] Ensure summary endpoint accepts card filter in `src/app/api/admin/reports/bein-spend/route.ts`
  - Reason: Summary totals must reflect card-number filtering.
  - Expected: Endpoint uses parsed filters with `cardNumber` and returns filtered totals.
  - Possible bugs: Endpoint can ignore card filter if parsing happens only in detail endpoint.
  - Fix/Mitigation: Keep both endpoints using `parseBeinSpendReportFilters`.
  - Verification: API call to summary with known card returns lower or equal totals than no-card query.

- [x] T021 [US2] Ensure detail endpoint accepts card filter in `src/app/api/admin/reports/bein-spend/operations/route.ts`
  - Reason: The report table must show only matching card rows.
  - Expected: Endpoint uses the same parsed `cardNumber` filter and pagination still works.
  - Possible bugs: Total count can ignore filter while items apply it.
  - Fix/Mitigation: Use the same `where` object for `findMany` and `count`.
  - Verification: Detail endpoint with `cardNumber` returns `total` equal to matching row count for the selected range.

- [x] T022 [US2] Add report empty/error state validation in `src/components/admin/reports/BeinSpendReportClient.tsx`
  - Reason: No-match searches should be understandable instead of appearing broken.
  - Expected: Existing empty rows remain clear when card search returns no rows.
  - Possible bugs: Summary cards can still show stale previous totals after a failed request.
  - Fix/Mitigation: Keep error handling and state update order so failures do not replace valid data silently.
  - Verification: Search a nonexistent card and confirm rows are empty with totals at 0 for the filtered request.

**Checkpoint**: User Story 2 is complete when admin report summary and detail rows both filter by card and show readable beIN account identity.

---

## Phase 5: User Story 3 - Search Operation History By Card Number (Priority: P3)

**Goal**: Users can search their own operation history by card number without leaking other users' operations.

**Independent Test**: A user with operations for multiple cards searches one card and only receives their own matching operations.

### Tests for User Story 3

- [x] T023 [P] [US3] Add operation history filter tests in `tests/unit/operation-card-search-filter.test.ts`
  - Reason: Ownership and card filtering must be preserved together.
  - Expected: Tests prove the generated where clause includes both `userId` and normalized `cardNumber`.
  - Possible bugs: Route code may not expose a pure helper for testing.
  - Fix/Mitigation: Extract a small helper that builds the operation `where` input from session and query params.
  - Verification: `npx tsx --test tests/unit/operation-card-search-filter.test.ts`.

### Implementation for User Story 3

- [x] T024 [US3] Extract operation list filter builder in `src/app/api/operations/route.ts`
  - Reason: The current route builds filters inline, making ownership/card search easy to regress.
  - Expected: A small helper builds the `where` input and remains easy to unit test.
  - Possible bugs: Extracting can accidentally change existing type/status/date behavior.
  - Fix/Mitigation: Keep current filter order and add tests for existing type/status/date behavior along with card search.
  - Verification: T023 passes.

- [x] T025 [US3] Add card-number query support in `src/app/api/operations/route.ts`
  - Reason: History UI needs server-side filtering by card number.
  - Expected: `cardNumber` query filters the authenticated user's operations by normalized card digits.
  - Possible bugs: Partial contains search may return too many cards if the user enters only a few digits.
  - Fix/Mitigation: Require a reasonable minimum normalized length before applying contains; otherwise ignore or return validation error according to implementation decision.
  - Verification: T023 includes short/empty card input behavior.

- [x] T026 [US3] Add card number to filter state in `src/components/history/HistoryFilters.tsx`
  - Reason: Users need a visible input for card-number history search.
  - Expected: `FilterValues` includes `cardNumber`, reset clears it, and submit sends it to parent.
  - Possible bugs: Reset may clear UI state but not parent filter state.
  - Fix/Mitigation: Update `initialFilters` and `handleReset` together.
  - Verification: Reset button clears the card input and reloads unfiltered history.

- [x] T027 [US3] Send card number query from `src/components/history/HistoryPageClient.tsx`
  - Reason: UI filter state must reach the `/api/operations` endpoint.
  - Expected: `cardNumber` is appended to URLSearchParams when non-empty.
  - Possible bugs: Changing card search may leave the user on an out-of-range page.
  - Fix/Mitigation: Existing `handleFilter` page reset must remain in place.
  - Verification: Browser network request includes `cardNumber=` after searching history.

- [x] T028 [US3] Preserve history table rendering in `src/components/history/OperationsTable.tsx`
  - Reason: Search should not require changing table semantics, but table rendering must still handle empty filtered results.
  - Expected: Existing table and mobile cards render filtered operations and empty state correctly.
  - Possible bugs: Pagination copy can be misleading when filtered results are fewer than a page.
  - Fix/Mitigation: Verify page/totalPages response drives existing pagination correctly.
  - Verification: Manual search for a card with one result shows page 1 of 1 and no stale rows.

**Checkpoint**: User Story 3 is complete when history card search works for the current user and cannot return another user's operations.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the feature end to end and document any remaining operational risks.

- [x] T029 [P] Update implementation notes in `specs/013-operation-bein-account-card-search/quickstart.md`
  - Reason: The quickstart should reflect any exact command or test name introduced during implementation.
  - Expected: A future agent can verify this feature without rediscovering commands.
  - Possible bugs: Documentation can drift if test file names change.
  - Fix/Mitigation: Update quickstart after test files are finalized.
  - Verification: Every command in quickstart exists or is clearly marked optional.

- [x] T030 Run Prisma verification for `prisma/schema.prisma`
  - Reason: Schema and migration drift breaks both app and worker builds.
  - Expected: Prisma client generation succeeds from the updated schema.
  - Possible bugs: Worker schema copy can lag behind root schema.
  - Fix/Mitigation: Run the existing schema sync command before builds.
  - Verification: `npm run check:schema-sync` and `npx prisma generate`.

- [x] T031 Run app build for `src/`
  - Reason: Report/history UI and route type changes must compile.
  - Expected: `next build` succeeds.
  - Possible bugs: Client component type changes may fail only during production build.
  - Fix/Mitigation: Run production build, not only TypeScript snippets.
  - Verification: `npm run build`.

- [x] T032 Run worker build for `worker/src/`
  - Reason: Worker ledger and account-link changes are TypeScript compiled separately.
  - Expected: Worker TypeScript build succeeds after root schema sync.
  - Possible bugs: Worker imports or Prisma types can differ from app assumptions.
  - Fix/Mitigation: Use existing `npm run worker:build`, which copies schema and generates worker Prisma client.
  - Verification: `npm run worker:build`.

- [x] T033 Run focused tests for `tests/unit/` and `tests/integration/`
  - Reason: The feature's risky behavior is protected by new tests.
  - Expected: All new tests pass; DB integration tests skip cleanly when database env is absent.
  - Possible bugs: Integration tests can fail because the local database is unavailable.
  - Fix/Mitigation: Use the repository's skip pattern for DB tests and report skipped status separately.
  - Verification: Run each new `npx tsx --test ...` command from this tasks file.

- [x] T034 Check changed files for mojibake and whitespace issues
  - Reason: Repository instructions require encoding safety after edits.
  - Expected: No new mojibake patterns or whitespace errors are introduced.
  - Possible bugs: Existing files may already contain mojibake, making the scan noisy.
  - Fix/Mitigation: Compare scan results to touched lines and only attribute newly introduced patterns to this feature.
  - Verification: `git diff --check`; then run `$pattern=([char]0x00E2)+'|'+([char]0x00EF)+'|'+([char]0x00C3)+'|'+([char]0x00C2); rg -n $pattern prisma src worker tests specs .specify AGENTS.md -g '!*.lock'`.

- [x] T035 Report known lint status from `package.json`
  - Reason: CI includes lint, but the repository currently has unrelated lint debt.
  - Expected: Final implementation report clearly states whether `npm run lint` passed or failed and whether failures are pre-existing.
  - Possible bugs: Feature may add new lint errors that get hidden among existing ones.
  - Fix/Mitigation: Review lint output for files touched by this feature.
  - Verification: `npm run lint`.

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1): no dependencies.
- Foundational (Phase 2): depends on Setup.
- User Story 1 (Phase 3): depends on Foundational.
- User Story 2 (Phase 4): depends on Foundational; can run after US1 tests are underway, but final verification should include US1.
- User Story 3 (Phase 5): depends on Foundational; independent from US2 after the operation filter helper exists.
- Polish (Phase 6): depends on the desired user stories being complete.

### User Story Dependencies

- **US1**: Highest priority. Confirms data integrity before relying on reports.
- **US2**: Depends on shared report filter parsing and ledger index.
- **US3**: Depends on card normalization pattern and operation route filter extraction.

### Within Each User Story

- Write tests first where listed.
- Run tests and confirm they fail for the missing behavior.
- Implement the smallest code change to pass.
- Re-run focused tests.
- Run build verification before final completion.

## Parallel Opportunities

- T007, T009, T010, T016, and T023 can be drafted in parallel after the relevant helper boundaries are known.
- UI work in T017-T019 can run in parallel with endpoint work T020-T021 after filter contracts are settled.
- History UI work T026-T028 can run in parallel with admin report UI work after server filter semantics are stable.
- Final documentation T029 can run while verification commands T030-T033 run.

## Parallel Example: User Story 2

```text
Task: "Add report contract tests in tests/unit/bein-spend-report-card-search.test.ts"
Task: "Extend report response types in src/components/admin/reports/BeinSpendReportClient.tsx"
Task: "Ensure summary endpoint accepts card filter in src/app/api/admin/reports/bein-spend/route.ts"
Task: "Ensure detail endpoint accepts card filter in src/app/api/admin/reports/bein-spend/operations/route.ts"
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational tasks.
2. Complete US1 so the account link is trustworthy.
3. Stop and verify account-link tests and worker build.

### Incremental Delivery

1. Deliver US1: reliable account link and audit-safe operation detail.
2. Deliver US2: admin beIN Spend Report card search.
3. Deliver US3: user operation history card search.
4. Complete Polish verification and document lint status.

### Safety Rule

Do not use card search results as confirmed financial spend unless the row comes from confirmed ledger evidence. Operation history can locate all states, but only ledger rows count as confirmed beIN spend.
