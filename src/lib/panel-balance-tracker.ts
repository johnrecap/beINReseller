import { PanelCommandState, type CommandReceipt } from './panel-command-state'
import { withRequestDeadline } from './request-deadline'
import { safeBalanceError, validBalanceObservation, type BalanceObservation, type BalanceRefreshError } from '../../shared/bein/balance-refresh'

/** Dashboard-owned display reads. No financial command can enter this reconciliation path. */
export class PanelBalanceTracker {
    private readonly inFlight = new Set<string>()
    private readonly stopped = new Set<string>()
    private readonly observations = new Map<string, BalanceObservation>()
    private readonly failures = new Map<string, BalanceRefreshError>()
    private readonly cancellation = new AbortController()
    constructor(private readonly state: PanelCommandState, private readonly send: typeof fetch = fetch) {}
    observation(accountId: string) { return this.observations.get(accountId) }
    failure(accountId: string) { return this.failures.get(accountId) }
    private failed(receipt: CommandReceipt, accountId: string, code: BalanceRefreshError, id?: string) {
        this.failures.set(accountId, code)
        return this.state.updateBalanceRead(receipt.attempt, accountId, 'FAILED', id)
    }
    dispose() { this.cancellation.abort() }
    async retryStatus(attempt: string) {
        const receipt = this.state.snapshot().find(r => r.attempt === attempt)
        if (!receipt || receipt.action !== 'bein.balance.refresh' || receipt.state !== 'UNCERTAIN') return
        this.stopped.delete(attempt)
        await this.tick()
    }
    private url(id: string) { return `/api/admin/bein-accounts/${encodeURIComponent(id)}/check-balance` }
    private async json(url: string, init?: RequestInit) {
        return withRequestDeadline(async signal => {
            const send = this.send
            const response = await send(url, { ...init, signal, cache: 'no-store' })
            return { response, body: await response.json() }
        }, 15_000, this.cancellation.signal)
    }
    private accept(receipt: CommandReceipt, accountId: string, value: unknown) {
        if (!value || typeof value !== 'object') return false
        const data = value as Record<string, unknown>
        if (data.accountId !== accountId || typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 128 ||
            (receipt.balanceRequestId && receipt.balanceRequestId !== data.requestId)) return false
        if (data.state === 'COMPLETED') {
            if (!validBalanceObservation(data)) return false
            this.observations.set(accountId, { balance: data.balance, updatedAt: data.updatedAt })
            return this.state.updateBalanceRead(receipt.attempt, accountId, 'SUCCEEDED', data.requestId)
        }
        if (data.state === 'FAILED') return this.failed(receipt, accountId, safeBalanceError(data.errorCode), data.requestId)
        if (data.state === 'QUEUED' || data.state === 'RUNNING') return this.state.updateBalanceRead(receipt.attempt, accountId, 'PENDING', data.requestId)
        return false
    }
    async start(accountId: string, attempt: string) {
        this.cancellation.signal.throwIfAborted()
        const receipt = this.state.claim('bein.balance.refresh', [`beinAccount/${accountId}`], attempt)
        this.failures.delete(accountId)
        this.inFlight.add(attempt)
        try {
            const { response, body } = await this.json(this.url(accountId), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'async' }),
            })
            if (this.cancellation.signal.aborted) return
            if (response.status === 202 && body.success === true && this.accept(receipt, accountId, body.data)) return
            // These route codes are emitted before queue admission.
            if ([400, 404, 409].includes(response.status) && ['VALIDATION_ERROR', 'ACCOUNT_UNAVAILABLE'].includes(body.code)) {
                this.failed(receipt, accountId, body.code === 'ACCOUNT_UNAVAILABLE' ? body.code : 'BALANCE_FAILED'); return
            }
            if (response.status === 503 && typeof body.requestId === 'string' && body.requestId.length <= 128)
                this.state.updateBalanceRead(attempt, accountId, 'UNCERTAIN', body.requestId)
            else this.state.updateBalanceRead(attempt, accountId, 'UNCERTAIN')
        } catch { if (!this.cancellation.signal.aborted) this.state.updateBalanceRead(attempt, accountId, 'UNCERTAIN') }
        finally { this.inFlight.delete(attempt) }
    }
    async tick() {
        if (this.cancellation.signal.aborted) return
        await Promise.all(this.state.snapshot().filter(r => r.action === 'bein.balance.refresh' &&
            ['PENDING', 'UNCERTAIN'].includes(r.state) && !this.inFlight.has(r.attempt) && !this.stopped.has(r.attempt))
            .map(async receipt => {
                const accountId = receipt.resources[0]?.slice('beinAccount/'.length)
                if (!accountId || receipt.resources.length !== 1 || !receipt.resources[0].startsWith('beinAccount/')) return
                this.inFlight.add(receipt.attempt)
                try {
                    const query = receipt.balanceRequestId ? `?requestId=${encodeURIComponent(receipt.balanceRequestId)}` : '?active=1'
                    const { response, body } = await this.json(this.url(accountId) + query)
                    if (this.cancellation.signal.aborted) return
                    if (response.ok && body.success === true && this.accept(receipt, accountId, body.data)) return
                    if (receipt.balanceRequestId && response.status === 404 && body.code === 'REQUEST_NOT_FOUND') {
                        const active = await this.json(this.url(accountId) + '?active=1')
                        if (this.cancellation.signal.aborted) return
                        if (active.response.ok && active.body.success === true && active.body.data === null) {
                            this.failed(receipt, accountId, 'REQUEST_NOT_FOUND'); return
                        }
                        // If another refresh is running, keep checking before releasing this resource.
                        this.state.updateBalanceRead(receipt.attempt, accountId, 'UNCERTAIN')
                        return
                    }
                    if (!receipt.balanceRequestId && response.ok && body.success === true && body.data === null) {
                        this.failed(receipt, accountId, 'REQUEST_NOT_FOUND'); return
                    }
                    this.state.updateBalanceRead(receipt.attempt, accountId, 'UNCERTAIN')
                    if ([401, 403, 404].includes(response.status) || (response.ok && body.data === null)) this.stopped.add(receipt.attempt)
                } catch { if (!this.cancellation.signal.aborted) this.state.updateBalanceRead(receipt.attempt, accountId, 'UNCERTAIN') }
                finally { this.inFlight.delete(receipt.attempt) }
            }))
    }
}
