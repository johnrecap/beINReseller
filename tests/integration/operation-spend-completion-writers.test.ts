import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())

function source(path: string) {
    return readFileSync(resolve(root, path), 'utf8')
}

function asyncFunctionSource(contents: string, functionName: string) {
    const start = contents.indexOf(`async function ${functionName}(`)
    assert.notEqual(start, -1, `${functionName} must exist`)
    const end = contents.indexOf('\nasync function ', start + 1)
    assert.notEqual(end, -1, `${functionName} must have a following function boundary`)
    return contents.slice(start, end)
}

test('every known Worker completion source captures an immutable award run', () => {
    const worker = source('worker/src/http-queue-processor.ts')
    const requiredSources = [
        'WORKER_CONTRACT_VERIFICATION',
        'WORKER_RENEWAL',
        'WORKER_LIVE_REVIEW',
        'WORKER_SIGNAL_REFRESH',
        'WORKER_SIGNAL_CHECK',
        'WORKER_NO_INSTALLMENT',
        'WORKER_INSTALLMENT',
    ]

    for (const completionSource of requiredSources) {
        assert.match(worker, new RegExp(`['"]${completionSource}['"]`), completionSource)
    }
    assert.match(worker, /SIGNAL_CHECK[\s\S]{0,4000}completedAt:/)
    assert.equal(
        (worker.match(/captureOperationSpendAwardRunInTransaction/g) || []).length >= 8,
        true,
    )
})

test('signal activation preserves the signal-check completion snapshot', () => {
    const worker = source('worker/src/http-queue-processor.ts')
    const activationRoute = source('src/app/api/operations/signal-activate/route.ts')
    const signalActivation = asyncFunctionSource(worker, 'handleSignalActivateHttp')
    const completionUpdateStart = signalActivation.indexOf('const signalActivateCompleted =')
    const completionUpdateEnd = signalActivation.indexOf(
        'if (signalActivateCompleted.count === 0)',
        completionUpdateStart,
    )
    assert.notEqual(completionUpdateStart, -1)
    assert.notEqual(completionUpdateEnd, -1)
    const completionUpdate = signalActivation.slice(completionUpdateStart, completionUpdateEnd)

    assert.match(activationRoute, /data:\s*{\s*status:\s*'PENDING'\s*}/)
    assert.doesNotMatch(signalActivation, /WORKER_SIGNAL_ACTIVATE/)
    assert.doesNotMatch(signalActivation, /captureOperationSpendAwardRunInTransaction/)
    assert.doesNotMatch(completionUpdate, /completedAt\s*:/)
    assert.match(signalActivation, /awardCompletedOperationPointsSafely\(operationId\)/)
})

test('web recovery and financial review capture inside their completion transactions', () => {
    const recovery = source('src/lib/operations/recovery.ts')
    const financialReview = source('src/app/api/admin/financial-review/[operationId]/decision/route.ts')

    assert.match(recovery, /captureOperationSpendAwardRunInTransaction/)
    assert.match(recovery, /WEB_RECOVERY/)
    assert.match(financialReview, /captureOperationSpendAwardRunInTransaction/)
    assert.match(financialReview, /ADMIN_FINANCIAL_REVIEW/)
})

test('financial review claims REVIEW_REQUIRED before refund or completion effects', () => {
    const financialReview = source('src/app/api/admin/financial-review/[operationId]/decision/route.ts')
    const transactionStart = financialReview.indexOf('prisma.$transaction')
    const lock = financialReview.indexOf('lockOperationRow(tx, operationId)', transactionStart)
    const reread = financialReview.indexOf('tx.operation.findUnique', lock)
    const guardedTransition = financialReview.indexOf('tx.operation.updateMany', reread)
    const refund = financialReview.indexOf('await applyAdminRefund', guardedTransition)
    const capture = financialReview.indexOf('captureOperationSpendAwardRunInTransaction', guardedTransition)

    assert.ok(transactionStart < lock)
    assert.ok(lock < reread)
    assert.ok(reread < guardedTransition)
    assert.ok(guardedTransition < refund)
    assert.ok(guardedTransition < capture)
    assert.match(financialReview, /where:\s*\{\s*id:\s*operationId,\s*status:\s*OperationStatus\.REVIEW_REQUIRED\s*\}/)
    assert.match(financialReview, /guardedTransition\.count !== 1/)
})

test('confirmation routes finalize captured runs and never reconstruct ownership awards', () => {
    for (const path of [
        'src/app/api/operations/[id]/confirm-purchase/route.ts',
        'src/app/api/operations/[id]/confirm-installment/route.ts',
    ]) {
        const route = source(path)
        assert.match(route, /finalizeOperationSpendAwardRun/)
        assert.doesNotMatch(route, /processCompletedOperationPoints/)
    }
})
