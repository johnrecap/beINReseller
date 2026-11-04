import { randomUUID } from 'node:crypto'
import { validBalanceObservation, type BalanceObservation, type BalanceRefreshError,
    type BalanceRefreshRequest, type BalanceRefreshTerminal } from '../../../shared/bein/balance-refresh'

export class BalanceRefreshFailure extends Error {
    constructor(public readonly code: BalanceRefreshError) { super(code) }
}
export interface BalanceRefreshJobStore {
    claim(id: string, token: string): Promise<BalanceRefreshRequest | null>
    read(id: string): Promise<BalanceRefreshRequest | null>
    finish(id: string, token: string, result: BalanceRefreshTerminal): Promise<boolean>
}

/** Does not race away from execution: the account owner releases only after HTTP drains. */
export async function runBalanceRefreshJob(requestId: string, accountId: string, store: BalanceRefreshJobStore,
    execute: (accountId: string, signal: AbortSignal, assertOwner: () => Promise<void>) => Promise<BalanceObservation>) {
    const request = await store.claim(requestId, randomUUID())
    if (!request) return // duplicate, expired, or already terminal delivery
    const token = request.runToken!
    const cancellation = new AbortController()
    const timer = setTimeout(() => cancellation.abort(new BalanceRefreshFailure('BALANCE_TIMEOUT')),
        Math.max(0, request.deadline - Date.now()))
    const guard = async () => {
        cancellation.signal.throwIfAborted()
        if (Date.now() >= request.deadline) throw new BalanceRefreshFailure('BALANCE_TIMEOUT')
        const current = await store.read(requestId)
        if (!current || current.state !== 'RUNNING' || current.runToken !== token || current.accountId !== accountId)
            throw new BalanceRefreshFailure('ACCOUNT_BUSY')
        cancellation.signal.throwIfAborted()
    }
    try {
        if (request.accountId !== accountId) throw new BalanceRefreshFailure('ACCOUNT_UNAVAILABLE')
        await guard()
        const result = await execute(accountId, cancellation.signal, guard)
        await guard()
        if (!validBalanceObservation(result)) throw new BalanceRefreshFailure('BALANCE_NOT_FOUND')
        if (!await store.finish(requestId, token, { state: 'COMPLETED', ...result })) throw new BalanceRefreshFailure('ACCOUNT_BUSY')
    } catch (error) {
        const code = cancellation.signal.aborted ? 'BALANCE_TIMEOUT' :
            error instanceof BalanceRefreshFailure ? error.code : 'BALANCE_FAILED'
        try { await store.finish(requestId, token, { state: 'FAILED', errorCode: code }) }
        catch { console.error('[balance-refresh] result unavailable', { requestId, code: 'STATUS_UNAVAILABLE' }) }
        throw new BalanceRefreshFailure(code)
    } finally { clearTimeout(timer); cancellation.abort() }
}
