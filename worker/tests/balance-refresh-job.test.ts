import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBalanceRefreshJob, BalanceRefreshFailure } from '../src/lib/bein-balance-refresh'
import type { BalanceRefreshRequest, BalanceRefreshTerminal } from '../../shared/bein/balance-refresh'

function fixture() {
    const request: BalanceRefreshRequest = { requestId: 'r', accountId: 'a', state: 'RUNNING',
        createdAt: Date.now(), deadline: Date.now() + 60_000, expiresAt: Date.now() + 660_000, runToken: 'owner' }
    const outcomes: BalanceRefreshTerminal[] = []
    const store = {
        claim: async () => request as BalanceRefreshRequest | null,
        read: async () => request as BalanceRefreshRequest | null,
        finish: async (_id: string, _token: string, result: BalanceRefreshTerminal) => { outcomes.push(result); return true },
    }
    return { request, outcomes, store }
}

test('balance job saves explicit observation; duplicate delivery does no provider work', async () => {
    const h = fixture(); let calls = 0
    const execute = async (_id: string, _signal: AbortSignal, guard: () => Promise<void>) => {
        await guard(); calls++; return { balance: 20, updatedAt: new Date().toISOString() }
    }
    await runBalanceRefreshJob('r', 'a', h.store, execute)
    assert.equal(h.outcomes[0].state, 'COMPLETED')
    h.store.claim = async () => null
    await runBalanceRefreshJob('r', 'a', h.store, execute)
    assert.equal(calls, 1)
})

test('balance job persists safe failure and rejects for BullMQ', async () => {
    const h = fixture()
    await assert.rejects(runBalanceRefreshJob('r', 'a', h.store, async () => { throw new Error('private provider response') }), /BALANCE_FAILED/)
    assert.deepEqual(h.outcomes, [{ state: 'FAILED', errorCode: 'BALANCE_FAILED' }])
})

test('wrong account, stale owner and invalid balance never report success', async () => {
    const h = fixture()
    await assert.rejects(runBalanceRefreshJob('r', 'other', h.store, async () => { throw new Error('must not execute') }), /ACCOUNT_UNAVAILABLE/)
    const stale = fixture(); stale.store.read = async () => ({ ...stale.request, runToken: 'new-owner' })
    await assert.rejects(runBalanceRefreshJob('r', 'a', stale.store, async (_id, _signal, guard) => {
        await guard(); return { balance: 5, updatedAt: new Date().toISOString() }
    }), /ACCOUNT_BUSY/)
    const invalid = fixture()
    await assert.rejects(runBalanceRefreshJob('r', 'a', invalid.store, async () => ({ balance: NaN, updatedAt: new Date().toISOString() })), /BALANCE_NOT_FOUND/)
})

test('deadline cancels provider work but waits for its drain before finishing', async () => {
    const h = fixture(); h.request.deadline = Date.now() + 30
    let drained = false
    await assert.rejects(runBalanceRefreshJob('r', 'a', h.store, async (_id, signal) => {
        await new Promise<void>(resolve => signal.addEventListener('abort', () => setTimeout(() => { drained = true; resolve() }, 10), { once: true }))
        throw new BalanceRefreshFailure('BALANCE_TIMEOUT')
    }), /BALANCE_TIMEOUT/)
    assert.equal(drained, true)
    assert.deepEqual(h.outcomes, [{ state: 'FAILED', errorCode: 'BALANCE_TIMEOUT' }])
})
