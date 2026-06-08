import test from 'node:test'
import assert from 'node:assert/strict'
import {
    canRequestCreditForOwner,
    getEligibilityReasonForOwner,
} from '@/lib/credit-requests/permissions'
import type { CurrentOwnerClassification } from '@/lib/users/ownership'

const activeUser = {
    id: 'user-1',
    role: 'USER',
    isActive: true,
    deletedAt: null,
}

function owner(ownerType: CurrentOwnerClassification['ownerType']): CurrentOwnerClassification {
    return {
        userId: 'user-1',
        ownerType,
        ownerId: ownerType === 'UNOWNED' ? null : `${ownerType.toLowerCase()}-1`,
        ownerLabel: ownerType === 'UNOWNED' ? null : ownerType,
        agentAssignmentId: ownerType === 'AGENT' ? 'assignment-1' : null,
        managerUserIds: ownerType === 'ADMIN' || ownerType === 'MANAGER' ? ['link-1'] : [],
        activeAgentAssignmentIds: ownerType === 'AGENT' ? ['assignment-1'] : [],
        isLegacyFallback: ownerType === 'LEGACY_ADMIN',
        conflicts: {
            managerUserIds: [],
            agentAssignmentIds: [],
            hasMixedCurrentOwners: false,
        },
    }
}

test('allows admin-owned and agent-owned users to request credit', () => {
    assert.equal(canRequestCreditForOwner({ user: activeUser, owner: owner('ADMIN') }), true)
    assert.equal(canRequestCreditForOwner({ user: activeUser, owner: owner('LEGACY_ADMIN') }), true)
    assert.equal(canRequestCreditForOwner({ user: activeUser, owner: owner('AGENT') }), true)
})

test('blocks manager-owned and unowned users from requesting credit', () => {
    assert.equal(canRequestCreditForOwner({ user: activeUser, owner: owner('MANAGER') }), false)
    assert.equal(canRequestCreditForOwner({ user: activeUser, owner: owner('UNOWNED') }), false)
})

test('returns clear eligibility reasons from owner classification', () => {
    assert.equal(getEligibilityReasonForOwner({ user: activeUser, owner: owner('ADMIN') }), 'ELIGIBLE')
    assert.equal(getEligibilityReasonForOwner({ user: activeUser, owner: owner('LEGACY_ADMIN') }), 'ELIGIBLE')
    assert.equal(getEligibilityReasonForOwner({ user: activeUser, owner: owner('AGENT') }), 'ELIGIBLE')
    assert.equal(getEligibilityReasonForOwner({ user: activeUser, owner: owner('MANAGER') }), 'MANAGER_OWNED')
    assert.equal(getEligibilityReasonForOwner({ user: activeUser, owner: owner('UNOWNED') }), 'UNOWNED')
})

test('blocks inactive, deleted, and non-user accounts regardless of owner', () => {
    assert.equal(getEligibilityReasonForOwner({
        user: { ...activeUser, role: 'AGENT' },
        owner: owner('ADMIN'),
    }), 'NOT_USER')
    assert.equal(getEligibilityReasonForOwner({
        user: { ...activeUser, isActive: false },
        owner: owner('ADMIN'),
    }), 'INACTIVE_USER')
    assert.equal(getEligibilityReasonForOwner({
        user: { ...activeUser, deletedAt: new Date() },
        owner: owner('ADMIN'),
    }), 'INACTIVE_USER')
})
