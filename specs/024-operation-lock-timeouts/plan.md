# Implementation Plan: Operation Lock Timeouts

**Branch**: `024-operation-lock-timeouts` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-operation-lock-timeouts/spec.md`

## Summary

Shorten the active renewal decision path and make beIN account ownership explicit for the whole active operation. The plan keeps customer money deduction at final confirmation, adds an earlier balance gate at package selection, reserves one beIN account per active renewal, cancels quickly before Pay when the customer leaves, and releases the beIN lock on completion, safe cancellation, failure, or review handoff after evidence is saved.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the
standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security
boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript on Next.js 16 app routes and Node worker

**Primary Dependencies**: NextAuth session auth, Prisma ORM, BullMQ operation queue, Redis/ioredis account locks, React client wizard

**Storage**: PostgreSQL through Prisma for operations, users, transactions, account metadata, and audit evidence; Redis for short-lived lock/heartbeat acceleration

**Testing**: `node:test` through `tsx`, TypeScript compiler checks, Next.js build, worker build, focused unit and integration tests

**Target Platform**: Web reseller panel plus background worker on the existing production server

**Project Type**: Web application with API routes and worker-driven provider automation

**Performance Goals**: Customer exits before Pay are reflected within 5 seconds of missed heartbeat; package and confirmation timeouts are enforced within one UI/server polling interval; lock checks add no visible delay to normal package loading

**Constraints**: No mobile subscription expansion; no provider secret exposure; no automatic refund after Pay may have started unless no-charge evidence exists; avoid heavy database writes every second if heartbeat is reduced

**Scale/Scope**: Existing reseller renewal flow, active web UI, operation cleanup/recovery, beIN account pool locking, admin beIN account controls

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Plan tracks lock owner, heartbeat, timeouts, balance gates, final Pay phase, review handoff, and admin unlock evidence.
- **Traceable Planning**: PASS. Tasks must map user stories to exact files and include the required detail block.
- **Test-First For Risky Behavior**: PASS. Money, account assignment, timeout, and recovery behavior require tests before implementation tasks.
- **Minimal, Encoding-Safe Edits**: PASS. Edits must be small and use `apply_patch` for manual changes; verification includes mojibake scans.
- **Security And Privacy Boundaries**: PASS. Admin views may expose labels and operation ids only; provider secrets remain hidden.

## Project Structure

### Documentation (this feature)

```text
specs/024-operation-lock-timeouts/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- operation-lock-timeouts.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/operations/[id]/
|   |-- heartbeat/route.ts
|   |-- select-package/route.ts
|   |-- confirm-purchase/route.ts
|   `-- cancel-confirm/route.ts
|-- app/api/cron/
|   |-- cleanup-stuck-operations/route.ts
|   `-- timeout-operations/route.ts
|-- app/api/admin/bein-accounts/
|   `-- [id]/unlock/route.ts
|-- app/dashboard/renew/page.tsx
|-- hooks/useOperationHeartbeat.ts
`-- lib/operations/
    `-- recovery.ts

worker/
|-- src/http-queue-processor.ts
|-- src/pool/account-locking.ts
|-- src/pool/account-pool-manager.ts
`-- tests/

tests/
|-- unit/
`-- integration/
```

**Structure Decision**: Keep the feature inside the existing Next.js app routes, React renewal page, worker queue processor, Redis account lock utilities, and focused tests. Do not add a new service or database subsystem unless implementation proves Redis lock metadata cannot satisfy admin visibility safely.

## Source Of Truth And Evidence

- **Customer balance source of truth**: `User.balance` and `BalanceTransaction` rows. Package selection checks but does not deduct. Final confirmation deducts exactly once.
- **Operation source of truth**: `Operation.status`, `selectedPackage`, `amount`, `finalConfirmExpiry`, `lastHeartbeat`, `heartbeatExpiry`, and `responseData` phase evidence.
- **beIN account ownership source of truth**: active Redis lock plus operation evidence linking `beinAccountId` to `operationId`. If admin visibility needs historical display, use operation response evidence or a small persisted lock audit record.
- **Provider money source of truth**: final Pay evidence and beIN dealer balance before/after readings from the existing final-payment guardrails.
- **Manual review source of truth**: `REVIEW_REQUIRED` operation status plus saved final Pay evidence and admin review decision evidence.

## Legacy And Backfill Behavior

- Existing active operations without enhanced lock metadata should continue through current recovery rules.
- Existing Redis locks with no operation owner should be treated as stale/unknown in admin visibility and force-unlockable by authorized admins.
- Existing `AWAITING_PACKAGE` operations with old 120 second deadlines should be handled by recovery/cleanup without creating unsafe refunds.
- Existing `AWAITING_FINAL_CONFIRM` operations keep their current deadline unless implementation explicitly migrates only newly created operations.

## Migration And Index Impact

- Prefer no database migration for the first implementation by storing lock owner/phase evidence in existing operation evidence and Redis lock values.
- If persisted lock audit is required, add a small migration and index by `beinAccountId`, `operationId`, and active/stale status.
- Existing operation indexes should be checked before adding any new cleanup query by status/deadline.

## API Authorization

- Reseller operation endpoints must continue requiring operation ownership.
- Heartbeat and leave/cancel endpoints must not allow another user to cancel someone else's operation.
- Admin unlock must require existing admin authorization and should log the actor, account, operation, reason, and timestamp.
- Admin unlock must not expose passwords, TOTP secrets, cookies, sessions, ViewState, storage state, or raw provider tokens.

## UI States

- Renewal page must show package timer, confirmation timer, 3 second warning state, timeout result, insufficient balance result, and review-required result.
- Admin beIN account lock view must show empty/no-lock, loading, locked, stale lock, unlock in progress, unlock success, and unlock failure states.
- If heartbeat fails due temporary network issue before Pay, UI should show a clear failure/timeout message and avoid implying a refund unless one happened.

## Complexity Tracking

No constitution violations identified.
