import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOperationSpendAwardSnapshot } from '../../shared/points/operation-spend-award-snapshot'

type SnapshotInput = Parameters<typeof buildOperationSpendAwardSnapshot>[0]

function makeAgentSnapshotInput(): SnapshotInput {
    return {
        policyVersion: 'operation-spend-v1',
        completionSource: 'WORKER_CONFIRM_PURCHASE',
        operation: {
            id: 'operation-1',
            status: 'COMPLETED',
            type: 'RENEW',
            amountUsd: 1000,
            completedAt: new Date('2026-08-06T10:00:00.000Z'),
            user: {
                id: 'user-1',
                role: 'USER',
                isActive: true,
                deletedAt: null,
            },
        },
        ownership: {
            kind: 'AGENT',
            ownerUserId: 'agent-1',
            managerOwnership: null,
            agentAssignment: {
                id: 'assignment-1',
                isActive: true,
                agent: {
                    id: 'agent-1',
                    role: 'AGENT',
                    isActive: true,
                    deletedAt: null,
                },
            },
            legacyCreator: null,
        },
        settings: {
            pointsEnabled: true,
            pointsStartAt: new Date('2026-08-01T00:00:00.000Z'),
            managerOwnedUserPointsEnabled: false,
        },
        resolvedRecipients: [
            {
                ownerUserId: 'user-1',
                ownerRole: 'USER',
                ownerKind: 'USER',
                rateBucket: 'USER_GLOBAL',
                rateSource: 'DEFAULT',
                ruleId: 'rule-user-default',
                ratePerThousand: 4,
            },
            {
                ownerUserId: 'agent-1',
                ownerRole: 'AGENT',
                ownerKind: 'AGENT',
                rateBucket: 'AGENT_OVERRIDE',
                rateSource: 'OWNER_OVERRIDE',
                ruleId: 'rule-agent-override',
                ratePerThousand: 2,
            },
        ],
    }
}

test('completed agent-owned operation produces a complete serializable captured snapshot', () => {
    const snapshot = buildOperationSpendAwardSnapshot(makeAgentSnapshotInput())

    assert.deepEqual(snapshot, {
        operationId: 'operation-1',
        policyVersion: 'operation-spend-v1',
        completionSource: 'WORKER_CONFIRM_PURCHASE',
        completedAtSnapshot: '2026-08-06T10:00:00.000Z',
        operationTypeSnapshot: 'RENEW',
        amountUsdSnapshot: 1000,
        operationUserIdSnapshot: 'user-1',
        ownershipKindSnapshot: 'AGENT',
        ownershipOwnerIdSnapshot: 'agent-1',
        pointsEnabledSnapshot: true,
        pointsStartAtSnapshot: '2026-08-01T00:00:00.000Z',
        managerOwnedUserPointsEnabledSnapshot: false,
        ownershipEvidenceSnapshot: {
            operationUser: {
                id: 'user-1',
                role: 'USER',
                isActive: true,
                deletedAt: null,
            },
            managerOwnership: null,
            agentAssignment: {
                id: 'assignment-1',
                isActive: true,
                agent: {
                    id: 'agent-1',
                    role: 'AGENT',
                    isActive: true,
                    deletedAt: null,
                },
            },
            legacyCreator: null,
        },
        recipientsSnapshot: [
            {
                ownerUserId: 'agent-1',
                ownerRole: 'AGENT',
                ownerKind: 'AGENT',
                rateBucket: 'AGENT_OVERRIDE',
                rateSource: 'OWNER_OVERRIDE',
                ruleId: 'rule-agent-override',
                ratePerThousand: 2,
                points: 2,
                zeroReason: null,
            },
            {
                ownerUserId: 'user-1',
                ownerRole: 'USER',
                ownerKind: 'USER',
                rateBucket: 'USER_GLOBAL',
                rateSource: 'DEFAULT',
                ruleId: 'rule-user-default',
                ratePerThousand: 4,
                points: 4,
                zeroReason: null,
            },
        ],
        status: 'CAPTURED',
        reasonCode: null,
    })

    assert.doesNotThrow(() => JSON.stringify(snapshot))
})

test('mixed zero and positive rates preserve the zero recipient without skipping the run', () => {
    const input = makeAgentSnapshotInput()
    input.resolvedRecipients[1].ratePerThousand = 0

    const snapshot = buildOperationSpendAwardSnapshot(input)

    assert.equal(snapshot.status, 'CAPTURED')
    assert.equal(snapshot.reasonCode, null)
    assert.deepEqual(snapshot.recipientsSnapshot.map((recipient) => ({
        ownerUserId: recipient.ownerUserId,
        points: recipient.points,
        zeroReason: recipient.zeroReason,
    })), [
        { ownerUserId: 'agent-1', points: 0, zeroReason: 'ZERO_RATE' },
        { ownerUserId: 'user-1', points: 4, zeroReason: null },
    ])
})

test('all-zero rates produce a durable skipped decision with zero evidence', () => {
    const input = makeAgentSnapshotInput()
    for (const recipient of input.resolvedRecipients) recipient.ratePerThousand = 0

    const snapshot = buildOperationSpendAwardSnapshot(input)

    assert.equal(snapshot.status, 'SKIPPED')
    assert.match(snapshot.reasonCode ?? '', /ZERO|POSITIVE_RECIPIENT/)
    assert.deepEqual(snapshot.recipientsSnapshot.map((recipient) => ({
        ownerUserId: recipient.ownerUserId,
        points: recipient.points,
        zeroReason: recipient.zeroReason,
    })), [
        { ownerUserId: 'agent-1', points: 0, zeroReason: 'ZERO_RATE' },
        { ownerUserId: 'user-1', points: 0, zeroReason: 'ZERO_RATE' },
    ])
})

test('completion-level skip reasons never retain positive recipient awards', () => {
    const disabledInput = makeAgentSnapshotInput()
    disabledInput.settings.pointsEnabled = false
    const disabled = buildOperationSpendAwardSnapshot(disabledInput)

    assert.equal(disabled.status, 'SKIPPED')
    assert.equal(disabled.reasonCode, 'POINTS_DISABLED')
    assert.deepEqual(disabled.recipientsSnapshot, [])

    const preStartInput = makeAgentSnapshotInput()
    preStartInput.settings.pointsStartAt = new Date('2026-08-07T00:00:00.000Z')
    const preStart = buildOperationSpendAwardSnapshot(preStartInput)

    assert.equal(preStart.status, 'SKIPPED')
    assert.equal(preStart.reasonCode, 'BEFORE_POINTS_START')
    assert.deepEqual(preStart.recipientsSnapshot, [])
})

test('snapshot ownership evidence allowlists safe fields and drops credentials', () => {
    const input = makeAgentSnapshotInput() as SnapshotInput & {
        operation: SnapshotInput['operation'] & { user: Record<string, unknown> }
        ownership: SnapshotInput['ownership'] & {
            agentAssignment: NonNullable<SnapshotInput['ownership']['agentAssignment']> & {
                agent: Record<string, unknown>
            }
        }
    }
    Object.assign(input.operation.user, {
        passwordHash: 'unsafe-password-hash',
        cookies: 'unsafe-cookie',
        storageState: 'unsafe-storage-state',
    })
    Object.assign(input.ownership.agentAssignment.agent, {
        password: 'unsafe-password',
        totpSecret: 'unsafe-totp',
        telegramToken: 'unsafe-telegram-token',
        providerToken: 'unsafe-provider-token',
        viewState: 'unsafe-view-state',
    })

    const snapshot = buildOperationSpendAwardSnapshot(input)
    const serialized = JSON.stringify(snapshot)

    assert.deepEqual(snapshot.ownershipEvidenceSnapshot, {
        operationUser: {
            id: 'user-1',
            role: 'USER',
            isActive: true,
            deletedAt: null,
        },
        managerOwnership: null,
        agentAssignment: {
            id: 'assignment-1',
            isActive: true,
            agent: {
                id: 'agent-1',
                role: 'AGENT',
                isActive: true,
                deletedAt: null,
            },
        },
        legacyCreator: null,
    })
    for (const forbidden of [
        'unsafe-password-hash',
        'unsafe-cookie',
        'unsafe-storage-state',
        'unsafe-password',
        'unsafe-totp',
        'unsafe-telegram-token',
        'unsafe-provider-token',
        'unsafe-view-state',
    ]) {
        assert.equal(serialized.includes(forbidden), false)
    }
})

test('snapshot retains completion-time owner and rates after source evidence changes', () => {
    const input = makeAgentSnapshotInput()
    const snapshot = buildOperationSpendAwardSnapshot(input)

    input.ownership.ownerUserId = 'agent-2'
    if (input.ownership.agentAssignment) {
        input.ownership.agentAssignment.agent.id = 'agent-2'
    }
    input.resolvedRecipients[1].ownerUserId = 'agent-2'
    input.resolvedRecipients[1].ratePerThousand = 99

    assert.equal(snapshot.ownershipOwnerIdSnapshot, 'agent-1')
    assert.deepEqual(snapshot.recipientsSnapshot.map((recipient) => ({
        ownerUserId: recipient.ownerUserId,
        ratePerThousand: recipient.ratePerThousand,
        points: recipient.points,
    })), [
        { ownerUserId: 'agent-1', ratePerThousand: 2, points: 2 },
        { ownerUserId: 'user-1', ratePerThousand: 4, points: 4 },
    ])
})

test('equivalent completion evidence serializes deterministically regardless of recipient query order', () => {
    const firstInput = makeAgentSnapshotInput()
    const secondInput = makeAgentSnapshotInput()
    secondInput.resolvedRecipients.reverse()

    const first = buildOperationSpendAwardSnapshot(firstInput)
    const second = buildOperationSpendAwardSnapshot(secondInput)

    assert.deepEqual(second, first)
    assert.equal(JSON.stringify(second), JSON.stringify(first))
})
