# Implementation Plan: Financial Review Evidence Provenance

**Branch**: `030-financial-review-evidence` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-financial-review-evidence/spec.md`

## Summary

Fix financial review evidence handling so stale package-load beIN balances cannot be displayed or stored as confirmed provider deductions. The implementation separates customer deduction, trusted final-payment beIN debit evidence, legacy/unverified evidence, and manual admin conclusions. Review decisions become safer: missing provider evidence is unknown, old inflated values are preserved but downgraded, and admin decisions record explicit payment-status conclusions with optional notes.

## Planning Quality Standard

Every generated `tasks.md` for this feature MUST include, for each task, the standard checklist line followed by a detail block:

- **Reason**: why this task is needed.
- **Expected**: the concrete outcome after completion.
- **Possible bugs**: realistic regressions or edge cases the task can introduce.
- **Fix/Mitigation**: how to prevent or repair those bugs.
- **Verification**: exact command, test, UI flow, or data check.

The plan MUST call out source-of-truth data, legacy/backfill behavior, security boundaries, required indexes, and known verification limitations.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js runtime, React 19.2

**Primary Dependencies**: Next.js 16.1, Prisma 7.2, PostgreSQL, zod, existing worker HTTP client, existing financial review APIs

**Storage**: PostgreSQL through Prisma plus existing JSON operation response metadata. Short-term manual decisions are append-only in operation response metadata; a normalized table is deferred unless reporting requirements need it.

**Testing**: Focused `npx tsx --test` unit/integration tests, `npx prisma validate`, `npx prisma generate`, `npm run build`, `npm --prefix worker run build`

**Target Platform**: Existing Desh Panel admin web app, API routes, background worker, and production PostgreSQL database

**Project Type**: Full-stack Next.js application with Prisma-backed APIs and a TypeScript worker

**Performance Goals**: Review list remains bounded to existing 300-row query. Evidence classification is per-row and does not scan ledger history broadly. Worker final-payment path avoids extra provider calls beyond existing balance reads.

**Constraints**: Do not delete or rewrite historical ledger/audit values. Missing evidence is unknown, not proof of no charge. Do not expose beIN passwords, sessions, cookies, ViewState, TOTP secrets, or raw provider HTML in UI/API. Use production-safe migrations if schema changes become necessary.

**Scale/Scope**: Renewal final-payment evidence capture, financial review backend evidence builder, admin decision API, financial review UI, legacy reclassification logic, focused tests. Installment source labeling is included if it shares the same evidence path; otherwise the risk is explicitly documented.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. The feature exists to separate trusted provider evidence from diagnostic and legacy data.
- **Traceable Planning**: PASS. Tasks map stories to files, tests, expected outcomes, risks, mitigations, and verification.
- **Test-First For Risky Behavior**: PASS REQUIRED. This changes refund/no-refund decisions and provider spend evidence, so focused tests must be written before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Plan uses targeted helpers and UI/API changes. No full-file rewrites.
- **Security And Privacy Boundaries**: PASS. New UI exposes only evidence labels, beIN account labels/usernames already used for admin audit, and redacted decision metadata.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/030-financial-review-evidence/
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
src/
|-- app/api/admin/financial-review/
|   |-- route.ts
|   `-- [operationId]/
|       |-- decision/route.ts
|       `-- verify-card/route.ts
|-- components/admin/financial-review/FinancialReviewClient.tsx
|-- lib/financial-review/
|   |-- evidence.ts
|   `-- types.ts
|-- lib/operation-detail-audit.ts
|-- lib/integrity/detector.ts
`-- lib/operations/

worker/
|-- src/http-queue-processor.ts
|-- src/http/HttpClientService.ts
`-- src/lib/bein-spend-ledger.ts

tests/
|-- unit/
`-- integration/
```

**Structure Decision**: Keep the existing Next.js app, Prisma, and worker structure. Add small evidence classification helpers near `src/lib/financial-review/` and update worker capture points where provider evidence is produced.

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design

See [data-model.md](./data-model.md), [contracts/api-contract.md](./contracts/api-contract.md), and [quickstart.md](./quickstart.md).

## Source Of Truth And Evidence Rules

- **Customer deduction source of truth**: `Transaction` rows with `OPERATION_DEDUCT`, operation amount, and customer wallet debits where applicable.
- **Confirmed beIN debit source of truth**: final-payment before and after balances captured from the final payment flow for the same operation/account context, or explicit manual admin verification.
- **Diagnostic data**: package-load or pre-final saved balances. These may help debug but must not create confirmed provider spend.
- **Legacy data**: existing ledger/audit values lacking provenance. These remain visible as old stored values but do not become trusted evidence unless manually verified.
- **Manual decision source**: append-only `financialReview` metadata in operation response data for v1, with possible normalized table later.

## Legacy Handling

Legacy rows are not deleted. Suspicious rows are reclassified at presentation/repair time as `legacy-unverified` when they lack final-payment provenance and show provider debit higher than the customer deduction beyond tolerance. Original amounts remain visible as old stored values.

## Security And Authorization

Only admins can view or submit financial review decisions. Manual verification metadata must include admin identity and timestamp. Sensitive beIN runtime data remains redacted and is not sent to the client.

## Known Verification Limitations

- The existing "check card now" endpoint is stored-evidence review, not live provider verification. It must be renamed unless a real provider check is implemented.
- Manual verification can confirm business outcome, but if no actual beIN debit amount is supplied, the UI must not calculate a customer-vs-provider difference.
- Provider charge confirmed but card not renewed is a conflict state requiring manual escalation, not automatic refund or no-refund.
