import test from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_EID_AUDIENCE_ROLES,
    evaluateEidRewardAudience,
} from '@/lib/eid-rewards/audience'

const activeUser = {
    id: 'user-1',
    role: 'USER',
    isActive: true,
    deletedAt: null,
}

test('default Eid audience keeps all current roles allowed', () => {
    assert.deepEqual(DEFAULT_EID_AUDIENCE_ROLES, ['ADMIN', 'MANAGER', 'AGENT', 'USER'])
})

test('allows an active user when their role is in the audience list', () => {
    const result = evaluateEidRewardAudience({
        user: activeUser,
        audienceRoles: ['USER'],
        override: null,
    })

    assert.equal(result.allowed, true)
    assert.equal(result.reason, 'ROLE_ALLOWED')
})

test('denies an active user when their role is not in the audience list', () => {
    const result = evaluateEidRewardAudience({
        user: activeUser,
        audienceRoles: ['AGENT'],
        override: null,
    })

    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'ROLE_DENIED')
})

test('allow override permits a user whose role is not selected', () => {
    const result = evaluateEidRewardAudience({
        user: activeUser,
        audienceRoles: ['AGENT'],
        override: { effect: 'ALLOW' },
        hasAllowOverrides: true,
    })

    assert.equal(result.allowed, true)
    assert.equal(result.reason, 'USER_ALLOWED')
})

test('manual allow list is exclusive when any allow override exists', () => {
    const result = evaluateEidRewardAudience({
        user: activeUser,
        audienceRoles: ['USER'],
        override: null,
        hasAllowOverrides: true,
    })

    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'USER_NOT_ALLOWED')
})

test('deny override wins even when the user role is selected', () => {
    const result = evaluateEidRewardAudience({
        user: activeUser,
        audienceRoles: ['USER'],
        override: { effect: 'DENY' },
    })

    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'USER_DENIED')
})

test('inactive users are denied even with an allow override', () => {
    const result = evaluateEidRewardAudience({
        user: { ...activeUser, isActive: false },
        audienceRoles: ['USER'],
        override: { effect: 'ALLOW' },
    })

    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'INACTIVE_USER')
})

test('deleted users are denied even with an allow override', () => {
    const result = evaluateEidRewardAudience({
        user: { ...activeUser, deletedAt: new Date('2026-06-04T00:00:00.000Z') },
        audienceRoles: ['USER'],
        override: { effect: 'ALLOW' },
    })

    assert.equal(result.allowed, false)
    assert.equal(result.reason, 'DELETED_USER')
})
