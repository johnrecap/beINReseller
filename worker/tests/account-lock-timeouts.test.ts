import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAccountLockOwnerValue,
    canAcquireAccountLock,
    canReleaseAccountLock,
    getAccountLockStatusFromOwner,
    parseAccountLockOwner,
} from '../src/pool/account-locking'
import { LOCK_NOW, lockOwner, staleLockOwner } from './helpers/account-lock-fixtures'

test('T007 parses legacy and operation-aware account lock owners', () => {
    const legacy = parseAccountLockOwner('worker-legacy')
    assert.equal(legacy.workerId, 'worker-legacy')
    assert.equal(legacy.operationId, null)
    assert.equal(legacy.legacy, true)

    const parsed = parseAccountLockOwner(lockOwner({ workerId: 'worker-a', operationId: 'operation-1' }))
    assert.equal(parsed.workerId, 'worker-a')
    assert.equal(parsed.operationId, 'operation-1')
    assert.equal(parsed.legacy, false)
})

test('T007 allows the same operation to continue a lock and blocks a different operation', () => {
    const currentOwner = lockOwner({ workerId: 'worker-a', operationId: 'operation-1' })

    assert.equal(canAcquireAccountLock(currentOwner, 'worker-b', 'operation-1').allowed, true)
    assert.equal(canAcquireAccountLock(currentOwner, 'worker-a', 'operation-2').allowed, false)
})

test('T007 release checks accept same operation ownership and reject unrelated operations', () => {
    const currentOwner = lockOwner({ workerId: 'worker-a', operationId: 'operation-1' })

    assert.equal(canReleaseAccountLock(currentOwner, 'worker-b', 'operation-1').allowed, true)
    assert.equal(canReleaseAccountLock(currentOwner, 'worker-b', 'operation-2').allowed, false)
})

test('T009 owner value contains worker id, operation id, and acquisition time only', () => {
    const value = buildAccountLockOwnerValue({
        workerId: 'worker-a',
        operationId: 'operation-1',
        acquiredAt: LOCK_NOW,
    })
    const parsed = JSON.parse(value) as Record<string, unknown>

    assert.deepEqual(Object.keys(parsed).sort(), ['acquiredAt', 'operationId', 'workerId'])
    assert.equal(parsed.workerId, 'worker-a')
    assert.equal(parsed.operationId, 'operation-1')
})

test('T023 lock status marks old locks as stale without exposing secrets', () => {
    const status = getAccountLockStatusFromOwner(staleLockOwner, {
        now: LOCK_NOW,
        staleAfterSeconds: 300,
    })

    assert.equal(status.locked, true)
    assert.equal(status.stale, true)
    assert.equal(status.ownerOperationId, 'operation-stale')
    assert.equal(status.ownerWorkerId, 'worker-a')
    assert.equal(status.ageSeconds, 600)
})
