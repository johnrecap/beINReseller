# Implementation Plan: Web Project Memory Ledger

**Branch**: `034-web-project-memory` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

## Summary

Upgrade the version-controlled skill package to `web-project-memory`, install a byte-equivalent personal Codex copy, and treat each repository's `PROJECT_MEMORY.md` as a compact derived index. The skill reads memory and Git freshness before broad discovery, follows stable source and feature IDs, narrows changed paths through connected records, synchronizes causal deltas, and requires full connected-source inspection for high-risk work. Extend the standard-library helper for twenty-three-section initialization, structural validation, Git baseline/freshness, and connected-impact reporting. Validate the package with UI metadata, deterministic CLI tests, and a temporary framework-neutral multi-layer web project without subagents or live services.

## Planning Quality Standard

Every implementation task includes Reason, Expected, Possible bugs, Fix/Mitigation, and Verification. No implementation starts until both requirements checklists are complete and analysis has no unresolved critical, high, or medium issue.

## Technical Context

**Language/Version**: Markdown, YAML frontmatter, Python 3 standard library, TypeScript 5.9 test harness
**Primary Dependencies**: Codex personal and repository-local skill discovery; Git when available; no new application runtime or package dependency
**Storage**: One version-controlled package source, one installed personal package copy, and one `PROJECT_MEMORY.md` per repository
**Testing**: Skill quick validation, UI metadata validation, Python CLI scenarios, temporary Git-backed multi-layer web-project behavior tests, package-parity checks, encoding and diff checks
**Target Platform**: Codex agents working in existing web repositories across Windows or Unix-like environments with Python 3; framework-neutral discovery
**Project Type**: Personal Codex development workflow plus repository-local durable documentation
**Performance Goals**: After an initial source-grounded seed, a fresh agent reaches only the relevant frontend, API, data, auth, job, test, and deployment sources from the ledger and changed-path impact map
**Constraints**: No application runtime changes; no production access; no external memory service; no subagents in acceptance testing; no secret values; minimal UTF-8 BOM-free edits; memory is an index, never proof
**Scale/Scope**: One generic skill package with four required files, one personal installation, one twenty-three-section root ledger, one focused behavior test, Spec Kit artifacts, and project-guide updates

## Constitution Check

- **Evidence-Driven Operation Accounting**: PASS. The ledger records source pointers and explicitly requires authoritative inspection for financially relevant operation changes.
- **Traceable Planning**: PASS. Requirements, contracts, tasks, stable ledger IDs, tests, and exact file paths are mapped.
- **Test-First For Risky Behavior**: PASS. A focused contract test precedes skill/helper creation and covers overwrite, validation, source, and secret-safety invariants.
- **Minimal, Encoding-Safe Edits**: PASS. The feature adds isolated documentation and skill files, uses `apply_patch`, and includes BOM/mojibake checks.
- **Security And Privacy Boundaries**: PASS. The ledger records configuration names and boundaries only and forbids credentials, tokens, cookies, and private runtime values.

No constitution exception is required.

## Existing System Checked

- Project instructions and delivery: `AGENTS.md`, `.specify/memory/constitution.md`, `.specify/extensions.yml`, `.specify/templates/*`, `specs/033-hierarchical-password-reset/*`.
- Stack and operations: `package.json`, `worker/package.json`, `.env.example`, `next.config.ts`, `prisma.config.ts`, `ecosystem.config.js`.
- Product and architecture docs: `docs/PROJECT_GUIDE.md`, `docs/current-project-prd.md`.
- Web/API/UI structure: `src/app`, 40 page entry points, 205 API route files, `src/components`, `src/i18n`.
- Domain/backend structure: `src/lib`, including auth, permissions, operations, accounting, ownership, maintenance, points, credit, and queue modules.
- Data: `prisma/schema.prisma` and 28 migration directories.
- Worker and jobs: `src/lib/queue.ts`, `src/lib/operation-dispatch.ts`, `worker/src/index.ts`, `worker/src/keepalive.ts`, `worker/src/http-queue-processor.ts` entry surface.
- Verification: `tests/unit`, `tests/integration`, and package verification scripts.
- Reference memory pattern: global `novel-memory-ledger` skill, its schema, and deterministic helper.
- Remediation authority: the supplied personal-skill requirements attachment, the superseded repository-only package, `skill-creator`, and `skill-creator/references/openai_yaml.md`.
- Installation state: no existing personal `web-project-memory` package under the active Codex skills directories; the current package is repository-local and lacks `agents/openai.yaml`.

## Project Structure

### Documentation

```text
specs/034-web-project-memory/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/ledger-contract.md
|-- checklists/requirements.md
|-- checklists/memory.md
`-- tasks.md
```

### Delivered Files

```text
.agents/skills/web-project-memory/
|-- SKILL.md
|-- agents/openai.yaml
|-- references/project-memory-schema.md
`-- scripts/project_memory.py

PROJECT_MEMORY.md
tests/unit/web-project-memory.test.ts
docs/PROJECT_GUIDE.md
AGENTS.md

Installed deployment: `C:/Users/SOUQ/.codex/skills/web-project-memory/`
```

**Structure Decision**: The repository package is the editable source and the personal Codex directory is an installed byte-equivalent deployment, not a second implementation. One skill owns lookup, synchronization, repair, and validation; detailed schema rules stay in one progressive-disclosure reference. The helper enforces structure, Git freshness, and source-link impact selection but never writes semantic project claims.

## Source Of Truth And Data Rules

- Runtime behavior: current source files and accepted runtime configuration.
- Data shape: `prisma/schema.prisma` plus ordered migrations; deployment state remains unknown unless verified from the target environment.
- Product and change intent: accepted Spec Kit feature artifacts and explicit maintainer decisions.
- Verification evidence: current tests and their actual results.
- Project memory: derived index only; it may accelerate discovery but cannot override authoritative evidence.
- Stable ledger IDs survive file moves and renames; only source pointers and aliases are updated.

## Ledger Design

The ledger has twenty-three numbered sections required by the supplied contract:

1. Project Identity
2. Current System Snapshot
3. Technology Stack
4. Architecture Map
5. Source Map
6. Frontend
7. Backend
8. API Contracts
9. Database
10. Data Flows
11. Authentication and Authorization
12. External Integrations
13. Environment Variables
14. Security
15. Testing and Quality
16. Build, Deployment and Operations
17. Feature Registry
18. Dependency and Impact Map
19. Technical Decisions
20. Known Issues and Technical Debt
21. Open Tasks
22. Change Ledger
23. Freshness and Conflicts

Material records use stable typed IDs such as `SRC-001`, `APP-001`, `FE-001`, `BE-001`, `API-001`, `DATA-001`, `FLOW-001`, `AUTH-001`, `JOB-001`, `INT-001`, `ENV-001`, `SEC-001`, `OPS-001`, `FEAT-001`, `IMPACT-001`, `TEST-001`, `DEC-001`, `RISK-001`, `WORK-001`, `FRESH-001`, and `UPD-YYYYMMDD-001`. Record state and Feature Registry status remain distinct vocabularies.

## Synchronization Rules

1. Capture the current commit, porcelain working-tree state, and deterministic status fingerprint when Git exists; otherwise capture a bounded non-Git source baseline.
2. Identify saved files through Git diff/status or the non-Git baseline and map direct plus transitive connected record IDs.
3. Read the affected ledger records and new authoritative source state.
4. Update current causal state and every connected feature, contract, data, auth, job, test, docs, or operations record affected.
5. Preserve unrelated records, stable IDs, and history.
6. Record stale and conflicting evidence instead of normalizing it away.
7. Add one compact update entry with state, date, sources, affected IDs, and runtime impact.
8. Refresh the synchronization baseline only after the ledger reflects the inspected changes.
9. Validate the ledger and run encoding/diff checks before handoff.

Read-only work produces no update entry unless it corrects verified stale memory.

## Security And Privacy Rules

- Record environment variable names and their owning boundary, never values.
- Never copy `.env`, database rows, session material, cookies, provider credentials, tokens, passwords, hashes, TOTP seeds, or private logs into memory.
- Redact sensitive paths and runtime evidence when a safe source pointer is sufficient.
- High-risk work must inspect connected sources and tests directly even when the ledger appears current.

## Verification Strategy

- Focused TypeScript tests validate package identity/UI metadata, twenty-three sections, exact state vocabularies, safe initialization, overwrite refusal, source existence, Git baseline/freshness, and connected-impact behavior.
- A temporary Git project contains frontend, API, service, database, authentication, and test sources; an API change must select directly and transitively connected records while preserving an unrelated record and producing a narrower second-read scope.
- Global Skill Creator `quick_validate.py` checks YAML frontmatter, naming, and unfinished placeholders.
- `project_memory.py validate PROJECT_MEMORY.md` checks section structure, authority/state declarations, synchronization metadata, stable record contracts, source pointers, and common secret-value patterns.
- Package-parity verification compares all required source and installed files byte-for-byte.
- `git diff --check`, BOM scan, and mojibake scan protect repository encoding and whitespace.
- No website, Worker process, Redis, PostgreSQL, or production environment is started.

## Post-Design Constitution Check

- Source authority and financially sensitive boundaries remain explicit: PASS.
- Every deliverable and verification path has exact ownership: PASS.
- Behavior tests and the isolated demo precede corrected skill/helper implementation: PASS.
- No schema, API, UI, Worker, dependency, or production behavior changes: PASS.
- Secret values and private runtime material are excluded by contract and validation: PASS.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Personal installed copy plus repository source | The user explicitly requires a personal installed skill while the repository needs a version-controlled source and tests | Treating the two packages as independently editable would drift, so byte parity and source ownership are mandatory |
