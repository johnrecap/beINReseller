# Tasks: Credit Request Notification Handoff

**Input**: Design documents from `specs/022-credit-notification-handoff/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required. This feature touches customer credit request approval UX, Telegram provider secrets, notification logs, and manual WhatsApp handoff.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Tests And Safety)

**Purpose**: Add test coverage around notification text, privacy, and handoff behavior before changing UI or flow.

- [ ] T001 Create Telegram notification formatting and privacy tests in `tests/unit/credit-request-notifications.test.ts`
  - Reason: Telegram alert content and secret handling are easy to regress while changing the settings flow.
  - Expected: Tests cover required request message fields, disabled/missing settings result summaries, and no raw Telegram secret in returned settings-shaped objects.
  - Possible bugs: Tests can become too coupled to exact punctuation instead of required message fields.
  - Fix/Mitigation: Assert required field labels and values are present without requiring every character to match.
  - Verification: `npx tsx --test tests/unit/credit-request-notifications.test.ts` fails before implementation.

- [ ] T002 Extend WhatsApp handoff tests in `tests/unit/credit-request-whatsapp-handoff.test.ts`
  - Reason: Destination priority and unsafe URL handling must stay correct while approval handoff UI changes.
  - Expected: Tests cover agent-owned request URL snapshot priority, current-assignment/agent/global URL fallback, admin-owned global-only fallback, historical null Source Group remaining null, invalid URL rejection, valid phone fallback, and message required fields.
  - Possible bugs: Mock data may not match real nullable values from current records.
  - Fix/Mitigation: Include null/empty string cases in the test mocks.
  - Verification: `npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts` fails for newly added expectations before implementation.

---

## Phase 2: Foundational (Notification Helpers And Contracts)

**Purpose**: Create clear, reusable behavior for settings privacy, message text, and handoff results before UI changes.

- [ ] T003 Add notification settings normalization helpers in `src/lib/credit-requests/notifications.ts`
  - Reason: The settings route, Telegram sender, and tests need one source of truth for keeping, replacing, clearing, masking, and reading the Telegram secret.
  - Expected: Helpers preserve existing saved values, hide raw secrets in responses, and support future-safe encrypted values without exposing them.
  - Possible bugs: Existing saved Telegram secret can stop working if read/keep logic changes incorrectly.
  - Fix/Mitigation: Keep backward-compatible handling for current saved values and add tests for keeping an existing saved secret.
  - Verification: `npx tsx --test tests/unit/credit-request-notifications.test.ts`.

- [ ] T004 Update Telegram message formatting in `src/lib/credit-requests/telegram.ts`
  - Reason: The admin alert must clearly identify who requested credit and what needs review.
  - Expected: Message includes customer username, amount, payment method, request-time agent/group snapshots when available, order number, and pending status; it omits Group for null/blank and never reads a later assignment label.
  - Possible bugs: Message text can omit a required field or include undefined/null labels.
  - Fix/Mitigation: Use safe fallbacks for optional agent/group values and test all required fields.
  - Verification: `npx tsx --test tests/unit/credit-request-notifications.test.ts`.

- [ ] T005 Update WhatsApp approval message builder in `src/lib/credit-requests/whatsapp-handoff.ts`
  - Reason: The copied message must be useful to paste/send without editing after approval.
  - Expected: Message includes customer username, approved amount, order number, and approval date with no extra technical wording.
  - Possible bugs: Date formatting or amount text can be unclear for admins or customers.
  - Fix/Mitigation: Keep the current Cairo-time approval date behavior and assert key fields in tests.
  - Verification: `npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts`.

---

## Phase 3: User Story 1 - Understand And Save Notification Settings (Priority: P1) MVP

**Goal**: Admin can understand the settings block and save/test notification settings without technical confusion.

**Independent Test**: Open `/dashboard/admin/settings`, understand both sections in Arabic, save values, test Telegram, and confirm WhatsApp is clearly described as manual.

### Tests for User Story 1

- [ ] T006 [US1] Cover notification settings response masking in `tests/unit/credit-request-notifications.test.ts`
  - Reason: UI clarity depends on safely reporting whether a Telegram secret exists without showing it.
  - Expected: Tests prove saved secret status and masked display are returned without raw secret text.
  - Possible bugs: The route can accidentally return the raw token when refactoring response shape.
  - Fix/Mitigation: Keep response serialization in a tested helper used by the route.
  - Verification: `npx tsx --test tests/unit/credit-request-notifications.test.ts`.

### Implementation for User Story 1

- [ ] T007 [US1] Redesign `src/components/admin/NotificationSettingsForm.tsx` into Arabic Telegram and manual WhatsApp sections
  - Reason: The current block is visually detached from the page and hard for admins to understand.
  - Expected: The block has Arabic titles, clear helper text, section grouping, consistent card styling, and no unexplained technical labels.
  - Possible bugs: RTL layout can place fields in an awkward order or cause text overflow.
  - Fix/Mitigation: Use the same spacing/card patterns as the surrounding settings form and check desktop width from the provided screenshot.
  - Verification: Manual review of `/dashboard/admin/settings` in Arabic.

- [ ] T008 [US1] Update save/test UI states in `src/components/admin/NotificationSettingsForm.tsx`
  - Reason: Admins need clear feedback for save, test, missing Telegram setup, and clearing a saved secret.
  - Expected: Save/test buttons show loading, success, and error states; raw secret input clears after save; clear-secret intent is explicit.
  - Possible bugs: Admin can accidentally clear the saved Telegram secret or test stale unsaved values.
  - Fix/Mitigation: Keep the clear checkbox explicit and make helper text explain test uses saved settings.
  - Verification: Manual save, reload, clear token, and test Telegram flows.

- [ ] T009 [US1] Apply notification settings helper output in `src/app/api/admin/notification-settings/route.ts`
  - Reason: The API response must match the redesigned UI and avoid exposing raw Telegram secrets.
  - Expected: GET/PUT return only safe display fields, configured status, and masked token text.
  - Possible bugs: Existing saves can lose WhatsApp defaults if empty strings are mishandled.
  - Fix/Mitigation: Preserve current clean-empty behavior and test representative settings payloads.
  - Verification: Manual save/reload and `npx tsx --test tests/unit/credit-request-notifications.test.ts`.

---

## Phase 4: User Story 2 - Alert Admin On New Credit Request (Priority: P2)

**Goal**: Admin receives a clear Telegram alert when a customer submits a credit request, and failures remain visible/retryable.

**Independent Test**: Configure Telegram, create a customer credit request, verify Telegram message content and notification status, then retry a failed/disabled alert while pending.

### Tests for User Story 2

- [ ] T010 [P] [US2] Add Telegram disabled/failure result tests in `tests/unit/credit-request-notifications.test.ts`
  - Reason: Request creation must not be blocked by disabled or missing Telegram settings.
  - Expected: Tests prove disabled, missing target, and missing secret return visible notification statuses without throwing.
  - Possible bugs: Helper tests may not cover the actual route transaction boundary.
  - Fix/Mitigation: Keep the helper contract focused and manually verify route behavior through the UI.
  - Verification: `npx tsx --test tests/unit/credit-request-notifications.test.ts`.

### Implementation for User Story 2

- [ ] T011 [US2] Update Telegram send/test secret reading in `src/lib/credit-requests/notifications.ts` and `src/app/api/admin/notification-settings/telegram/test/route.ts`
  - Reason: Both real alerts and test alerts must read the saved Telegram secret through the same privacy-safe behavior.
  - Expected: Test and real sends work with existing saved settings and never log or return the raw secret.
  - Possible bugs: Test Telegram can pass while real credit request alerts fail if they use different secret handling.
  - Fix/Mitigation: Reuse the same helper for both paths and test the shared behavior.
  - Verification: Telegram test button plus credit request alert manual test.

- [ ] T012 [US2] Verify credit request creation still returns notification status in `src/app/api/credit-requests/route.ts`
  - Reason: Customer request creation must stay successful even when Telegram is disabled or fails.
  - Expected: Response keeps request details and notification attempted/provider/status fields without exposing internal errors to customers unnecessarily.
  - Possible bugs: A thrown Telegram error can turn a valid credit request into a failed customer submission.
  - Fix/Mitigation: Keep Telegram send after request creation and return a safe status object.
  - Verification: Manual submit with Telegram disabled and with Telegram enabled.

- [ ] T013 [US2] Keep retry behavior clear in `src/app/api/admin/credit-requests/[id]/notification-retry/route.ts` and `src/components/admin/credit-requests/AdminCreditRequestsClient.tsx`
  - Reason: Admins need a straightforward way to retry failed or disabled Telegram alerts for pending requests.
  - Expected: Pending failed/disabled rows show retry, retry updates status, and errors are readable.
  - Possible bugs: Retry can show for already approved requests or duplicate confusing logs.
  - Fix/Mitigation: Preserve pending-only guard and reload the list after retry.
  - Verification: Manual admin retry flow on a pending failed/disabled request.

---

## Phase 5: User Story 3 - Manual WhatsApp Confirmation After Approval (Priority: P3)

**Goal**: After approval, the admin gets a prepared WhatsApp message, copy fallback, and the correct WhatsApp destination opens for manual paste/send.

**Independent Test**: Approve a pending request with a saved WhatsApp group, verify balance approval still succeeds, message is copyable, destination opens, and no automatic WhatsApp send occurs.

### Tests for User Story 3

- [ ] T014 [P] [US3] Extend handoff destination and message tests in `tests/unit/credit-request-whatsapp-handoff.test.ts`
  - Reason: Manual handoff correctness depends on destination priority and message content.
  - Expected: Tests cover destination priority, unsafe URL rejection, phone fallback, missing destination, and required message fields.
  - Possible bugs: Test mocks can drift from actual Prisma selections.
  - Fix/Mitigation: Keep mock object shape aligned with fields selected in `whatsapp-handoff.ts`.
  - Verification: `npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts`.

### Implementation for User Story 3

- [ ] T015 [US3] Update approval handoff result handling in `src/components/admin/credit-requests/AdminCreditRequestsClient.tsx`
  - Reason: Desktop and mobile browsers can block automatic copy or popups, so the admin needs reliable visible actions.
  - Expected: Approval opens a clear handoff dialog with message, copy button, open group/phone buttons, and status text explaining whether automatic copy worked.
  - Possible bugs: Popup blockers can prevent WhatsApp from opening if the open action is not tied to admin approval.
  - Fix/Mitigation: Keep the pre-open window behavior for approval while also providing manual open buttons.
  - Verification: Manual approval from desktop browser and at least one mobile browser if available.

- [ ] T016 [US3] Preserve approval accounting behavior in `src/app/api/admin/credit-requests/[id]/decision/route.ts`
  - Reason: This feature touches approval UX but must not change balance creation semantics.
  - Expected: Approval still increments balance once, records the transaction, creates status history, and then creates the WhatsApp handoff snapshot.
  - Possible bugs: Handoff failure could roll back a valid balance approval or duplicate transaction creation.
  - Fix/Mitigation: Keep guarded approval update and one-snapshot upsert behavior; verify non-pending requests still reject.
  - Verification: Manual approve one pending request and confirm balance/transaction/request status.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T017 Run focused unit tests and TypeScript checks
  - Reason: Notification helper, handoff, UI, and route changes cross client/server boundaries.
  - Expected: Focused tests, type checking, and production build pass.
  - Possible bugs: Unit tests can pass while Next route/client component typing fails.
  - Fix/Mitigation: Run both unit tests and build-level checks.
  - Verification: `npx tsx --test tests/unit/credit-request-notifications.test.ts`, `npx tsx --test tests/unit/credit-request-whatsapp-handoff.test.ts`, `npx tsc --noEmit`, `npm run build`.

- [ ] T018 Perform full manual flow validation from `specs/022-credit-notification-handoff/quickstart.md`
  - Reason: Telegram and clipboard/WhatsApp behavior depend on browser and external service behavior.
  - Expected: Settings, Telegram alert, approval handoff, copy fallback, and manual WhatsApp opening are verified.
  - Possible bugs: Mobile browser behavior can differ from desktop, especially clipboard and popup handling.
  - Fix/Mitigation: Test at least desktop and one mobile browser when available; keep visible fallback actions.
  - Verification: Complete quickstart manual checks and record any environment limitations.

- [ ] T019 Perform encoding and diff safety checks
  - Reason: The UI will add Arabic copy and the repository has strict encoding rules.
  - Expected: No new mojibake patterns, no whitespace errors, and no BOM introduced.
  - Possible bugs: Arabic labels can be corrupted by unsafe file writes.
  - Fix/Mitigation: Use `apply_patch` only for edits and scan changed paths.
  - Verification: `rg -n "أ¢|أ¯طںآ½|أƒ|أ‚|â|Ã|Â" src/components/admin/NotificationSettingsForm.tsx src/components/admin/credit-requests/AdminCreditRequestsClient.tsx src/lib/credit-requests tests/unit specs/022-credit-notification-handoff` and `git diff --check`.

- [ ] T020 Prepare deployment notes
  - Reason: Production Next.js builds must follow the safe `.next` replacement order.
  - Expected: Final notes state no migration expected and include the safe stop/remove/build/restart order from `AGENTS.md`.
  - Possible bugs: Building while `bein-web` serves traffic can cause stale chunks.
  - Fix/Mitigation: Follow existing production deployment order exactly.
  - Verification: Compare final deployment notes with `AGENTS.md`.

---

## Dependencies

- Phase 1 before behavior changes.
- Phase 2 before UI and route updates.
- User Story 1 is the MVP because admins must understand and save settings first.
- User Story 2 depends on Phase 2 helper behavior.
- User Story 3 depends on existing approval flow and Phase 2 handoff message behavior.
- Final checks depend on all chosen user stories being complete.

## Parallel Opportunities

- T001 and T002 can run in parallel.
- T004 and T005 can run in parallel after T003 if they avoid shared lines.
- T010 and T014 can run in parallel.
- T011 and T013 can run in parallel after T003/T004 if coordinated.
- T017 and T019 are final verification tasks and should run after implementation.

## Implementation Strategy

1. Add failing focused tests for Telegram content/privacy and WhatsApp handoff behavior.
2. Add shared helper behavior for settings privacy and message formatting.
3. Redesign the notification settings block in Arabic.
4. Verify Telegram alert/test/retry behavior.
5. Improve approval handoff dialog copy/open fallback while keeping WhatsApp manual.
6. Run automated checks, manual quickstart, encoding scan, and deployment note review.
