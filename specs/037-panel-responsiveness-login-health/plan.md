# Implementation Plan: Panel Responsiveness and beIN Login Health

**Branch**: `codex/037-panel-responsiveness-login-health` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Documentation completed; user authorized application implementation on 2026-11-04. Task-specific acceptance remains pending.

**Note**: Produced through the local speckit-plan workflow using the unchanged original plan template; application implementation is now in progress.

## Summary

Preserve an interactive dashboard while commands run, replace synchronous dealer-balance waiting with a tracked read-only job, and apply first-terminal-login quarantine consistently. Source findings and unknowns are separated in [research.md](research.md). This feature links to 027 login recovery and 036 panel/financial safety; it does not recertify them.

## Planning Quality Standard

Every task has Reason, Expected, Possible bugs, Fix/Mitigation and Verification from the original task template, plus requirement IDs and dependencies. Runtime tasks are unchecked. Sources of truth, legacy handling, authorization and evidence limits are explicit below and in the contracts.

## Technical Context

**Language/Version**: Existing TypeScript; root package uses Next.js 16.1.1 / React 19.2.3.
**Primary Dependencies**: Existing Radix Dialog, BullMQ, ioredis, Prisma 7.2 and next-auth; no new packages.
**Storage**: PostgreSQL account health and balances; Redis refresh request state; memory plus minimal sessionStorage command tombstones.
**Testing**: Existing Node/tsx unit and Worker suites, isolated PostgreSQL/Redis integration harnesses, existing mocked-browser panel harness; real pointer/focus assertions.
**Target Platform**: Existing Linux deployment and Windows local development; desktop and mobile browsers.
**Project Type**: Next.js panel/API plus shared contracts and a separate Worker.
**Performance Goals**: SC-001/SC-003 controlled delayed-response targets; 2-second refresh polling; no production latency guarantee.
**Constraints**: No financial replay, provider purchase, schema change or dependency installation in this documentation task; no new UI library or retry/concurrency increase.
**Scale/Scope**: All panel shared-command/dialog consumers in the consumer matrix; existing worker topology is preserved, actual production inventory remains unverified.

## Constitution Check

| Principle | Design evidence | Planning disposition |
| --- | --- | --- |
| Evidence-driven accounting | [command contract](contracts/panel-commands.md), [refresh contract](contracts/balance-refresh.md): uncertainty never refunds/replays; balance observations are display data | Satisfied in design; runtime NOT_VERIFIED |
| Traceable planning | tasks retain original detail fields; analysis maps every FR/SC | Checked by planning gate |
| Tests before risky behavior | T002/T003/T009/T014 precede their behavior changes; test seam extraction only where absent | Required, not executed |
| Minimal encoding-safe edits | Reuse shared components; original templates; UTF-8/BOM/diff check | Required for docs and implementation |
| Security/privacy | Current role checks, actor isolation, no raw provider secrets or body persistence | Contracted, runtime NOT_VERIFIED |

No principle is waived. Configuration and template customizations are preserved. The missing historical 027 evidence contract remains an explicit separate gap, not a new feature PASS.

## Project Structure

### Documentation (this feature)

The feature directory contains spec, plan, research, data-model, quickstart, contracts, requirement-quality checklists, tasks and evidence. [analysis.md](analysis.md) is the canonical planning issue/coverage register. Evidence records only the scope actually checked.

### Source Code (repository root)

Existing roots: `src/` web/API, `shared/` portable contracts, `worker/src/` queue/provider consumers, and `tests/` plus `worker/tests/`. Exact existing consumers are in research; planned new files are explicitly labelled below and in tasks.

**Structure Decision**: Extend existing request/dialog infrastructure and provider-report-style Redis admission. Do not introduce a second app, generic workflow platform or new financial ledger.

## Implementation Design

1. **Shared command lifecycle (US1)**: planned `src/components/providers/PanelCommandProvider.tsx` mounted within the stable DashboardShell, backed by planned `src/lib/panel-command-state.ts`. `usePanelCommand` delegates command ownership to it instead of an unmount-owned controller. Keep the existing latest-read request generation/deadlines. Conflict identity is actor + resource family + resource ID; action + attempt identifies the specific command. Atomically claim before sending. Persist only tombstones before dispatch; if sessionStorage is unavailable, refuse protected non-idempotent submission with a localized actionable error. Read-only refresh remains usable.
2. **Dialogs and consumers (US1)**: keep ordinary pre-submit modal confirmation. After a command is accepted locally, expose Hide and nonblocking pending status; X/Escape can hide. Never make sensitive confirmation dialogs transparent to background clicks. Independent work becomes available after hide. Parent busy handlers must permit hide, while immutable submitted controls remain protected. Remove page-level busy fieldsets; local read-loading must not disable unrelated existing rows. Add `src/app/dashboard/loading.tsx` inside the persistent shell and verify actual route boundaries; never force body pointerEvents globally. A navigation reproduction failure is evidence to investigate, not permission to claim a fixed root cause.
3. **Refresh job (US2)**: optional asynchronous mode on the current POST, GET follow-up, shared queue singleton, separate Redis namespace, one active request per account, owner/run-token fenced terminal result. Defaults and exact compatibility behavior are in the refresh contract. Existing account execution/reservation guards remain final concurrency authority. Failed worker execution records FAILED and rejects the queue job. Never infer success from job disappearance or account timestamps.
4. **Login health (US3)**: extend existing typed outcomes with explicit attempt-started/terminal context; one policy records all final outcomes. Credential-only counter retains its meaning. Quarantine credential/CAPTCHA/unknown authentication outcomes immediately; warn on transport/rate limit/local system errors. Persist safe codes using existing reason/timestamp fields with revision CAS. All caller guards must use the policy rather than credential-only filtering. Treat persistence failure as failed work with safe diagnostics, never healthy success.
5. **ADMIN recovery/monitor (US3)**: reuse protected recovery for every activation route: toggle, low-balance reactivation and edit-to-active; combined edits stay atomic under the helper's owned transaction. Keep counter-only reset inactive. Monitor first failure independent of count, include isActive and typed code/category. Retire editable threshold semantics while retaining old DB values and compatibility fields. Catalog keys under existing locale namespaces cover progress, unavailable results and health reasons.
6. **Connected effects**: disabled accounts reject new assignments without canceling/reassigning uncertain purchases or changing operation proof/settlement. Successful reads never establish payment fulfillment. Existing purchase-route snapshots, locks, ledgers, commission/points rules and current ownership checks remain authoritative.

## Data, Compatibility and Operations

No new Prisma fields, indexes, migrations or bulk backfill. Account timestamps/reasons are PostgreSQL truth; Redis tracks only refresh requests and delivery health; browser state is advisory duplicate protection. Existing account SQL predicates/owned leases remain mandatory.

Web and Worker must be released together only in a later authorized release. Build Worker artifacts first, drain/stop old Worker consumers, restart all applicable consumers with the compatible handler, then stop web before replacing its .next/build and restart web. KeepAlive must share the same login policy before admission. Preserve exact reviewed topology, not a guessed process count. Old jobs without requestId remain readable; old clients without async mode keep the synchronous response contract. Rollback to old code requires draining new jobs first and explicitly acknowledging restoration of the previous threshold policy; never auto-enable quarantined accounts. No deployment is performed here.

Monitor safe request/attempt IDs, queue age, execution duration, expired/unknown outcomes, rejected stale writes and health persistence failures. Do not log credentials, account payloads, provider HTML or financial bodies. The runbook distinguishes local fixtures from authorized production observation.

## Complexity Tracking

No constitutional violation. A dashboard-owned command registry is required to retain identity across unmount; component-local refs cannot do so. Separate Redis refresh records are required because removed BullMQ jobs and unrelated balance timestamps cannot attribute completion. A new durable financial-command platform is deliberately outside scope; same-tab uncertainty remains blocked when no authoritative outcome can be established.
