# BeIN Reseller Panel Spec Constitution

## Core Principles

### I. Evidence-Driven Operation Accounting
Financially relevant operation changes must preserve clear evidence. Any feature that touches customer balance, beIN dealer balance, refunds, operation status, account assignment, or review workflows must document the source of truth, fallback evidence, and conflict behavior before implementation.

### II. Traceable Planning
Every implementation plan and generated task list must preserve traceability from user story to files, tests, and verification. Each task must include:
- Reason: why the task exists.
- Expected result: what should be true when it is complete.
- Possible bugs: realistic failure modes introduced by the task.
- Fix/mitigation: how the implementer should handle those failures.
- Verification: the exact check, test, build, or manual scenario that proves the task.

### III. Test-First For Risky Behavior
Changes that affect money, beIN account assignment, card search, operation status transitions, or recovery/review behavior require tests before implementation where a test seam exists. If a test seam is missing, the plan must include a small extraction task that creates one before changing behavior.

### IV. Minimal, Encoding-Safe Edits
Plans must prefer small targeted edits that follow current repository patterns. Automated edits must preserve file encoding, avoid full-file rewrites unless explicitly requested, and include a mojibake check for changed text files.

### V. Security And Privacy Boundaries
Plans must avoid exposing beIN passwords, TOTP secrets, sessions, cookies, storage state, ViewState, or raw provider tokens. UI and API contracts may expose beIN account labels/usernames to admins only when needed for audit, and must redact sensitive runtime data.

## Planning Requirements

Every Speckit feature must include `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/` when interfaces change, and `tasks.md`. The `tasks.md` file is executable work, not a summary. It must be detailed enough for a fresh agent to implement safely without guessing.

## Quality Gates

Before implementation starts, the plan must identify:
- Source-of-truth tables or services.
- Required indexes or migration impact.
- Backfill or legacy-data handling.
- API authorization rules.
- UI states for empty, loading, invalid filters, and errors.
- Verification commands and known pre-existing failures.

## Governance

This constitution controls Speckit planning in this repository. If a feature needs to violate one of these principles, the plan must record the violation, why it is necessary, and the safer alternative that was rejected.

**Version**: 1.0.0 | **Ratified**: 2026-05-25 | **Last Amended**: 2026-05-25
