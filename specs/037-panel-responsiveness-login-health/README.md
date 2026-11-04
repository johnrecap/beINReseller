# Spec Kit 037 — Panel Responsiveness and beIN Login Health

Implementation authorized and started 2026-11-04. Current status: PARTIAL; see [execution evidence](evidence/implementation.md). Branch: `codex/037-panel-responsiveness-login-health`.

| Artifact | Purpose |
| --- | --- |
| [Specification](spec.md) | User decisions, 24 functional requirements and seven success criteria |
| [Plan](plan.md) | Architecture, boundaries and constitution checks |
| [Research](research.md) | Source findings, shared-consumer matrix and unknowns |
| [Data model](data-model.md) | Command/refresh/health states; no migration |
| [Panel commands](contracts/panel-commands.md) | Hide, navigation/reload and financial uncertainty |
| [Balance refresh](contracts/balance-refresh.md) | Async/legacy API, jobs and failure handling |
| [Login health](contracts/login-health.md) | First terminal failure and protected reactivation |
| [Tasks](tasks.md) | 24 ordered runtime/test tasks; all unchecked |
| [Runbook](quickstart.md) | Future checks, evidence and release limits |
| [Requirements checklist](checklists/requirements.md) / [Safety checklist](checklists/safety-and-coverage.md) | 34 requirement-quality items, not runtime acceptance |
| [Analysis register](analysis.md) | Findings, coverage, obligations and next task |

The accepted scope covers the whole panel. Current work introduces dashboard command ownership and migrates C01/C02; remaining consumers, async balance jobs and login-health integration are unfinished. The new login policy/persistence helpers have isolated tests but no production callers. Historical 027/036 evidence and production gaps remain open. No database/provider operation or deployment occurred.
