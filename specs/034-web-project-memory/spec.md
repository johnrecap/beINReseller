# Feature Specification: Web Project Memory Ledger

**Feature Branch**: `034-web-project-memory`

**Created**: 2026-08-23

**Status**: Reopened for personal-skill compliance remediation

**Input**: Create a programming equivalent of the novel continuity ledger for the complete web project so future work can resume with fewer tokens and reach authoritative frontend, backend, API, database, auth, job, integration, test, configuration, and operations sources quickly.

## Clarifications

### Session 2026-08-23

- Q: Where should the skill and memory live? A: Keep one version-controlled skill source in the repository, install a byte-equivalent personal Codex copy, and keep one project-specific `PROJECT_MEMORY.md` at each repository root.
- Q: Is the memory authoritative? A: No; source code, schemas, migrations, accepted specifications, tests, and explicit maintainer decisions remain authoritative.
- Q: How should broad or risky reviews use memory? A: Use memory only to locate sources, then inspect every connected authoritative surface required by the risk.
- Q: Should read-only work create log noise? A: No; synchronize only after a saved material project change or a verified correction to stale memory.
- Q: May the ledger contain configuration values or credentials? A: No; record variable names and secret boundaries only, never values, tokens, passwords, cookies, or private runtime data.
- Q: How should the corrected skill be packaged? A: Keep one version-controlled source package named `web-project-memory` in this repository and install a byte-equivalent personal copy under the active Codex skills home; the repository ledger remains project-specific.
- Q: What identity and invocation must the skill expose? A: Use internal name `web-project-memory`, display name `Web Project Memory`, automatic invocation enabled, and manual invocation through `$web-project-memory`.
- Q: Must the supplied memory contract be followed literally? A: Yes; support the twenty-three named sections, the eight record states, Git synchronization metadata, and explicit freshness/conflict reporting while keeping entries compact.
- Q: How is the corrected skill acceptance-tested? A: Use deterministic tests plus a temporary multi-layer web-project scenario in the current task; do not use subagents.

## User Scenarios & Testing

### User Story 1 - Resume Web Project Work Efficiently (Priority: P1)

A developer or coding agent can start a new task by reading one compact memory file, locating the relevant feature slice and authoritative sources, and opening only the connected files needed for the requested work.

**Why this priority**: Fast, reliable resumption is the primary token-saving outcome.

**Independent Test**: Start from only the ledger and locate the web entry points, API handlers, service logic, data models, authorization rules, worker/job path, tests, and operations notes for at least three representative project domains.

**Acceptance Scenarios**:

1. **Given** a new task about an existing feature, **When** the agent searches the ledger by stable feature or source ID, **Then** it finds compact current-state context and exact repository-relative source pointers.
2. **Given** a task affects several layers, **When** the agent follows the ledger connections, **Then** it can trace the UI or system entry point through API, service, data, worker or integration effects, tests, documentation, and deployment notes where applicable.
3. **Given** a fact is uncertain or contradictory, **When** the agent reads the ledger, **Then** the uncertainty is explicit and the authoritative sources to inspect are named.

---

### User Story 2 - Keep Memory Synchronized After Changes (Priority: P1)

After a material repository change, the agent records only the causal delta and affected current state so future sessions do not rebuild the same project map from scratch.

**Why this priority**: A memory file saves tokens only if it stays aligned with the repository.

**Independent Test**: Apply a simulated frontend, API, schema, and operations change to a temporary ledger copy and confirm every affected cross-layer record, risk, decision, source pointer, and compact update entry is synchronized without rewriting unrelated sections.

**Acceptance Scenarios**:

1. **Given** a saved material change, **When** the task reaches handoff, **Then** every affected ledger record is updated with a stable update ID, record state, ISO date, source pointer, and impact summary.
2. **Given** a documentation-only or release-state change, **When** it does not alter runtime behavior, **Then** it is recorded separately with `NO_RUNTIME_IMPACT` and does not rewrite product or data facts.
3. **Given** memory disagrees with authoritative sources, **When** the conflict is verified, **Then** memory is corrected or marked `CONFLICT`; source code is never changed solely to match memory.

---

### User Story 3 - Initialize And Validate A Trustworthy Ledger (Priority: P2)

A maintainer can initialize a missing project ledger safely and validate its required structure without overwriting an existing ledger.

**Why this priority**: Deterministic setup and validation prevent malformed or lossy memory files.

**Independent Test**: Initialize a ledger in an empty temporary project, reject a second initialization, validate a complete ledger, and report precise errors for missing sections, record-state declarations, source authority, or synchronization metadata.

**Acceptance Scenarios**:

1. **Given** no project ledger exists, **When** initialization runs, **Then** one UTF-8 Markdown ledger with all required sections is created.
2. **Given** a ledger already exists, **When** initialization runs, **Then** it refuses to overwrite the file.
3. **Given** a malformed ledger, **When** validation runs, **Then** it reports each missing structural invariant and returns failure.

---

### User Story 4 - Preserve Full-Source Safety For High-Risk Work (Priority: P2)

A developer uses memory as an index rather than proof when work involves security, money, destructive migrations, production deployment, whole-project audits, or final release judgments.

**Why this priority**: Token reduction must not trade away correctness in high-impact areas.

**Independent Test**: Review the skill instructions and confirm they require connected authoritative source inspection for high-risk and final judgments while still using the ledger to narrow discovery.

**Acceptance Scenarios**:

1. **Given** a high-risk or broad audit request, **When** the skill is used, **Then** it requires fresh inspection of every relevant authoritative source and does not issue a final verdict from memory alone.
2. **Given** a source pointer is stale or missing, **When** it is encountered, **Then** the agent repairs or flags the ledger before relying on it.

---

### User Story 5 - Use One Personal Skill Across Web Stacks (Priority: P1)

A Codex user can invoke or automatically receive the same personal memory workflow in an existing web project regardless of framework, while each repository keeps only its own root ledger.

**Why this priority**: Personal installation and cross-project portability are explicit delivery outcomes, not optional packaging polish.

**Independent Test**: Validate the version-controlled package, install it under the active Codex skills home, verify package parity and UI metadata, and exercise it against a temporary project containing frontend, API, service, database, authentication, and test sources.

**Acceptance Scenarios**:

1. **Given** the personal skill is installed, **When** Codex discovers skills, **Then** `web-project-memory` appears with display name `Web Project Memory`, automatic invocation is allowed, and its default prompt names `$web-project-memory`.
2. **Given** a temporary multi-layer web project, **When** the helper initializes and evaluates its ledger, **Then** all twenty-three sections, exact record states, source pointers, Git baseline, and connected impact scope are validated without reading secret values.
3. **Given** the version-controlled source package and personal installation, **When** parity is checked, **Then** all skill, reference, script, and UI metadata files are byte-equivalent.

### Edge Cases

- The ledger is missing, empty, structurally incomplete, stale, or contains unresolved scaffold placeholders.
- A file moved or a symbol was renamed while its stable ledger ID must be preserved.
- Multiple sources disagree about an API contract, ownership rule, migration state, or deployment procedure.
- A planned feature exists in specifications but not in runtime code.
- Generated files, build output, vendored dependencies, or production-only runtime state appear in discovery.
- A change crosses the web app and Worker packages or changes shared Prisma data.
- A migration is present but not yet deployed, or deployment state is unknown.
- A secret-like value is encountered while recording configuration names.
- The project has no durable guide or has several competing architecture documents.
- A material change affects several feature slices that share one API, model, permission, job, or component primitive.
- The repository has no Git metadata, has a detached HEAD, or has dirty and untracked files at synchronization time.
- The personal installation is missing, stale, partially copied, or differs from the version-controlled source package.
- A framework uses unfamiliar conventions; the skill must discover manifests and entry points without assuming React, Next.js, Node.js, or Prisma.

## Requirements

### Functional Requirements

- **FR-001**: The project MUST have exactly one canonical root `PROJECT_MEMORY.md` for durable web-project memory.
- **FR-002**: The ledger MUST declare that source code, schemas, migrations, accepted specifications, tests, and explicit maintainer decisions are authoritative and that memory is derived.
- **FR-003**: Material records MUST use stable IDs, one state from `VERIFIED`, `INFERRED`, `PLANNED`, `PARTIAL`, `STALE`, `CONFLICT`, `DEPRECATED`, or `UNKNOWN`, and one or more exact repository-relative source pointers.
- **FR-004**: The ledger MUST contain the twenty-three numbered sections Project Identity, Current System Snapshot, Technology Stack, Architecture Map, Source Map, Frontend, Backend, API Contracts, Database, Data Flows, Authentication and Authorization, External Integrations, Environment Variables, Security, Testing and Quality, Build Deployment and Operations, Feature Registry, Dependency and Impact Map, Technical Decisions, Known Issues and Technical Debt, Open Tasks, Change Ledger, and Freshness and Conflicts.
- **FR-005**: Feature-slice records MUST connect entry points, upstream dependencies, downstream effects, shared primitives, data touched, authorization, failure behavior, tests, docs, and operational impact where applicable.
- **FR-006**: The skill MUST instruct agents to read and search the ledger before opening broad repository surfaces, then open only linked authoritative sources needed by the task.
- **FR-007**: Every saved material project change MUST synchronize all affected ledger sections before task completion.
- **FR-008**: Read-only analysis, discussion, or review MUST NOT create ceremonial update-log entries when no authoritative project state was saved or corrected.
- **FR-009**: High-risk changes, whole-project audits, production actions, destructive data work, and final release judgments MUST inspect all connected authoritative sources and MUST NOT rely on memory as proof.
- **FR-010**: Conflicting evidence MUST remain visible as `CONFLICT` with all relevant source pointers until resolved.
- **FR-011**: The ledger MUST store compact causal state and links rather than copied source code, long prose, exhaustive route lists, schema dumps, secret values, or generated output inventories.
- **FR-012**: A deterministic helper MUST initialize a missing ledger, refuse to overwrite an existing ledger, validate required structural invariants, report Git synchronization state, detect baseline drift, and narrow changed paths to directly and transitively connected ledger records without rewriting semantic memory.
- **FR-013**: A personal Codex skill named `web-project-memory` MUST be installed under the active Codex skills home and automatically discoverable for web-project planning, analysis, implementation, debugging, refactoring, API, data, infrastructure, operations, resumption, and handoff work.
- **FR-014**: The initial project ledger MUST be grounded in inspected files from this repository and MUST distinguish verified current behavior from planned or unknown state.
- **FR-015**: Configuration records MUST contain names, ownership, environment scope, and source locations only; secret values, credentials, session material, cookies, tokens, and private runtime data MUST never be recorded.
- **FR-016**: Material update entries MUST include a stable update ID, ISO date, record state, affected record IDs, exact source pointers, and runtime impact or `NO_RUNTIME_IMPACT`.
- **FR-017**: Stable record IDs MUST survive file moves and renames; source pointers and aliases change instead of allocating replacement IDs for the same concept.
- **FR-018**: The skill MUST provide a repair path for missing, stale, or untrusted memory and a full-source initialization path when no trustworthy ledger exists.
- **FR-019**: The workflow MUST preserve current repository encoding rules and use minimal, non-lossy ledger edits.
- **FR-020**: The skill MUST define selection boundaries so adjacent non-project questions do not load it and ordinary code work can invoke it automatically.
- **FR-021**: The personal skill MUST expose `agents/openai.yaml` with display name `Web Project Memory`, a concise UI description, a default prompt that explicitly names `$web-project-memory`, and implicit invocation enabled.
- **FR-022**: The version-controlled source package and installed personal package MUST have matching required files and byte-equivalent content at handoff.
- **FR-023**: The workflow MUST record the last synchronized Git commit, working-tree state, and deterministic working-tree status fingerprint; when Git is unavailable it MUST record a bounded source-name, timestamp, or short-hash baseline instead of inventing Git state.
- **FR-024**: The workflow MUST inspect `git status` and `git diff` when Git exists, use changes to narrow synchronization scope, and still reopen authoritative files before changing memory.
- **FR-025**: First-run discovery MUST be framework-neutral, use `rg` or `rg --files` when available, group monorepo applications and packages in one ledger, and exclude dependencies, VCS internals, build output, coverage, caches, generated files, binary files, secret files, and large lockfile contents.
- **FR-026**: Feature Registry records MUST use `PLANNED`, `PARTIAL`, `WORKING`, `BLOCKED`, `DEPRECATED`, `BROKEN`, or `UNKNOWN` without confusing implementation status with record evidence.
- **FR-027**: The schema reference MUST define a non-empty validation boundary that distinguishes structural validation, freshness detection, semantic source verification, and authorized production verification.
- **FR-028**: Tests MUST exercise observable helper and package behavior on an isolated temporary web project with frontend, API, service, database, authentication, and test sources; wording-only regex assertions MUST NOT be the primary acceptance evidence.
- **FR-029**: The temporary scenario MUST demonstrate source validation, secret rejection, API-change impact propagation to connected frontend and data records, stale-baseline detection, preservation of unrelated records, and a narrower second-read scope.
- **FR-030**: Test and installation work MUST remain single-agent and MUST NOT start the application, Worker, Redis, PostgreSQL, a production process, or an external service.

### Key Entities

- **Project memory ledger**: The single compact derived index for current repository knowledge and resumption state.
- **Source record**: A stable identifier for an authoritative file, directory, contract, schema, test, specification, or operations document.
- **Feature slice**: An end-to-end product or system flow connected across relevant web layers.
- **Decision record**: An explicit accepted, proposed, rejected, or superseded maintainer decision with scope and authority.
- **Risk or conflict record**: A visible inconsistency, unknown, regression risk, or required follow-up with severity and sources.
- **Material update**: A saved change that alters runtime behavior, data, contracts, security, UX, integrations, tests, build or deployment behavior, durable documentation, or the accuracy of the ledger.
- **Synchronization baseline**: The last recorded Git commit plus working-tree state/fingerprint, or a bounded non-Git source baseline, used to detect whether memory may be stale.
- **Personal skill package**: The generic `web-project-memory` instructions, schema, helper, and UI metadata installed for Codex and mirrored from the version-controlled source package.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A fresh agent can locate authoritative sources for representative frontend, API, database, auth, Worker, test, and deployment questions from the ledger without scanning the entire repository.
- **SC-002**: 100% of the twenty-three required ledger sections and eight record-state declarations pass deterministic validation.
- **SC-003**: Initialization creates one complete ledger and rejects overwrite attempts with a non-zero result.
- **SC-004**: Every `VERIFIED` material record in the initial ledger cites at least one inspected repository-relative source pointer.
- **SC-005**: The initial ledger contains zero secret values, copied credential material, unresolved scaffold placeholders, or generated dependency/build inventories.
- **SC-006**: A simulated cross-layer change can be synchronized by editing only affected records plus one compact update entry.
- **SC-007**: The skill description correctly selects at least three realistic framework-neutral web-project requests and excludes at least one adjacent non-project request.
- **SC-008**: The skill and ledger pass structural, encoding, internal-reference, and repository diff checks.
- **SC-009**: The source package and personal installation contain `SKILL.md`, `agents/openai.yaml`, `references/project-memory-schema.md`, and `scripts/project_memory.py` with no content drift.
- **SC-010**: A temporary multi-layer project test detects a changed API source, returns its connected frontend and database records, excludes an unrelated record, and reports a changed baseline as stale.
- **SC-011**: A fresh temporary-project run uses no more source files than its source map and connected records require after the initial seed.
- **SC-012**: All verification completes without a subagent, live service, production state, database process, or external network dependency.

## Assumptions

- English is used for durable project artifacts because the repository project-guide contract requires English documentation.
- The version-controlled package in this repository is the install source; the personal Codex copy is a verified deployment of the same generic skill, while each project's `PROJECT_MEMORY.md` contains that project's actual architecture.
- `PROJECT_MEMORY.md` is committed with the repository so future agents and maintainers share the same derived index.
- No application runtime behavior, production database state, dependency version, or deployment process is changed by this feature.
- Existing Spec Kit specifications and `docs/PROJECT_GUIDE.md` remain authoritative planning and handoff sources; the ledger links to them rather than replacing them.
- Exact twenty-three-section compliance is accepted despite the larger schema because progressive disclosure and source-linked records keep ordinary reads narrow.

## Non-Goals

- Replacing source inspection, tests, specifications, schemas, migrations, or operational verification.
- Creating a vector database, external memory service, background agent pool, or runtime dependency.
- Recording every file, route, component, model field, migration statement, or historical commit.
- Modifying web application, Worker, database, API, UI, auth, or production behavior.
- Storing live environment values, production state, secrets, credentials, or personally identifiable data.
- Maintaining two independently editable skill implementations or using a subagent for acceptance testing.
