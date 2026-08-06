import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWhatsAppHandoffDestination } from '@/lib/credit-requests/whatsapp-handoff'

function createTxMock(input: {
    assignmentGroupUrl?: string | null
    assignmentSourceGroup?: string | null
    agentGroupUrl?: string | null
    defaultGroupUrl?: string | null
    agentHandoffLabel?: string | null
    agentApiGroupName?: string | null
    agentDefaultSourceGroup?: string | null
    globalLabel?: string | null
    onAssignmentLookup?: () => void
}) {
    return {
        agentAssignment: {
            async findFirst() {
                input.onAssignmentLookup?.()
                return input.assignmentGroupUrl || input.assignmentSourceGroup
                    ? {
                        sourceGroup: input.assignmentSourceGroup ?? null,
                        whatsappGroupUrl: input.assignmentGroupUrl ?? null,
                    }
                    : null
            },
        },
        agentProfile: {
            async findUnique() {
                return {
                    whatsappHandoffGroupUrl: input.agentGroupUrl ?? null,
                    whatsappHandoffPhone: ' +20 100 123 4567 ',
                    whatsappHandoffLabel: input.agentHandoffLabel === undefined
                        ? 'Agent default label'
                        : input.agentHandoffLabel,
                    whapiGroupName: input.agentApiGroupName === undefined
                        ? 'Agent API group'
                        : input.agentApiGroupName,
                    defaultSourceGroup: input.agentDefaultSourceGroup ?? 'Agent default source',
                }
            },
        },
        notificationSetting: {
            async findUnique() {
                return {
                    defaultWhatsappGroupUrl: input.defaultGroupUrl ?? null,
                    defaultWhatsappPhone: '201111111111',
                    defaultWhatsappLabel: input.globalLabel === undefined
                        ? 'Global default'
                        : input.globalLabel,
                }
            },
        },
    }
}

test('historical null Source Group keeps no group metadata while assignment URL still falls back', async () => {
    const destination = await resolveWhatsAppHandoffDestination(createTxMock({
        assignmentGroupUrl: 'https://chat.whatsapp.com/user-group',
        assignmentSourceGroup: 'Later assignment group',
        agentGroupUrl: 'https://chat.whatsapp.com/agent-group',
        defaultGroupUrl: 'https://chat.whatsapp.com/global-group',
    }) as never, {
        agentId: 'agent-1',
        userId: 'user-1',
        sourceGroup: null,
        whatsappGroupUrl: null,
    })

    assert.equal(destination.groupUrl, 'https://chat.whatsapp.com/user-group')
    assert.equal(destination.label, 'Agent default label')
    assert.equal(destination.phone, '+201001234567')
})

test('uses the credit request group snapshot before the current assignment', async () => {
    const destination = await resolveWhatsAppHandoffDestination(createTxMock({
        assignmentGroupUrl: 'https://chat.whatsapp.com/current-group',
        assignmentSourceGroup: 'Current group',
        agentGroupUrl: 'https://chat.whatsapp.com/agent-group',
    }) as never, {
        agentId: 'agent-1',
        userId: 'user-1',
        sourceGroup: 'Snapshot group',
        whatsappGroupUrl: 'https://chat.whatsapp.com/snapshot-group',
    })

    assert.equal(destination.groupUrl, 'https://chat.whatsapp.com/snapshot-group')
    assert.equal(destination.label, 'Snapshot group')
})

test('historical null Source Group never inherits the current agent default group label', async () => {
    const destination = await resolveWhatsAppHandoffDestination(createTxMock({
        assignmentGroupUrl: 'https://chat.whatsapp.com/current-url',
        agentHandoffLabel: null,
        agentApiGroupName: null,
        agentDefaultSourceGroup: 'Later default group',
        globalLabel: null,
    }) as never, {
        agentId: 'agent-1',
        userId: 'user-1',
        sourceGroup: null,
        whatsappGroupUrl: null,
    })

    assert.equal(destination.groupUrl, 'https://chat.whatsapp.com/current-url')
    assert.equal(destination.label, null)
})

test('ignores unsafe group URLs and falls back to configured defaults', async () => {
    const destination = await resolveWhatsAppHandoffDestination(createTxMock({
        assignmentGroupUrl: 'javascript:alert(1)',
        assignmentSourceGroup: 'Unsafe group',
        agentGroupUrl: 'https://chat.whatsapp.com/agent-group',
    }) as never, {
        agentId: 'agent-1',
        userId: 'user-1',
        sourceGroup: null,
        whatsappGroupUrl: null,
    })

    assert.equal(destination.groupUrl, 'https://chat.whatsapp.com/agent-group')
})

test('ignores non-WhatsApp HTTPS URLs when resolving handoff destinations', async () => {
    const destination = await resolveWhatsAppHandoffDestination(createTxMock({
        assignmentGroupUrl: 'https://example.com/not-a-whatsapp-group',
        agentGroupUrl: 'https://chat.whatsapp.com/agent-group',
    }) as never, {
        agentId: 'agent-1',
        userId: 'user-1',
        sourceGroup: null,
        whatsappGroupUrl: null,
    })

    assert.equal(destination.groupUrl, 'https://chat.whatsapp.com/agent-group')
})

test('admin-owned requests skip current assignment lookup and use global defaults', async () => {
    let assignmentLookupCount = 0
    const destination = await resolveWhatsAppHandoffDestination(createTxMock({
        assignmentGroupUrl: 'https://chat.whatsapp.com/current-agent-group',
        assignmentSourceGroup: 'Current agent group',
        agentGroupUrl: 'https://chat.whatsapp.com/agent-group',
        defaultGroupUrl: 'https://chat.whatsapp.com/global-group',
        onAssignmentLookup: () => {
            assignmentLookupCount += 1
        },
    }) as never, {
        ownerType: 'ADMIN',
        agentId: null,
        userId: 'user-1',
        sourceGroup: null,
        whatsappGroupUrl: null,
    })

    assert.equal(assignmentLookupCount, 0)
    assert.equal(destination.groupUrl, 'https://chat.whatsapp.com/global-group')
    assert.equal(destination.label, 'Global default')
})
