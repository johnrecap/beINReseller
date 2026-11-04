'use client'

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { PanelCommandState, type CommandReceipt } from '@/lib/panel-command-state'
import { PanelCommandRunner } from '@/lib/panel-command-runner'
import { PanelBalanceTracker } from '@/lib/panel-balance-tracker'
import { useTranslation } from '@/hooks/useTranslation'

type Owner = { actor: string; runner: PanelCommandRunner; balance: Map<'current', PanelBalanceTracker>; drafts: Map<string, unknown>; labels: Map<string, string> }
const Context = createContext<Owner | null>(null)
const empty: readonly CommandReceipt[] = Object.freeze([])
const emptySnapshot = () => empty
const noSubscription = () => () => {}

/** Mounted in the persistent dashboard layout, above route and dialog lifetimes. */
export function PanelCommandProvider({ children }: { children: ReactNode }) {
    const { data: session } = useSession()
    const actor = session?.user?.id
    const hydrated = useSyncExternalStore(noSubscription, () => true, () => false)
    return hydrated && actor ? <ActorCommands key={actor} actor={actor}>{children}</ActorCommands> :
        <Context.Provider value={null}>{children}</Context.Provider>
}

function ActorCommands({ actor, children }: { actor: string; children: ReactNode }) {
    const [owner] = useState<Owner | null>(() => {
        try {
            const state = new PanelCommandState(actor, window.sessionStorage)
            return { actor, runner: new PanelCommandRunner(state), balance: new Map(), drafts: new Map(), labels: new Map() }
        } catch { return null } // Fail closed when persistent receipts cannot be read.
    })
    const receipts = useSyncExternalStore(owner?.runner.state.subscribe ?? noSubscription,
        owner?.runner.state.snapshot ?? emptySnapshot, emptySnapshot)
    useEffect(() => {
        if (!owner) return
        const tracker = new PanelBalanceTracker(owner.runner.state)
        owner.balance.set('current', tracker)
        const poll = () => { if (document.visibilityState !== 'hidden' && navigator.onLine) void tracker.tick() }
        const timer = setInterval(poll, 2000)
        document.addEventListener('visibilitychange', poll)
        window.addEventListener('online', poll)
        poll()
        return () => {
            clearInterval(timer)
            document.removeEventListener('visibilitychange', poll)
            window.removeEventListener('online', poll)
            tracker.dispose()
        }
    }, [owner])
    const { t } = useTranslation()
    const copy = t.panelUi.commandTracker
    const stateLabel = { PENDING: copy.pending, UNCERTAIN: copy.uncertain, FAILED: copy.failed, SUCCEEDED: copy.succeeded }
    return <Context.Provider value={owner}>
        {children}
        {receipts.length > 0 && <aside role="status" aria-live="polite"
            data-panel-command-status className="fixed bottom-4 end-4 z-40 max-h-60 max-w-sm overflow-auto rounded-lg border bg-card p-3 text-sm shadow-lg">
            {receipts.map(receipt => <div key={receipt.attempt} className="border-b py-2 last:border-0">
                <p>{owner?.labels.get(receipt.attempt) || copy.operation}: {stateLabel[receipt.state]}</p>
                {receipt.state === 'UNCERTAIN' && <p>{copy.review}</p>}
                {receipt.state === 'UNCERTAIN' && receipt.action === 'bein.balance.refresh' &&
                    <button type="button" className="underline" onClick={() => void owner?.balance.get('current')?.retryStatus(receipt.attempt)}>{copy.retryStatus}</button>}
                {(receipt.state === 'SUCCEEDED' || receipt.state === 'FAILED') &&
                    <button type="button" className="underline" onClick={() => owner?.runner.state.dismissSettled(receipt.attempt)}>{copy.dismiss}</button>}
            </div>)}
        </aside>}
    </Context.Provider>
}

/** New explicit commands use this owner; caller migrations must supply all conflict resources. */
export function usePanelCommandOwner() {
    return useContext(Context)
}
