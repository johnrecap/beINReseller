# PROJECT_MEMORY.md Schema

Use this schema only when creating a ledger, repairing structure, adding a record family, or synchronizing a wide-impact change. Ordinary work should read the matching records and linked sources, not this whole reference.

## Authority and record states

Source code, schemas, ordered migrations, accepted specifications, tests, explicit maintainer decisions, and freshly authorized operational evidence are authoritative. `PROJECT_MEMORY.md` is a compact derived index; it locates evidence and is never proof by itself.

Every material record uses exactly one record state:

- `VERIFIED`: directly supported by inspected authoritative sources.
- `INFERRED`: strongly implied but not explicitly guaranteed.
- `PLANNED`: accepted or proposed future state, absent from verified runtime behavior.
- `PARTIAL`: some declared behavior exists, but the record names what is incomplete.
- `STALE`: the record or its source pointer is known to lag current sources.
- `CONFLICT`: relevant sources disagree; cite every side until resolved.
- `DEPRECATED`: retained only to explain a supported transition or replacement.
- `UNKNOWN`: evidence is absent, insufficient, unsafe, or unauthorized to inspect.

Feature Registry implementation status is separate and uses one of `PLANNED`, `PARTIAL`, `WORKING`, `BLOCKED`, `DEPRECATED`, `BROKEN`, or `UNKNOWN`. A feature can have `State: VERIFIED` and `Status: PARTIAL`: the record is verified while the implementation remains incomplete.

Never convert a present migration into proof of deployment, an unrun test into passing evidence, or a local process into verified production state.

## Stable IDs

Preserve IDs when paths or symbols move. Update aliases and source pointers instead of allocating a new ID for the same concept.

| Family | Meaning |
| --- | --- |
| `SRC-###` | Authoritative source or source group |
| `APP-###` | Deployable app, package, process, or runtime |
| `FE-###` | Frontend route, shell, shared component, or state boundary |
| `BE-###` | Backend service, domain module, or server-side primitive |
| `API-###` | API route, RPC, webhook, request/response, or error contract |
| `DATA-###` | Data model, schema, migration, constraint, or lifecycle |
| `FLOW-###` | Cross-layer data or control flow |
| `AUTH-###` | Authentication, session, role, permission, or ownership rule |
| `JOB-###` | Worker, queue, cron, retry, lock, or background lifecycle |
| `INT-###` | External provider or cross-system integration |
| `ENV-###` | Environment/config name and ownership boundary |
| `SEC-###` | Security, privacy, abuse, audit, or trust boundary |
| `OPS-###` | Build, deployment, observability, recovery, or release procedure |
| `FEAT-###` | End-to-end feature slice and implementation status |
| `IMPACT-###` | Shared dependency or blast-radius map |
| `TEST-###` | Verification suite, command, evidence boundary, or gap |
| `DEC-###` | Accepted, proposed, rejected, or superseded decision |
| `RISK-###` | Issue, conflict, debt, regression risk, or follow-up |
| `WORK-###` | Planned, active, blocked, or completed durable work |
| `FRESH-###` | Freshness fact, non-Git baseline, or unresolved drift |
| `UPD-YYYYMMDD-###` | One compact material synchronization entry |

IDs are local to one ledger. Never renumber records for presentation.

## Record form

Every `###` record has `State` and at least one backticked source pointer. Use repository-relative files or directories plus `#symbol`, `#heading`, or `:line` when helpful. Prefix a legitimate non-file authority with `command:`, `external:`, `decision:`, `production:`, `runtime:`, or `user:` so structural validation does not mistake it for a file.

```markdown
### API-001 — Accounts contract

- State: VERIFIED
- Sources: `src/api/accounts.ts#GET`; `tests/accounts.contract.test.ts`
- Current state: Returns the authenticated actor's visible accounts.
- Entry points: `FE-001`
- Connections: `BE-001`, `DATA-001`, `AUTH-001`, `TEST-001`
- Impact: API, frontend client, data query, authorization
```

Feature records also require `Status`:

```markdown
### FEAT-001 — Account listing

- State: VERIFIED
- Status: WORKING
- Sources: `src/pages/accounts.tsx`; `src/api/accounts.ts`
- Entry points: `FE-001`, `API-001`
- Connections: `BE-001`, `DATA-001`, `AUTH-001`, `TEST-001`
- Impact: frontend, API, data, auth
```

Omit fields that add no information. Keep causal state and stable-ID connections; do not paste source, route inventories, schema dumps, long diffs, secret values, or generated output lists.

## Required header

```markdown
# PROJECT MEMORY — Project Name

> Source of truth: source code, schemas, ordered migrations, accepted specifications, tests, explicit maintainer decisions, and authorized operational evidence.
> Memory role: derived index and resumption state; use it to locate evidence, never as proof.
> Record states: VERIFIED | INFERRED | PLANNED | PARTIAL | STALE | CONFLICT | DEPRECATED | UNKNOWN
> Feature states: PLANNED | PARTIAL | WORKING | BLOCKED | DEPRECATED | BROKEN | UNKNOWN
> Last synchronized: YYYY-MM-DD
> Last synchronized commit: 40_HEX_COMMIT | NO_GIT | UNKNOWN
> Working tree at synchronization: CLEAN | DIRTY | NO_GIT | UNKNOWN
> Working tree fingerprint: SHA256:64_HEX | NO_GIT | UNKNOWN
```

When Git is unavailable, also include `> Non-Git source baseline: SHA256:64_HEX`. That value represents only bounded source names, sizes, and timestamps; it is a drift signal, not source verification.

## 1. Project Identity

Purpose, repository boundary, documentation language, owners, authoritative-source hierarchy, canonical ledger, and excluded generated/runtime data.

## 2. Current System Snapshot

The smallest current state needed to resume: product shape, active slice, important constraints, high-risk boundaries, and where a new session should begin.

## 3. Technology Stack

Languages, frameworks, runtime/toolchain versions, package managers, storage engines, test tools, and version sources. Do not infer versions from memory.

## 4. Architecture Map

`APP-*` and key boundary records for deployable apps, packages, browser/server separation, workers, databases, caches, queues, and ownership.

## 5. Source Map

`SRC-*` records for high-signal manifests, entry points, schemas, migrations, specifications, tests, configuration, and operations sources. Do not list every leaf or generated file.

## 6. Frontend

`FE-*` records for routes, shells, component systems, state/data patterns, loading/empty/error/success behavior, responsiveness, accessibility, localization, and RTL where applicable.

## 7. Backend

`BE-*` records for domain services, server-only modules, repositories, validation primitives, transactions, errors, and side-effect ownership.

## 8. API Contracts

`API-*` records for routes/RPC/webhooks, callers, request/response/error shapes, auth headers, validation, pagination, idempotency, compatibility, and contract tests.

## 9. Database

`DATA-*` records for domain models, constraints, indexes, migrations, seeds, retention, deletion, rollback/forward-fix boundaries, and the distinction between migration presence and deployment.

## 10. Data Flows

`FLOW-*` records linking entry points through state, API, services, transactions, queues, caches, integrations, and final effects. Record failure and consistency boundaries.

## 11. Authentication and Authorization

`AUTH-*` records for login/session type, guards, roles, permissions, resource ownership, tenant isolation, denied paths, revocation, and server-side enforcement. UI visibility alone is never authorization.

## 12. External Integrations

`JOB-*` and `INT-*` records for producers/consumers, payload pointers, provider contracts, retries, timeouts, idempotency, locks, recovery, observability, and data effects.

## 13. Environment Variables

`ENV-*` records for variable names, source locations, environment scope, precedence, owning runtime, required/optional state, and public-versus-secret classification. Never record values.

## 14. Security

`SEC-*` records for trust boundaries, validation, privacy/PII, logging redaction, rate limits, abuse controls, audit trails, secrets, dependency exposure, and unresolved threat evidence.

## 15. Testing and Quality

`TEST-*` records for commands and suite groups, what they prove, flags, fixtures, external dependencies, safe local boundaries, known gaps, and last verified source evidence.

## 16. Build Deployment and Operations

`OPS-*` records for install/build/deploy order, process names, migrations, health checks, rollback/forward-fix, monitoring, logs, backups, incident recovery, and release verification. Live state stays `UNKNOWN` unless freshly and safely verified.

## 17. Feature Registry

`FEAT-*` records connect actors and entry points through frontend, API, backend, data, auth, jobs/integrations, tests, docs, and operations. Require both record `State` and implementation `Status`.

## 18. Dependency and Impact Map

`IMPACT-*` records for shared primitives and blast radius: callers, consumers, data, permissions, tests, documentation, deployment, and high-risk fan-out. Prefer stable-ID links over repeated prose.

## 19. Technical Decisions

`DEC-*` records with state, authority, ISO date, scope, rationale, rejected alternatives where useful, and superseding decision. Memory does not invent a decision.

## 20. Known Issues and Technical Debt

`RISK-*` records with severity, evidence, affected IDs, mitigation, acceptance owner if known, and explicit resolution criteria. Conflicts stay visible.

## 21. Open Tasks

`WORK-*` records for active specifications, accepted task ranges, blockers, completion evidence, and durable next work. Remove transient scratch notes.

## 22. Change Ledger

Keep recent material deltas in reverse chronological order. One saved task gets one task-level entry, not one entry per edited file.

```markdown
### UPD-20260823-001 — Initialize project memory

- State: VERIFIED
- Sources: `PROJECT_MEMORY.md`; `specs/001-project-memory/spec.md`
- Date: 2026-08-23
- Affected IDs: `DEC-001`, `WORK-001`, `FRESH-001`
- Delta: Added a source-linked project index and synchronization baseline.
- Impact: NO_RUNTIME_IMPACT
```

## 23. Freshness and Conflicts

`FRESH-*` records capture baseline kind, known stale pointers, unresolved Git/non-Git drift, conflicting sources, and the exact authoritative files that must be reopened. Do not use this section as a second issue backlog.

## Material synchronization

Synchronize after saved changes to runtime behavior, UI/UX, APIs, backend services, schemas/migrations, auth/permissions, jobs/integrations, environment names or ownership, security, build/deployment, verification coverage, accepted specifications/decisions, durable documentation, or ledger correctness.

For each material change:

1. Inspect Git status and diff, then reopen the authoritative changed sources.
2. Update current records and every declared connected record affected by the causal change.
3. Preserve unrelated records, stable IDs, aliases, decisions, and history.
4. Add one `UPD-*` entry with date, state, affected IDs, exact sources, delta, and impact.
5. Use `NO_RUNTIME_IMPACT` only for planning, documentation, skill packaging, or release metadata with no product/runtime/data effect.
6. Refresh the Git or non-Git baseline only after the synchronized source state is settled.

Read-only review, discussion, an unchanged validation run, or a transient experiment that saves no authoritative project state creates no ledger churn.

## Wide-impact and high-risk work

For auth/session rules, money/accounting, destructive or backfill migrations, public APIs, shared model semantics, queue payloads, cross-runtime state, tenant isolation, secrets/config precedence, deployment, incident recovery, or release decisions, memory is only a traversal plan. Search and inspect every connected authoritative caller, consumer, schema/migration, guard, job/integration, negative test, document, and operational step required by the scope.

## Secret boundary

Record environment variable names and ownership only. Never record `.env` values, passwords or hashes, API keys, tokens, cookies, JWTs, session material, TOTP seeds, private keys, connection strings with credentials, database rows, payment data, PII, provider payloads, or sensitive logs.

## Validation Boundary

The helper's `validate` command proves structural invariants only: UTF-8 without BOM, exact header/state declarations, twenty-three ordered sections, unique supported IDs, required record fields, Feature Registry statuses, secret-like value rejection, and optional existence of repository-relative source pointers. It does not prove that prose accurately describes the source.

The `freshness` command compares the recorded Git commit and content-sensitive working-tree fingerprint, or a bounded non-Git metadata baseline. It reports likely drift; a current fingerprint does not prove semantic correctness, deployment state, or external health.

The `impact` command follows changed source pointers and declared stable-ID connections to produce a narrow second-read set. Its output is conservative routing evidence, not a complete program dependency graph and not authorization to edit every connected file.

Semantic verification requires reopening the cited authoritative files, inspecting actual callers and consumers, and running proportionate tests. Security, financial, destructive-data, migration, production, incident, and release claims additionally require freshly authorized production or external evidence. When that evidence is unavailable, use `UNKNOWN`, `STALE`, or `CONFLICT` and name what remains unverified.
