# Feature Specification: Unified Operation Spend Points

**Feature Branch**: `codex/032-unify-points-awards`

**Created**: 2026-06-08

**Status**: Approved for implementation

**Input**: User description: "Unify the points logic in one place. The user directly under admin must receive spend points, not the admin. Freeze the points owner when the operation completes so a later ownership transfer cannot redirect historical points."

## Clarifications

### Session 2026-08-06

- Q: Which ownership decides operation-spend recipients? A: Ownership, settings, rates, amount, and eligibility are captured atomically at the exact transition to `COMPLETED`; later state is never consulted for that operation.
- Q: What happens if final ledger insertion fails after completion? A: The immutable captured run remains retryable, and finalization uses only its snapshot.
- Q: What happens to a completed historical operation without a snapshot? A: It is marked/reported `LEGACY_REVIEW_REQUIRED` and is never automatically assigned from current ownership.
- Q: Can a transfer redirect points for a previously completed operation? A: No. The captured recipient set is authoritative even if finalization happens after the transfer.
- Q: What happens when a customer/mobile operation has `customerId` but no panel `userId`? A: Completion records one durable `SKIPPED` run with reason `CUSTOMER_OPERATION_NOT_ELIGIBLE`; it never infers panel ownership and must not block or roll back the customer operation.
- Q: How are permanently failing captured runs handled? A: Retry metadata and bounded backoff are persisted; after the configured attempt limit the run moves to `LEGACY_REVIEW_REQUIRED` with a safe reason instead of starving newer runs.

## User Scenarios & Testing

### User Story 1 - One Points Decision For Every Completion Path (Priority: P1)

When a renewal or installment operation is completed, every completion path uses the same award rules so the same operation cannot produce different point owners depending on whether it finished through web, worker, recovery, or manual review.

**Why this priority**: The current code has separate web and worker award logic. That makes production behavior inconsistent and can award the wrong owner.

**Independent Test**: Complete the same operation fixture through each supported completion path and confirm the produced point recipients are identical.

**Acceptance Scenarios**:

1. **Given** a completed renewal operation, **When** the award logic is triggered from web completion, **Then** it uses the shared award policy and writes the same recipients as worker completion.
2. **Given** a completed installment operation stored as a renewal operation, **When** worker completion awards points, **Then** it uses the same shared award policy as web completion.
3. **Given** recovery marks an operation completed, **When** points are awarded, **Then** the same eligibility and owner rules apply.
4. **Given** manual financial review closes an operation as charged/completed, **When** the operation becomes completed, **Then** operation spend points are awarded once using the same shared policy.
5. **Given** an operation completes while Agent A owns the user, **When** the user moves to Agent B before finalization or retry, **Then** only the completion-time recipient snapshot for Agent A can be awarded.
6. **Given** any operation path transitions to `COMPLETED`, including an ineligible signal or zero-amount path, **When** the transition commits, **Then** the same transaction stores one durable awarded-or-skipped decision.
7. **Given** signal check already completed and captured the durable skipped decision for an operation, **When** signal activation temporarily reopens and re-completes that same operation, **Then** activation preserves the original completion timestamp/run and only re-observes/finalizes it instead of creating or replacing a second decision.

---

### User Story 2 - Admin-Owned Direct Users Receive Their Own Spend Points (Priority: P1)

A normal user who is directly owned by admin receives their own spend points when their paid renewal operation completes. The admin does not receive points on that user's behalf.

**Why this priority**: The business decision is explicit: users under admin should earn their own points. Existing code disagrees between web and worker for this case.

**Independent Test**: Run an active admin-owned normal user through a completed renewal and confirm the user receives normal-user spend points and admin receives no operation-spend point entry for that operation.

**Acceptance Scenarios**:

1. **Given** an active normal user has an active admin/direct owner, **When** a renewal completes, **Then** the user receives points using the normal user per-1000 USD rate.
2. **Given** a legacy admin-created normal user has no active manager owner and no active agent owner, **When** a renewal completes, **Then** the user receives points using the normal user rate.
3. **Given** an admin-owned direct user has a completed operation, **When** the award runs more than once, **Then** only one point entry is recorded for that user and operation.
4. **Given** an inactive, deleted, or non-user account is involved, **When** the award policy runs, **Then** no direct user spend points are awarded.

---

### User Story 3 - Existing Agent And Manager Rules Stay Intact (Priority: P2)

Existing point behavior for users under agents and managers remains unchanged while the admin-owned user case is corrected.

**Why this priority**: Fixing admin-owned users must not break current agent and manager reward rules.

**Independent Test**: Run existing agent-owned and manager-owned fixtures and confirm recipients and rates match current approved behavior.

**Acceptance Scenarios**:

1. **Given** an active user under an active agent, **When** a renewal completes, **Then** both the user and agent receive spend points.
2. **Given** an active user under an active manager and manager-owned user points are disabled, **When** a renewal completes, **Then** only the manager receives spend points.
3. **Given** an active user under an active manager and manager-owned user points are enabled, **When** a renewal completes, **Then** the manager receives manager points and the user receives manager-owned-user points.
4. **Given** an owner-specific agent or manager override is set to zero, **When** a renewal completes, **Then** the override is respected as an explicit zero rate.

---

### User Story 4 - Admin Settings Page Explains The Rules Clearly (Priority: P3)

The points settings page makes it clear which people receive spend points under each ownership type, including admin-owned direct users.

**Why this priority**: The current labels can make admins think every role always receives points. The page should match the actual award policy.

**Independent Test**: Open the points settings page and confirm the displayed labels or helper text explain admin-owned, agent-owned, manager-owned, and disabled-program behavior.

**Acceptance Scenarios**:

1. **Given** the points program is disabled, **When** an admin views the settings page, **Then** the page makes clear that no operation-spend points are awarded.
2. **Given** normal user points are configured, **When** an admin views the default rules, **Then** the page indicates this rate applies to agent-owned users and admin-owned direct users.
3. **Given** manager-owned user points are disabled, **When** an admin views the manager-owned user setting, **Then** the page indicates manager-owned users do not receive user points while disabled.
4. **Given** manager-owned user points are enabled, **When** an admin views the manager-owned user setting, **Then** the page indicates manager-owned users receive the dedicated manager-owned-user rate.

### Edge Cases

- Points program is disabled: no recipients receive operation-spend points, regardless of ownership or rates.
- Operation is not completed, has no completion time, is not a renewal-style operation, or has a non-positive amount: no points are awarded.
- Operation completed before the configured points start date: no points are awarded.
- User has both current manager/admin ownership and an active agent assignment from dirty historical data: current owner precedence must be deterministic and tested.
- User has no valid current owner and no legacy admin-created fallback: no points are awarded.
- Award logic is triggered repeatedly for the same operation: duplicate ledger entries are not created.
- Admin-owned direct user has a later agent assignment after the operation: award uses the ownership evidence at operation completion time, not a later guess.
- Program toggles, start dates, rates, or owner overrides change after completion: the captured decision and rate snapshots remain authoritative.
- Web and Worker attempt to capture or finalize simultaneously: one operation run and one complete recipient set are committed.
- One recipient insert fails in a multi-recipient run: no recipient ledger entry or final status is partially committed.
- A non-spend operation reaches `COMPLETED`: one durable `SKIPPED` run records the reason so a later configuration change cannot award it.
- A customer/mobile operation has `customerId` and no panel `userId`: completion still commits and one durable `SKIPPED` run records `CUSTOMER_OPERATION_NOT_ELIGIBLE` without ownership evidence or recipients.
- Two admins submit conflicting financial-review decisions: the operation row is locked and revalidated so at most one guarded transition commits; a refund and a charged completion cannot both take effect.
- A captured run repeatedly fails finalization: persisted attempts use bounded backoff and eventually transition to review-required so later runs remain eligible for maintenance.
- A post-cutover completed operation has no run: it is reported for review and never reconstructed from current ownership.
- A pre-cutover operation already has operation-spend ledger rows but no run: the rows remain untouched and no new owner entry is inferred.
- Sensitive credentials, sessions, Telegram tokens, beIN passwords, cookies, TOTP secrets, and provider data must not appear in logs or point audit output.

## Requirements

### Functional Requirements

- **FR-001**: System MUST use one shared operation-spend award policy for web, worker, recovery, and manual completion paths.
- **FR-002**: System MUST award operation-spend points only when the points program is enabled, the operation is completed, the operation is renewal-style, the amount is positive, completion time exists, and completion time is not before the configured points start date.
- **FR-003**: System MUST award admin-owned direct normal users their own operation-spend points using the normal user per-1000 USD rate.
- **FR-004**: System MUST NOT award admin users operation-spend points on behalf of admin-owned direct users.
- **FR-005**: System MUST preserve the existing agent-owned rule: active normal user receives normal user points and active agent receives agent points.
- **FR-006**: System MUST preserve the existing manager-owned rule: active manager receives manager points, and the normal user receives manager-owned-user points only when that setting is enabled.
- **FR-007**: System MUST treat owner-specific zero overrides as explicit zero rates, not as missing overrides.
- **FR-008**: System MUST avoid awarding points to inactive, deleted, non-user, or unclear owners.
- **FR-009**: System MUST keep point ledger writes idempotent per owner, source type, and operation id.
- **FR-010**: System MUST make manual financial-review charged/completed closure eligible for the same point award process.
- **FR-011**: System MUST expose clear settings-page wording so admins understand which rates apply to each ownership type.
- **FR-012**: System MUST add focused tests for admin-owned direct users, worker/web parity, manual completion, manager toggle behavior, zero overrides, idempotency, and disabled-program behavior.
- **FR-013**: System MUST not recalculate or rewrite historical point ledger rows automatically in this feature.
- **FR-014**: System MUST include release verification that distinguishes valid skipped runs from captured/awarded runs and identifies post-cutover completed operations with missing runs or inconsistent run-linked ledger entries.
- **FR-015**: Every canonical first-completion path that changes an `Operation` to `COMPLETED` MUST capture one immutable `OperationSpendAwardRun` in the same database transaction and with the same exact `completedAt` value. Re-observation of an already captured reused operation follows FR-029 instead.
- **FR-016**: The captured run MUST snapshot safe ownership evidence, program switches, start date, operation amount/type/user, resolved rate source and value, recipient points, completion source, and a stable skipped reason where applicable.
- **FR-017**: A decision with at least one positive recipient MUST commit as `CAPTURED`; zero-rate recipients remain in its snapshot with a zero reason while other positive recipients are preserved. `SKIPPED` is used only when no positive recipient remains, including disabled, pre-start, non-renewal, non-positive, invalid-owner, unowned, or all-zero outcomes.
- **FR-018**: Finalization MUST lock the run, create all positive point-ledger entries, and mark the run `AWARDED` in one transaction; either the entire recipient set commits or none does.
- **FR-019**: Finalization and retry MUST read recipients and rates only from the immutable run and MUST NOT query current ownership, current settings, or current rules to reconstruct them.
- **FR-020**: System MUST allow at most one operation-spend run per operation and at most one run-linked ledger entry per recipient, while preserving the existing owner/source/operation uniqueness constraint.
- **FR-021**: Web, Worker, recovery, manual financial review, purchase confirmation, installment confirmation, and maintenance finalization MUST use the same capture/finalize contracts.
- **FR-022**: Canonical non-spend completion writers MUST capture a durable skipped run and set a completion timestamp consistently; a later re-observation of the same operation MUST preserve that timestamp.
- **FR-023**: Detection of a completed operation without a run after cutover, or of existing unlinked operation-spend rows, MUST atomically create-or-read one unique minimal `LEGACY_REVIEW_REQUIRED` sentinel run containing only safe operation identity fields and a reason/origin; ownership/program/rate/recipient snapshot fields remain null and MUST NOT be inferred from current state. Pre-cutover missing runs return `NOT_FOUND` without a sentinel.
- **FR-024**: Existing historical ledger rows and completed operations before cutover MUST not be rewritten or automatically backfilled; encountering existing unlinked operation-spend rows prevents new automatic awards.
- **FR-025**: Ownership transfer and completion capture MUST use the same subject-user row lock discipline so completion-time ownership cannot race with transfer.
- **FR-026**: Release rollout MUST apply additive schema changes first, deploy compatible web and all Worker processes, and activate `operationSpendSnapshotCutoverAt` only through the audited dry-run-first activation command after the operator explicitly attests the compatible release is running everywhere.
- **FR-027**: A bounded maintenance finalizer MUST retry stale `CAPTURED` runs without changing their snapshot; automatic infinite retries and current-state reconstruction are prohibited.
- **FR-028**: Release auditing MUST report total counts plus bounded safe operation/run ids only and must distinguish `CAPTURED`, `AWARDED`, `SKIPPED`, and `LEGACY_REVIEW_REQUIRED` states, stale/retry-exhausted runs, post-cutover missing runs, and unlinked ledger rows.
- **FR-029**: The two-phase signal-check/signal-activation lifecycle MUST keep signal check as the canonical completion for its reused operation id. Signal activation MUST preserve the existing `completedAt`, MUST NOT overwrite or create a second run, and MAY only re-observe/finalize the existing skipped run. A new capture is required only when activation uses a distinct operation id.
- **FR-030**: A canonical completion for an operation with `customerId` and no panel `userId` MUST commit a durable `SKIPPED` run with reason `CUSTOMER_OPERATION_NOT_ELIGIBLE`, null ownership/program/rate/recipient evidence, and the exact operation completion identity; capture MUST NOT throw or roll back that completion merely because `userId` is absent.
- **FR-031**: Admin financial-review decisions MUST lock and re-read the operation before decision validation, use a guarded transition from `REVIEW_REQUIRED`, and prevent concurrent charged/refund/follow-up decisions from overwriting one another or applying both financial effects.
- **FR-032**: Each failed finalization attempt MUST persist a bounded safe retry count and next-attempt time. Maintenance MUST skip runs whose backoff has not elapsed and MUST move an exhausted run to `LEGACY_REVIEW_REQUIRED` with a safe reason code; no raw exception or sensitive payload may be stored.
- **FR-033**: Cutover activation MUST invoke the same read-only preflight used by release audit inside the activation flow and MUST refuse activation when required release invariants are unresolved. A syntactically valid release attestation alone is insufficient.

### Key Entities

- **Operation spend award policy**: The single pure decision source that evaluates completion-time evidence and returns an immutable recipient or skipped snapshot.
- **Operation spend award run**: The unique per-operation durable snapshot and state machine for capture, finalization, skip, or legacy review.
- **Operation**: A panel-user or customer/mobile operation whose exact transition to completed supplies amount, completion time, and available subject identity. Customer-only operations deliberately capture a skipped run without panel ownership evidence.
- **Owner classification**: The current or legacy ownership decision captured at completion: admin-owned direct, agent-owned, manager-owned, or unowned.
- **Point program settings**: The global enabled flag, start date, conversion ratio, and manager-owned user toggle.
- **Point rule**: The active per-1000 USD rate for normal users, manager-owned users, agents, managers, or owner-specific overrides.
- **Point ledger entry**: The persisted point record tied to an owner, operation-spend source, and optional operation-spend award run.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of focused tests show identical recipient decisions for web, worker, recovery, and manual charged completion paths.
- **SC-002**: 100% of admin-owned direct user tests award points to the user and zero operation-spend points to admin for that operation.
- **SC-003**: Existing agent-owned and manager-owned point tests continue to pass without changed expected recipients.
- **SC-004**: Re-running the same award path at least three times creates no duplicate point ledger rows.
- **SC-005**: The points settings page states the disabled-program and admin-owned direct user behavior clearly enough for an admin to predict who receives points.
- **SC-006**: Build verification passes for both web and worker after the shared policy is introduced.
- **SC-007**: Transfer-after-completion tests prove that 100% of retries and concurrent finalizers retain the original completion-time recipients and rates.
- **SC-008**: Fault-injection tests prove multi-recipient finalization commits either all expected ledger rows or zero rows.
- **SC-009**: Every enumerated canonical `Operation -> COMPLETED` writer has a focused assertion that exactly one captured or skipped run is committed in the completion transaction, and every reused-operation re-observation has a focused assertion that the existing run/timestamp is preserved.
- **SC-010**: Post-cutover missing-run and pre-existing-unlinked-ledger tests create no automatic award and surface a review-required result.
- **SC-011**: Clean-install and upgraded-database migration tests, app/Worker schema sync, web build, and Worker build all pass before cutover activation.
- **SC-012**: Customer renewal, signal refresh, and signal check fixtures with no `userId` all commit completion plus exactly one `CUSTOMER_OPERATION_NOT_ELIGIBLE` skipped run.
- **SC-013**: PostgreSQL race tests prove conflicting financial-review decisions produce one guarded winner and no refund-plus-award state.
- **SC-014**: Retry tests prove poisoned runs back off, become review-required at the attempt limit, and cannot starve a later eligible captured run.

## Assumptions

- "User under admin" means an active normal user directly owned by admin, either through current admin/direct ownership evidence or a legacy admin-created fallback when no current owner rows exist.
- Admin-owned direct users use the same rate as normal users.
- Existing manager-owned user toggle behavior remains unchanged.
- Historical point ledger rows are not changed by this feature; any historical cleanup or correction is a separate reviewed task.
- The shared policy is pure and credential-free; database reads and writes stay in shared capture/finalize adapters callable by web and Worker.
- The cutover timestamp is nullable and remains unset until migration plus compatible web and all Worker deployments are verified.
