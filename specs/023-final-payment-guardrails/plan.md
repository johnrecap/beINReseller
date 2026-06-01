# Implementation Plan: Final Payment Guardrails

**Branch**: `023-final-payment-guardrails` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-final-payment-guardrails/spec.md`

## Summary

Keep renewal balance deduction at final confirmation, but make that final step financially safe. Confirmation will become the single handoff into final payment: it deducts once, clears stale waiting deadlines, records dispatch evidence, and prevents duplicate confirmation. The worker must then persist a final-payment-started marker before pressing beIN Pay, re-check that the operation is still allowed to pay, perform delayed beIN verification, and send uncertain outcomes to manual review without automatic refund. The same rule is applied to installment paths. Inactive app subscription flows are excluded because they are not active in the current project.

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

**Primary Dependencies**: Existing operation routes, BullMQ operations queue, operation dispatch watchdog, Prisma operation/transaction models, worker HTTP client, recovery classifier, beIN spend ledger, financial review APIs, reseller refund helper

**Storage**: PostgreSQL through Prisma. Primary tables include `operations`, `transactions`, `operation_dispatches`, `bein_account_spend_ledger`, notifications, and existing review/audit records.

**Testing**: `node:test` with `tsx`, existing worker tests, existing integration tests, TypeScript check, Next production build, manual renewal/installment simulations where external beIN cannot be mocked fully.

**Target Platform**: Existing Next.js dashboard and Node worker processes in production.

**Project Type**: Full-stack web dashboard plus background worker.

**Performance Goals**: Final confirmation response remains fast after durable dispatch is recorded. Delayed beIN verification runs in the worker without blocking the UI. Recovery runners remain bounded and idempotent.

**Constraints**: Deduction stays at final confirmation. No automatic refund after Pay may have reached beIN without confirmed no-charge evidence. No sensitive beIN credentials, cookies, sessions, ViewState, or raw tokens may be exposed.

**Scale/Scope**: Renewal final confirmation, beIN outcome verification, recovery/cleanup behavior, installment parity, and admin review closure.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. This feature is entirely about financial evidence and explicitly defines source-of-truth, no-charge evidence, charge evidence, and review fallback.
- **Traceable Planning**: PASS. The task plan maps work to user stories, files, tests, risks, mitigations, and verification.
- **Test-First For Risky Behavior**: PASS. The plan starts with tests around final payment, delayed verification, recovery, installment, and review closure.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are targeted to operation confirmation, worker payment, recovery, installment, financial review, and tests.
- **Security And Privacy Boundaries**: PASS. The plan forbids exposing beIN passwords, TOTP secrets, cookies, sessions, ViewState, or raw provider tokens.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/023-final-payment-guardrails/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- final-payment-flow.md
|   `-- recovery-review.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- app/api/operations/[id]/
|   |-- confirm-purchase/route.ts
|   |-- confirm-installment/route.ts
|   |-- heartbeat/route.ts
|   `-- packages/route.ts
|-- app/api/operations/
|   |-- route.ts
|   `-- start-renewal/route.ts
|-- app/api/admin/financial-review/
|   |-- route.ts
|   `-- [operationId]/decision/route.ts
|-- lib/
|   |-- operation-dispatch.ts
|   |-- operation-safety.ts
|   |-- operations/recovery-classifier.ts
|   |-- operations/recovery.ts
|   |-- refund.ts
|   `-- bein-spend-ledger.ts
worker/
|-- src/http/HttpClientService.ts
|-- src/http-queue-processor.ts
|-- src/utils/error-handler.ts
`-- tests/
    |-- http-client-final-pay-delay.test.ts
    |-- http-client-payment-classification.test.ts
    `-- helpers/final-pay-fixtures.ts
tests/
|-- integration/
|   |-- operation-dispatch-watchdog.test.ts
|   `-- operation-timeout-recovery.test.ts
`-- unit/
    |-- operation-recovery-classifier.test.ts
    |-- operation-recovery-foundation.test.ts
    `-- final-payment-guardrails.test.ts
```

**Structure Decision**: Keep current boundaries. The Next.js routes own reseller confirmation and admin review decisions. The worker owns beIN Pay and provider evidence. Recovery helpers own timeout/refund/review classification. Tests should extend existing operation recovery and HTTP final-pay tests before implementation changes.

## Source Of Truth And Legacy Behavior

- `operations` remains the source of truth for operation status, amount, selected package, assigned beIN account, final confirmation deadline, heartbeat deadline, and response/evidence payload.
- `transactions` remains the source of truth for reseller deductions and refunds.
- `operation_dispatches` remains the durable dispatch source for final confirmation jobs.
- `bein_account_spend_ledger` remains the source of confirmed provider-side spend and duplicate detection.
- `responseData` phase evidence remains the short-term place for final-payment-started markers unless implementation proves a schema field is necessary.
- Legacy `COMPLETING` operations without phase evidence must be treated conservatively: if reseller money was deducted and Pay may have started, manual review wins over auto-refund.

## API Authorization Rules

- Reseller operation final confirmation must require the operation owner or admin as currently enforced.
- Installment confirmation must preserve the same operation ownership rules as renewal confirmation.
- Financial review list and decisions must require admin access only.
- No API response may expose beIN session data, ViewState, cookies, password, TOTP secret, proxy credentials, or raw provider tokens.

## Required Indexes And Migration Impact

- No migration is required for the first implementation if final-payment-started and delayed-verification evidence stays in `responseData`.
- If implementation needs queryable review closure fields, add a focused migration with backfill rules for existing `REVIEW_REQUIRED` operations.
- Existing uniqueness around active card operations, operation deductions, operation refunds, and beIN spend ledger must be preserved.
- Any migration must be safe for production data and must be preceded by an audit query for conflicting legacy rows.

## Verification Limitations

- Real beIN timing cannot be fully controlled in automated tests. Automated tests must simulate delayed provider balance changes and ambiguous responses.
- Real proxy behavior may differ by environment. Manual production-like worker tests should include one configured proxy account if available.
- Manual review closure needs admin UI or API validation with known test operations.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Plan defines evidence before Pay, after Pay, delayed verification, and admin review closure.
- **Traceable Planning**: PASS. `tasks.md` maps each story to files and verification.
- **Test-First For Risky Behavior**: PASS. Tests are first-class tasks before implementation.
- **Minimal, Encoding-Safe Edits**: PASS. Scope is constrained and final tasks include diff and mojibake checks.
- **Security And Privacy Boundaries**: PASS. Sensitive beIN runtime data stays out of API/UI/log outputs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No constitution violation is needed | No simpler alternative was rejected |
