# Ledger And Helper Contract

## Skill Selection Contract

The personal `web-project-memory` skill is selected automatically when work in an existing web repository needs planning, analysis, debugging, implementation, refactoring, API/data/auth/job/infrastructure changes, resumption, release review, or handoff. It is framework-neutral and is not selected for general programming questions without project files or unrelated prose tasks.

## Ledger Location Contract

- Canonical path: `<repository-root>/PROJECT_MEMORY.md`.
- Exactly one canonical ledger per repository.
- Domain detail remains inside numbered sections and stable records; do not create per-feature memory fragments.

## Record Contract

```markdown
### FEAT-001 — Example feature slice

- State: VERIFIED
- Sources: `src/example.ts#symbol`; `tests/unit/example.test.ts`
- Current state: Compact causal state.
- Connections: `API-001`, `DATA-001`, `TEST-001`
- Impact: runtime, API, data
```

Allowed record states are `VERIFIED`, `INFERRED`, `PLANNED`, `PARTIAL`, `STALE`, `CONFLICT`, `DEPRECATED`, and `UNKNOWN`. Feature Registry status is separately restricted to `PLANNED`, `PARTIAL`, `WORKING`, `BLOCKED`, `DEPRECATED`, `BROKEN`, or `UNKNOWN`.

## Helper CLI Contract

### Initialize

```text
python <skill-root>/scripts/project_memory.py init <directory> --project-name <name>
```

Behavior:

- Resolve `<directory>` and require it to exist.
- Create `<directory>/PROJECT_MEMORY.md` with UTF-8 and LF line endings.
- Include all twenty-three numbered sections, authority/state vocabularies, current UTC synchronization date, and Git or explicit non-Git baseline.
- Refuse to overwrite an existing ledger and return non-zero.
- Never scan `.env`, runtime data, build output, or production systems.

### Validate

```text
python <skill-root>/scripts/project_memory.py validate <path> [--repository <directory>]
```

Behavior:

- Require valid UTF-8 and the twenty-three numbered sections in order.
- Require the authority declaration, all record and feature state names, an ISO last-synchronized date, commit, worktree state, and fingerprint.
- Require unique stable IDs.
- Require `State` and non-empty `Sources` fields for every typed record.
- When `--repository` is present, reject missing repository-relative source pointers while allowing explicitly classified commands or external references.
- Reject unsupported states, common secret-value assignments, and private-key material.
- Print each structural error to stderr and return `1` for validation failure, `2` for usage or I/O errors, and `0` for success.

### Git State

```text
python <skill-root>/scripts/project_memory.py git-state <repository>
```

Behavior: output deterministic JSON containing Git availability, current commit, `CLEAN`/`DIRTY` state, normalized status fingerprint, and changed repository-relative paths. Never print file contents or environment values.

### Freshness

```text
python <skill-root>/scripts/project_memory.py freshness <repository> <ledger>
```

Behavior: compare recorded and current Git baselines, output JSON with `CURRENT`, `STALE`, or `NO_GIT`, return `0` only for current/non-Git-valid state, `1` for stale state, and `2` for invalid input or Git failure.

### Impact

```text
python <skill-root>/scripts/project_memory.py impact <repository> <ledger>
```

Behavior: map changed Git paths to directly sourced records, traverse stable-ID connections, and output only the changed paths, direct IDs, connected IDs, and bounded source paths that should be opened. It never edits the ledger.

## Synchronization Contract

Before final handoff after a saved material project change:

1. Determine changed files and affected stable records.
2. Inspect new authoritative state and relevant memory records.
3. Update causal current state and every connected record affected.
4. Preserve unrelated records and stable IDs.
5. Add exactly one compact material update entry for the task.
6. Refresh the compact synchronization baseline after semantic synchronization.
7. Validate the ledger, freshness state, installed-package parity, and changed-file encoding.

Read-only work without an authoritative saved correction creates no update record.

## Safety Contract

- Memory never contains environment values, credentials, session material, cookies, tokens, password/hash values, private keys, database row dumps, or sensitive logs.
- Memory never proves deployment state, live database contents, external-provider state, or production health unless those are freshly verified through authorized sources.
- Broad/high-risk/final reviews inspect all required connected sources directly.

## Personal Installation Contract

- Source package: `.agents/skills/web-project-memory`.
- Installed package: `<CODEX_HOME>/skills/web-project-memory`, falling back to `~/.codex/skills/web-project-memory`.
- Required files: `SKILL.md`, `agents/openai.yaml`, `references/project-memory-schema.md`, and `scripts/project_memory.py`.
- `agents/openai.yaml` exposes display name `Web Project Memory`, names `$web-project-memory` in the default prompt, and keeps implicit invocation enabled.
- Source and installed required files are byte-equivalent at handoff.
