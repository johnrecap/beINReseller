# Feature Specification: Panel Responsiveness and beIN Login Health

**Feature Branch**: `codex/037-panel-responsiveness-login-health`

**Created**: 2026-11-03

**Status**: Implementation authorized 2026-11-04; acceptance pending

**Input**: The documentation phase is complete. On 2026-11-04 the user requested implementation of this plan. Execute the accepted task IDs locally; deployment remains outside this delivery.

## Clarifications

### Session 2026-11-04

- Q: Is runtime implementation now authorized? → A: Yes: "ابدأ في تنفيذ الخطه". Preserve the approved behavior and evidence requirements; no sub-agents. Prior documentation receipts describe the preceding phase only.

### Session 2026-11-03

- Q: Is the freeze limited to one beIN row? → A: No; cover all panel operations and navigation, including account creation and user-balance changes.
- Q: When is a provider account disabled? → A: First terminal credential rejection, exhausted CAPTCHA or invalid authentication outcome; ADMIN manually reactivates. Transport/proxy/rate-limit errors are separate warnings.
- Q: Does ordinary session expiry disable an account? → A: No; use the existing fresh-login procedure first.
- Q: What is authorized now? → A: Persist specifications, contracts, checklists, tasks and analysis only, directly without sub-agents; do not implement runtime tasks.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep using the panel during work (Priority: P1)

A signed-in panel user navigates and performs independent work while an earlier action is pending, without repeating it.

**Why this priority**: Unrelated controls currently become unavailable during reported slow operations.

**Independent Test**: Hold an account-creation or user-balance response, hide its dialog, navigate and use another resource before releasing that response; reopening the original action preserves pending/uncertain protection.

**Acceptance Scenarios**:

1. **Given** pending work, **When** its dialog is hidden, **Then** a nonblocking status remains and the panel is interactive; hiding does not cancel server work.
2. **Given** pending/uncertain work, **When** a conflicting mutation targets its resource, **Then** only that conflict is blocked; unrelated work remains available.
3. **Given** delayed navigation data, **When** another destination is selected, **Then** navigation remains responsive and the latest destination wins.
4. **Given** a lost financial response, **When** the user navigates or reloads the same tab, **Then** the action is not resubmitted or declared unexecuted from an ordinary balance read.
5. **Given** a submitted form, **When** it is reopened, **Then** immutable submitted values and new draft values remain distinct and stale results cannot overwrite a newer attempt.

### User Story 2 - Follow a balance refresh without waiting on the page (Priority: P1)

An administrator starts a dealer-balance refresh and follows its progress while using the rest of the panel.

**Why this priority**: It is a reported freeze trigger and needs a trustworthy terminal outcome.

**Independent Test**: Hold a simulated refresh, navigate away, then finish/fail it; verify one execution and the correct account result on return.

**Acceptance Scenarios**:

1. **Given** an eligible account, **When** refresh is accepted, **Then** queued/running status appears promptly without waiting for the provider.
2. **Given** concurrent refresh submissions for one account, **When** admitted, **Then** callers follow one active refresh.
3. **Given** a known worker/provider failure, **When** follow-up occurs, **Then** it exposes a safe failure, not false success or indefinite progress.
4. **Given** connection loss, expired results or interruption, **When** follow-up occurs, **Then** unavailable/unknown is distinguished from confirmed failure and a new balance observation.

### User Story 3 - Identify and repair unusable provider logins (Priority: P1)

An administrator sees accounts with terminal login failures disabled with an actionable reason, and deliberately reactivates repaired accounts.

**Why this priority**: A known unusable account must not keep receiving new work behind an active badge.

**Independent Test**: Exercise terminal-login and transport fixtures across all callers and an ADMIN recovery race; assert activity, reason, counters and assignment eligibility.

**Acceptance Scenarios**:

1. **Given** a completed login procedure, **When** it ends in credential rejection, exhausted CAPTCHA or invalid authentication result, **Then** the account is immediately disabled and the next monitor read shows why.
2. **Given** an expired session, **When** fresh login succeeds, **Then** the account stays active without terminal failure.
3. **Given** a network/proxy/rate-limit failure, **When** recorded, **Then** a connection warning appears without credential counting or disablement by login handling.
4. **Given** a disabled account, **When** background success or counter-only reset occurs, **Then** it remains disabled.
5. **Given** ADMIN recovery races an older attempt, **When** the old attempt finishes, **Then** it cannot undo recovery or restore stale sessions.

### Edge Cases

- Slow bodies, timeout after possible commit, double clicks, hidden dialogs, navigation/unmount, same-tab reload, actor changes and mobile sidebar dismissal.
- Edited/disabled/deleted queued accounts, worker crashes, duplicate workers, late results, cache loss and unavailable dependencies.
- Generic unauthenticated pages versus explicit rejection; challenge versus exhausted CAPTCHA; local configuration/revision failures before authentication; health persistence failure.
- Empty/stale lists, failed follow-up reads, invalid input, revoked access, busy recovery and legacy reasons.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Actions MUST leave unrelated controls and navigation usable; block only the same action or conflicting mutations of its resource.
- **FR-002**: Pending dialogs MUST be hideable without canceling server work, losing command identity or leaving an invisible interaction-blocking layer.
- **FR-003**: Pending/uncertain identity MUST survive internal navigation and same-tab reload; actor changes MUST isolate private command state.
- **FR-004**: Uncertain financial commands MUST NOT be retried automatically or cleared by ordinary account reads; authoritative reconciliation remains controlling.
- **FR-005**: Submitted payloads MUST remain immutable per attempt; stale completions cannot overwrite newer attempts. Sensitive form values MUST NOT enter browser storage.
- **FR-006**: Navigation loading MUST preserve an interactive shell, correct focus and pointer/keyboard cleanup.
- **FR-007**: All panel consumers of shared busy/command behavior MUST be covered, preserving their specific permissions and confirmation requirements.
- **FR-008**: Dealer refresh MUST expose accepted, queued, running, completed, failed and unavailable outcomes without holding the page until completion.
- **FR-009**: One account MUST have at most one active refresh; unrelated accounts retain independent progress.
- **FR-010**: Success MUST use the request's attributable balance observation; removed jobs or unrelated account timestamps are not success evidence.
- **FR-011**: Refresh MUST have bounded queue/execution/result lifetimes and lost-reply recovery without debit, purchase or refund effects.
- **FR-012**: Existing authorized refresh clients MUST remain compatible; all follow-up reads enforce current ADMIN access and account/request binding.
- **FR-013**: First terminal credential rejection, exhausted CAPTCHA or invalid authentication result after actual login MUST disable immediately, without an attempt threshold.
- **FR-014**: Ordinary expiry MUST use existing fresh-login recovery first; intermediate challenges/retries are not terminal outcomes.
- **FR-015**: Transport/proxy/rate-limit failures MUST be visible separately without credential counting or disablement through generic login-error paths. Pre-authentication system failures are warnings, not provider rejection.
- **FR-016**: All login callers MUST share this policy without increasing retries, worker concurrency or keepalive cadence.
- **FR-017**: Health/session writes MUST respect account revision and ownership; new assignment excludes disabled accounts. Existing uncertain financial work retains its evidence/recovery rules.
- **FR-018**: Account list and monitor MUST expose activity, safe reason, time and recovery action from the first recorded failure, independent of credential count.
- **FR-019**: Reactivation MUST be explicit ADMIN action through protected recovery; background success/counter reset cannot reactivate, and busy conflicts remain protected.
- **FR-020**: The old threshold control MUST cease to govern this policy; legacy values remain readable without bulk disablement or history rewriting.
- **FR-021**: Changed states MUST use ar/en/bn catalogs and support RTL, keyboard, narrow screens and accessible nonblocking progress.
- **FR-022**: Diagnostics MUST exclude passwords, session material, provider HTML and submitted financial bodies; use safe codes and attempt/request identifiers.
- **FR-023**: The release plan MUST cover connected web/worker contracts, rollback and evidence gaps without changing commercial, ledger or payment-proof semantics.
- **FR-024**: Respect the authorized delivery phase. The documentation-only phase ended on 2026-11-04 when the user authorized implementation. Runtime tasks MUST remain unchecked until their required evidence is current; local implementation does not authorize deployment or establish runtime acceptance.

### Key Entities *(include if feature involves data)*

- **Panel command**: actor/action/resource, conflict identity, attempt, immutable submission, progress and result certainty.
- **Balance refresh request**: account/request identity, lifecycle/deadline and attributable observation or safe failure.
- **Provider login health**: activity, attempt revision, safe category/timestamps and credential-only counter.
- **Manual recovery**: ADMIN identity, account ownership checks, revised session state and explicit activation intent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a response held for 60 seconds, unrelated controls, hide actions and navigation selections respond within one second before release, across all declared consumer groups.
- **SC-002**: Duplicate/navigation/reload/timeout scenarios submit at most one instance of the same protected mutation; uncertain cases remain unresolved until authoritative reconciliation.
- **SC-003**: With healthy local services and a held provider response, refresh acceptance appears within two seconds; a readable terminal outcome appears within one follow-up interval plus one second.
- **SC-004**: Every terminal-login fixture disables on its first final outcome; transport/rate-limit fixtures preserve activity/counter and all stale-recovery writes are rejected.
- **SC-005**: Every first recorded failure appears accurately on the next successful monitor read; no background path reactivates an account.
- **SC-006**: Changed flows pass at 360/768/1280 CSS pixels with keyboard and ar/en/bn coverage; after hiding/navigation no invisible overlay intercepts an unrelated click.
- **SC-007**: Every FR/SC maps to tasks and checks; this planning delivery changes zero runtime files, performs zero provider/business-data operations and completes zero runtime tasks.

## Assumptions

- Panel and connected shared services are in scope; customer/store/mobile UI redesign, general server tuning and new UI libraries are excluded.
- Timings are controlled-test acceptance targets, not measured production guarantees. Full navigation-freeze causality and authenticated production latency remain unverified.
- Navigation and same-tab reload are covered; this feature does not promise universal cross-tab/server idempotency for every existing financial endpoint.
- Unknown terminal authentication may quarantine a changed provider page; label it login review, not proved incorrect credentials. Manual reactivation is the accepted policy.
- Existing bounded retries stay unchanged. Revision capture or configuration failure before authentication cannot establish credential rejection.
- Historical 027/036 evidence and release gaps remain open; planning acceptance is separate from implementation and production acceptance.
