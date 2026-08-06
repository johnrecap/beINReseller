import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(process.cwd())

function read(relativePath: string): string {
    return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

test('web and Worker Prisma schemas expose the additive operation-spend award run model', () => {
    const webSchema = read('prisma/schema.prisma')
    const workerSchema = read('worker/prisma/schema.prisma')

    assert.equal(workerSchema, webSchema)
    assert.match(webSchema, /enum OperationSpendAwardRunStatus\s*\{[\s\S]*CAPTURED[\s\S]*AWARDED[\s\S]*SKIPPED[\s\S]*LEGACY_REVIEW_REQUIRED[\s\S]*\}/)
    assert.match(webSchema, /model OperationSpendAwardRun\s*\{/)
    assert.match(webSchema, /operationId\s+String\s+@unique/)
    assert.match(webSchema, /recipientsSnapshot\s+Json\?/)
    assert.match(webSchema, /@@index\(\[status, capturedAt\]\)/)
    assert.match(webSchema, /finalizationAttemptCount\s+Int\s+@default\(0\)/)
    assert.match(webSchema, /lastFinalizationAttemptAt\s+DateTime\?/)
    assert.match(webSchema, /nextFinalizationAttemptAt\s+DateTime\?/)
    assert.match(webSchema, /lastFinalizationErrorCode\s+String\?/)
    assert.match(webSchema, /@@index\(\[status, nextFinalizationAttemptAt, capturedAt\], map: "op_spend_award_retry_due_idx"\)/)
    assert.match(webSchema, /operationSpendSnapshotCutoverAt\s+DateTime\?/)
    assert.match(webSchema, /operationSpendAwardRunId\s+String\?/)
    assert.match(webSchema, /@@unique\(\[operationSpendAwardRunId, ownerUserId\]\)/)
    assert.match(webSchema, /onDelete: Restrict/)
})

test('migration is additive and makes Source Group nullable without rewriting historical values', () => {
    const sourceGroupMigration = read(
        'prisma/migrations/20260806120000_make_agent_assignment_source_group_optional/migration.sql'
    )
    const awardRunMigration = read(
        'prisma/migrations/20260806123000_operation_spend_award_runs/migration.sql'
    )

    assert.match(sourceGroupMigration, /ALTER COLUMN "source_group" DROP NOT NULL/)
    assert.doesNotMatch(sourceGroupMigration, /UPDATE\s+"agent_assignments"/i)

    assert.match(awardRunMigration, /CREATE TABLE "operation_spend_award_runs"/)
    assert.match(awardRunMigration, /ON DELETE RESTRICT/)
    assert.match(awardRunMigration, /operation_spend_snapshot_cutover_at/)
    assert.match(awardRunMigration, /finalization_attempt_count/)
    assert.match(awardRunMigration, /next_finalization_attempt_at/)
    assert.match(awardRunMigration, /last_finalization_error_code/)
    assert.doesNotMatch(awardRunMigration, /INSERT INTO "operation_spend_award_runs"/i)
})
