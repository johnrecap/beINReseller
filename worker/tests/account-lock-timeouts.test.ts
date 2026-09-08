import test from 'node:test'
import assert from 'node:assert/strict'
import {
    ACCOUNT_EXECUTION_LEASE_HEARTBEAT_SECONDS,
    ACCOUNT_EXECUTION_LEASE_TTL_SECONDS,
    buildAccountExecutionLeaseOwnerValue,
    executionLeaseOwnerMatches,
    getAccountLockStatusFromOwner,
    parseAccountExecutionLeaseOwner,
    type AccountExecutionLeaseHandle,
} from '../src/pool/account-locking'

const LOCK_NOW = new Date('2026-08-24T18:40:00.000Z')

function leaseHandle(
    overrides: Partial<AccountExecutionLeaseHandle> = {}
): AccountExecutionLeaseHandle {
    return {
        accountId: 'account-1',
        operationId: 'operation-1',
        reservationGeneration: 4,
        leaseId: 'invocation-1',
        fencingToken: 12,
        workerId: 'worker-a',
        acquiredAt: LOCK_NOW.toISOString(),
        ...overrides,
    }
}

test('T028 execution lease owner contains every causal ownership field', () => {
    const value = buildAccountExecutionLeaseOwnerValue(leaseHandle())
    const parsed = JSON.parse(value) as Record<string, unknown>

    assert.deepEqual(Object.keys(parsed).sort(), [
        'acquiredAt',
        'fencingToken',
        'leaseId',
        'operationId',
        'reservationGeneration',
        'workerId',
    ])
    assert.equal(parsed.operationId, 'operation-1')
    assert.equal(parsed.reservationGeneration, 4)
    assert.equal(parsed.leaseId, 'invocation-1')
    assert.equal(parsed.fencingToken, 12)
    assert.equal(parsed.workerId, 'worker-a')
})

test('T028 parser rejects legacy, incomplete, and malformed lock owners', () => {
    assert.equal(parseAccountExecutionLeaseOwner('worker-legacy'), null)
    assert.equal(parseAccountExecutionLeaseOwner('{bad-json'), null)
    assert.equal(parseAccountExecutionLeaseOwner(JSON.stringify({
        operationId: 'operation-1',
        workerId: 'worker-a',
    })), null)
})

test('T028 only the exact lease invocation and fencing token owns execution', () => {
    const current = leaseHandle()
    const ownerValue = buildAccountExecutionLeaseOwnerValue(current)
    assert.equal(executionLeaseOwnerMatches(ownerValue, current), true)

    const nonOwners: Array<[string, AccountExecutionLeaseHandle]> = [
        ['same operation and worker without the current invocation', leaseHandle({ leaseId: 'invocation-2' })],
        ['same operation and invocation with stale fencing token', leaseHandle({ fencingToken: 11 })],
        ['same operation and token from another reservation generation', leaseHandle({ reservationGeneration: 3 })],
        ['same operation and token from another worker', leaseHandle({ workerId: 'worker-b' })],
        ['different operation with copied token', leaseHandle({ operationId: 'operation-2' })],
    ]

    for (const [scenario, candidate] of nonOwners) {
        assert.equal(executionLeaseOwnerMatches(ownerValue, candidate), false, scenario)
    }
    assert.equal(executionLeaseOwnerMatches(null, current), false)
    assert.equal(executionLeaseOwnerMatches('worker-a', current), false)
})

test('T028 lease timing leaves multiple heartbeat opportunities before expiry', () => {
    assert.equal(ACCOUNT_EXECUTION_LEASE_TTL_SECONDS, 120)
    assert.equal(ACCOUNT_EXECUTION_LEASE_HEARTBEAT_SECONDS, 30)
    assert.ok(ACCOUNT_EXECUTION_LEASE_HEARTBEAT_SECONDS * 3 < ACCOUNT_EXECUTION_LEASE_TTL_SECONDS)
})

test('T028 lock status marks an expired exact lease stale without weakening ownership', () => {
    const owner = buildAccountExecutionLeaseOwnerValue(leaseHandle({
        operationId: 'operation-stale',
        acquiredAt: '2026-08-24T18:30:00.000Z',
    }))
    const status = getAccountLockStatusFromOwner(owner, {
        now: LOCK_NOW,
        staleAfterSeconds: 300,
    })

    assert.equal(status.locked, true)
    assert.equal(status.stale, true)
    assert.equal(status.ownerOperationId, 'operation-stale')
    assert.equal(status.ownerWorkerId, 'worker-a')
    assert.equal(status.ageSeconds, 600)
})
