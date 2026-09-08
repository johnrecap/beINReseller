---
name: web-project-memory
description: Maintain a compact, source-linked PROJECT_MEMORY.md while planning, analyzing, debugging, implementing, refactoring, testing, or handing off work in an existing web project across frontend, backend, APIs, databases, auth, integrations, infrastructure, and operations. Use it to resume project work and narrow connected source reads across any web stack. Do not use for general programming questions without project files or for fiction continuity.
---

# Web Project Memory

Keep one durable project index so future web-project work can resume from compact current context and open only the connected authoritative sources needed by the task.

## Core contract

- Canonical project path: `<repository-root>/PROJECT_MEMORY.md`.
- Keep exactly one project ledger per repository, including monorepos. Group apps and packages inside it; do not create frontend, backend, database, feature, or session fragments.
- Source code, schemas, migrations, accepted specifications, tests, explicit maintainer decisions, and freshly authorized operational evidence are authoritative. Memory is derived.
- Memory locates evidence; it is never proof and never overrides project instructions, source inspection, tests, approvals, or production-safety gates.
- Use record states `VERIFIED`, `INFERRED`, `PLANNED`, `PARTIAL`, `STALE`, `CONFLICT`, `DEPRECATED`, and `UNKNOWN` exactly as defined in the schema.
- Feature implementation status is separate: `PLANNED`, `PARTIAL`, `WORKING`, `BLOCKED`, `DEPRECATED`, `BROKEN`, or `UNKNOWN`.
- Preserve stable IDs across file moves, symbol renames, and implementation refactors.

Read [project-memory-schema.md](references/project-memory-schema.md) only when initializing or repairing a ledger, adding a record family, or synchronizing a wide-impact change. For ordinary work, read matching records and their linked sources only.

## Before project work

1. Locate the repository root and read its instructions.
2. Read the ledger header, Current System Snapshot, and matching stable records before scanning broad sources.
3. Check freshness. Resolve this skill's own directory from the loaded `SKILL.md`, then run:

   ```text
   python <skill-root>/scripts/project_memory.py freshness <repository-root> <repository-root>/PROJECT_MEMORY.md
   ```

4. If current, search the ledger by feature, file path, route, model, permission, job, integration, decision, risk, or stable ID.
5. If stale, inspect the reported Git status/diff paths, calculate connected impact, and reopen the authoritative files before trusting or changing memory:

   ```text
   python <skill-root>/scripts/project_memory.py impact <repository-root> <repository-root>/PROJECT_MEMORY.md
   ```

6. Open the target plus only the reported or declared connected sources needed to verify callers, contracts, data, auth, effects, tests, docs, and operations.
7. For high-risk or broad audits, expand to the complete authoritative scope required by the risk; do not stop at the narrow memory route.

Use `rg` and `rg --files` for text and file discovery when available. If unavailable, use the platform's next safe read-only search tool.

## First run or untrusted memory

When the ledger is missing, empty, structurally invalid, or materially untrusted:

1. Inspect project instructions and top-level layout.
2. Discover manifests, workspace/package definitions, runtime entry points, route conventions, frontend roots, backend/service roots, schemas and ordered migrations, auth/permission primitives, jobs/integrations, tests, documentation, infrastructure, build files, and deployment/operations sources.
3. Stay framework-neutral. Infer structure from real manifests and imports; do not assume React, Next.js, Node.js, Prisma, REST, or a single package.
4. Exclude dependency and vendor trees such as `node_modules/` and `vendor/`, plus `.git`, build output, coverage, caches, generated files, binary/media files, secret files, and large lockfile contents. Record lockfile names and package-manager role only when useful.
5. For monorepos, identify every deployable app and shared package, then map them into the same ledger.
6. Initialize only when `PROJECT_MEMORY.md` is absent:

   ```text
   python <skill-root>/scripts/project_memory.py init <repository-root> --project-name <name>
   ```

7. Replace empty section markers with compact source-grounded records. Do not turn a generated file inventory into architecture memory.
8. Validate structure and repository-relative source existence:

   ```text
   python <skill-root>/scripts/project_memory.py validate <repository-root>/PROJECT_MEMORY.md --repository <repository-root>
   ```

Initialization uses exclusive creation and refuses to overwrite an existing ledger.

## Git and non-Git baselines

When Git exists, inspect `git status` and `git diff`, record the synchronized commit, clean/dirty state, and content-sensitive status fingerprint, and exclude `PROJECT_MEMORY.md` itself from its freshness signal. Use changed paths only to narrow inspection; always reopen authoritative sources before editing memory.

For a bounded state report:

```text
python <skill-root>/scripts/project_memory.py git-state <repository-root> --ledger <repository-root>/PROJECT_MEMORY.md
```

When Git is unavailable, keep a bounded source-name/size/timestamp hash and a short source-name sample. Do not invent a commit or Git status. Supply known changed paths explicitly to impact routing when useful:

```text
python <skill-root>/scripts/project_memory.py impact <repository-root> <repository-root>/PROJECT_MEMORY.md --changed-path src/path/file.ext
```

## Connected lookup

For a page, component, button, route, endpoint, service, model, migration, permission, job, environment name, test, deployment step, or proposed change, trace:

- entry points and callers;
- frontend state and API clients;
- request, response, error, validation, and compatibility contracts;
- backend services, transactions, data reads/writes, caches, and consistency boundaries;
- authentication, roles, permissions, ownership, privacy, and abuse controls;
- queues, workers, webhooks, external calls, retries, and idempotency;
- loading, empty, failure, recovery, success, accessibility, responsive, localization, and RTL behavior where applicable;
- unit, contract, integration, browser, migration, security-negative, and operational verification;
- accepted specifications, decisions, docs, build/deployment, and observability effects.

Prefer reuse, then extension, then a narrow adapter. Do not infer the best fix from memory alone.

## Synchronization gate

A saved material project change is incomplete until every affected ledger record is synchronized and the ledger validates.

Material changes include saved changes to product/UI behavior, APIs, backend services, schemas/migrations, auth/permissions, jobs/integrations, environment variable names or ownership, security boundaries, build/deployment/observability, tests, accepted specifications/decisions, durable docs, active work, risks/conflicts, or ledger correctness.

1. Inspect the final changed sources and their connected records.
2. Record the causal delta, not copied code or a long diff retelling.
3. Update all affected current-state, source, architecture, frontend, backend, API, data, flow, auth, integration, environment, security, test, operations, feature, impact, decision, risk, task, and freshness records.
4. Preserve unrelated records, stable IDs, aliases, and historical decisions.
5. If sources disagree, keep `CONFLICT` and cite every side. Never alter working source solely to make memory agree.
6. Add exactly one task-level `UPD-YYYYMMDD-###` record with date, state, affected IDs, exact sources, delta, and impact.
7. Use `NO_RUNTIME_IMPACT` for planning, documentation, skill packaging, or release metadata that does not change product/runtime/data behavior.
8. Refresh synchronization metadata only after all authoritative saved changes are settled.
9. Re-read edited records, run structural and source validation, rerun freshness, and perform repository encoding/diff checks.

Read-only analysis, review, discussion, an unchanged validation run, or a transient local experiment with no saved authoritative change creates no ceremonial update entry. A verified repair of stale memory is a material correction and does create one.

## High-risk and broad scopes

For security, money/accounting, auth/session invalidation, permissions/ownership, destructive or backfill migrations, public APIs, shared model semantics, queue payloads, cross-runtime state, tenant isolation, secrets/config precedence, production deployment, incident recovery, or final release decisions:

- use memory only as a traversal plan;
- search every relevant caller, consumer, schema/migration, guard, job/integration, negative test, contract, document, and operations step;
- verify live or external state only through freshly authorized evidence; otherwise use `UNKNOWN`;
- do not issue a safety, migration, deployment, incident, or release verdict from memory alone.

Whole-project architecture, backend, UI/UX, security, data, and release audits require their complete authoritative scope.

## Secret and privacy boundary

Record environment variable names, scope, owner, source path, and public-versus-secret classification only. Never copy values from `.env` files; passwords or hashes; API keys; tokens; session material; cookies; JWTs; TOTP seeds; private keys; credentialed connection strings; database rows; payment data; PII; provider payloads; or sensitive logs. Hashing local working-tree content for freshness must never print file contents.

## Token discipline

- Store short causal bullets and stable-ID links, not code, schema dumps, exhaustive file/route/model/test inventories, long quotations, or commit history.
- Prefer one grouped source record when enumerating leaves adds no decision value.
- Link to existing specifications, guides, tests, and operations docs instead of copying them.
- Compact old update entries without deleting current facts, accepted decisions, active risks, or their source pointers.
- Use impact output as the second-read set; widen only for missing/untrusted memory, broad requested scope, or connected risk.

## Handoff checks

Before claiming completion after a material change, confirm:

- all affected records reflect inspected authoritative sources;
- states, Feature Registry statuses, IDs, source pointers, and synchronization metadata validate;
- conflicts, stale facts, and unknown production/deployment state remain explicit;
- one compact update entry captures the task delta;
- no secret or private runtime material entered the ledger;
- freshness is current for the settled worktree baseline;
- the final response says whether `PROJECT_MEMORY.md` was synchronized.

If synchronization or validation is blocked, name the exact record, source, or installation path still pending and treat the task as incomplete.
