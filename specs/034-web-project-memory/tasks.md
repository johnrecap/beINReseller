# Tasks: Web Project Memory Ledger

**Input**: Design documents from `specs/034-web-project-memory/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/ledger-contract.md`, `quickstart.md`

**Tests**: Focused tests are required because the skill becomes a durable completion gate for future web-project changes. No website, Worker, Redis, PostgreSQL, or production process may be started.

## Phase 1: Failing Skill And Helper Contracts

- [x] T001 [P] Add selection, ledger-structure, source, evidence, overwrite, malformed-ledger, and secret-boundary tests in `tests/unit/web-project-memory-ledger.test.ts`
  - **Reason**: The skill and helper need observable contracts before their instructions and validation logic exist.
  - **Expected**: Tests cover automatic selection wording, narrow version-control visibility, one root ledger, five evidence states, high-risk full-source rules, all sixteen sections, initialization, validation, overwrite refusal, duplicate IDs, missing sources, and common secret-value rejection.
  - **Possible bugs**: Tests can overfit exact prose or require a platform-specific Python executable name.
  - **Fix/Mitigation**: Assert durable invariants and allow the available Python launcher to be resolved from the environment.
  - **Verification**: Run only `npx tsx --test tests/unit/web-project-memory-ledger.test.ts` and confirm the implementation-dependent cases fail before T002-T005.

## Phase 2: Foundational Ledger Contract

- [x] T002 Create the compact record schema and section contract in `.agents/skills/web-project-memory-ledger/references/project-memory-schema.md`
  - **Reason**: Lookup, synchronization, initialization, and validation need one non-duplicated structural contract.
  - **Expected**: The reference defines sixteen sections, stable ID families, evidence states, record fields, update entries, source-pointer rules, and secret boundaries.
  - **Possible bugs**: An oversized schema can duplicate the skill or make the ledger expensive to load.
  - **Fix/Mitigation**: Keep examples short, place only conditional structural detail in the reference, and link it from the skill.
  - **Verification**: Cross-check against `spec.md` FR-001 through FR-020 and `contracts/ledger-contract.md`.

- [x] T003 Implement safe `init` and structural `validate` commands in `.agents/skills/web-project-memory-ledger/scripts/project_memory.py`
  - **Reason**: Repeated setup and validation are deterministic and should not be recreated manually.
  - **Expected**: Initialization creates one UTF-8 LF ledger, refuses overwrite, and validation reports missing sections, authority/evidence/date errors, duplicate IDs, record source/evidence errors, and common secret-value patterns.
  - **Possible bugs**: Validation can reject variable names as secrets, overlook malformed records, or overwrite an existing ledger.
  - **Fix/Mitigation**: Use exclusive file creation, conservative line-oriented secret patterns, typed-record block parsing, and standard-library-only code.
  - **Verification**: T001 helper scenarios pass, plus direct temporary init/validate/overwrite checks from `quickstart.md`.

## Phase 3: User Story 1 - Resume Web Project Work Efficiently (Priority: P1)

**Goal**: A fresh agent reads one ledger and reaches the right connected sources without scanning the entire repository.

**Independent Test**: Use the initial ledger to locate authoritative frontend, API, data/auth, Worker/job, test, and deployment sources for representative domains.

- [x] T004 [US1] Create lookup, authority, evidence, token-discipline, and connected-source workflow in `.agents/skills/web-project-memory-ledger/SKILL.md`
  - **Reason**: The discoverable entrypoint must change agent behavior while remaining lean enough to load on ordinary web-project work.
  - **Expected**: The skill selects precisely, reads memory first, searches stable IDs, follows linked sources, prefers reuse, and treats memory as an index rather than proof.
  - **Possible bugs**: A broad description can activate for unrelated questions, or the body can duplicate the entire schema.
  - **Fix/Mitigation**: Use a discriminating description, explicit exclusions, progressive disclosure, and short purpose-driven instructions.
  - **Verification**: T001 selection and lookup assertions pass; Skill Creator quick validation passes.

- [x] T005 [US1] Initialize source-grounded current topology, source map, layer summaries, and feature-slice links in `PROJECT_MEMORY.md`
  - **Reason**: A generic empty template would not save tokens or improve source discovery for this project.
  - **Expected**: The ledger compactly maps the Next.js web app, APIs, domain libraries, Prisma/PostgreSQL, Redis/BullMQ, Worker/keepalive/maintenance runtimes, auth/permissions, tests, specs, docs, configuration names, and PM2 deployment with exact inspected sources.
  - **Possible bugs**: The ledger can become a route/schema dump, copy stale docs as fact, or accidentally include environment values.
  - **Fix/Mitigation**: Seed from opened high-signal sources, use evidence labels, preserve unknown deployment state, record names only, and keep directory inventories out.
  - **Verification**: T001 real-ledger assertions and `project_memory.py validate PROJECT_MEMORY.md` pass.

## Phase 4: User Story 2 - Keep Memory Synchronized After Changes (Priority: P1)

**Goal**: Every saved material web-project change leaves compact, accurate resumption state.

**Independent Test**: Trace the synchronization gate for a simulated cross-layer change and verify affected records plus one update entry are required while unrelated sections remain untouched.

- [x] T006 [US2] Add material-change classification, cross-record synchronization, stable-ID preservation, conflict handling, read-only no-churn, and end-of-task validation rules to `.agents/skills/web-project-memory-ledger/SKILL.md`
  - **Reason**: A ledger that is not synchronized after changes quickly becomes a liability.
  - **Expected**: The skill defines exactly when and how to update current state, connected records, decisions, risks, active work, and one compact update log entry.
  - **Possible bugs**: Every conversation can create noisy entries, or file moves can allocate duplicate concept IDs.
  - **Fix/Mitigation**: Limit updates to saved material changes or verified corrections, require causal deltas, and preserve stable IDs across path changes.
  - **Verification**: T001 synchronization assertions pass and the skill contract matches spec FR-007, FR-008, FR-010, FR-016, and FR-017.

- [x] T007 [US2] Record the initial memory-system decision, active feature, risks, and material update in `PROJECT_MEMORY.md`
  - **Reason**: The ledger must demonstrate its own synchronization contract and preserve the authority for its creation.
  - **Expected**: Accepted one-file/derived-index decisions, active Spec Kit work, known live-state limits, and `UPD-20260823-001` cite exact sources with `NO_RUNTIME_IMPACT`.
  - **Possible bugs**: Self-documentation can become circular or claim the skill is active before validation.
  - **Fix/Mitigation**: Cite the accepted spec/plan and mark work state accurately until final verification is complete.
  - **Verification**: Validate stable IDs, sources, evidence, date, and runtime impact through T001 and the helper.

## Phase 5: User Story 3 - Initialize And Validate A Trustworthy Ledger (Priority: P2)

**Goal**: A missing ledger can be created safely and a damaged ledger fails with actionable errors.

**Independent Test**: Initialize, validate, reject overwrite, damage a temporary copy, and observe non-zero actionable failure.

- [x] T008 [US3] Document helper routing, repair behavior, and validation limits in `.agents/skills/web-project-memory-ledger/SKILL.md` and `.agents/skills/web-project-memory-ledger/references/project-memory-schema.md`
  - **Reason**: Agents must know when to run deterministic tooling and when semantic source inspection is still required.
  - **Expected**: Missing memory is initialized, stale memory is repaired from authoritative sources, validation remains explicitly structural, and existing ledgers are never overwritten.
  - **Possible bugs**: Agents can mistake structural validation for semantic correctness or initialize over useful history.
  - **Fix/Mitigation**: State the limitation beside the commands and require exclusive initialization plus source-grounded repair.
  - **Verification**: T001 helper-boundary assertions and direct quickstart scenarios pass.

## Phase 6: User Story 4 - Preserve Full-Source Safety For High-Risk Work (Priority: P2)

**Goal**: Token savings never replace complete evidence for security, money, destructive data, production, or final release judgments.

**Independent Test**: Read the skill as a new agent and confirm it requires complete connected-source inspection in all named high-risk modes.

- [x] T009 [US4] Add high-risk, wide-impact, final-audit, production-state, data-migration, and secret-safety gates in `.agents/skills/web-project-memory-ledger/SKILL.md`
  - **Reason**: Memory can be stale or incomplete precisely where false confidence is most costly.
  - **Expected**: The ledger narrows discovery but final judgments reopen all connected authoritative code, schema, migrations, tests, config, and authorized live evidence required by scope.
  - **Possible bugs**: The gate can be vague enough to skip a downstream consumer or broad enough to force full-repository reads for ordinary work.
  - **Fix/Mitigation**: Name high-risk categories and require complete connected surfaces, not unrelated files.
  - **Verification**: T001 high-risk assertions pass and the wording matches spec FR-009 and FR-015.

## Final Phase: Documentation, Validation, And Convergence

- [x] T010 Update durable handoff documentation in `docs/PROJECT_GUIDE.md`
  - **Reason**: Future maintainers need to know the ledger exists, how it is used, and how it is validated.
  - **Expected**: Start Here, architecture, where-to-start, testing, operational notes, and recent changes link the skill and ledger without duplicating their full contents.
  - **Possible bugs**: Documentation can claim runtime behavior changed or repeat sensitive configuration detail.
  - **Fix/Mitigation**: Mark the change `NO_RUNTIME_IMPACT`, link exact files, and list names only.
  - **Verification**: Cross-check claims against delivered files and actual validation results.

- [x] T011 Run focused tests, skill validation, ledger validation, diff/encoding checks, and manual convergence against `specs/034-web-project-memory/quickstart.md`
  - **Reason**: The skill, schema, helper, ledger, tests, Spec Kit artifacts, and project guide must agree before handoff.
  - **Expected**: All checks pass, every task is complete, no runtime source changed, no secret or encoding issue exists, and a second convergence pass adds no task.
  - **Possible bugs**: Broad checks can start services or inspect a live database, or missing `speckit-converge` integration can hide drift.
  - **Fix/Mitigation**: Use only listed local non-server checks and perform an explicit artifact-to-diff convergence pass twice.
  - **Verification**: Record command results, mark tasks complete, and confirm `git diff --check` plus BOM/mojibake scans are clean.

## Remediation Phase 1: Failing Personal-Skill Behavior Contract

- [x] T012 [P] Add corrected package, metadata, twenty-three-section, Git freshness, impact, and isolated demo behavior tests in `tests/unit/web-project-memory.test.ts`
  - **Reason**: The earlier tests prove a narrower repository-local contract and rely heavily on wording assertions; the supplied requirements demand observable personal-package and multi-layer behavior.
  - **Expected**: Tests create a temporary Git-backed web project with frontend, API, service, database, auth, and test sources; assert safe initialization, source validation, stale detection, connected impact, unrelated-record exclusion, and source/install metadata requirements.
  - **Possible bugs**: Tests can depend on a global installation before the source package exists, leak temporary directories, assert Git framework behavior, or couple to prose.
  - **Fix/Mitigation**: Test the version-controlled package first, use real temporary files and Git commands without mocks, clean only the exact temporary root, and keep installation parity as a separate final check.
  - **Verification**: Run `npx tsx --test tests/unit/web-project-memory.test.ts` before T013-T014 and confirm implementation-dependent cases fail for the missing corrected package.

## Remediation Phase 2: Portable Package And Deterministic Helper

- [x] T013 Update the twenty-three-section record/state/freshness schema and helper behavior in `.agents/skills/web-project-memory/references/project-memory-schema.md` and `.agents/skills/web-project-memory/scripts/project_memory.py`
  - **Reason**: Initialization, validation, stale detection, and impact narrowing need one portable deterministic contract.
  - **Expected**: The helper initializes exact sections and baseline metadata, validates state/source rules, reports Git state, detects freshness drift, and returns direct plus connected records without editing semantic memory.
  - **Possible bugs**: The ledger can be immediately stale after creation, Git output can vary by platform, source checks can reject non-file references, or impact traversal can include unrelated records.
  - **Fix/Mitigation**: Fingerprint normalized porcelain paths after ledger creation, use standard-library subprocess/path handling, classify non-file references explicitly, exclude the ledger itself, and traverse only declared stable-ID connections.
  - **Verification**: T012 helper scenarios pass on Windows and use no application runtime, database, network, or mock.

- [x] T014 Create the corrected generic skill and UI metadata in `.agents/skills/web-project-memory/SKILL.md` and `.agents/skills/web-project-memory/agents/openai.yaml`, update `.gitignore`, and retire `.agents/skills/web-project-memory-ledger`
  - **Reason**: The user requires the exact personal skill identity, display metadata, implicit invocation, framework-neutral behavior, and one maintained package source.
  - **Expected**: The new package exposes `web-project-memory`, `Web Project Memory`, `$web-project-memory`, framework-neutral first-run/monorepo discovery, Git/non-Git workflow, secret boundaries, progressive disclosure, and no duplicate legacy package.
  - **Possible bugs**: Both skill names can remain discoverable, the description can become a catchall, the default prompt can name the wrong skill, or ignore rules can expose unrelated local skills.
  - **Fix/Mitigation**: Use a discriminating description, byte-parity-ready four-file package, narrow `.gitignore` exceptions, and explicit negative selection tests.
  - **Verification**: T012 package/metadata tests and Skill Creator `quick_validate.py` pass; `git status --untracked-files=all` exposes only the intended skill package.

## Remediation Phase 3: Project Ledger Migration And Personal Installation

- [x] T015 Migrate the current source-grounded ledger to the corrected schema in `PROJECT_MEMORY.md`
  - **Reason**: The real ledger must use the same twenty-three-section, state, Git baseline, impact, and freshness contract that future projects receive.
  - **Expected**: Existing stable IDs and source facts survive; `CONFIRMED` becomes `VERIFIED`, merged concerns are split without duplicating facts, Feature Registry status is explicit, and the current dirty-worktree baseline is truthful.
  - **Possible bugs**: Moving records can drop source pointers/history, misclassify a current feature, duplicate facts, claim a clean or deployed state, or introduce encoding corruption.
  - **Fix/Mitigation**: Use targeted record moves/heading changes, preserve IDs, compute baseline from Git after all repository paths are known, keep production unknowns visible, and validate sources plus encoding.
  - **Verification**: The corrected helper validates `PROJECT_MEMORY.md --repository .`; stable IDs remain unique and the original source coverage remains reachable.

- [x] T016 Install a byte-equivalent personal package at `C:/Users/SOUQ/.codex/skills/web-project-memory`
  - **Reason**: Repository-local discovery alone does not satisfy personal cross-project installation.
  - **Expected**: The personal directory contains exactly the four required package files and matches the version-controlled source byte-for-byte.
  - **Possible bugs**: A partial copy, wrong Codex home, stale prior package, or path permission failure can leave a false installation claim.
  - **Fix/Mitigation**: Resolve the active user/Codex paths, refuse to merge with an unknown existing package, install only after source validation, compare manifests/hashes, and request the runtime approval required for the external write.
  - **Verification**: Skill Creator validation passes on the installed path and a four-file SHA-256 manifest equals the source manifest.

## Remediation Final Phase: Documentation, Quality, And Convergence

- [x] T017 Update durable handoff and corrected commands in `docs/PROJECT_GUIDE.md`, `specs/034-web-project-memory/quickstart.md`, and affected Spec Kit artifacts
  - **Reason**: Future maintainers need the exact personal/source ownership, invocation, validation, freshness, and installation workflow.
  - **Expected**: Documentation names only current paths and commands, records `NO_RUNTIME_IMPACT`, and does not duplicate the schema or expose secret values.
  - **Possible bugs**: Stale legacy names or unverified success claims can remain after rename/install.
  - **Fix/Mitigation**: Search every durable artifact for `web-project-memory-ledger`, cross-check commands against CLI help and installed files, then run docs review.
  - **Verification**: No active instruction references the legacy package except historical explanation; all documented paths and commands exist and pass.

- [x] T018 Run source and installed skill validation, focused behavior tests, real-ledger validation/freshness/impact, parity, diff/encoding checks, and two manual convergence passes
  - **Reason**: The corrected package, installation, ledger, tests, docs, and planning artifacts must agree before handoff.
  - **Expected**: All checks pass; no runtime/schema/migration/dependency source changes; all tasks/checklists complete; no secret/encoding issue; the second convergence pass adds no task.
  - **Possible bugs**: Updating the final Git fingerprint can itself change status classification, broad checks can start services, or the personal copy can drift after a late source edit.
  - **Fix/Mitigation**: Fingerprint normalized status paths, install only after the final source package edit, rerun parity last, and use only local non-server commands from quickstart.
  - **Verification**: Record exact results for 23-section validation, behavior tests, both quick validations, freshness, impact, SHA-256 parity, `git diff --check`, BOM/mojibake scans, and two unchanged convergence passes.

## Dependencies And Execution Order

- T001 precedes all skill/helper implementation.
- T002 establishes the contract used by T003-T009.
- T003 blocks initialization and real-ledger validation in T005 and T007.
- T004 and T005 deliver User Story 1; T004 precedes T006, T008, and T009 because they extend the same skill.
- T006 precedes T007.
- T010 follows all delivered behavior and T011 follows every other task.
- T012 is the remediation TDD gate and precedes T013-T016.
- T013 and T014 implement the portable package contract before T015 migrates the real ledger.
- T015 precedes T016 so the source package and project memory are validated before personal installation.
- T017 follows delivered behavior; T018 follows every remediation task.

## Parallel Opportunities

- T001 test authoring and read-only final source-map review can proceed independently, but all repository edits remain root-owned.
- After T002, helper implementation and skill lookup drafting target different files, but this plan executes them sequentially to preserve the test-first gate.
- No concurrent writer is used for `PROJECT_MEMORY.md` or `SKILL.md`.
- Remediation remains single-agent by explicit requirement; `[P]` marks independent test authoring only and does not authorize subagent use.

## Implementation Strategy

1. Lock durable invariants in one focused failing test.
2. Define the schema reference and deterministic helper.
3. Create the lean skill entrypoint and initialize the real project ledger.
4. Add synchronization, repair, and high-risk safety gates.
5. Update project documentation and run only local non-server verification.
6. Compare the delivered diff to all accepted requirements and tasks until no further task is needed.
7. Reopen the feature when supplied requirements expose drift, add failing behavior tests, migrate the package/ledger, install the personal copy, and reconverge.
