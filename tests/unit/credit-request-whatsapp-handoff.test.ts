import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWhatsAppHandoffDestination } from '@/lib/credit-requests/whatsapp-handoff'

function createTxMock(input: {
    assignmentGroupUrl?: string | null
    assignmentSourceGroup?: string | null
    agentGroupUrl?: string | null
    defaultGroupUrl?: string | null
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
                    whatsappHandoffLabel: 'Agent default label',
                    whapiGroupName: 'Agent API group',
                    defaultSourceGroup: 'Agent default source',
                }
            },
        },
        notificationSetting: {
            async findUnique() {
                return {
                    defaultWhatsappGroupUrl: input.defaultGroupUrl ?? null,
                    defaultWhatsappPhone: '201111111111',
                    defaultWhatsappLabel: 'Global default',
                }
            },
        },
    }
}

test('uses the user assignment WhatsApp group before agent defaults', async () => {
    const destination = await resolveWhatsAppHandoffDestination(createTxMock({
        assignmentGroupUrl: 'https://chat.whatsapp.com/user-group',
        assignmentSourceGroup: 'VIP group',
        agentGroupUrl: 'https://chat.whatsapp.com/agent-group',
        defaultGroupUrl: 'https://chat.whatsapp.com/global-group',
    }) as never, {
        agentId: 'agent-1',
        userId: 'user-1',
        sourceGroup: null,
        whatsappGroupUrl: null,
    })

    assert.equal(destination.groupUrl, 'https://chat.whatsapp.com/user-group')
    assert.equal(destination.label, 'VIP group')
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
    assert.equal(destination.label, 'Unsafe group')
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
