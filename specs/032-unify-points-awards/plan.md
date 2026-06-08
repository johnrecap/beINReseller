# Implementation Plan: Unified Operation Spend Points

**Branch**: `codex/032-unify-points-awards` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-unify-points-awards/spec.md`

## Summary

Unify operation-spend point award rules so web, worker, recovery, and manual financial-review completion all use one shared policy. The business rule is explicit: a normal user directly under admin receives their own spend points using the normal-user rate; admin does not receive points on that user's behalf. Existing agent-owned and manager-owned behavior remains intact.

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

**Primary Dependencies**: Next.js 16.1, Prisma 7.2, PostgreSQL, existing point settings/rules/ledger models, existing worker queue processor, existing financial-review routes

**Storage**: PostgreSQL through Prisma. No schema migration is planned for the core fix.

**Testing**: `npx tsx --test` focused unit/integration tests, `npm run build`, `npm --prefix worker run build`, and `git diff --check`

**Target Platform**: Existing Desh Panel web app, API routes, maintenance/recovery code, and worker process

**Project Type**: Full-stack Next.js application plus TypeScript worker

**Performance Goals**: Award calculation remains bounded to one operation and one small set of point rules. The shared policy is pure and does not add extra database scans.

**Constraints**: Do not rewrite historical point ledger rows. Do not change customer balances or operation amounts. Do not expose sensitive provider credentials or Telegram tokens. Keep edits minimal and encoding-safe.

**Scale/Scope**: Shared award policy, web award wrapper, worker award wrapper, manual financial-review completion hook, settings-page wording, focused tests, build verification, and release audit query.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Point ledger writes are financially adjacent and must remain idempotent with clear source operation evidence.
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
`-- points/
    `-- operation-spend-policy.ts

src/
|-- app/api/admin/financial-review/[operationId]/decision/route.ts
|-- components/admin/points/AdminPointsSettingsClient.tsx
|-- lib/operations/recovery.ts
|-- lib/points/operation-awards.ts
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

**Structure Decision**: Put the recipient and eligibility policy in a shared, pure module under `shared/points/`. Web and worker wrappers remain responsible for database reads/writes, but they must call the same pure policy. Worker build configuration may need a narrow include/root adjustment so this shared module compiles without copying logic.

## Phase 0 Research

See [research.md](./research.md). Decisions:

- Use one pure shared operation-spend policy for eligibility, owner precedence, recipient kinds, and rate bucket selection.
- Admin-owned direct normal users receive normal-user points; admin receives no operation-spend point for that user.
- Unowned users receive no points unless they qualify as legacy admin-created users with no current owner rows.
- Manager ownership remains higher precedence than agent assignment when dirty data contains both, matching existing manager-first behavior.
- Manual financial-review charged closure must call the same award process when it transitions an operation to completed.
- No historical point ledger rewrite in this feature.

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/api-contract.md](./contracts/api-contract.md), and [quickstart.md](./quickstart.md).

## Source Of Truth And Data Rules

- **Operation source**: `Operation` status, type, amount, completed time, user id, and related ownership evidence at award time.
- **Program source**: `PointProgramSettings.pointsEnabled`, `pointsStartAt`, and `managerOwnedUserPointsEnabled`.
- **Rate source**: active `PointRule` rows for `USER_GLOBAL`, `MANAGER_OWNED_USER_DEFAULT`, `AGENT_DEFAULT`, `AGENT_OVERRIDE`, `MANAGER_DEFAULT`, and `MANAGER_OVERRIDE`.
- **Current admin/manager owner source**: active manager/admin ownership relation whose owner user is active and not deleted.
- **Current agent owner source**: active agent assignment whose agent is active and not deleted.
- **Legacy admin fallback source**: operation user creator is an active admin and there is no current manager/admin owner and no current active agent owner.
- **Ledger source**: `PointLedgerEntry` with source type `OPERATION_SPEND` and operation id.

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
8. Repeated award attempts must not duplicate ledger rows.

## Security Boundaries

- Award logs may include operation id, safe user id, owner role, owner kind, skipped reason, and point count only.
- Award logs must not include beIN passwords, TOTP secrets, cookies, sessions, storage state, ViewState, Telegram tokens, provider credentials, or raw request payloads.
- Admin-only reports may show point owner labels and operation ids needed for audit.
- The shared policy module must be pure and credential-free.

## Database And Migration Impact

- No schema migration is required for the core fix.
- Existing unique ledger constraint on owner, source type, and source id continues to prevent duplicate entries per owner and operation.
- No new index is planned unless verification shows a slow report or audit query.
- Historical point ledger rows are not rewritten or corrected automatically.

## Legacy And Backfill Behavior

- Old point entries remain unchanged.
- Completed historical operations are not automatically reprocessed.
- Release verification should identify recently completed operations with missing `OPERATION_SPEND` entries so the admin can decide whether to run a separate audited backfill later.
- Dirty ownership data is not cleaned in this feature; it is classified deterministically for award purposes only.

## API Authorization Rules

- No new public API is introduced.
- Existing admin financial-review decision route remains admin-only.
- Existing operation completion routes keep their current authorization.
- Any new diagnostic route is out of scope unless separately approved; release audit can be a developer/admin command.

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
- Unit tests proving manual financial-review charged closure calls point awards.
- Build checks for web and worker.
- Release audit query for completed operations missing operation-spend point entries after deployment.
- Encoding and diff safety checks.

## Verification Limitations

- Production data may contain dirty ownership rows; this feature classifies them deterministically but does not clean them.
- Historical point correction is intentionally out of scope.
- External Telegram/WhatsApp flows are not part of this feature.
- Browser verification only covers settings-page wording, not the worker runtime path.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. The plan preserves ledger idempotency and operation source evidence.
- **Traceable Planning**: PASS. `tasks.md` maps exact files and tests.
- **Test-First For Risky Behavior**: PASS. Behavior-changing tasks are preceded by tests.
- **Minimal, Encoding-Safe Edits**: PASS. Shared pure policy plus wrappers is the smallest reliable consolidation.
- **Security And Privacy Boundaries**: PASS. No sensitive runtime data is exposed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| None | No constitution violation is needed | The shared-policy approach fits within the constitution |
