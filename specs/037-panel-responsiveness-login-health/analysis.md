# Specification Analysis and Delivery Register

Feature: 037. Review date: 2026-11-04. Scope: application implementation authorized by the user's subsequent instruction. Runtime acceptance: NOT_VERIFIED. This is the canonical issue/obligation register for this feature; it does not replace 027/036 registers. The following planning receipts remain historical; current execution evidence belongs in evidence/implementation.md.

## Implementation phase reconciliation

The user authorized the accepted T001–T024 workflow on 2026-11-04. O01's documentation-only restriction describes the completed preceding phase; it no longer prohibits runtime changes. O02–O12 and all FR/SC mappings remain binding. No requirement, original template or historical evidence gap is waived. Source discovery reconfirmed C01–C07 and the queue/report/keepalive tracking callers before runtime edits. Planning structural analysis must run with explicit implementation-phase scope; it does not certify runtime tests. No deployment, provider purchase or automatic commit is authorized by this phase change.

Current runtime status is PARTIAL. T004–T006 have foundation/C01/C02 and scoped unit/browser evidence. T009–T012 have async balance store/API/Worker lifecycle with selected tests and temporary native Redis concurrency; UI polling and integrated SQL/Worker acceptance remain open. T014–T015 have health helpers; balance uses the revision-returning success writer, while first-terminal failure policy is not wired across callers. All task boxes remain open. C03–C07, remaining US2/US3 and T020–T024 gates are required work, not accepted omissions. See evidence/implementation.md, evidence/current-checks.json and evidence/native-redis-checkpoint.json. Design resolutions below do not imply zero outstanding runtime issues.

## Findings

Continuation: T007 edit/reset and T013 dashboard-owned polling/row observations have focused checks. Missing-result retry/status-specific copy, C03 creation/transfers, C04–C07 and integrated SQL/Worker/real-router gates remain NOT_VERIFIED. These are open implementation obligations, not accepted requirement reductions; see the latest execution evidence.

| ID | Category | Severity | Location | Finding and resolution | State |
| --- | --- | --- | --- | --- | --- |
| A01 | Coverage | HIGH | Health contract / T017 | Toggle-only recovery omitted account PUT and low-balance reactivation. Added both and atomic combined-edit handling after inspecting the real routes | RESOLVED in design |
| A02 | Source accuracy | MEDIUM | T016 / research OBS-12 | Initial pool filename was wrong; generic failure caller is currently low balance, not proved login transport. Corrected path and bounded inspection requirement | RESOLVED |
| A03 | Safety clarity | HIGH | Command contract / T003–T004 | Navigation-only ownership was insufficient for same-tab reload, actor change and storage failure. Explicit tombstones, uncertainty, safe storage failure and no-replay rules now specified | RESOLVED in design |
| A04 | Evidence attribution | HIGH | Research OBS-01/10 / T002/T008 | Account fieldset proves scoped disabling, not outer navigation causality. Separate real-route/mouse reproduction and production limits retained | RESOLVED as explicit verification obligation |
| A05 | Compatibility | MEDIUM | Balance contract / T011–T012 | Missing jobs/timestamps cannot prove request completion. Added request-attributed terminal result, active lookup, legacy adapter and old-payload handling | RESOLVED in design |
| A06 | Template completeness | MEDIUM | Plan/tasks/checklists metadata | The original-template checker found omitted explicit Note/Purpose/Goal/Independent Test/Checkpoint labels despite related prose. Restored every original field without changing templates or weakening the gate; corrected an evidence quotation | RESOLVED; 56 original headings checked on rerun |

No runtime repair or user approval is inferred from these resolutions. Detailed artifact acceptance has not been separately reviewed by the user; the supplied outline and documentation scope were explicitly authorized.

## Obligations

| ID | Source and requirement | Output / verification | Current scope status |
| --- | --- | --- | --- |
| O01 | Accepted user plan; spec FR-024 | Only feature docs/pointers/handoff changed; no implementation tasks checked | VERIFIED; planning-validation.json |
| O02 | Spec Kit governance; constitution Traceable Planning | Specify, clarify, plan, checklist, tasks, analyze; original templates and all five task fields | VERIFIED; template-validation.json and planning-validation.json |
| O03 | always-on compliance workflow | First representative task verified before scaling; all 24 tasks checked against the same original detail template | VERIFIED; representative-task.json and planning-validation.json |
| O04 | Constitution Evidence-Driven Operation Accounting | Command certainty, attributable display reads, no replay/refund inference, no financial policy change | VERIFIED design review; runtime NOT_VERIFIED |
| O05 | Constitution Test-First For Risky Behavior | Red tests precede command/account/recovery implementation; native races and semantic UI evidence have explicit tasks | VERIFIED design review; tests NOT_RUN |
| O06 | Constitution Security And Privacy Boundaries | No credentials/payloads in artifacts; auth/account binding, safe diagnostics and actor isolation contracted | VERIFIED design review; runtime NOT_VERIFIED |
| O07 | User whole-panel scope; connected-impact review | C01–C07, login callers, activation routes, state/data/auth/queue/locale/test/release connections mapped | VERIFIED source/design review |
| O08 | Localization and UI rules | ar/en/bn, RTL, keyboard, widths, modal lifecycle, existing UI reuse | VERIFIED plan coverage; visual behavior NOT_VERIFIED |
| O09 | Encoding and docs accuracy rules | Original-template/detail/link/diff/BOM/mojibake checks and planned/current distinction | VERIFIED; evidence/verification.md |
| O10 | web-project-memory synchronization | Feature/decision/work/impact links and one NO_RUNTIME_IMPACT update; validate/freshness | Synchronized records and structural validation VERIFIED; final fingerprint checked at handoff |
| O11 | Explicit no-sub-agent rule | All exploration, documentation and review performed directly | VERIFIED process scope |
| O12 | Existing historical evidence obligations | Missing 027 plan-guard.json and 027/036 production/provider gates retained without fabricated repair | VERIFIED disclosure; historical scope INCOMPLETE |

## Coverage Summary

The exhaustive FR/SC → task map is in [planning validation](evidence/planning-validation.json). Each task lists its mapping and dependencies; Q01–Q06 define the checks. A human grouping follows.

| Requirements | Stories / tasks | Acceptance |
| --- | --- | --- |
| FR-001–FR-007 | US1, T001–T008, T019–T023 | SC-001/002/006; Q02/Q04 and money invariants |
| FR-008–FR-012 | US2, T009–T013, T020/T021/T024 | SC-003; Q02/Q03/Q04/Q06 |
| FR-013–FR-020 | US3, T014–T018, T020/T021/T024 | SC-004/005; Q02/Q03/Q04 |
| FR-021–FR-024 | Cross-cutting, T001/T019–T024 plus story tasks | SC-006/007; Q01–Q06 |

## Semantic Counterchecks

- Allowing Hide does not mean making confirmation dialogs nonmodal; only scoped pending ownership is moved. Pointer/focus cleanup must be observed.
- UI tombstones protect the same tab; they do not claim universal financial idempotency. No reliable execution receipt means uncertainty stays blocked, including after reload/logout-login.
- Refresh is read-only display work; a completed result never supplies purchase/fulfillment proof. Redis/DB partial failure stays explicit.
- Authentication unknown is not wrong password. Quarantine is the user's chosen response to a final invalid login result; configuration failure before HTTP and transport are separate.
- Disablement does not replay/cancel/reassign uncertain purchases. Manual recovery remains owner/revision guarded across all activation routes.
- New plan-only paths are marked planned. Existing runtime paths/CLI flags were checked locally; current production parity, resource load and authenticated navigation remain unverified.

## Constitution Alignment Issues

No design exception is requested. The original constitution remains unchanged. The Spec Kit optional commit hooks are omitted; the mandatory feature-branch hook created the local codex/037 branch after managed .git write access was approved. No fetch/push/deploy occurred. Six customized managed files are preserved. Planning scripts generated only this feature's documentation; agent-context marker updates are limited to the feature references.

## Unmapped Tasks and Metrics

Current planning metrics: **24 functional requirements + 7 success criteria; 24 tasks; 31/31 requirements covered (100%); 34/34 quality checklist items complete; 0 unmapped tasks; 0 unresolved CRITICAL/HIGH/MEDIUM findings; 56 original-template headings checked.** All 24 runtime tasks remain unchecked. No unresolved product ambiguity or duplicate requirement was found in the final semantic pass. The first original-template failure and its correction are retained separately; original templates were not modified to pass.

[Verification and limits](evidence/verification.md) separates mechanical checks from semantic design review, unexecuted visual/runtime checks and unverified production behavior. Documentation gate: VERIFIED. Runtime/production acceptance: NOT_VERIFIED. Historical 027 affected evidence scope: INCOMPLETE.

## Next Actions

The header/refresh follow-up narrows T004, T011–T013 and T021 to the incident reproduced in Chrome. A native fetch call made as a tracker method threw before HTTP dispatch. Replacing window.fetch with a fixture function masked that failure. Q04b now follows the production web handler and Worker dispatcher through a delayed provider response, SQL readback, status polling and the rendered row. It also checks queue-delivery confirmation, expiry reconciliation, and tracker close/focus during pending, unknown and failed outcomes. This is local incident coverage; whole-panel task boxes retain their existing status.

Application implementation is authorized. Follow T001–T024 and evidence/implementation.md; do not infer full task completion from partial unit or fixture checks. Missing historical 027 evidence remains separately tracked; do not invent a historical PASS or alter its original requirements to close it.
