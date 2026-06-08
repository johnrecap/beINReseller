import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCreditRequestTelegramMessage } from '@/lib/credit-requests/telegram'

const base = {
    requestNumber: 'CR-20260608-ABC',
    username: 'customer1',
    amountUsd: 150,
    paymentMethod: 'cash',
}

test('formats agent-owned credit request with agent and group details', () => {
    const message = formatCreditRequestTelegramMessage({
        ...base,
        ownerType: 'AGENT',
        ownerLabel: 'Agent One',
        agentName: 'Agent One',
        sourceGroup: 'VIP group',
    })

    assert.match(message, /Owner: Agent One/)
    assert.match(message, /Agent: Agent One/)
    assert.match(message, /Group: VIP group/)
    assert.doesNotMatch(message, /Admin direct/)
})

test('formats admin-owned credit request without fake agent values', () => {
    const message = formatCreditRequestTelegramMessage({
        ...base,
        ownerType: 'ADMIN',
        ownerLabel: 'Admin direct',
        agentName: null,
        sourceGroup: null,
    })

    assert.match(message, /Owner: Admin direct/)
    assert.doesNotMatch(message, /Agent: -/)
    assert.doesNotMatch(message, /Group: -/)
})

test('formats legacy admin-owned retry without fake agent placeholders', () => {
    const message = formatCreditRequestTelegramMessage({
        ...base,
        ownerType: 'LEGACY_ADMIN',
        ownerLabel: 'Admin direct \(legacy\)',
        agentName: null,
        sourceGroup: null,
    })

    assert.match(message, /Owner: Admin direct \(legacy\)/)
    assert.doesNotMatch(message, /Agent: -/)
    assert.doesNotMatch(message, /Group: -/)
})
