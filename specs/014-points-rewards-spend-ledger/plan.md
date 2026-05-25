# Implementation Plan: Spend-Based Points and Cash Redemptions

**Branch**: `014-points-rewards-spend-ledger` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-points-rewards-spend-ledger/spec.md`

## Summary

Replace the current top-up and credit-request-based point earning behavior with a spend-based ledger. Points are awarded only after qualifying subscription operations become `COMPLETED`, using `operation.amount` as the source of truth. Manager-owned users award points to the manager only; agent-owned users award points to both user and agent; direct users award points to themselves. Admins control enablement, start date, earning rates, owner overrides, and cash conversion. Users, agents, and managers can immediately convert available points to balance.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js runtime used by Next.js and `tsx`

**Primary Dependencies**: Next.js 16.1, React 19.2, Prisma 7.2, PostgreSQL, zod, next-auth beta

**Storage**: PostgreSQL through Prisma schema and migrations

**Testing**: `node:test` through `npx tsx --test`, `npx tsc --noEmit`, schema sync script, focused API/service tests

**Target Platform**: Web application and API running in the existing BeIN reseller panel deployment

**Project Type**: Full-stack Next.js application with Prisma-backed APIs and server-rendered/admin client views

**Performance Goals**: User list point summaries must avoid per-row N+1 queries; completed-operation point awarding must add negligible latency to completion flow and be idempotent on retries.

**Constraints**: Use encoding-safe edits only; no full-file rewrites; do not expose sensitive beIN runtime secrets; do not backfill old spend; preserve existing operation accounting evidence.

**Scale/Scope**: One accounting model change across operation completion, admin settings, point wallet conversion, admin users, manager users, agent/user dashboards, Prisma schema, and focused tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Source of truth is `Operation.status=COMPLETED`, `Operation.amount`, completion timestamp, and existing relationship snapshots. Ledger entries store rate and amount snapshots.
- **Traceable Planning**: PASS. Tasks must include detailed reason/expected/bugs/mitigation/verification blocks.
- **Test-First For Risky Behavior**: PASS REQUIRED. This touches balance and point accounting, so tests must be written before implementation where seams exist. Missing seams must be extracted first.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted edits and `apply_patch`; avoid risky PowerShell writers.
- **Security And Privacy Boundaries**: PASS. No beIN secrets, sessions, cookies, or provider tokens are exposed by contracts.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/014-points-rewards-spend-ledger/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- admin-points-settings.md
|   |-- point-cash-redemption.md
|   |-- completed-operation-point-awards.md
|   `-- user-points-summary.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
prisma/
|-- schema.prisma
`-- migrations/

src/
|-- app/api/admin/points/
|-- app/api/points/
|-- app/api/rewards/
|-- app/api/admin/users/
|-- app/api/manager/users/
|-- app/api/operations/
|-- components/admin/points/
|-- components/rewards/
|-- components/admin/users/
|-- components/manager/users/
`-- lib/credit-requests/

tests/
|-- unit/
`-- integration/
```

**Structure Decision**: Keep the feature inside existing Next.js API, Prisma, and component locations. Add small accounting services under `src/lib/credit-requests/` or a new local `src/lib/points/` namespace only if it reduces duplicated ledger and summary logic.

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design And Contracts

See [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), and [contracts/](./contracts/).

## Source Of Truth And Accounting Rules

- **Earn source**: `Operation` rows that are completed after the program start date.
- **Earn amount**: `operation.amount`, not dealer cost, not profit, not credit request amount.
- **Earn timestamp**: completed timestamp when available; otherwise the terminal operation update timestamp used by existing operation completion logic.
- **Recipient routing**:
  - Manager-owned user: manager only.
  - Agent-owned user: user and agent.
  - Direct user: user only.
  - Manager ownership wins when both manager and agent relationships exist.
- **Idempotency**: Unique ledger semantics must prevent duplicate owner/source entries when completion processing retries.
- **Legacy handling**: No old spend is backfilled. Existing legacy entries from credit approvals/top-ups remain audit records and must be excluded or clearly classified from new spend-earned conversion logic.
- **Reversal handling**: Refund or correction after awarded spend points creates negative adjustment entries linked to the original operation and owner.

## API Authorization Rules

- Admin points settings and ledger review endpoints require exact admin role.
- Cash conversion requires authenticated owner and only affects the current user's points and balance.
- Admin user point summaries follow existing admin user visibility.
- Manager user point summaries follow existing manager ownership filters and must not expose users outside that manager.
- Agent dashboards show agent-owned point summaries for the agent only.

## Required Indexes And Migration Impact

- Add source enum values for spend awards and cash redemptions.
- Add conversion/settings storage with a singleton key and indexes on update/audit fields if needed.
- Add indexes for point ledger aggregation by owner/status/source type and source operation.
- Reuse or extend the existing unique ledger constraint to preserve one entry per owner, source type, and source id.
- If reversal needs multiple entries against the same operation, use distinct source ids or a dedicated parent reference so the uniqueness rule remains valid.

## Verification Limitations

- Existing `npm run lint -- --max-warnings=0` currently fails on unrelated repository issues. Feature verification should still run TypeScript, schema sync, focused tests, and document the pre-existing lint baseline if full lint remains blocked.
- Existing Spec Kit setup PowerShell script uses `[System.IO.File]::WriteAllText`, which violates this repository's encoding rules. This plan was generated manually with `apply_patch`.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Contracts and data model specify source operation, amount, rates, relationships, and reversal behavior.
- **Traceable Planning**: PASS. `tasks.md` must maintain detailed per-task blocks.
- **Test-First For Risky Behavior**: PASS. Unit and integration test tasks precede implementation tasks for accounting paths.
- **Minimal, Encoding-Safe Edits**: PASS. Implementation tasks call out scoped edits and mojibake scans.
- **Security And Privacy Boundaries**: PASS. Contracts expose no beIN runtime secrets.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
