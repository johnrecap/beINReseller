# Phase 2 Foundation — accepted local verification

Date: 2026-09-07. Tasks T003, T004 and T005: COMPLETE for their immediate Q02/focused Q04 acceptance. Original plan progress: 5/58 (T001-T005); supplemental LOCAL-001 remains separate. Branch/HEAD preserved: 034-web-project-memory / 7457b7028811759736faa799a8b06b43691b1218 plus the existing dirty tree. This is not release acceptance.

## Scope and isolation

The maintainer explicitly requested completing Phase 2 after discussing executable verification. The spec, plan and tasks were amended before execution. Existing requirement/safety checklists passed 16/16 and 24/24. Prerequisites selected feature 036; the scope review found no new business policy, API contract or dependency beyond the existing foundation. Optional Git commit hooks were not run.

Tests use deshpanel_audit_test_20260907_v2 on loopback port 5433 with a dedicated non-superuser role and a 20-connection database cap. Its initial business tables were empty. Only schema and migration metadata came from the local reference; no customer/business rows were imported. Windows DPAPI protects its password outside Git. Child environments override repository environment keys and use the existing Node socket guard to block external network destinations. No Redis consumer, provider worker, production access, seed or full build ran. The interactive work database and reference snapshot were not test targets.

## Baseline, failures and migration evidence

1. A fresh database rehearsal using the first 33 SQL files failed at 20260216193000: 0_init is empty, so OperationStatus does not exist. The failed resource was retained as diagnostic evidence; no production/historical SQL was altered. This is an existing clean-install/release gap owned by T040/T052, not a failure of the three foundation migrations.
2. Created the separate v2 database from the reference schema only (57 tables, no COPY of business data) plus its 27 migration metadata records. Applied the six remaining pre-foundation migrations in a byte-equivalent bundle. The intentionally empty duplicate migration directory was omitted, as established in the earlier local database evidence.
3. Ran the authored eight DB cases before foundation migrations: 0 passed, 8 failed, 0 skipped. Failures identify the missing Operation.purpose column. Atomic setup rolled back its attempted synthetic rows. This supplies observed pre-foundation failure; the earlier source delivery had recorded expectations only.
4. Applied the three existing foundation migrations unchanged. The first post-migration run passed seven DB cases and failed the stale-baseline fixture because its dealerContextHash was not 64 hexadecimal characters.
5. Added a fixture card-format regression; it failed because generated cards were 17 digits while the API contract permits 10-16. Fixed only the test fixture: a SHA-256 synthetic context hash and a 16-digit card identifier. No production schema, constraint or runtime financial rule was weakened.

## Final verification

Command, with the isolated environment/credential supplied only in process memory:

```text
node --import tsx --test tests/unit/audit-financial-context.test.ts tests/integration/audit-financial-model-db.test.ts
```

Result: **20 tests passed, 0 failed, 0 skipped** (9 unit/guard cases and 11 PostgreSQL cases).

- Owner XOR, operation spend uniqueness and both reseller/customer families.
- Dispatch operation/job/revision uniqueness, revision-zero financial jobs and default compatibility.
- Fixed claim deadlines preserved across unrelated updates; deadline mutation rejected.
- Original funding bounds, canonical refund/request/event identities, cancellation reservation vetoes, immutable observations and request/origin fields.
- Installment identity, valid observation times/outcomes/amounts and required settlement reference; no claim that the fixture performs real provider settlement.
- Legacy adjudication uniqueness, immutable normalized evidence and valid classification.
- Concurrent completion effect insertion produces exactly one row; completion snapshots cannot be rewritten.
- All eleven fixture variants execute, including stale baselines, absent evidence, mixed/credit/wallet funding and old dispatch defaults.
- Callback failure cleans its own fixture and leaves a concurrently retained fixture intact. The fixture wrapper refuses unconfigured execution before runtime DB imports.
- The real existing Stripe refund finalizer is forced to wait behind a canonical card/row lock holder. pg_locks verifies an actual waiting advisory lock before release; the finalizer then returns REFUNDED and writes exactly one store-credit refund. This is foundation lock serialization, not the future pending-settlement authorizer/veto integration in T021.

Focused TypeScript checking of the five foundation source/test files and their imported dependencies: zero scope errors and zero dependency diagnostics. ESLint on the three edited test/helper files exited 0; it reported only an existing Browserslist data-age notice. Both Prisma schemas remain byte-equal. The migration bundle and all 36 source migration hashes remain unchanged. This is not the combined web/worker build gate Q06.

Final database verification: 72 public tables, 36 migration records, **zero business rows across every business table**, zero invalid indexes. The test database contains synthetic resources only and no persisted fixture residue. Cleanup never truncated the work clone or source snapshot.

## Tracking, convergence and remaining limits

- T003 accepted: meaningful pre-foundation failures, pure decisions, real model/lock tests and strengthened negative coverage.
- T004 accepted: all three unchanged SQL migrations applied to the synthetic baseline; the six model families and compatibility constraints exercised; schema parity verified.
- T005 accepted: eleven variants, actual cleanup on success/failure, valid card/hash contracts and pre-import disposable guards verified.
- Bounded Phase 2 convergence found no additional foundation task necessary. The existing empty initialization baseline is recorded under T040/T052 rather than rewriting history or silently declaring clean-install readiness.
- T006 onward is not implemented by this task. All twenty original audit findings remain open. Full financial writer/veto integration, Redis/worker journeys, combined builds, historical data validation, full migration rehearsal, real beIN evidence, consumer acceptance and production deployment remain in their existing tasks.
- Test logs, copied schema/history and metadata stay outside Git at D:/CodexPostgreSQL/phase2-verification-20260907: baseline-deploy.log, schema-import.log, baseline-v2-deploy.log, before-foundation.log, foundation-deploy.log, after-foundation-initial.log, foundation-focused-final.log, migration-hashes.json and final-metadata.json. No credentials or customer rows are included in this report.
