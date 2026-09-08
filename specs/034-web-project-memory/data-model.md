# Data Model: Web Project Memory Ledger

This feature changes no runtime database schema. The model below defines Markdown record contracts.

## Project Ledger

- **Identity**: Exactly one `PROJECT_MEMORY.md` at repository root.
- **Authority**: Declares authoritative source classes and derived-memory status.
- **Record-state vocabulary**: `VERIFIED`, `INFERRED`, `PLANNED`, `PARTIAL`, `STALE`, `CONFLICT`, `DEPRECATED`, `UNKNOWN`.
- **Feature-status vocabulary**: `PLANNED`, `PARTIAL`, `WORKING`, `BLOCKED`, `DEPRECATED`, `BROKEN`, `UNKNOWN`.
- **Synchronization metadata**: Last synchronized ISO date, Git commit, working-tree state, deterministic status fingerprint, and inspected source scope; use an explicit non-Git baseline when Git is unavailable.
- **Sections**: Twenty-three required numbered sections defined in the implementation plan.

## Memory Record

- **Stable ID**: Typed identifier preserved across file moves and renames.
- **Title**: Compact human-readable concept name.
- **State**: One allowed record state.
- **Sources**: One or more repository-relative authoritative pointers; `UNKNOWN` records still name the location that must be inspected when available.
- **Current state**: Short causal state needed for resumption.
- **Connections**: Other stable IDs or relevant entry/upstream/downstream relationships.
- **Impact**: Runtime/data/contract/security/UX/operations scope, or `NO_RUNTIME_IMPACT` where applicable.

## Source Record

- **ID family**: `SRC-###`.
- **Path or scope**: File, directory, symbol, document heading, or contract.
- **Authority class**: Runtime source, schema, migration, test, accepted specification, explicit decision, or operations documentation.
- **Use**: What questions this source can answer.
- **Caveat**: Generated, derived, planned, deployment-dependent, or unverified limitations.

## Feature Slice Record

- **ID family**: `FEAT-###`.
- **Entry points**: UI routes, API routes, scheduled work, queue jobs, webhooks, or commands.
- **Upstream dependencies**: State, configuration, auth, permissions, shared primitives, and callers.
- **Downstream effects**: Responses, navigation, database changes, queue jobs, integrations, notifications, logs, analytics, or deployment steps.
- **Data and contracts**: Related `DATA-*`, `API-*`, `AUTH-*`, `JOB-*`, and `INT-*` records.
- **Verification**: Related `TEST-*` and authoritative specs/docs.
- **State**: One record state describing the claim's evidence/freshness.
- **Status**: One Feature Registry status describing implementation lifecycle without conflating it with evidence.

## Decision Record

- **ID family**: `DEC-###`.
- **State**: Accepted, proposed, rejected, or superseded.
- **Authority and date**: Explicit maintainer decision or accepted Spec Kit source.
- **Scope**: Affected stable records and files.
- **Rationale**: Short reason that changes future decisions.

## Risk Or Conflict Record

- **ID family**: `RISK-###`.
- **Severity**: Critical, high, medium, or low.
- **Evidence and sources**: All sides of a conflict or the evidence for a risk.
- **Affected records**: Stable IDs and user/system outcomes.
- **Resolution state**: Open, accepted, mitigated, or resolved.
- **Next verification**: Exact source or check required.

## Work Record

- **ID family**: `WORK-###`.
- **Status**: Planned, active, blocked, or complete.
- **Specification or authority**: Active Spec Kit feature or explicit maintainer request.
- **Owned scope**: Files and stable records that may change.
- **Completion evidence**: Tasks and checks.

## Update Record

- **ID family**: `UPD-YYYYMMDD-###`.
- **Date**: ISO date.
- **State**: One allowed record state.
- **Affected IDs**: All materially changed current-state records.
- **Sources**: Exact changed or verified source pointers.
- **Delta**: One compact causal summary.
- **Impact**: Named runtime/data/contract/security/UX/operations impact or `NO_RUNTIME_IMPACT`.

## Validation Rules

- Required headings, authority declaration, state vocabularies, synchronized date, commit, worktree state, and fingerprint must exist.
- Every typed `###` record must have `State` and non-empty `Sources` fields.
- Stable IDs must be unique.
- Common secret-value assignments and private-key blocks are rejected.
- Existing ledgers are never overwritten by initialization.
- Freshness compares the recorded Git baseline to current Git state and reports drift without changing the ledger.
- Impact maps changed source paths to direct and connected stable IDs while preserving unrelated records.
- Validation is structural; semantic correctness and production truth still require authoritative source inspection.

## Synchronization Baseline

- **Commit**: Full current Git commit, `NO_GIT`, or `UNKNOWN`.
- **Working-tree state**: `CLEAN`, `DIRTY`, `NO_GIT`, or `UNKNOWN`.
- **Fingerprint**: SHA-256 of normalized `git status --porcelain=v1 --untracked-files=all`, or `NO_GIT`/`UNKNOWN`.
- **Changed paths**: Returned by the helper for inspection; the ledger stores only the compact state and affected records needed for resumption.
