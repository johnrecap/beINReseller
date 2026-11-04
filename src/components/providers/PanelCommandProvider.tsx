'use client'

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ListChecks, X } from 'lucide-react'
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
    return <Context.Provider value={owner}>{children}</Context.Provider>
}

export function PanelCommandMenu() {
    const owner = useContext(Context)
    const receipts = useSyncExternalStore(owner?.runner.state.subscribe ?? noSubscription,
        owner?.runner.state.snapshot ?? emptySnapshot, emptySnapshot)
    const [open, setOpen] = useState(false)
    const trigger = useRef<HTMLButtonElement>(null)
    const closeButton = useRef<HTMLButtonElement>(null)
    const close = () => { setOpen(false); trigger.current?.focus() }
    useEffect(() => {
        if (!open) return
        closeButton.current?.focus()
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close() }
        }
        document.addEventListener('keydown', escape)
        return () => document.removeEventListener('keydown', escape)
    }, [open])
    const { t, dir } = useTranslation()
    const copy = t.panelUi.commandTracker
    const stateLabel = { PENDING: copy.pending, UNCERTAIN: copy.uncertain, FAILED: copy.failed, SUCCEEDED: copy.succeeded }
    return <div dir={dir}>
        <button type="button" ref={trigger} data-panel-command-toggle aria-expanded={open}
            aria-controls={open ? 'panel-command-list' : undefined} aria-label={copy.title} title={copy.title}
            className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md hover:bg-secondary"
            onClick={() => open ? close() : setOpen(true)}>
            <ListChecks className="size-5" /><span className="hidden lg:inline">{copy.title}</span>
        </button>
        {open && <section id="panel-command-list" aria-label={copy.title}
            data-panel-command-status className="absolute end-2 top-full z-40 max-h-[60dvh] w-80 max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border bg-card p-3 text-sm shadow-lg">
            <div className="flex items-center justify-between"><strong>{copy.title}</strong>
                <button ref={closeButton} type="button" aria-label={t.panelUi.close} className="p-2" onClick={close}><X className="size-4" /></button>
            </div>
            {receipts.length === 0 && <p>{copy.empty}</p>}
            {receipts.map(receipt => <div key={receipt.attempt} className="border-b py-2 last:border-0">
                <p>{owner?.labels.get(receipt.attempt) || copy.operation}: {stateLabel[receipt.state]}</p>
                {receipt.state === 'UNCERTAIN' && receipt.action !== 'bein.balance.refresh' && <p>{copy.review}</p>}
                {receipt.state === 'UNCERTAIN' && receipt.action === 'bein.balance.refresh' &&
                    <button type="button" className="underline" onClick={() => void owner?.balance.get('current')?.retryStatus(receipt.attempt)}>{copy.retryStatus}</button>}
                {(receipt.state === 'SUCCEEDED' || receipt.state === 'FAILED') &&
                    <button type="button" className="underline" onClick={() => owner?.runner.state.dismissSettled(receipt.attempt)}>{copy.dismiss}</button>}
            </div>)}
        </section>}
    </div>
}

/** New explicit commands use this owner; caller migrations must supply all conflict resources. */
export function usePanelCommandOwner() {
    return useContext(Context)
}
