# Implementation Plan: Credit Request Notification Handoff

**Branch**: `022-credit-notification-handoff` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-credit-notification-handoff/spec.md`

## Summary

Clarify and restyle the credit request notification settings block, keep WhatsApp as a manual handoff, improve the Telegram alert flow for new credit requests, and make the approval handoff reliable across desktop and mobile browsers by always showing the prepared WhatsApp message and copy/open actions. The implementation reuses the existing credit request, notification settings, Telegram log, WhatsApp handoff snapshot, assignment, and agent profile records.

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

**Primary Dependencies**: Existing admin dashboard components, `prisma.notificationSetting`, `prisma.creditRequest`, `prisma.whatsAppNotificationLog`, `prisma.whatsAppHandoffSnapshot`, existing auth helpers, existing Telegram fetch helper, existing clipboard/browser APIs

**Storage**: Existing PostgreSQL tables: `notification_settings`, `credit_requests`, `whatsapp_notification_logs`, `whatsapp_handoff_snapshots`, `agent_assignments`, `agent_profiles`

**Testing**: `node:test` + `tsx`, TypeScript check, Next production build, manual desktop/mobile browser checks

**Target Platform**: Existing admin dashboard and production server; desktop browsers, Android browsers, and iPhone browsers for copy/open behavior

**Project Type**: Full-stack Next.js dashboard

**Performance Goals**: Saving settings and approving a request should remain immediate for an admin. Telegram send timeout remains bounded so request creation is not blocked for a long period.

**Constraints**: WhatsApp must not send automatically. Telegram secret must not be displayed or logged. Approval must preserve existing balance behavior. Clipboard behavior must tolerate browser denial.

**Scale/Scope**: One settings block, one credit request approval handoff dialog, existing Telegram alert/retry flow, focused tests for message formatting, destination priority, and secret handling.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Evidence-Driven Operation Accounting**: PASS. The feature touches credit request approval UX but must not alter balance accounting. The plan includes verification that approval balance behavior remains unchanged.
- **Traceable Planning**: PASS. Tasks must map to user stories and include reason, expected result, risks, mitigation, and verification.
- **Test-First For Risky Behavior**: PASS. Telegram secret handling, notification formatting, destination priority, and approval handoff require focused tests before behavior changes.
- **Minimal, Encoding-Safe Edits**: PASS. Changes are scoped to notification settings, credit request notification/handoff helpers, admin credit request UI, and tests. Edits must use `apply_patch`.
- **Security And Privacy Boundaries**: PASS. Telegram secrets must remain hidden, must not be logged, and should be stored/handled through a privacy-safe path without exposing raw values in API responses.

No constitution violations are required.

## Project Structure

### Documentation (this feature)

```text
specs/022-credit-notification-handoff/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- notification-settings.md
|   `-- credit-request-handoff.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- components/admin/
|   |-- NotificationSettingsForm.tsx
|   `-- credit-requests/AdminCreditRequestsClient.tsx
|-- app/api/admin/notification-settings/
|   |-- route.ts
|   `-- telegram/test/route.ts
|-- app/api/credit-requests/
|   `-- route.ts
|-- app/api/admin/credit-requests/
|   |-- route.ts
|   |-- [id]/decision/route.ts
|   `-- [id]/notification-retry/route.ts
`-- lib/credit-requests/
    |-- telegram.ts
    |-- notifications.ts
    |-- whatsapp-handoff.ts
    `-- types.ts

tests/
`-- unit/
    |-- credit-request-notifications.test.ts
    `-- credit-request-whatsapp-handoff.test.ts
```

**Structure Decision**: Keep the existing feature boundaries. Notification settings UI remains in `NotificationSettingsForm.tsx`; Telegram formatting/sending stays in `src/lib/credit-requests/telegram.ts` and `notifications.ts`; manual WhatsApp approval behavior stays in `whatsapp-handoff.ts` and `AdminCreditRequestsClient.tsx`. Add or extend focused unit tests rather than creating a new subsystem.

## Source Of Truth And Legacy Behavior

- Source of truth for notification settings remains `notification_settings` singleton row with `singleton_key = default`.
- Source of truth for customer credit request state remains `credit_requests`.
- Source of truth for request alert attempts remains `whatsapp_notification_logs`, including Telegram provider rows.
- Source of truth for manual WhatsApp approval output remains `whatsapp_handoff_snapshots`.
- Existing Telegram token values may already be saved in the current field. Implementation must support current saved values and avoid breaking existing alerts after deploy.
- Existing customer/agent/default WhatsApp destination priority remains request URL snapshot, current assignment URL, agent default, then global default. Source Group labels are separate historical metadata: a null request snapshot remains no-group and never inherits a later assignment group.

## API Authorization Rules

- Notification settings GET/PUT/test endpoints must require exact ADMIN access.
- Admin credit request list, retry, and decision endpoints must require exact ADMIN access.
- Customer credit request creation must keep existing authenticated USER eligibility rules.
- No response may include the raw Telegram secret.
- No response may claim WhatsApp was sent automatically.

## Required Indexes And Migration Impact

- No schema migration is expected.
- Existing `notification_settings.singleton_key` uniqueness is sufficient.
- Existing `credit_requests` and `whatsapp_handoff_snapshots.credit_request_id` constraints are sufficient.
- If Telegram secret storage is hardened in-place, it must reuse the existing column and handle legacy plaintext values without a migration.

## Verification Limitations

- Real Telegram delivery depends on a valid bot token and external Telegram availability.
- Browser clipboard permissions vary by platform; automated tests can validate fallback logic, but desktop/Android/iPhone manual checks are still required.
- Opening WhatsApp depends on installed apps or browser support.
- Production deployment should follow the safe Next.js build order from `AGENTS.md`; no Prisma migration is expected.

## Post-Design Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. Approval balance changes are not redesigned and must be regression-tested manually or through existing checks.
- **Traceable Planning**: PASS. `tasks.md` maps stories to files, tests, and verification.
- **Test-First For Risky Behavior**: PASS. Tests are planned before changes to notification formatting, secret handling, and handoff destination behavior.
- **Minimal, Encoding-Safe Edits**: PASS. Scope is limited and final checks include mojibake scan.
- **Security And Privacy Boundaries**: PASS. Telegram secret output/logging is explicitly constrained.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No constitution violation is needed | No simpler alternative was rejected |
