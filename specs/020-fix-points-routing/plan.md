# Implementation Plan: Fix Points Recipient Routing

**Branch**: `020-fix-points-routing` | **Date**: 2026-05-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/020-fix-points-routing/spec.md`

## Summary

Fix operation spend point routing so users receive points only when they are under an AGENT. Manager-owned users award points to the manager only. Direct admin-created users with no manager link and no active agent assignment award points to the creating admin only. The fix updates recipient resolution, keeps actual ledger role accurate, uses manager rate rules for admin-as-manager, and includes a safe audit/remediation plan for historical wrong awards.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Next.js 16.1 app router, Prisma 7.2

**Primary Dependencies**: Existing Prisma client, `src/lib/points/operation-awards.ts`, point settings/rules, point ledger, unit tests through `node:test` + `tsx`

**Storage**: Existing PostgreSQL tables: `users`, `manager_users`, `agent_assignments`, `operations`, `point_ledger_entries`, `point_rules`, `point_cash_redemptions`

**Testing**: `npx tsx --test tests/unit/points-operation-awards.test.ts`, `npx tsx --test tests/unit/points-analysis.test.ts`, `npx tsc --noEmit`, `npm run build`

**Target Platform**: Existing production web app and worker/recovery flows that call operation point awards

**Project Type**: Full-stack Next.js dashboard with shared server libraries

**Performance Goals**: Recipient resolution remains a single operation fetch with nested ownership relations. Historical audit runs read-only and paginated/bounded if implemented.

**Constraints**: Do not delete ledger rows. Preserve idempotency through existing unique constraints. Do not auto-debit balances for converted wrong points. Preserve agent-owned USER + AGENT behavior.

**Scale/Scope**: One core routing library, existing operation point tests, optional read-only audit helper/script, no schema migration expected.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. Forward fix uses existing ownership evidence and historical remediation uses ledger reversals, not deletes.
- **Traceable Planning**: PASS. Tasks map routing stories to files, tests, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. Points and balance-adjacent logic must start with failing tests.
- **Minimal, Encoding-Safe Edits**: PASS. Expected code edits are scoped to point routing, tests, and optional audit helper.
- **Security And Privacy Boundaries**: PASS. No beIN secrets or provider data are exposed.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/020-fix-points-routing/
|-- plan.md
|-- spec.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- operation-point-routing.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- lib/points/
|   |-- operation-awards.ts
|   |-- settings.ts
|   `-- historical-routing-audit.ts
|-- app/api/admin/reports/points-analysis/
|   `-- route.ts

tests/
|-- unit/points-operation-awards.test.ts
|-- unit/points-analysis.test.ts
`-- unit/points-routing-audit.test.ts
```

**Structure Decision**: Fix the root cause in `src/lib/points/operation-awards.ts`, where recipients are resolved before ledger entries are created. Add an optional pure audit helper only if historical remediation is implemented now; otherwise document manual SQL/report workflow in quickstart.

## Source Of Truth And Legacy Behavior

- New awards source of truth: `operations.user`, `user.managerLink`, active `user.agentAssignmentAsUser`, and `user.createdBy`.
- Point ledger source of truth: `point_ledger_entries`.
- Existing wrong historical entries must remain as evidence; correction should use `POINT_REVERSAL` and new correct owner entries where safe.
- Converted wrong points are flagged for review and are not automatically debited.

## API Authorization Rules

- Forward routing code is internal and called by existing operation confirmation/recovery flows.
- Any historical audit/remediation endpoint or script must require admin-only execution.
- No user-facing API behavior changes are required for point conversion or rewards.

## Required Indexes And Migration Impact

- No Prisma schema migration is expected.
- Existing relations and indexes should support forward recipient resolution.
- Historical audit may need bounded pagination over `point_ledger_entries` by source type/status/owner role. Add indexes only if implementation review shows current indexes are insufficient.

## Verification Limitations

- Historical correction requires production data review; unit tests can validate classification but not decide every real account's intent.
- Existing converted wrong points may require a business decision before any balance debit.
- Some old records may lack reliable point-in-time ownership evidence; those must be reported as review-required.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Plan uses ledger evidence and does not destroy history.
- **Traceable Planning**: PASS. `tasks.md` includes test-first and verification steps.
- **Test-First For Risky Behavior**: PASS. Red tests for recipient resolution are mandatory before implementation.
- **Minimal, Encoding-Safe Edits**: PASS. No broad refactor or schema change.
- **Security And Privacy Boundaries**: PASS. No sensitive provider data is exposed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
