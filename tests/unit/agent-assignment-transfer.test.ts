import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAgentTransferPlan,
    resolveAgentSourceGroup,
    validateAgentTransferTargets,
} from '@/lib/agents/assignment-transfer'

const activeUser = {
    id: 'user-1',
    role: 'USER',
    isActive: true,
    deletedAt: null,
}

const activeAgent = {
    id: 'agent-1',
    role: 'AGENT',
    isActive: true,
    deletedAt: null,
    agentProfile: {
        defaultSourceGroup: 'default-group',
        isActive: true,
    },
}

type SourceGroupResolution =
    | {
        ok: true
        sourceGroup: string | null
        resolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'AGENT_DEFAULT' | 'NONE'
    }
    | { ok: false; code: string; status: number }

const resolveSourceGroup = resolveAgentSourceGroup as unknown as (input: {
    requestedSourceGroup?: string | null
    currentSourceGroup?: string | null
    agentDefaultSourceGroup?: string | null
    isSameAgent?: boolean
}) => SourceGroupResolution

const buildNullableAgentTransferPlan = buildAgentTransferPlan as unknown as (input: {
    userId: string
    targetAgentId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    agentDefaultSourceGroup?: string | null
    managerOwnerIds: string[]
    activeAssignments: Array<{
        id: string
        agentId: string
        sourceGroup: string | null
        whatsappGroupUrl: string | null
    }>
    replaceExisting: boolean
}) => Record<string, unknown>

test('validates transfer target user and agent', () => {
    assert.deepEqual(validateAgentTransferTargets({
        user: activeUser,
        agent: activeAgent,
    }), { ok: true })

    assert.deepEqual(validateAgentTransferTargets({
        user: { ...activeUser, role: 'MANAGER' },
        agent: activeAgent,
    }), { ok: false, code: 'INVALID_TARGET_USER', status: 400 })

    assert.deepEqual(validateAgentTransferTargets({
        user: activeUser,
        agent: { ...activeAgent, isActive: false },
    }), { ok: false, code: 'INVALID_TARGET_AGENT', status: 400 })

    assert.deepEqual(validateAgentTransferTargets({
        user: activeUser,
        agent: { ...activeAgent, agentProfile: { defaultSourceGroup: 'default-group', isActive: false } },
    }), { ok: false, code: 'INVALID_TARGET_AGENT', status: 400 })
})

test('source group presence semantics resolve nullable values without fake fallbacks', async (t) => {
    const cases: Array<{
        name: string
        input: Parameters<typeof resolveSourceGroup>[0]
        expected: SourceGroupResolution
    }> = [
        {
            name: 'explicit text is trimmed and wins over current/default values',
            input: {
                requestedSourceGroup: ' requested ',
                currentSourceGroup: 'current',
                agentDefaultSourceGroup: 'default',
                isSameAgent: true,
            },
            expected: { ok: true, sourceGroup: 'requested', resolution: 'EXPLICIT' },
        },
        {
            name: 'explicit null clears instead of applying the agent default',
            input: {
                requestedSourceGroup: null,
                currentSourceGroup: 'current',
                agentDefaultSourceGroup: 'default',
                isSameAgent: true,
            },
            expected: { ok: true, sourceGroup: null, resolution: 'CLEARED' },
        },
        {
            name: 'explicit whitespace clears instead of applying the agent default',
            input: {
                requestedSourceGroup: '   ',
                currentSourceGroup: 'current',
                agentDefaultSourceGroup: 'default',
                isSameAgent: true,
            },
            expected: { ok: true, sourceGroup: null, resolution: 'CLEARED' },
        },
        {
            name: 'omission preserves the same-agent value',
            input: {
                currentSourceGroup: ' current ',
                agentDefaultSourceGroup: 'default',
                isSameAgent: true,
            },
            expected: { ok: true, sourceGroup: 'current', resolution: 'PRESERVED' },
        },
        {
            name: 'omission uses the new agent default',
            input: {
                currentSourceGroup: 'old-agent-group',
                agentDefaultSourceGroup: ' new-default ',
                isSameAgent: false,
            },
            expected: { ok: true, sourceGroup: 'new-default', resolution: 'AGENT_DEFAULT' },
        },
        {
            name: 'omission stores null when the new agent has no default',
            input: {
                currentSourceGroup: 'old-agent-group',
                agentDefaultSourceGroup: null,
                isSameAgent: false,
            },
            expected: { ok: true, sourceGroup: null, resolution: 'NONE' },
        },
    ]

    for (const scenario of cases) {
        await t.test(scenario.name, () => {
            assert.deepEqual(resolveSourceGroup(scenario.input), scenario.expected)
        })
    }
})

test('source group accepts 120 characters and rejects longer explicit values', () => {
    const atLimit = resolveSourceGroup({
        requestedSourceGroup: 'g'.repeat(120),
        agentDefaultSourceGroup: null,
        isSameAgent: false,
    })
    assert.deepEqual(atLimit, {
        ok: true,
        sourceGroup: 'g'.repeat(120),
        resolution: 'EXPLICIT',
    })

    const overLimit = resolveSourceGroup({
        requestedSourceGroup: 'g'.repeat(121),
        agentDefaultSourceGroup: null,
        isSameAgent: false,
    })
    assert.equal(overLimit.ok, false)
    if (overLimit.ok) return
    assert.equal(overLimit.status, 400)

    const overLimitDefault = resolveSourceGroup({
        agentDefaultSourceGroup: 'g'.repeat(121),
        isSameAgent: false,
    })
    assert.deepEqual(overLimitDefault, {
        ok: false,
        code: 'SOURCE_GROUP_TOO_LONG',
        status: 400,
    })
})

test('legacy Source Group resolution accepts omitted and blank values', () => {
    assert.deepEqual(resolveAgentSourceGroup({
        agentDefaultSourceGroup: null,
    }), {
        ok: true,
        sourceGroup: null,
        resolution: 'NONE',
    })
    assert.deepEqual(resolveAgentSourceGroup({
        requestedSourceGroup: '   ',
        agentDefaultSourceGroup: null,
    }), {
        ok: true,
        sourceGroup: null,
        resolution: 'CLEARED',
    })
})

test('builds direct user transfer plan', () => {
    const plan = buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: 'group-a',
        managerOwnerIds: [],
        activeAssignments: [],
        replaceExisting: true,
    })

    assert.deepEqual(plan, {
        mode: 'created',
        userId: 'user-1',
        agentId: 'agent-1',
        sourceGroup: 'group-a',
        previousManagerOwnerIds: [],
        previousAgentAssignmentIds: [],
        replacedOwnership: false,
    })
})

test('builds transfer plan for manager-owned user', () => {
    const plan = buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: 'group-a',
        managerOwnerIds: ['manager-1', 'admin-1'],
        activeAssignments: [],
        replaceExisting: true,
    })

    assert.equal('ok' in plan, false)
    if ('ok' in plan) return
    assert.deepEqual(plan.mode, 'transferred')
    assert.deepEqual(plan.previousManagerOwnerIds, ['manager-1', 'admin-1'])
    assert.equal(plan.replacedOwnership, true)
})

test('builds transfer plan for agent-owned user', () => {
    const plan = buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-2',
        sourceGroup: 'group-b',
        managerOwnerIds: [],
        activeAssignments: [
            { id: 'assignment-1', agentId: 'agent-1', sourceGroup: 'group-a' },
        ],
        replaceExisting: true,
    })

    assert.deepEqual(plan, {
        mode: 'transferred',
        userId: 'user-1',
        agentId: 'agent-2',
        sourceGroup: 'group-b',
        previousManagerOwnerIds: [],
        previousAgentAssignmentIds: ['assignment-1'],
        replacedOwnership: true,
    })
})

test('same-agent transfer updates only explicitly changed metadata in place', () => {
    const plan = buildNullableAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: null,
        managerOwnerIds: [],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: 'old-group',
                whatsappGroupUrl: 'https://chat.whatsapp.com/existing',
            },
        ],
        replaceExisting: true,
    })

    assert.equal(plan.mode, 'refreshed')
    assert.equal(plan.assignmentIdToUpdate, 'assignment-1')
    assert.equal(plan.sourceGroup, null)
    assert.equal(plan.sourceGroupResolution, 'CLEARED')
    assert.equal(plan.whatsappGroupUrl, 'https://chat.whatsapp.com/existing')
    assert.deepEqual(plan.activeAssignmentIdsToClose, [])
    assert.equal(plan.requiresAssignmentCreate, false)
    assert.equal(plan.replacedOwnership, false)
})

test('same-agent omitted source group is preserved while WhatsApp can be cleared independently', () => {
    const plan = buildNullableAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        whatsappGroupUrl: null,
        managerOwnerIds: [],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: 'existing-group',
                whatsappGroupUrl: 'https://chat.whatsapp.com/existing',
            },
        ],
        replaceExisting: true,
    })

    assert.equal(plan.mode, 'refreshed')
    assert.equal(plan.assignmentIdToUpdate, 'assignment-1')
    assert.equal(plan.sourceGroup, 'existing-group')
    assert.equal(plan.sourceGroupResolution, 'PRESERVED')
    assert.equal(plan.whatsappGroupUrl, null)
    assert.deepEqual(plan.activeAssignmentIdsToClose, [])
    assert.equal(plan.requiresAssignmentCreate, false)
})

test('rejects unsafe explicit WhatsApp assignment URLs before storage', () => {
    const invalidUrls = [
        'http://chat.whatsapp.com/group-code',
        'https://example.com/group-code',
        'javascript:alert(1)',
    ]

    for (const whatsappGroupUrl of invalidUrls) {
        assert.deepEqual(buildNullableAgentTransferPlan({
            userId: 'user-1',
            targetAgentId: 'agent-1',
            whatsappGroupUrl,
            managerOwnerIds: [],
            activeAssignments: [],
            replaceExisting: true,
        }), {
            ok: false,
            code: 'INVALID_WHATSAPP_GROUP_URL',
            status: 400,
        })
    }
})

test('accepts an HTTPS WhatsApp group invitation URL', () => {
    const plan = buildNullableAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        whatsappGroupUrl: ' https://chat.whatsapp.com/invite-code?mode=ac_t ',
        managerOwnerIds: [],
        activeAssignments: [],
        replaceExisting: true,
    })

    assert.equal(plan.whatsappGroupUrl, 'https://chat.whatsapp.com/invite-code?mode=ac_t')
    assert.equal(plan.whatsappGroupUrlResolution, 'EXPLICIT')
})

test('different-agent transfer never leaks previous Source Group or WhatsApp metadata', () => {
    const plan = buildNullableAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-2',
        agentDefaultSourceGroup: null,
        managerOwnerIds: [],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: 'private-old-group',
                whatsappGroupUrl: 'https://chat.whatsapp.com/private-old-link',
            },
        ],
        replaceExisting: true,
    })

    assert.equal(plan.mode, 'transferred')
    assert.equal(plan.sourceGroup, null)
    assert.equal(plan.sourceGroupResolution, 'NONE')
    assert.equal(plan.whatsappGroupUrl, null)
    assert.deepEqual(plan.activeAssignmentIdsToClose, ['assignment-1'])
    assert.equal(plan.requiresAssignmentCreate, true)
})

test('exact same-agent durable state is a no-op without assignment churn', () => {
    const plan = buildNullableAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        managerOwnerIds: [],
        activeAssignments: [
            {
                id: 'assignment-1',
                agentId: 'agent-1',
                sourceGroup: null,
                whatsappGroupUrl: null,
            },
        ],
        replaceExisting: true,
    })

    assert.equal(plan.mode, 'noop')
    assert.equal(plan.assignmentIdToUpdate, null)
    assert.deepEqual(plan.activeAssignmentIdsToClose, [])
    assert.equal(plan.requiresAssignmentCreate, false)
    assert.equal(plan.replacedOwnership, false)
})

test('rejects replacing existing ownership when replaceExisting is false', () => {
    assert.deepEqual(buildAgentTransferPlan({
        userId: 'user-1',
        targetAgentId: 'agent-1',
        sourceGroup: 'group-a',
        managerOwnerIds: ['manager-1'],
        activeAssignments: [],
        replaceExisting: false,
    }), { ok: false, code: 'OWNERSHIP_EXISTS', status: 409 })
})
