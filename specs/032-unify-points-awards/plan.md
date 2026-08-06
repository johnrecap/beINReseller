# Implementation Plan: Unified Operation Spend Points

**Branch**: `codex/032-unify-points-awards` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-unify-points-awards/spec.md`

## Summary

Unify operation-spend point decisions so every canonical `Operation -> COMPLETED` writer captures one immutable eligibility/recipient/rate snapshot in the same transaction as completion, then web, Worker, recovery, manual review, confirmation, and maintenance paths finalize only that snapshot. Re-observation of an already captured reused operation preserves the first snapshot. A user directly under admin receives their own spend points; a later ownership transfer or settings change cannot redirect a completed operation. Existing agent/manager behavior remains intact, skipped decisions are durable, and legacy missing snapshots require review rather than current-state inference.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9 for web app, TypeScript 5.7 worker build, Node.js runtime

**Primary Dependencies**: Next.js 16.1, Prisma 7.2, PostgreSQL row locks and transactions, existing point settings/rules/ledger models, existing Worker queue processor, operation completion/recovery routes

**Storage**: PostgreSQL through Prisma with an additive operation-spend award-run migration shared by app and Worker schemas.

**Testing**: `npx tsx --test` pure/unit/integration and fault-injection tests, PostgreSQL migration/concurrency tests, app/Worker schema sync, both builds, completion-writer inventory assertions, release audit, and `git diff --check`

**Target Platform**: Existing Desh Panel web app, API routes, maintenance/recovery code, and worker process

**Project Type**: Full-stack Next.js application plus TypeScript worker

**Performance Goals**: Capture remains bounded to one locked operation/user and one small rule set; finalization locks one run and inserts a small recipient set; stale-run maintenance is bounded and indexed.

**Constraints**: Do not rewrite historical point ledger rows. Do not change customer balances or operation amounts. Do not expose sensitive provider credentials or Telegram tokens. Keep edits minimal and encoding-safe.

**Scale/Scope**: Shared snapshot policy, additive run/ledger/settings schema, capture and finalizer services, every known completion writer, confirmation/recovery/manual/maintenance callers, legacy/cutover handling, settings wording, focused concurrency/fault/migration tests, both builds, and release audit.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Completion and its immutable award/skip evidence commit atomically; ledger finalization is all-or-nothing and run-linked.
- **Traceable Planning**: PASS. Tasks map stories to exact files, tests, risks, mitigations, and verification commands.
- **Test-First For Risky Behavior**: PASS REQUIRED. Admin-owned points, worker/web parity, and manual completion must have tests before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses a shared pure policy plus targeted wrappers instead of broad rewrites.
- **Security And Privacy Boundaries**: PASS. Policy and logs must not include credentials, sessions, cookies, TOTP secrets, ViewState, or raw provider tokens.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/032-unify-points-awards/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- api-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
shared/
|-- db/
|   `-- ownership-evidence-lock.ts
`-- points/
    |-- operation-spend-policy.ts
    |-- operation-spend-award-snapshot.ts
    `-- operation-spend-award-runs.ts

src/
|-- app/api/admin/financial-review/[operationId]/decision/route.ts
|-- components/admin/points/AdminPointsSettingsClient.tsx
|-- lib/operations/recovery.ts
|-- lib/points/operation-awards.ts
|-- lib/points/operation-spend-award-runs.ts
`-- lib/points/settings.ts

worker/
|-- tsconfig.json
`-- src/lib/points.ts

tests/
|-- unit/
|   |-- points-operation-spend-policy.test.ts
|   |-- points-operation-awards.test.ts
|   |-- worker-points-awards.test.ts
|   `-- financial-review-points-awards.test.ts
`-- integration/
    `-- operation-points-completion-parity.test.ts
```

**Structure Decision**: Keep the recipient/eligibility calculation pure under `shared/points/`, add one durable capture/finalize contract used by both runtimes, and adapt each completion writer to capture inside its existing transaction. Web and Worker wrappers become finalizer adapters and never reconstruct recipients from live state.

Canonical lock implementation lives in `shared/db/ownership-evidence-lock.ts`. Completion locks the operation first, then the subject user; ownership transfer locks the subject user first because it never locks an operation. After current relation ids are read, both lock any current/target owner user ids in lexical order. Every ownership writer and completion snapshot caller must use these helpers; a pre-existing run is idempotent only when operation id, user id, exact completed time, operation type, amount, and completion source match.

## Phase 0 Research

See [research.md](./research.md). Decisions:

- Use one pure shared operation-spend policy for eligibility, owner precedence, recipient kinds, and rate bucket selection.
- Admin-owned direct normal users receive normal-user points; admin receives no operation-spend point for that user.
- Unowned users receive no points unless they qualify as legacy admin-created users with no current owner rows.
- Manager ownership remains higher precedence than agent assignment when dirty data contains both, matching existing manager-first behavior.
- Every canonical completion writer captures the same immutable policy decision in its completion transaction; manual financial-review charged closure is included, while explicit reused-operation re-observation preserves the first decision.
- Customer/mobile operations that carry `customerId` without a panel `userId` capture `CUSTOMER_OPERATION_NOT_ELIGIBLE` as a durable skipped decision and never enter panel-owner resolution.
- Decisions with at least one positive recipient become `CAPTURED`; zero recipients remain in a mixed snapshot with zero reasons. Only decisions with no positive recipient become durable `SKIPPED`; finalizers consume only the run snapshot.
- Completion-time user locking is shared with ownership transfer so the captured owner cannot race a transfer.
- A nullable cutover timestamp is activated only after migration plus compatible web and all Worker processes are deployed.
- No historical point ledger rewrite in this feature.

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/api-contract.md](./contracts/api-contract.md), and [quickstart.md](./quickstart.md).

## Source Of Truth And Data Rules

- **Completion source**: the exact transaction that changes `Operation.status` to `COMPLETED` and supplies the single `completedAt` value.
- **Run source**: unique `OperationSpendAwardRun` containing operation, completion-time ownership, program, rule, recipient, rate, amount, and skipped evidence.
- **Program/rate source at capture**: `PointProgramSettings` plus active `PointRule` rows, copied into the immutable run and never re-read by finalization.
- **Ownership source at capture**: locked subject user plus deterministic active manager/admin link, active agent assignment, or legacy admin fallback evidence.
- **Customer-only source at capture**: the locked operation identity and `customerId`; no panel user/owner/settings/rate evidence is queried or synthesized.
- **Ledger source**: run-linked `PointLedgerEntry` with source type `OPERATION_SPEND`, operation id, and snapshot values.
- **Cutover source**: nullable `PointProgramSettings.operationSpendSnapshotCutoverAt`; post-cutover missing runs are invariant violations, not award inputs.

## Award Policy Rules

1. If the points program is disabled, skip.
2. If the operation is not completed, not renewal-style, has no completed time, has non-positive amount, or completed before the points start date, skip.
3. If the operation user is not an active normal user for user-recipient paths, skip that user recipient.
4. Manager-owned user:
   - Active manager receives manager points.
   - User receives manager-owned-user points only when the manager-owned-user toggle is enabled.
5. Agent-owned user:
   - Active normal user receives normal user points.
   - Active agent receives agent points.
6. Admin-owned direct or legacy admin-created user:
   - Active normal user receives normal user points.
   - Admin receives no operation-spend points for that user's operation.
7. Unowned or invalid ownership:
   - No points are awarded.
8. The completion transaction records `SKIPPED` only when no positive recipient remains; mixed zero/positive decisions remain `CAPTURED` with zero reasons preserved.
9. Positive snapshots commit as `CAPTURED`; finalization writes all recipients and marks `AWARDED` atomically.
10. Repeated capture/finalization attempts serialize on unique/row locks and do not duplicate or change recipients.
11. A post-cutover completed operation missing a run creates/reads one unique minimal review sentinel; unlinked spend rows create that sentinel when no run exists or transition a captured run to review-required. Neither case is reconstructed from current state.
12. Signal check is the canonical completion for the existing two-phase signal operation. The later signal-activation job preserves that operation's original `completedAt` and re-observes/finalizes the existing skipped run; it does not attempt a second immutable capture for the reused operation id.
13. An operation with `customerId` and no `userId` records `SKIPPED/CUSTOMER_OPERATION_NOT_ELIGIBLE` and allows the surrounding completion transaction to commit.
14. Admin financial-review decisions lock and re-read the operation before any refund or completion mutation, then perform one guarded transition from `REVIEW_REQUIRED`.
15. Failed finalization persists only a safe attempt count/code plus exponential bounded backoff; exhausted runs move to review-required and no longer occupy the retry batch.

## Security Boundaries

- Award logs may include operation id, safe user id, owner role, owner kind, skipped reason, and point count only.
- Award logs must not include beIN passwords, TOTP secrets, cookies, sessions, storage state, ViewState, Telegram tokens, provider credentials, or raw request payloads.
- Admin-only reports may show point owner labels and operation ids needed for audit.
- The shared policy module must be pure and credential-free.

## Database And Migration Impact

- Add unique `OperationSpendAwardRun.operationId` with captured operation/user/ownership/program/recipient JSON evidence, policy version, completion source, state, reason, ledger counts, safe retry count/code, next-attempt time, and timestamps.
- Add nullable `PointLedgerEntry.operationSpendAwardRunId`, a foreign key/index, and unique `(operationSpendAwardRunId, ownerUserId)` while preserving the existing owner/source/operation unique constraint.
- Add nullable `PointProgramSettings.operationSpendSnapshotCutoverAt`; leave it null through migration and mixed-version deployment.
- Add `(status, capturedAt)` and `(completionSource, capturedAt)` indexes for bounded finalization and audit.
- Mirror the additive schema byte-for-byte into the Worker schema and generate both clients.
- Historical point ledger rows are not rewritten or corrected automatically.
- The existing signal check/activation flow continues to reuse one operation id and therefore one award run; activation does not introduce a second run or change the original completion identity.

## Legacy And Backfill Behavior

- Old point entries remain unchanged.
- Completed historical operations are not automatically reprocessed.
- Before cutover, missing runs remain historical and return `NOT_FOUND`; after cutover detection atomically creates/reads a unique minimal `LEGACY_REVIEW_REQUIRED` sentinel without automatic awards.
- Existing `OPERATION_SPEND` rows without a run remain untouched and create/read the minimal sentinel; if a captured run encounters unlinked rows, it preserves its snapshot, transitions to review-required, and inserts nothing.
- Rollback is code-only/forward-fix: additive columns and tables remain, and cutover is not activated or is disabled while compatible code is restored.
- Dirty ownership data is not cleaned in this feature; it is classified deterministically for award purposes only.

## API Authorization Rules

- No new public API is introduced.
- Existing admin financial-review decision route remains admin-only.
- Existing operation completion routes keep their current authorization.
- Release audit and bounded stale-run finalization remain internal maintenance/admin commands and emit safe ids/counts only.

## UI States

- Points settings page:
  - Program disabled: shows that no operation-spend points are awarded.
  - Normal user rate: explains it applies to agent-owned users and admin-owned direct users.
  - Manager-owned toggle disabled: explains manager-owned users do not receive user points.
  - Manager-owned toggle enabled: explains manager-owned users receive the dedicated manager-owned-user rate.
- No changes are planned to the user dashboard.

## Verification Strategy

- Unit tests for shared policy eligibility and all owner paths.
- Unit tests proving app wrapper and worker wrapper use the same policy outcomes.
- Unit tests proving admin-owned direct users receive user points and admin receives none.
- Unit/integration tests proving every canonical completion writer captures one positive or skipped run inside the completion transaction and reused-operation re-observation preserves it.
- Transfer-after-completion, settings/rate mutation, concurrent capture/finalization, and second-recipient fault-injection tests.
- Clean and upgraded migration tests, app/Worker schema-sync, and both builds.
- Release audit/preflight for captured, awarded, skipped, review-required, retry-exhausted, post-cutover missing-run, and unlinked-ledger states, with total counts and bounded ids.
- Real PostgreSQL behavior tests for customer-only completions, financial-review decision races, writer parity, retry starvation, migrations, and cutover preflight.
- Encoding and diff safety checks.

## Verification Limitations

- Production data may contain dirty ownership rows; this feature classifies them deterministically but does not clean them.
- Historical point correction is intentionally out of scope.
- External Telegram/WhatsApp flows are not part of this feature.
- Browser verification only covers settings-page wording; Worker/runtime correctness is proven by focused integration and build tests.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. The plan atomically freezes completion evidence and finalizes a complete recipient set from it.
- **Traceable Planning**: PASS. `tasks.md` maps exact files and tests.
- **Test-First For Risky Behavior**: PASS. Behavior-changing tasks are preceded by tests.
- **Minimal, Encoding-Safe Edits**: PASS. Shared pure policy plus one run state machine is the smallest reliable way to prevent transfer/settings races across separate runtimes.
- **Security And Privacy Boundaries**: PASS. No sensitive runtime data is exposed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| None | No constitution violation is needed | The shared-policy approach fits within the constitution |
