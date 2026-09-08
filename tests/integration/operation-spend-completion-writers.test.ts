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
    const renewalFinalizer = source('worker/src/lib/fulfillment-finalization.ts')
    const signalCheck = asyncFunctionSource(worker, 'handleSignalCheckHttp')
    const requiredSources = [
        'WORKER_SIGNAL_REFRESH',
        'WORKER_SIGNAL_CHECK',
        'WORKER_NO_INSTALLMENT',
        'WORKER_INSTALLMENT',
    ]

    for (const completionSource of requiredSources) {
        assert.match(worker, new RegExp(`['"]${completionSource}['"]`), completionSource)
    }
    assert.match(worker, /finalizeAutomatedRenewalFulfillment/)
    assert.match(renewalFinalizer, /captureAwardRun/)
    assert.match(renewalFinalizer, /['"]AUTOMATED_COMPOSITE_FULFILLMENT['"]/)
    assert.match(renewalFinalizer, /operationIntegrityIssue\.updateMany/)
    assert.match(renewalFinalizer, /status:\s*['"]RESOLVED['"]/)
    assert.match(signalCheck, /completedAt:/)
    assert.match(signalCheck, /['"]WORKER_SIGNAL_CHECK['"]/)
    assert.equal(
        (worker.match(/captureOperationSpendAwardRunInTransaction/g) || []).length >= 5,
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
    const manualFulfillment = source('src/lib/operations/manual-fulfillment-finalization.ts')

    assert.match(recovery, /captureOperationSpendAwardRunInTransaction/)
    assert.match(recovery, /WEB_RECOVERY/)
    assert.match(recovery, /operationIntegrityIssue\.updateMany/)
    assert.match(manualFulfillment, /prisma\.\$transaction/)
    assert.match(manualFulfillment, /captureOperationSpendAwardRunInTransaction/)
    assert.match(manualFulfillment, /ADMIN_MANUAL_FULFILLMENT/)
    assert.match(manualFulfillment, /operationIntegrityIssue\.updateMany/)
    assert.match(manualFulfillment, /status:\s*['"]RESOLVED['"]/)
})

test('financial review delegates refund and manual completion to atomic evidence finalizers', () => {
    const financialReview = source('src/app/api/admin/financial-review/[operationId]/decision/route.ts')
    const manualFulfillment = source('src/lib/operations/manual-fulfillment-finalization.ts')
    const strictRefund = source('src/lib/operations/financial-review-refund-finalization.ts')
    const recovery = source('src/lib/operations/recovery.ts')
    const refundLock = strictRefund.indexOf('FOR UPDATE')
    const noChargeEvidence = strictRefund.indexOf('const confirmedNoCharge', refundLock)
    const balanceUpdate = strictRefund.indexOf('tx.user.update', noChargeEvidence)
    const operationTransition = strictRefund.indexOf('tx.operation.updateMany', balanceUpdate)
    const manualClaim = manualFulfillment.indexOf('tx.providerInvoiceClaim.create')
    const manualTransition = manualFulfillment.indexOf('tx.operation.updateMany', manualClaim)
    const manualCapture = manualFulfillment.indexOf(
        'captureOperationSpendAwardRunInTransaction',
        manualTransition,
    )

    assert.match(financialReview, /finalizeStrictFinancialReviewRefund/)
    assert.doesNotMatch(financialReview, /applyAdminRefund/)
    assert.ok(refundLock >= 0)
    assert.ok(refundLock < noChargeEvidence)
    assert.ok(noChargeEvidence < balanceUpdate)
    assert.ok(balanceUpdate < operationTransition)
    assert.ok(manualClaim < manualTransition)
    assert.ok(manualTransition < manualCapture)
    assert.match(strictRefund, /createOperationPointReversalsInTransaction/)
    assert.match(strictRefund, /operationIntegrityIssue\.updateMany/)
    assert.match(recovery, /Atomic recovery refund/)
    assert.doesNotMatch(recovery, /await refundUser\(/)
    assert.match(manualFulfillment, /where:\s*\{\s*id:\s*operation\.id,\s*status:\s*['"]REVIEW_REQUIRED['"]\s*\}/)
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
