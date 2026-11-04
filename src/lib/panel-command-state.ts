/** Minimal same-tab mutation receipts. Never persist request bodies or provider errors. */
export interface CommandStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}
export type CommandOutcome = 'SUCCEEDED' | 'FAILED' | 'UNCERTAIN'
export type CommandReceipt = Readonly<{
    actor: string
    action: string
    resources: readonly string[]
    attempt: string
    startedAt: number
    state: 'PENDING' | CommandOutcome
    /** Opaque read-only balance request identity; never a financial execution receipt. */
    balanceRequestId?: string
}>

function immutable(receipt: CommandReceipt): CommandReceipt {
    return Object.freeze({ ...receipt, resources: Object.freeze([...receipt.resources]) })
}

export class PanelCommandState {
    private receipts: readonly CommandReceipt[] = Object.freeze([])
    private readonly key: string
    private readonly listeners = new Set<() => void>()

    constructor(private readonly actor: string, private readonly storage: CommandStorage) {
        if (!actor) throw new Error('COMMAND_ACTOR_REQUIRED')
        this.key = `panel-commands:v1:${encodeURIComponent(actor)}`
        try {
            const raw = storage.getItem(this.key)
            if (!raw) return
            const records: unknown = JSON.parse(raw)
            if (!Array.isArray(records)) throw new Error('invalid receipts')
            const attempts = new Set<string>()
            this.receipts = Object.freeze(records.map(record => {
                if (!record || record.actor !== actor || typeof record.action !== 'string' || !record.action ||
                    typeof record.attempt !== 'string' || !record.attempt || attempts.has(record.attempt) ||
                    !Number.isFinite(record.startedAt) || !Array.isArray(record.resources) || !record.resources.length ||
                    record.resources.some((key: unknown) => typeof key !== 'string' || !key) ||
                    !['PENDING', 'UNCERTAIN'].includes(record.state)) throw new Error('invalid receipt')
                attempts.add(record.attempt)
                // Select fields explicitly: untrusted storage must not inject payloads into UI state.
                return immutable({ actor, action: record.action, attempt: record.attempt,
                    resources: [...new Set<string>(record.resources)].sort(), startedAt: record.startedAt, state: 'UNCERTAIN',
                    ...(record.action === 'bein.balance.refresh' && typeof record.balanceRequestId === 'string' &&
                        record.balanceRequestId.length > 0 && record.balanceRequestId.length <= 128 ? { balanceRequestId: record.balanceRequestId } : {}) })
            }))
        } catch { throw new Error('COMMAND_STORAGE_UNAVAILABLE') }
    }

    snapshot = (): readonly CommandReceipt[] => this.receipts
    subscribe = (listener: () => void) => {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    private publish(next: readonly CommandReceipt[]) {
        this.receipts = Object.freeze([...next])
        for (const listener of this.listeners) listener()
    }

    private persist(next: readonly CommandReceipt[]) {
        this.storage.setItem(this.key, JSON.stringify(next.filter(r => r.state === 'PENDING' || r.state === 'UNCERTAIN')))
    }

    claim(action: string, resources: readonly string[], attempt: string): CommandReceipt {
        const keys = [...new Set(resources)].sort()
        if (!action || !attempt || !keys.length || keys.some(key => !key)) throw new Error('COMMAND_INVALID_IDENTITY')
        if (this.receipts.some(r => r.attempt === attempt ||
            ((r.state === 'PENDING' || r.state === 'UNCERTAIN') && r.resources.some(key => keys.includes(key))))) {
            throw new Error('COMMAND_CONFLICT')
        }
        const receipt = immutable({ actor: this.actor, action, resources: keys, attempt, startedAt: Date.now(), state: 'PENDING' })
        const next = [...this.receipts, receipt]
        // Must succeed before the caller can dispatch. No partial in-memory resource acquisition.
        try { this.persist(next) } catch { throw new Error('COMMAND_STORAGE_UNAVAILABLE') }
        this.publish(next)
        return receipt
    }

    settle(attempt: string, state: CommandOutcome): boolean {
        const current = this.receipts.find(r => r.attempt === attempt)
        if (!current || current.state !== 'PENDING') return false
        const next = this.receipts.map(r => r === current ? immutable({ ...r, state }) : r)
        try { this.persist(next) } catch {
            // Old persistent PENDING remains conservative across reload. Never release the live claim.
            this.publish(this.receipts.map(r => r === current ? immutable({ ...r, state: 'UNCERTAIN' }) : r))
            return false
        }
        this.publish(next)
        return true
    }

    dismissSettled(attempt: string): void {
        this.publish(this.receipts.filter(r => r.attempt !== attempt || r.state === 'PENDING' || r.state === 'UNCERTAIN'))
    }

    /** The only reconciliation exception is the explicitly read-only dealer display operation. */
    updateBalanceRead(attempt: string, accountId: string, state: 'PENDING' | CommandOutcome, requestId?: string): boolean {
        const current = this.receipts.find(r => r.attempt === attempt)
        if (!current || current.action !== 'bein.balance.refresh' || current.resources.length !== 1 ||
            current.resources[0] !== `beinAccount/${accountId}` || !['PENDING', 'UNCERTAIN'].includes(current.state)) return false
        if (requestId && (requestId.length > 128 || (current.balanceRequestId && current.balanceRequestId !== requestId))) return false
        const next = this.receipts.map(r => r === current ? immutable({ ...r, state,
            ...(requestId ? { balanceRequestId: requestId } : {}) }) : r)
        try { this.persist(next) } catch { return false }
        this.publish(next)
        return true
    }
}
