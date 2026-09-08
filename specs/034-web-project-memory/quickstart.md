# Quickstart: Web Project Memory

## Safe Verification Boundary

Run only local file and test commands. Do not start the website, Worker, Redis, PostgreSQL, or any production process.

## 1. Validate Skill Structure

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" .agents\skills\web-project-memory
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" "$env:USERPROFILE\.codex\skills\web-project-memory"
```

Expected: both the version-controlled source and installed personal skill pass Skill Creator structure, YAML frontmatter, naming, and description validation. The focused behavior test below verifies `agents/openai.yaml`.

## 2. Run Focused Contract Test

```powershell
npx tsx --test tests\unit\web-project-memory.test.ts
```

Expected: package identity, UI metadata, twenty-three sections, exact state vocabularies, one-file safety, initialization, overwrite, malformed-ledger, secrets, Git freshness, and connected-impact cases pass against an isolated temporary web project.

## 3. Validate The Real Ledger

```powershell
python .agents\skills\web-project-memory\scripts\project_memory.py validate PROJECT_MEMORY.md --repository .
```

Expected: all twenty-three sections, state declarations, synchronization metadata, stable records, repository sources, uniqueness, dates, and secret checks pass.

## 4. Inspect Git Freshness And Impact

```powershell
python .agents\skills\web-project-memory\scripts\project_memory.py git-state . --ledger PROJECT_MEMORY.md
python .agents\skills\web-project-memory\scripts\project_memory.py freshness . PROJECT_MEMORY.md
python .agents\skills\web-project-memory\scripts\project_memory.py impact . PROJECT_MEMORY.md
```

Expected: output contains no source contents or secret values; freshness matches the recorded baseline and impact lists only changed and connected record/source scope.

## 5. Direct Temporary Initialization Scenario

Create a temporary directory outside the repository work tree, initialize a ledger, validate it, and confirm a second initialization fails. Remove only that exact temporary directory after resolving and verifying its path.

## 6. Personal Installation Parity

Compare the four required files under `.agents\skills\web-project-memory` and `$env:USERPROFILE\.codex\skills\web-project-memory` with `Get-FileHash -Algorithm SHA256`. Expected: both manifests contain exactly `SKILL.md`, `agents/openai.yaml`, `references/project-memory-schema.md`, and `scripts/project_memory.py`, with matching hashes.

## 7. Repository Safety Checks

```powershell
git diff --check
```

Inspect changed files for UTF-8 BOM and mojibake patterns `â`, `ï؟½`, `Ã`, and `Â`. Expected: no newly introduced encoding corruption.

## 8. Convergence Review

- Every accepted task ID is complete.
- `PROJECT_MEMORY.md` matches inspected repository sources and cites them.
- The skill, schema reference, helper contract, tests, project guide, and Spec Kit artifacts agree.
- The personal package is installed, discoverable, valid, and byte-equivalent to the version-controlled source.
- No runtime source, schema, migration, dependency, or production behavior changed.
- Rerunning the convergence comparison appends no new task.
