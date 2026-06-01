import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAccountLockStatus,
    buildForceUnlockAuditDetails,
    getAccountLockReleaseDecision,
    validateForceUnlockReason,
} from '@/lib/operations/account-lock-release'

const LOCKED_AT = '2026-06-01T09:50:00.000Z'
const NOW = new Date('2026-06-01T10:00:00.000Z')

function ownerValue() {
    return JSON.stringify({
        workerId: 'worker-a',
        operationId: 'operation-1',
        acquiredAt: LOCKED_AT,
    })
}

test('T008 admin unlock reason is required and normalized', () => {
    assert.equal(validateForceUnlockReason('  '), null)
    assert.equal(validateForceUnlockReason(' customer left before Pay '), 'customer left before Pay')
})

test('T008 admin lock status exposes owner metadata without account secrets', () => {
    const status = buildAccountLockStatus(ownerValue(), {
        now: NOW,
        ttlSeconds: 120,
        staleAfterSeconds: 300,
    })

    assert.equal(status.locked, true)
    assert.equal(status.stale, true)
    assert.equal(status.ownerWorkerId, 'worker-a')
    assert.equal(status.ownerOperationId, 'operation-1')
    assert.equal(status.ageSeconds, 600)
    assert.equal('password' in status, false)
    assert.equal('totpSecret' in status, false)
})

test('T008 force unlock audit details do not mutate or decide money state', () => {
    const status = buildAccountLockStatus(ownerValue(), { now: NOW })
    const details = buildForceUnlockAuditDetails({
        accountId: 'bein-1',
        accountLabel: 'Main',
        accountUsername: 'dealer-main',
        lockStatus: status,
        reason: 'stuck after browser close',
        unlockedAt: NOW,
    })

    assert.equal(details.accountId, 'bein-1')
    assert.equal(details.ownerOperationId, 'operation-1')
    assert.equal(details.reason, 'stuck after browser close')
    assert.equal(details.financialStatusChanged, false)
    assert.equal(details.operationStatusChanged, false)
    assert.equal('password' in details, false)
    assert.equal('totpSecret' in details, false)
})

test('T008 release decision can match operation-aware owners by operation id', () => {
    const result = getAccountLockReleaseDecision(ownerValue(), 'operation-1')

    assert.equal(result.released, true)
    assert.equal(result.reason, 'owner_matched')
})
