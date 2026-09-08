# Research: Web Project Memory Ledger

## Decision 1: Use One Root Ledger

- **Decision**: Store durable project memory only in `PROJECT_MEMORY.md` at the repository root.
- **Rationale**: The user's main goals are token reduction and fast source discovery. One searchable file minimizes routing overhead and mirrors the proven novel-memory contract.
- **Alternatives considered**: Per-domain memory files were rejected because they duplicate cross-layer state and require agents to discover which memory file to load first. A database or vector store was rejected because it adds runtime, setup, portability, and trust problems.

## Decision 2: Memory Is Derived, Sources Remain Authoritative

- **Decision**: Treat memory as a compact index and resumption state, never as proof.
- **Rationale**: Web systems drift across code, schema, migrations, tests, deployment, and production state. Allowing memory to override those sources would turn token savings into correctness risk.
- **Alternatives considered**: Treating the ledger as canonical architecture documentation was rejected because it cannot prove runtime behavior or migration deployment state.

## Decision 3: Use Stable Typed IDs And Explicit Record States

- **Decision**: Use the supplied record states `VERIFIED`, `INFERRED`, `PLANNED`, `PARTIAL`, `STALE`, `CONFLICT`, `DEPRECATED`, and `UNKNOWN`, plus a separate Feature Registry status vocabulary, and retain typed stable IDs for sources, runtimes, layers, feature slices, decisions, risks, work, freshness, and updates.
- **Rationale**: Stable IDs make compact cross-references survive path changes; explicit stale/partial/deprecated states preserve lifecycle and freshness without presenting them as verified facts.
- **Alternatives considered**: Free-form headings were rejected because names drift and cannot be referenced compactly. Git hashes were rejected as primary IDs because they are not durable concept identifiers.

## Decision 4: Model End-To-End Feature Slices

- **Decision**: Record important behavior as connected feature slices rather than separate frontend/backend/database summaries only.
- **Rationale**: Most costly rediscovery comes from tracing a user or system action across UI, API, service, data, auth, worker, tests, and operations. A slice provides that map without copying implementation.
- **Alternatives considered**: A directory inventory alone was rejected because it does not explain runtime connections or blast radius.

## Decision 5: Keep Semantic Synchronization Agent-Owned

- **Decision**: The helper initializes and validates structure, captures Git state, detects baseline drift, and maps changed source paths to connected record IDs, but never rewrites existing semantic memory or invents project claims.
- **Rationale**: Correct synchronization requires judgment and source inspection. Automating semantic edits would risk lossy summaries and fabricated facts.
- **Alternatives considered**: A repository crawler was rejected because file inventories are not behavior maps and would create a large, noisy ledger.

## Decision 6: Use A Single-Agent Pipeline

- **Decision**: Harness architecture is a single-agent sequential pipeline: inspect memory, inspect linked sources, perform task work, synchronize affected records, validate, hand off.
- **Rationale**: The artifact is one shared ledger and synchronization is order-dependent. Additional specialist or delegation layers add coordination cost without improving the core contract.
- **Alternatives considered**: Fan-out by frontend/backend/database was rejected because independent writers would contend on one file and could create contradictory summaries.

## Decision 7: Seed From High-Signal Repository Sources

- **Decision**: Initialize the first ledger from inspected entry points, architecture docs, package manifests, schema/migrations, auth/permission primitives, queue/worker entry points, tests, and deployment configuration.
- **Rationale**: A useful seed must be source-grounded but compact. High-signal sources cover topology and boundaries without enumerating every route or model.
- **Alternatives considered**: Reading every source file was rejected for ordinary initialization; it is reserved for a full final audit or when the ledger is untrusted.

## Decision 8: Version One Package And Install An Identical Personal Copy

- **Decision**: Rename the source package to `web-project-memory`, keep it version-controlled under `.agents/skills`, and install a byte-equivalent copy under the active Codex personal skills home.
- **Rationale**: The repository needs reviewable source and tests, while the user explicitly requires the skill across projects. Byte parity prevents two independently maintained implementations.
- **Alternatives considered**: Keeping only the repository-local skill fails the personal-install requirement. Maintaining different global and local skills was rejected because their behavior would drift.

## Decision 9: Use Twenty-Three Sections With Progressive Disclosure

- **Decision**: Adopt the supplied twenty-three-section contract and keep the skill entrypoint lean by routing structural detail to the schema reference.
- **Rationale**: Literal compliance adds explicit API, data-flow, impact, and freshness surfaces; progressive disclosure prevents the larger schema from loading during ordinary lookup.
- **Alternatives considered**: The earlier sixteen-section consolidation was more compact but omitted explicit contract surfaces and did not satisfy the supplied acceptance criteria.

## Decision 10: Make Git Freshness Deterministic And Non-Semantic

- **Decision**: Store the synchronized commit, working-tree state, and a SHA-256 fingerprint of normalized porcelain status. The helper reports freshness and impact; the agent still inspects and edits authoritative project facts.
- **Rationale**: A deterministic baseline detects drift without storing source content, secrets, or full diffs and avoids pretending that file-list changes explain semantics.
- **Alternatives considered**: Commit-only baselines miss dirty/untracked changes. Content hashes for the whole repository were rejected as expensive and noisy.

## Repository Findings Used By The Design

- The project is a full-stack Next.js panel with 40 page entry points and 205 App Router API route files.
- The database is PostgreSQL through a 1,718-line Prisma schema with 28 migration directories.
- The runtime includes the web app, operation maintenance, eight BullMQ worker processes, and one keepalive process under PM2.
- `src/lib/queue.ts` defines reseller and customer queues; `src/lib/operation-dispatch.ts` persists an operation dispatch outbox before queue handoff.
- `src/lib/auth.ts`, `src/lib/mobile-auth.ts`, and `src/lib/auth-utils.ts` support panel web JWT sessions and mobile bearer tokens backed by current database account state.
- `src/lib/permissions/evaluator.ts` resolves account status, global blocks, account overrides, role settings, then defaults.
- The repository has 96 test files across unit and integration suites plus focused verification commands in `docs/PROJECT_GUIDE.md`.
- Existing product and architecture coverage in `docs/current-project-prd.md` and `docs/PROJECT_GUIDE.md` should be linked, not duplicated.
