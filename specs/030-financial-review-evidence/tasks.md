# Tasks: Financial Review Evidence Provenance

**Input**: Design documents from `specs/030-financial-review-evidence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature changes refund/no-refund safety and provider spend evidence.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Evidence Safety Test Harness)

**Purpose**: Lock the known bug and safety decisions into tests before changing production behavior.

- [x] T001 [P] Add final-pay evidence tests in `tests/unit/worker-final-pay-evidence.test.ts`
  - Reason: The root bug is stale package-load balance being promoted to confirmed final-payment evidence.
  - Expected: Tests cover confirmed final before/after, missing final before with package-load fallback, and missing final after.
  - Possible bugs: Tests may accidentally assert current broken fallback behavior.
  - Fix/Mitigation: Fixture names must distinguish final-pay balances from package-load diagnostic balances.
  - Verification: `npx tsx --test tests/unit/worker-final-pay-evidence.test.ts` fails before implementation and passes after T007-T010.

- [x] T002 [P] Add financial review evidence builder tests in `tests/unit/financial-review-evidence-provenance.test.ts`
  - Reason: The review screen must not display untrusted provider debit as confirmed.
  - Expected: Tests cover confirmed-final-pay, incomplete-evidence, legacy-unverified, manual-verified-paid, and manual-verified-not-paid states.
  - Possible bugs: Evidence builder may still prefer old ledger values before checking provenance.
  - Fix/Mitigation: Include a legacy ledger fixture with inflated spendAmount and missing final-pay provenance.
  - Verification: `npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts`.

- [x] T003 [P] Add decision API safety tests in `tests/unit/financial-review-decision-safety.test.ts`
  - Reason: Refund/no-refund rules must reject missing, old, fallback, and conflicting evidence unless manual verification exists.
  - Expected: Tests prove no-refund, refund, keep-under-review, and conflict behavior.
  - Possible bugs: Tests may conflate payment status with card renewal status.
  - Fix/Mitigation: Use separate fixture fields for paymentStatus, cardRenewed, action, and actualBeinDebitAmount.
  - Verification: `npx tsx --test tests/unit/financial-review-decision-safety.test.ts`.

- [x] T004 [P] Add admin decision integration tests in `tests/integration/admin-financial-review-decisions.test.ts`
  - Reason: Button defaults and append-only decision history must work through the real API.
  - Expected: No-refund stores `تم تأكيد الدفع`, refund stores `لم يتم تأكيد الدفع`, and optional notes append without deleting older decisions.
  - Possible bugs: Integration fixtures can leave refunds or transactions behind.
  - Fix/Mitigation: Use generated operation ids/users and clean up only those rows.
  - Verification: `npx tsx --test tests/integration/admin-financial-review-decisions.test.ts`.

---

## Phase 2: Foundational (Shared Evidence Types And Helpers)

**Purpose**: Create a single evidence vocabulary used by the worker, API, and UI.

- [x] T005 Create evidence provenance types in `src/lib/financial-review/types.ts`
  - Reason: UI/API decisions need stable values for confirmed, incomplete, legacy, manual, and conflict states.
  - Expected: Types include provider evidence state, evidence source, manual decision metadata, and legacy classification shape.
  - Possible bugs: Changing existing exported types can break current financial review callers.
  - Fix/Mitigation: Add fields as backward-compatible optional fields first, then tighten where tests require.
  - Verification: `npm run build` type-checks all imports after implementation.

- [x] T006 [P] Add evidence classification helper in `src/lib/financial-review/evidence-provenance.ts`
  - Reason: Evidence trust rules should be tested independently from the route and UI.
  - Expected: Helper classifies final-pay evidence, package-load diagnostics, legacy rows, manual verification, and conflicts.
  - Possible bugs: Helper may treat missing evidence as no charge.
  - Fix/Mitigation: Explicitly return `incomplete-evidence` for missing final before/after unless manual verification exists.
  - Verification: `npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts`.

- [x] T007 [P] Add manual decision metadata helper in `src/lib/financial-review/manual-decisions.ts`
  - Reason: Decision history must be append-only and avoid overwriting previous review metadata.
  - Expected: Helper appends no-refund/refund/keep-review records with default payment status and optional note.
  - Possible bugs: Helper may store button defaults as provider evidence.
  - Fix/Mitigation: Store defaults under admin decision/conclusion fields, not provider evidence fields.
  - Verification: `npx tsx --test tests/unit/financial-review-decision-safety.test.ts`.

---

## Phase 3: User Story 1 - Show Only Trusted beIN Debit Evidence (Priority: P1) MVP

**Goal**: Stop inflated provider spend display by preventing fallback balances from becoming confirmed beIN debit.

**Independent Test**: Missing final before-balance plus old package-load balance shows incomplete evidence, not confirmed beIN debit.

### Tests for User Story 1

- [x] T008 [P] [US1] Add regression fixture for stale package-load fallback in `tests/unit/worker-final-pay-evidence.test.ts`
  - Reason: This is the exact bug reported by the user after manual beIN verification.
  - Expected: Fixture proves no confirmed ledger/evidence is produced from package-load fallback.
  - Possible bugs: Fixture may not mirror worker responseData shape.
  - Fix/Mitigation: Use real keys from `worker/src/http-queue-processor.ts`: dealerBalance, dealerBalanceBefore, finalPaySubmitted, expectedCost.
  - Verification: `npx tsx --test tests/unit/worker-final-pay-evidence.test.ts`.

### Implementation for User Story 1

- [x] T009 [US1] Stop fallback promotion in `worker/src/http-queue-processor.ts`
  - Reason: `rawResult.beinBalanceBefore ?? preFinalBeinBalance` can turn stale package-load balance into confirmed provider debit.
  - Expected: `result.beinBalanceBefore` remains missing when the final payment flow did not read it.
  - Possible bugs: Existing success path may lose diagnostic balance visibility.
  - Fix/Mitigation: Preserve diagnostic package-load balance under a separate source-labeled responseData field.
  - Verification: `npx tsx --test tests/unit/worker-final-pay-evidence.test.ts`.

- [x] T010 [US1] Add source labels for renewal balance evidence in `worker/src/http-queue-processor.ts`
  - Reason: Review needs to know whether before/after balances came from final payment or diagnostics.
  - Expected: Response audit data includes final before/after sources and diagnostic package-load balance source separately.
  - Possible bugs: Source labels may be omitted on error/review paths.
  - Fix/Mitigation: Populate labels in success, review-required, and failed/refund-safe branches.
  - Verification: Inspect responseData in `tests/unit/worker-final-pay-evidence.test.ts`.

- [x] T011 [US1] Gate confirmed ledger creation in `worker/src/lib/bein-spend-ledger.ts`
  - Reason: Ledger rows currently look confirmed even when the before value may be fallback-derived.
  - Expected: Confirmed spend rows are created only with final-payment before/after source and matching context.
  - Possible bugs: Legitimate rows may not be recorded if source labels are missing during transition.
  - Fix/Mitigation: Treat missing source as unconfirmed for new rows; keep old rows visible as legacy-unverified.
  - Verification: `npx tsx --test tests/unit/worker-final-pay-evidence.test.ts`.

- [x] T012 [US1] Update audit snapshot construction in `worker/src/http-queue-processor.ts`
  - Reason: `auditSnapshot.beinDelta` must not be calculated from untrusted before/after values.
  - Expected: Audit delta is null/incomplete when final before or after source is missing; diagnostic balances remain separate.
  - Possible bugs: Card verification and integrity reports may expect a numeric delta.
  - Fix/Mitigation: Update downstream classification to use provider evidence state instead of assuming numeric delta.
  - Verification: `npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts`.

- [x] T013 [US1] Update financial review evidence builder in `src/lib/financial-review/evidence.ts`
  - Reason: Review currently prefers ledger spendAmount or audit delta without enough provenance.
  - Expected: `beinDebitConfirmed` is true only for confirmed final-pay evidence or manual verified amount.
  - Possible bugs: Old confirmed rows may disappear without explanation.
  - Fix/Mitigation: Expose old stored values as `legacyStoredBeinDebitAmount` and provider state `legacy-unverified`.
  - Verification: `npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts`.

- [x] T014 [US1] Update financial review UI labels in `src/components/admin/financial-review/FinancialReviewClient.tsx`
  - Reason: Admins need plain labels that say whether beIN debit is confirmed, incomplete, old, or manual.
  - Expected: UI shows `خصم العميل من النظام`, `خصم beIN المؤكد`, and warnings for incomplete/legacy values.
  - Possible bugs: Arabic text can overflow buttons/cards or mojibake can be introduced.
  - Fix/Mitigation: Keep labels concise, test desktop width, and run mojibake scan on changed files.
  - Verification: Manual UI check plus `rg -n "â|Ã|Â|ï؟½" src/components/admin/financial-review`.

---

## Phase 4: User Story 2 - Record Manual Admin Decisions Safely (Priority: P1)

**Goal**: Record admin conclusions with optional notes and append-only history without overwriting provider evidence.

**Independent Test**: Save no-refund/refund/keep-review decisions and verify stored metadata after reload.

### Tests for User Story 2

- [x] T015 [P] [US2] Add append-only decision tests in `tests/unit/financial-review-decision-safety.test.ts`
  - Reason: A mutable single decision object can erase previous audit context.
  - Expected: Multiple decisions append in order and preserve who/when/status/note fields.
  - Possible bugs: Tests may assert exact timestamps.
  - Fix/Mitigation: Assert timestamp existence and parseability, not exact clock value.
  - Verification: `npx tsx --test tests/unit/financial-review-decision-safety.test.ts`.

### Implementation for User Story 2

- [x] T016 [US2] Update decision API request handling in `src/app/api/admin/financial-review/[operationId]/decision/route.ts`
  - Reason: API must accept optional note/manual verification and apply button default payment statuses.
  - Expected: No-refund records `تم تأكيد الدفع`, refund records `لم يتم تأكيد الدفع`, keep-review records no forced status.
  - Possible bugs: Payment status may be confused with provider evidence.
  - Fix/Mitigation: Store under admin decision metadata, separate from provider evidence.
  - Verification: `npx tsx --test tests/integration/admin-financial-review-decisions.test.ts`.

- [x] T017 [US2] Add optional note input to `src/components/admin/financial-review/FinancialReviewClient.tsx`
  - Reason: User requested optional note beside decision input.
  - Expected: Admin can enter or omit a note; note is submitted with the clicked decision.
  - Possible bugs: One card's note may leak into another card's decision.
  - Fix/Mitigation: Store note state by operation id or inside each card component.
  - Verification: Manual UI flow with two review cards open.

- [x] T018 [US2] Persist manual verification metadata in `src/lib/financial-review/evidence.ts`
  - Reason: Reloaded review cards need to show manual verification history and current conclusion.
  - Expected: Evidence builder exposes latest manual verification and decision history.
  - Possible bugs: Existing responseData without financialReview metadata may throw parse errors.
  - Fix/Mitigation: Default to empty history when metadata is absent or malformed.
  - Verification: `npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts`.

---

## Phase 5: User Story 3 - Enforce Safe Refund And No-Refund Decisions (Priority: P1)

**Goal**: Prevent false refunds and false no-refunds when evidence is missing, legacy, or conflicting.

**Independent Test**: Decision API rejects unsafe actions until trusted evidence or explicit manual verification is present.

### Tests for User Story 3

- [x] T019 [P] [US3] Add unsafe decision rejection cases in `tests/unit/financial-review-decision-safety.test.ts`
  - Reason: Missing evidence must stay review; it is not proof of no charge or proof of charge.
  - Expected: Refund/no-refund are blocked for incomplete and legacy-unverified rows without manual verification.
  - Possible bugs: Tests may not cover conflict state.
  - Fix/Mitigation: Include provider-charge-confirmed plus card-not-renewed fixture.
  - Verification: `npx tsx --test tests/unit/financial-review-decision-safety.test.ts`.

### Implementation for User Story 3

- [x] T020 [US3] Implement decision guards in `src/app/api/admin/financial-review/[operationId]/decision/route.ts`
  - Reason: UI warnings are not enough; API must enforce financial safety.
  - Expected: No-refund requires confirmed renewal/service outcome; refund requires no trusted provider charge plus no-renewal proof.
  - Possible bugs: Existing confirmed final-pay rows may be blocked if evidence builder does not expose state correctly.
  - Fix/Mitigation: Use the shared evidence classifier and add fixtures for confirmed legacy-compatible rows.
  - Verification: `npx tsx --test tests/unit/financial-review-decision-safety.test.ts`.

- [x] T021 [US3] Add conflict state handling in `src/lib/financial-review/evidence.ts`
  - Reason: Provider charged but card not renewed is not automatic refund or no-refund.
  - Expected: Conflict rows remain under review and show a clear warning.
  - Possible bugs: Conflict may hide available refund/no-refund actions entirely without explanation.
  - Fix/Mitigation: UI warning should explain that manual escalation is required.
  - Verification: Manual UI review with conflict fixture.

- [x] T022 [US3] Rename stored evidence check in `src/components/admin/financial-review/FinancialReviewClient.tsx`
  - Reason: Current "check card now" wording implies a live provider check when it is stored-evidence-only.
  - Expected: Button and result copy say stored evidence review unless live check is implemented.
  - Possible bugs: Admins may lose a familiar action label.
  - Fix/Mitigation: Use clear Arabic text: `فحص الأدلة المسجلة`.
  - Verification: Manual UI check and Arabic label regression.

- [x] T023 [US3] Update verify-card copy in `src/app/api/admin/financial-review/[operationId]/verify-card/route.ts`
  - Reason: API response should not claim a live beIN check when it reviewed stored evidence.
  - Expected: Response outcome and summary clearly say stored evidence only.
  - Possible bugs: Existing UI may expect old outcome enum values.
  - Fix/Mitigation: Preserve old fields where needed and add new source/label fields.
  - Verification: `npx tsx --test tests/integration/admin-financial-review-decisions.test.ts`.

---

## Phase 6: User Story 4 - Preserve And Reclassify Legacy Review Rows (Priority: P2)

**Goal**: Make old suspicious records safe to review without deleting history.

**Independent Test**: A suspect old row becomes legacy-unverified while original stored values remain visible.

- [x] T024 [P] [US4] Add legacy classification tests in `tests/unit/financial-review-evidence-provenance.test.ts`
  - Reason: Old inflated values must not be trusted but must remain auditable.
  - Expected: Legacy row with no final-pay provenance and inflated debit returns legacy-unverified state.
  - Possible bugs: Confirmed old rows with valid evidence may be downgraded incorrectly.
  - Fix/Mitigation: Add a valid old final-pay fixture if provenance exists.
  - Verification: `npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts`.

- [x] T025 [US4] Add non-destructive legacy reclassification helper in `src/lib/financial-review/evidence-provenance.ts`
  - Reason: Presentation and optional repair action need the same suspect-row logic.
  - Expected: Helper returns legacy-unverified metadata without mutating original ledger/audit values.
  - Possible bugs: Helper may classify every mismatch as legacy even when final-pay evidence confirms a true mismatch.
  - Fix/Mitigation: Require missing provenance before legacy downgrade.
  - Verification: `npx tsx --test tests/unit/financial-review-evidence-provenance.test.ts`.

- [x] T026 [US4] Surface original old values in `src/components/admin/financial-review/FinancialReviewClient.tsx`
  - Reason: Admins need audit visibility while understanding the value is not trusted.
  - Expected: UI shows old stored value with `المبلغ القديم ظاهر للمراجعة فقط، وليس خصما مؤكدا من beIN`.
  - Possible bugs: Displaying both old and trusted values can confuse admins.
  - Fix/Mitigation: Group old value under a warning block, not beside confirmed beIN debit.
  - Verification: Manual UI check with legacy fixture.

---

## Phase 7: User Story 5 - Keep Related Flows Explicitly Bounded (Priority: P3)

**Goal**: Prevent future diagnostic context leaks and document/install small related protections.

**Independent Test**: Diagnostic balances cannot survive account/card/package context changes as trusted evidence.

- [x] T027 [US5] Bind diagnostic balances to account/card/package context in `worker/src/http-queue-processor.ts`
  - Reason: Account retry can make package-load diagnostics stale even if they are no longer trusted spend.
  - Expected: Diagnostic balance metadata includes account, card, package, stage, and is discarded/marked diagnostic when context changes.
  - Possible bugs: Context metadata may include sensitive session data accidentally.
  - Fix/Mitigation: Store only ids, labels, card number already used in operation audit, package name/price, and stage; never store cookies/ViewState.
  - Verification: Inspect responseData fixture in `tests/unit/worker-final-pay-evidence.test.ts`.

- [x] T028 [US5] Apply or document installment source behavior in `worker/src/http-queue-processor.ts`
  - Reason: Installment has a similar fallback risk and should not silently diverge.
  - Expected: Installment either gets the same source labels or the quickstart/release notes explicitly mark it deferred.
  - Possible bugs: Broad installment changes may delay the renewal fix.
  - Fix/Mitigation: Implement labels only if local change is small; otherwise add a visible deferred-risk note and test TODO.
  - Verification: `npm --prefix worker run build` and quickstart review.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T029 [P] Update quickstart validation notes in `specs/030-financial-review-evidence/quickstart.md`
  - Reason: Operators need exact checks for incomplete, legacy, manual, and conflict states.
  - Expected: Quickstart reflects implemented tests and any deferred installment/live-check scope.
  - Possible bugs: Documentation can drift from actual labels.
  - Fix/Mitigation: Update after UI labels are finalized.
  - Verification: Manual review of quickstart against UI.

- [x] T030 Run schema, build, and mojibake verification for changed files
  - Reason: This feature touches TypeScript, Arabic UI strings, worker code, and possibly Prisma schema.
  - Expected: Validation commands pass and no new mojibake patterns are introduced.
  - Possible bugs: Existing repository mojibake can make scans noisy.
  - Fix/Mitigation: Scope scan to changed files when needed.
  - Verification: `npx prisma validate`, `npm run build`, `npm --prefix worker run build`, and scoped `rg -n "â|Ã|Â|ï؟½" <changed-files>`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies and should run first.
- **Foundational (Phase 2)**: Depends on setup test scaffolding and blocks user stories.
- **US1 (Phase 3)**: MVP and highest priority; blocks safe UI/API interpretation.
- **US2 (Phase 4)**: Can start after foundational helpers but should integrate with US1 evidence states.
- **US3 (Phase 5)**: Depends on US1/US2 states and manual metadata.
- **US4 (Phase 6)**: Depends on evidence builder and legacy classifier.
- **US5 (Phase 7)**: Can run after US1 worker changes.
- **Polish**: Runs after selected stories are complete.

### User Story Dependencies

- **US1**: Required first. It prevents new inflated evidence.
- **US2**: Can run after foundational helpers; records admin conclusions.
- **US3**: Depends on US1 and US2 to enforce decisions.
- **US4**: Depends on US1 classifier and display model.
- **US5**: Related hardening; can proceed in parallel after worker source labels exist.

## Parallel Opportunities

- T001-T004 can be written in parallel.
- T005-T007 can be implemented in parallel after tests exist.
- T014, T017, and T022 touch the same UI file and should be sequenced or coordinated.
- Worker tasks T009-T012 and UI/API tasks T016-T023 can be split between agents after shared types are ready.

## Implementation Strategy

### MVP First

1. Complete Phase 1 tests.
2. Complete Phase 2 helpers.
3. Complete US1 evidence capture and display.
4. Validate that stale package-load balances no longer create confirmed beIN debit.

### Incremental Delivery

1. US1 prevents new bad evidence.
2. US2 records admin decisions safely.
3. US3 enforces API safety.
4. US4 handles old rows.
5. US5 applies bounded related hardening.
