import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    decideProviderAccountConsumerAccess,
    isProviderAccountAutomationEligible,
} from '../src/lib/provider-account-reservation'

const processorSource = readFileSync(
    join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'),
    'utf8'
)
const poolSource = readFileSync(
    join(process.cwd(), 'worker', 'src', 'pool', 'account-pool-manager.ts'),
    'utf8'
)
const keepaliveSource = readFileSync(
    join(process.cwd(), 'worker', 'src', 'lib', 'session-keepalive.ts'),
    'utf8'
)
const baselineSource = readFileSync(
    join(process.cwd(), 'worker', 'src', 'lib', 'fulfillment-baseline.ts'),
    'utf8'
)

function functionSource(startMarker: string, endMarker: string): string {
    const start = processorSource.indexOf(startMarker)
    const end = processorSource.indexOf(endMarker, start + startMarker.length)
    assert.ok(start >= 0, `missing ${startMarker}`)
    assert.ok(end > start, `missing ${endMarker}`)
    return processorSource.slice(start, end)
}

test('T028 only explicitly automation-exclusive active accounts enter the correlation pool', () => {
    assert.equal(isProviderAccountAutomationEligible({
        isActive: true,
        automationExclusive: true,
    }), true)
    assert.equal(isProviderAccountAutomationEligible({
        isActive: true,
        automationExclusive: false,
    }), false)
    assert.equal(isProviderAccountAutomationEligible({
        isActive: false,
        automationExclusive: true,
    }), false)
})

test('T028 keepalive and unrelated consumers skip a causally reserved account', () => {
    const activeReservation = {
        operationId: 'operation-1',
        reservationGeneration: 3,
    }

    for (const consumer of ['KEEPALIVE', 'POOL_SELECTION', 'SIGNAL', 'BALANCE', 'REPORT'] as const) {
        assert.deepEqual(decideProviderAccountConsumerAccess({
            consumer,
            activeReservation,
            requester: null,
        }), {
            allowed: false,
            reason: 'ACCOUNT_CAUSALLY_RESERVED',
        }, consumer)
    }
})

test('T028 owning operation still needs matching generation and exact execution lease', () => {
    const activeReservation = {
        operationId: 'operation-1',
        reservationGeneration: 3,
    }

    assert.deepEqual(decideProviderAccountConsumerAccess({
        consumer: 'RENEWAL',
        activeReservation,
        requester: {
            operationId: 'operation-1',
            reservationGeneration: 3,
            exactExecutionLease: true,
        },
    }), {
        allowed: true,
        reason: 'EXACT_OWNER',
    })

    for (const requester of [
        null,
        { operationId: 'operation-1', reservationGeneration: 3, exactExecutionLease: false },
        { operationId: 'operation-1', reservationGeneration: 2, exactExecutionLease: true },
        { operationId: 'operation-2', reservationGeneration: 3, exactExecutionLease: true },
    ]) {
        assert.equal(decideProviderAccountConsumerAccess({
            consumer: 'RENEWAL',
            activeReservation,
            requester,
        }).allowed, false)
    }
})

test('T028 every assigned-account two-step consumer uses a causal reservation and fenced lease', () => {
    const promo = functionSource(
        'async function handleApplyPromoHttp',
        'async function handleCompletePurchaseHttp'
    )
    const signalCheck = functionSource(
        'async function handleSignalCheckHttp',
        'async function handleSignalActivateHttp'
    )
    const signalActivate = functionSource(
        'async function handleSignalActivateHttp',
        'async function waitForCaptchaSolution'
    )
    const installmentStart = functionSource(
        'async function handleStartInstallmentHttp',
        'async function handleConfirmInstallmentHttp'
    )
    const installmentConfirm = functionSource(
        'async function handleConfirmInstallmentHttp',
        'export function closeAllHttpClients'
    )

    for (const [name, source, consumer] of [
        ['promo', promo, 'RENEWAL'],
        ['signal-check', signalCheck, 'SIGNAL'],
        ['signal-activate', signalActivate, 'SIGNAL'],
        ['installment-start', installmentStart, 'INSTALLMENT'],
        ['installment-confirm', installmentConfirm, 'INSTALLMENT'],
    ] as const) {
        assert.match(source, /reserveProviderAccountForFulfillment\(/, name)
        assert.match(source, new RegExp(`consumer: '${consumer}'`), name)
        assert.match(source, /assertCurrent\(\)/, name)
        assert.match(source, /releaseExecutionLease\(/, name)
    }
})

test('T028 balance, pool selection, and keepalive recheck causal ownership around legacy guards', () => {
    const balance = functionSource(
        'async function handleCheckAccountBalance',
        '// MONTHLY INSTALLMENT HANDLERS'
    )

    // Regression: a long beIN balance request must not outlive or silently lose its causal guard.
    assert.match(balance, /consumer: 'BALANCE'/)
    assert.match(balance, /account\.automationExclusive/)
    assert.match(balance, /reservationBeforeGuard/)
    assert.match(balance, /reservationAfterGuard/)
    assert.match(balance, /lockAccount\(/)
    assert.match(balance, /extendLock\(/)
    assert.match(balance, /getAccountLockStatus\(/)
    assert.match(balance, /status\.ownerWorkerId !== workerId/)
    assert.match(balance, /status\.ownerOperationId !== guardOperationId/)
    assert.match(balance, /BALANCE_ACCOUNT_LOCK_HEARTBEAT_MS/)
    assert.match(processorSource, /const BALANCE_ACCOUNT_LOCK_HEARTBEAT_MS = 30_000;/)
    assert.match(
        balance,
        /await assertBalanceGuardOwnership\(\);\s*const loginResult = await client\.login\([\s\S]*?await assertBalanceGuardOwnership\(\);/
    )
    assert.match(
        balance,
        /await assertBalanceGuardOwnership\(\);\s*const balanceResult = await client\.fetchDealerBalance\(testCardNumber\);\s*await assertBalanceGuardOwnership\(\);/
    )
    assert.match(balance, /clearInterval\(guardHeartbeat\)/)
    assert.match(balance, /if \(guardHeartbeatInFlight\) await guardHeartbeatInFlight/)
    assert.match(balance, /unlockAccount\(/)
    assert.match(poolSource, /confirmUnreservedConsumerLock/)
    assert.match(poolSource, /consumer: 'POOL_SELECTION'/)
    assert.match(keepaliveSource, /accessBeforeGuard/)
    assert.match(keepaliveSource, /accessAfterGuard/)
    assert.match(keepaliveSource, /consumer: 'KEEPALIVE'/)
})

test('T028 final provider mutation atomically requires card, account, and baseline ownership', () => {
    assert.match(baselineSource, /JOIN "card_lifecycle_reservations"/)
    assert.match(baselineSource, /JOIN "provider_account_causal_reservations"/)
    assert.match(baselineSource, /JOIN "operation_fulfillment_baselines"/)
    assert.match(baselineSource, /baseline\."superseded_at" IS NULL/)
    assert.match(
        baselineSource,
        /FOR UPDATE OF operation_row, card_reservation, account_reservation, verification, baseline/
    )
    assert.match(baselineSource, /reservation_generation" = \$\{input\.reservationGeneration\}/)
    assert.match(baselineSource, /session_generation" = \$\{String\(input\.reservationGeneration\)\}/)
})

test('T028 legacy SIGNAL_REFRESH is fenced for the entire provider mutation handler', () => {
    const source = readFileSync(
        join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'),
        'utf8'
    )
    const start = source.indexOf('async function handleSignalRefreshHttp(')
    const end = source.indexOf('async function handleSignalCheckHttp(', start)
    assert.ok(start >= 0 && end > start)
    const handler = source.slice(start, end)

    assert.match(handler, /reserveProviderAccountForFulfillment\(\{[\s\S]*consumer: 'SIGNAL'/)
    assert.match(handler, /startExecutionLeaseHeartbeat/)
    assert.match(handler, /withSessionRetry\([\s\S]*reservedSignalRefreshExecution\.lease/)
    assert.match(handler, /saveSessionToCacheFenced/)
    assert.match(handler, /signalRefreshLeaseHeartbeat\.assertCurrent\(\)[\s\S]*activateSignal/)
    assert.match(handler, /releaseExecutionLease\(reservedSignalRefreshExecution\.lease\)/)
    assert.match(handler, /releaseSafeTerminalReservations\(operationId, 'SIGNAL_REFRESH_COMPLETED'\)/)
})

test('T028 cancellation never deletes a lock owned by a later consumer', () => {
    const source = readFileSync(
        join(process.cwd(), 'worker', 'src', 'http-queue-processor.ts'),
        'utf8'
    )
    const start = source.indexOf('async function handleCancelConfirmHttp(')
    const end = source.indexOf('async function handleSignalRefreshHttp(', start)
    assert.ok(start >= 0 && end > start)
    const handler = source.slice(start, end)

    assert.match(handler, /markAccountUsed\(operation\.beinAccountId, operationId\)/)
    assert.doesNotMatch(handler, /forceUnlockAccount/)
})
