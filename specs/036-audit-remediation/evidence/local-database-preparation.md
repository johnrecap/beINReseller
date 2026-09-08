# Local database preparation — 2026-09-07

Follow-up: local interactive application startup was explicitly requested and completed. Root Prisma generation and a loopback Next dev server now use the work clone and separate Redis. The verified local trial below supersedes the original no-startup boundary only for this trial and does not accept feature tasks.

## Local interactive trial — verified 2026-09-07

- Next.js development server is available at http://127.0.0.1:3000/login and the login page was opened in the browser. GET /login, /api/auth/session and /api/auth/csrf returned HTTP 200; the inspected browser error/warning log was empty. No authenticated journey or application test suite was run.
- Root Prisma client generation succeeded. A full user-model read with the restricted local app role succeeded without displaying the row. Memurai 4.2.2, Redis API 7.4.7, runs separately on loopback port 6389 and returned PONG. Existing Memurai service was left stopped.
- The deshpanel_local_app role has application DML privileges on the work clone, no schema ownership or migration-table privileges, and no access granted to the reference snapshot. No panel account/password was changed; use existing panel credentials from the backup.
- Child environment values override repository .env keys in process memory. Local database/Redis/auth/encryption credentials are Windows DPAPI protected outside Git; project .env files are unchanged. A local Node socket preload rejects non-loopback connections; its denial probe passed. This is a Node networking guard, not an operating-system firewall or a restriction on the user's browser.
- No provider worker, keepalive or maintenance consumer was started. Fresh Redis queues have no worker consumers; actual provider renewal, provider balance retrieval, external payment and notifications are unavailable in this trial. Local admin actions may change the disposable work clone.
- Runtime configuration, logs and PID manifest: D:/CodexPostgreSQL/local-panel. Initial web launcher PID 15756 and Redis PID 8608 are observations, not persistent process identities. Manual background processes are not configured to restart after Windows reboot.
- This proves startup, unauthenticated auth endpoints and basic local dependencies only. It does not prove all pages, successful account login, financial correctness, production readiness, Q02/Q04/Q09 or Phase 2 acceptance. Accepted tasks remain 2/58.

Status: reference snapshot RESTORED_VERIFIED; writable clone WORK_CLONE_MIGRATED_VERIFIED. Accepted tasks remain T001/T002 (2/58).

## Reported renewal error — LOCAL-001

- The user logged into the local panel and reported Server error on Start Renewal. Server logs show POST /api/operations/start-renewal failing P2010 in lockRenewalCardLifecycle before operation creation: pg_advisory_xact_lock returns PostgreSQL void, which the installed Prisma adapter cannot deserialize. This failure is independent of provider isolation. The logs also show P2037 on concurrent notification/reward/proxy requests; the work clone's connection cap was 6.
- The same unsupported result occurred in four existing lock sites: renewal lifecycle, card reservation, refund provider reservation and worker provider reservation. Each query now casts only its result to text. Tagged parameters, hash keys, order and transaction lifetime are unchanged; no lock is bypassed or migration required.
- tests/integration/local-advisory-lock-compatibility.test.ts executes all four source SQL statements through the actual Prisma adapter with synthetic keys. Before repair it reproduced P2010. After repair it passed, verified lock presence and second-session exclusion during the transaction, then successful acquisition after release. No business records or provider calls occur. Explicit opt-in and exact local target validation precede imports/connections.
- Eight existing unit cases in start-renewal-review-guard.test.ts and renewal-payment-refund-finalization.test.ts passed. These include source checks and pure decision cases; they are not full transaction/financial acceptance. No broader suites/builds ran.
- ALTER DATABASE on deshpanel_work_20260907 changed its connection limit from 6 to 40; verified afterward. Cluster max remains 100; observed pre-change sessions were 10 cluster-wide and 1 for the work clone. Snapshot and production settings remain unchanged. No server restart was required.
- Spec amendment, plan and LOCAL-001 agree on unchanged schema/API/financial contracts, narrow test permission and retained external isolation. Checklists remain 16/16 and 24/24; prerequisite check selected feature 036. Optional commit hooks were not run. Narrow converge review found no additional task necessary for this repair. Separate 58-task progress remains 2/58.
- Limits: actual authenticated renewal submission was reported failing before the fix and has not been independently replayed after it; provider workers remain stopped, so queued operations cannot fetch packages or execute beIN renewal. All twenty original audit findings remain open. Imported media files are absent locally and some existing media URLs return 404.

## Authorization and boundaries

The maintainer supplied the PostgreSQL backup, confirmed its location on D, then asked to run database updates to create missing objects. This preparation may restore/check local data, create a separate writable clone and apply existing SQL migrations there. It may not run the app, workers, Redis/providers, application tests/builds, seeds, client generation or production operations. This is a narrow exception to the original source-only Phase 2 runtime prohibition, not a new product implementation wave or full T004/T040/T052 acceptance.

## Reference evidence

- PostgreSQL 18.6 on loopback port 5433, data at D:/CodexPostgreSQL/audit18-data; original automatic 5432 service unchanged.
- Read-only database deshpanel_snapshot_20260907 restored from the supplied 18.0 SQL dump. SQL SHA256 444a95dd70e75000391d90eb44f46292b21345a4d8c4bfe741936c91bf0b8595 matches the adjacent gzip payload.
- Single-transaction restore omitted 369 cleanup DROP statements for the fresh database. All 57 table row counts match the dump (625,801 rows); zero invalid constraints/indexes. Saved SELECT-only reader credentials and restart verified; zero-row UPDATE denied with SQLSTATE 42501 even in READ WRITE mode.
- Local manifests, outside Git and without customer rows: D:/CodexPostgreSQL/restore-verification.json, reader-and-migration-verification.json and migration-preflight.json.

## Migration provenance and preflight

- Snapshot history contains 27 completed migrations and no failed/rolled-back records. All match local SQL content: 13 raw checksums, 14 after CRLF-to-LF normalization. Do not rewrite their files or recorded checksums.
- Nine newer SQL migrations are absent from snapshot history. They declare 15 new tables and 11 new types. Read-only preflight found zero target table/type collisions, canonical beIN username duplicates/blanks, invalid store-credit rows or spend rows without a user. These bounded checks are not exhaustive migration acceptance.
- The empty directory 20260616120000_unique_refund_transaction_per_operation is not missing required unique-index SQL. Commit 1c96b47cdc13c728486b8a4c93e81008b2c28706 added tests/unit/refund-unique-index-migration.test.ts explicitly asserting that this SQL file does not exist, because 20260216193000_add_review_required_and_financial_guards already creates uq_transactions_refund_once. Both snapshot history and Git contain the earlier migration; no SQL for the empty directory is recorded. Preserve repository history and omit the empty directory from an isolated migration bundle rather than inventing a replacement migration.

## Execution and verification

Observed drift: the snapshot has none of uq_transactions_refund_once, uq_transactions_deduct_once or uq_wallet_refund_once despite recording their original migration. Existing transaction refund/deduction duplicate-group counts are zero. Applying the nine pending migrations succeeded but does not repair already-recorded historical objects. The local-clone preparation also reasserts only these three exact canonical unique-index statements from the existing 20260216193000 SQL after duplicate checks; no original file/history or snapshot is changed. Wider schema drift and a production forward-repair migration remain separate review work.

1. Inspect the existing refund index on the snapshot, available D space and no conflicting target database; the missing historical guards were classified separately as described above.
2. Create deshpanel_work_20260907 from the preserved snapshot on the same isolated cluster. Keep the snapshot read-only.
3. Copy the current schema and all 36 existing SQL migration files byte-for-byte into a protected D-local bundle; verify hashes, omit only the empty directory, and use a minimal explicit Prisma config without app/dotenv/seed imports.
4. Run the already-installed Prisma migrate deploy against only localhost:5433/deshpanel_work_20260907 with the password passed in process memory. Do not execute seeds or generate clients. Stop on error; do not reset or force the history.
5. Verify migration status, new schema objects/constraints and preservation of original table row counts; retain the source snapshot. Record failures honestly. Do not promote this result to synthetic concurrency tests, complete schema-drift proof, full Q04/Q09 acceptance or application readiness. Source locale parity remains unknown (local builtin C.UTF-8).

## Scope consistency review before application

The local amendment changes environment execution permission only. Requirements, story contracts, 58 task IDs/dependencies, runtime source, schemas and historical migration bytes remain unchanged. The reference snapshot and writable clone have separate purposes; no production/provider path or financial writer is enabled. The original source-only acceptance gaps remain open.

## Verified result

- Local deshpanel_work_20260907 on port 5433 contains 72 public tables: the reference's 57 plus 15 new tables. Prisma migrate deploy applied all nine pending SQL files; migrate status exited 0 with no pending migrations in the explicit 36-file bundle. No seed, client generation or application entry point ran.
- The work database has 36 completed migration records and no unfinished/rolled-back records. All 56 original data tables retain their counts (625,774 data rows); the reference's 27 migration records remain unchanged. The nine extra records belong only to clone migration history.
- Three canonical partial unique indexes were restored on the clone only, after zero duplicate-group preflights. All three are unique/valid and every work-database index is valid. Snapshot guards remain absent, preserving the supplied backup state.
- Two constraints deliberately remain NOT VALID as written in the new migration source: customers_store_credit_nonnegative_check and bein_spend_exactly_one_owner_check. They enforce new writes; this preparation did not promote them to full historical validation.
- SQL files and schema in the repository were not edited; the bundle is byte-equivalent and omits only the documented empty directory. Original dumps and reference snapshot are preserved. Remaining D space was approximately 10 GB; work database size was approximately 2.99 GB.
- Local evidence: D:/CodexPostgreSQL/work-preparation.json, work-verification.json, migrate-deploy.stdout.log and migrate-status.stdout.log. Passwords remain encrypted outside Git and were passed only through process memory.
- Q01 amendment consistency: 31 FR IDs covered; 58 unique task IDs; T001/T002 alone checked; requirement/safety checklists 16/16 and 24/24. Scope review found no new application-contract or dependency change. The optional Git commit hooks were not executed under the existing preservation boundary.
- Limits: full schema-drift analysis, full Q04/Q09, locale parity, application tests/builds/startup, production deployment and financial/provider behavior remain unverified. The three missing historical guards demonstrate that a complete migration history alone does not establish schema parity. Plan a forward repair for deployment rather than changing past migration records.
