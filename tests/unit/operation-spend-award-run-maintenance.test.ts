import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    resolveOperationSpendAwardRunMaintenanceBounds,
} from '@/lib/maintenance/operation-spend-award-run-maintenance'

const repositoryRoot = resolve(process.cwd())

test('maintenance award-run bounds reject fresh runs and cap each retry batch', () => {
    const now = new Date('2026-08-06T12:00:00.000Z')

    assert.deepEqual(
        resolveOperationSpendAwardRunMaintenanceBounds({ now }),
        {
            limit: 25,
            staleBefore: new Date('2026-08-06T11:55:00.000Z'),
        }
    )
    assert.deepEqual(
        resolveOperationSpendAwardRunMaintenanceBounds({
            now,
            limit: 10_000,
            staleMs: 1,
        }),
        {
            limit: 100,
            staleBefore: new Date('2026-08-06T11:59:00.000Z'),
        }
    )
})

test('maintenance retries only stale captured runs whose persisted backoff elapsed', () => {
    const source = readFileSync(
        resolve(repositoryRoot, 'src/lib/maintenance/operation-spend-award-run-maintenance.ts'),
        'utf8'
    )

    assert.match(source, /operationSpendAwardRun\.findMany\(\{[\s\S]*status:\s*'CAPTURED'/)
    assert.match(source, /capturedAt:\s*\{\s*lte:\s*staleBefore\s*\}/)
    assert.match(source, /nextFinalizationAttemptAt:\s*\{\s*lte:\s*now\s*\}/)
    assert.match(source, /select:\s*\{\s*id:\s*true,\s*operationId:\s*true,\s*finalizationAttemptCount:\s*true\s*\}/)
    assert.match(source, /nextFinalizationAttemptAt:\s*'asc'/)
    assert.match(source, /take:\s*limit/)
    assert.match(source, /finalizeOperationSpendAwardRun\(run\.operationId\)/)
    assert.match(source, /status:\s*'LEGACY_REVIEW_REQUIRED'/)
    assert.match(source, /OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON/)
    assert.doesNotMatch(source, /captureOperationSpendAwardRun|buildOperationSpendAwardSnapshot/)
    assert.doesNotMatch(source, /agentAssignment|managerUser|pointRule|pointProgramSettings/)
})

test('the operation maintenance cycle includes the bounded award-run retry', () => {
    const source = readFileSync(
        resolve(repositoryRoot, 'src/lib/maintenance/operation-maintenance-runner.ts'),
        'utf8'
    )

    assert.match(source, /retryStaleCapturedOperationSpendAwardRuns\(\{/)
    assert.match(source, /awardRunLimit/)
    assert.match(source, /awardRunStaleMs/)
})
