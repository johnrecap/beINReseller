# Requirements Checklist: Fix Points Recipient Routing

**Feature**: `020-fix-points-routing`

**Created**: 2026-05-27

## Clarity

- [x] The expected routing behavior is explicit for agent, manager, admin, and no-owner cases.
- [x] The admin fallback condition is defined.
- [x] The difference between actual ledger role and rate bucket is defined.
- [x] Historical remediation scope is separated from forward-looking routing.

## Completeness

- [x] User stories are independently testable.
- [x] Functional requirements cover all ownership paths.
- [x] Edge cases cover invalid/deleted owners and converted historical points.
- [x] Success criteria are measurable.

## Safety

- [x] No requirement deletes existing ledger rows.
- [x] Converted historical points require review before balance changes.
- [x] Idempotency and eligibility rules must remain intact.
- [x] No unrelated rewards or Eid behavior is included.

## Readiness

- [x] No clarification markers remain.
- [x] Assumptions are documented.
- [x] The MVP is clear: fix recipient resolution and tests.
